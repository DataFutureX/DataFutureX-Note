import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { canWriteSync, defaultLibraryDir, probeWritePaths } from './writableFs'

export { canWriteSync, defaultLibraryDir, probeWritePaths }

/**
 * 在 app.ready 前调用：把 userData 指到 Electron 实际可写的目录。
 * Windows 受控文件夹访问等策略常拦截 electron.exe 写入 AppData/Documents。
 */
export function bootstrapWritableUserData(): string {
  const candidates: string[] = []
  try {
    candidates.push(app.getPath('userData'))
  } catch {
    // ignore
  }
  try {
    candidates.push(path.join(path.dirname(app.getPath('exe')), 'userdata'))
  } catch {
    // ignore
  }
  // 开发态：工程目录下 .data（Cursor/沙箱通常仅放行工作区写入）
  candidates.push(path.join(process.cwd(), '.data'))
  // 与源码同级的备用目录
  candidates.push(path.join(__dirname, '../../../.data'))

  for (const dir of candidates) {
    if (!dir) continue
    if (canWriteSync(dir)) {
      try {
        app.setPath('userData', dir)
      } catch {
        continue
      }
      return dir
    }
  }

  const fallback = path.join(process.cwd(), '.data')
  fs.mkdirSync(fallback, { recursive: true })
  try {
    app.setPath('userData', fallback)
  } catch {
    // ignore
  }
  return fallback
}
