import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import crypto from 'node:crypto'

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
const INVALID_CHARS = /[<>:"/\\|?*\x00-\x1f]/

/** 同一文件串行写入 */
const writeChains = new Map<string, Promise<unknown>>()

export function normalizePath(p: string): string {
  return path.normalize(p).replace(/\\/g, '/')
}

export function assertInsideRoot(rootDir: string, targetPath: string): string {
  const root = path.resolve(rootDir)
  const resolved = path.resolve(targetPath)
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep
  if (resolved !== root && !resolved.startsWith(rootWithSep)) {
    throw Object.assign(new Error('路径越出笔记库根目录'), { code: 'PATH_OUTSIDE_ROOT' })
  }
  return resolved
}

export function toRelativeId(rootDir: string, absolutePath: string): string {
  const rel = path.relative(path.resolve(rootDir), path.resolve(absolutePath))
  return normalizePath(rel === '' ? '.' : rel)
}

export function fromRelativeId(rootDir: string, id: string): string {
  if (!id || id === '.' || id === './') {
    return path.resolve(rootDir)
  }
  const decoded = id.replace(/\//g, path.sep)
  return assertInsideRoot(rootDir, path.join(rootDir, decoded))
}

export function validateFileName(name: string, isFolder = false): string {
  const trimmed = name.trim()
  if (!trimmed) {
    throw Object.assign(new Error('名称不能为空'), { code: 'INVALID_NAME' })
  }
  if (trimmed === '.' || trimmed === '..') {
    throw Object.assign(new Error('非法名称'), { code: 'INVALID_NAME' })
  }
  if (INVALID_CHARS.test(trimmed)) {
    throw Object.assign(new Error('名称包含非法字符'), { code: 'INVALID_NAME' })
  }
  const base = path.parse(trimmed).name
  if (WINDOWS_RESERVED.test(base) || WINDOWS_RESERVED.test(trimmed)) {
    throw Object.assign(new Error('名称属于系统保留名'), { code: 'INVALID_NAME' })
  }
  if (trimmed.endsWith('.') || trimmed.endsWith(' ')) {
    throw Object.assign(new Error('名称不能以点或空格结尾'), { code: 'INVALID_NAME' })
  }
  if (!isFolder && !trimmed.toLowerCase().endsWith('.md')) {
    return `${trimmed}.md`
  }
  if (!isFolder && trimmed.toLowerCase().endsWith('.md.md')) {
    return trimmed.slice(0, -3)
  }
  return trimmed
}

export function noteDisplayName(fileName: string): string {
  return fileName.replace(/\.md$/i, '')
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.promises.mkdir(dir, { recursive: true })
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.promises.access(p)
    return true
  } catch {
    return false
  }
}

export async function isWritableDir(dir: string): Promise<boolean> {
  try {
    const stat = await fs.promises.stat(dir)
    if (!stat.isDirectory()) return false
    // 使用普通 .md 探针：部分环境对 .tmp / 点文件更敏感
    const testFile = path.join(dir, `dfx-write-test-${process.pid}-${Date.now()}.md`)
    await fs.promises.writeFile(testFile, 'ok\n', { encoding: 'utf8', flag: 'w' })
    await fs.promises.unlink(testFile)
    return true
  } catch {
    return false
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryable(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code
  return code === 'EPERM' || code === 'EBUSY' || code === 'EACCES' || code === 'UNKNOWN'
}

function accessDeniedError(filePath: string, cause?: unknown): Error {
  const detail = cause instanceof Error ? cause.message : String(cause || '')
  const error = new Error(
    [
      `无法写入文件：${filePath}`,
      '',
      '常见原因与处理：',
      '1. 当前进程（electron.exe）被 Windows「受控文件夹访问」拦截，请把它加入允许应用',
      '2. 文件正被其他程序占用（请关闭预览窗格 / Word / 记事本等）',
      '3. 杀毒软件正在扫描该文件，可稍后重试',
      '4. 请改用应用可写目录（欢迎页「使用推荐笔记库」或 D:\\CodeWorkspace 下目录）',
      detail ? `（技术细节：${detail}）` : ''
    ]
      .filter(Boolean)
      .join('\n')
  ) as Error & { code?: string }
  error.code = 'WRITE_DENIED'
  return error
}

async function clearReadonly(filePath: string): Promise<void> {
  try {
    if (!(await pathExists(filePath))) return
    await fs.promises.chmod(filePath, 0o666)
  } catch {
    // ignore
  }
}

/** 旁路写入后替换（避免直接 open 被占用文件） */
async function replaceViaSidecar(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath)
  const tmp = path.join(dir, `dfx-tmp-${process.pid}-${Date.now()}.md`)
  await fs.promises.writeFile(tmp, content, 'utf8')

  let lastErr: unknown
  for (let i = 0; i < 20; i++) {
    try {
      await clearReadonly(filePath)
      await fs.promises.copyFile(tmp, filePath)
      await fs.promises.unlink(tmp).catch(() => undefined)
      return
    } catch (err) {
      lastErr = err
      if (!isRetryable(err)) {
        await fs.promises.unlink(tmp).catch(() => undefined)
        throw err
      }
      await sleep(80 + i * 80)
    }
  }
  await fs.promises.unlink(tmp).catch(() => undefined)
  throw lastErr
}

async function writeFileDirect(filePath: string, content: string): Promise<void> {
  let lastErr: unknown
  for (let i = 0; i < 20; i++) {
    try {
      await clearReadonly(filePath)
      await fs.promises.writeFile(filePath, content, { encoding: 'utf8', flag: 'w' })
      return
    } catch (err) {
      lastErr = err
      if (!isRetryable(err)) throw err
      await sleep(80 + i * 80)
    }
  }
  throw lastErr
}

async function writeInternal(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath)
  await ensureDir(dir)

  // 新建文件优先直接写，减少 sidecar 开销
  const existed = await pathExists(filePath)
  if (!existed) {
    try {
      await writeFileDirect(filePath, content)
      return
    } catch {
      // fall through
    }
  }

  try {
    await replaceViaSidecar(filePath, content)
    return
  } catch (err1) {
    try {
      await writeFileDirect(filePath, content)
      return
    } catch (err2) {
      const osTmp = path.join(os.tmpdir(), `dfx-${crypto.randomBytes(6).toString('hex')}.md`)
      try {
        await fs.promises.writeFile(osTmp, content, 'utf8')
        for (let i = 0; i < 15; i++) {
          try {
            await clearReadonly(filePath)
            await fs.promises.copyFile(osTmp, filePath)
            await fs.promises.unlink(osTmp).catch(() => undefined)
            return
          } catch (err) {
            if (!isRetryable(err) || i === 14) {
              await fs.promises.unlink(osTmp).catch(() => undefined)
              throw accessDeniedError(filePath, err)
            }
            await sleep(100 + i * 100)
          }
        }
      } catch (err3) {
        await fs.promises.unlink(osTmp).catch(() => undefined)
        throw accessDeniedError(filePath, err2 || err1 || err3)
      }
    }
  }
}

/** 安全写入（同文件串行 + 重试） */
export async function atomicWrite(filePath: string, content: string): Promise<void> {
  const key = path.resolve(filePath).toLowerCase()
  const prev = writeChains.get(key) || Promise.resolve()
  const job = prev.catch(() => undefined).then(() => writeInternal(filePath, content))
  writeChains.set(
    key,
    job.then(
      () => undefined,
      () => undefined
    )
  )
  return job
}
