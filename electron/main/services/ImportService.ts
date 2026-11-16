import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { ConflictStrategy, ImportResult } from '../../../src/types'
import { FileSystemService } from './FileSystemService'
import { assertInsideRoot, ensureDir, pathExists } from '../utils/pathSafety'
import { notifyLibraryChanged, withWatchPaused } from '../utils/libraryWatch'

async function loadAdmZip() {
  const mod = await import('adm-zip')
  return mod.default
}

const MAX_FILES = 50000
const MAX_TOTAL_SIZE = 2 * 1024 * 1024 * 1024 // 2GB
const MAX_COMPRESSION_RATIO = 100

export class ImportService {
  constructor(private fsService: FileSystemService) {}

  async importBackup(
    zipPath: string,
    targetFolderId: string,
    strategy: ConflictStrategy
  ): Promise<ImportResult> {
    const root = this.fsService.requireRoot()
    const targetDir = this.fsService.resolveId(targetFolderId)
    assertInsideRoot(root, targetDir)

    if (!(await pathExists(zipPath))) {
      throw Object.assign(new Error('备份文件不存在'), { code: 'ZIP_NOT_FOUND' })
    }

    const AdmZip = await loadAdmZip()
    let zip: InstanceType<typeof AdmZip>
    try {
      zip = new AdmZip(zipPath)
    } catch {
      throw Object.assign(new Error('ZIP 损坏或无法读取'), { code: 'ZIP_CORRUPT' })
    }

    const entries = zip.getEntries()
    if (entries.length > MAX_FILES) {
      throw Object.assign(new Error('压缩包文件数量超限'), { code: 'ZIP_BOMB' })
    }

    let uncompressed = 0
    const compressedSize = (await fs.promises.stat(zipPath)).size
    for (const entry of entries) {
      uncompressed += entry.header.size
      if (uncompressed > MAX_TOTAL_SIZE) {
        throw Object.assign(new Error('解压大小超限'), { code: 'ZIP_BOMB' })
      }
    }
    if (compressedSize > 0 && uncompressed / compressedSize > MAX_COMPRESSION_RATIO) {
      throw Object.assign(new Error('压缩比异常，疑似 ZIP 炸弹'), { code: 'ZIP_BOMB' })
    }

    const tmpRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dfx-import-'))
    const result: ImportResult = { imported: 0, skipped: 0, overwritten: 0, failed: [] }

    try {
      // 先解压到临时目录并校验路径
      for (const entry of entries) {
        const name = entry.entryName.replace(/\\/g, '/')
        if (!name || name.includes('\0')) {
          result.failed.push({ path: name, reason: '非法路径' })
          continue
        }
        // Zip Slip 防护
        const dest = path.resolve(tmpRoot, name)
        if (!dest.startsWith(tmpRoot + path.sep) && dest !== tmpRoot) {
          result.failed.push({ path: name, reason: '路径穿越被拦截' })
          continue
        }
        if (entry.isDirectory || name.endsWith('/')) {
          await ensureDir(dest)
          continue
        }
        await ensureDir(path.dirname(dest))
        await fs.promises.writeFile(dest, entry.getData())
      }

      // 提交到目标目录
      await withWatchPaused(async () => {
        await this.copyTree(tmpRoot, targetDir, strategy, result, '')
      })
      notifyLibraryChanged()
    } finally {
      await fs.promises.rm(tmpRoot, { recursive: true, force: true })
    }

    return result
  }

  private async copyTree(
    srcDir: string,
    destDir: string,
    strategy: ConflictStrategy,
    result: ImportResult,
    rel: string
  ): Promise<void> {
    const entries = await fs.promises.readdir(srcDir, { withFileTypes: true })
    for (const entry of entries) {
      const src = path.join(srcDir, entry.name)
      const dest = path.join(destDir, entry.name)
      const relPath = rel ? `${rel}/${entry.name}` : entry.name
      try {
        if (entry.isDirectory()) {
          await ensureDir(dest)
          await this.copyTree(src, dest, strategy, result, relPath)
        } else if (entry.isFile()) {
          const exists = await pathExists(dest)
          if (!exists) {
            await fs.promises.copyFile(src, dest)
            result.imported += 1
          } else if (strategy === 'skip') {
            result.skipped += 1
          } else if (strategy === 'overwrite') {
            await fs.promises.copyFile(src, dest)
            result.overwritten += 1
          } else {
            const kept = await this.uniquePath(dest)
            await fs.promises.copyFile(src, kept)
            result.imported += 1
          }
        }
      } catch (err) {
        result.failed.push({
          path: relPath,
          reason: err instanceof Error ? err.message : String(err)
        })
      }
    }
  }

  private async uniquePath(filePath: string): Promise<string> {
    const dir = path.dirname(filePath)
    const ext = path.extname(filePath)
    const base = path.basename(filePath, ext)
    let i = 1
    let candidate = path.join(dir, `${base} (${i})${ext}`)
    while (await pathExists(candidate)) {
      i += 1
      candidate = path.join(dir, `${base} (${i})${ext}`)
    }
    return candidate
  }
}
