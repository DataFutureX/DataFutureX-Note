import fs from 'node:fs'
import path from 'node:path'

/** 同步探测目录是否可写 */
export function canWriteSync(dir: string): boolean {
  try {
    fs.mkdirSync(dir, { recursive: true })
    const probe = path.join(dir, `.dfx-write-${process.pid}-${Date.now()}.tmp`)
    fs.writeFileSync(probe, 'ok', { flag: 'w' })
    fs.unlinkSync(probe)
    return true
  } catch {
    return false
  }
}

export function defaultLibraryDir(userDataDir: string): string {
  return path.join(userDataDir, 'library')
}

export type WriteProbeResult = {
  path: string
  writable: boolean
  error?: string
}

export function probeWritePaths(paths: string[]): WriteProbeResult[] {
  return paths.map((p) => {
    try {
      const ok = canWriteSync(p)
      return { path: p, writable: ok, error: ok ? undefined : 'EPERM/写入被拒绝' }
    } catch (e) {
      return {
        path: p,
        writable: false,
        error: e instanceof Error ? e.message : String(e)
      }
    }
  })
}
