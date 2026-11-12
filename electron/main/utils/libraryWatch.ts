import fs from 'node:fs'
import { BrowserWindow } from 'electron'

type RootGetter = () => string | null

let getRoot: RootGetter = () => null
let watcher: fs.FSWatcher | null = null
let debounceTimer: NodeJS.Timeout | null = null
let pauseCount = 0
let suppressUntil = 0

/** Windows 递归 watch 易导致笔记文件 EPERM，默认关闭，改为保存后主动通知 */
const ENABLE_FS_WATCH = process.platform !== 'win32'

function eachWindow(send: (win: Electron.BrowserWindow) => void) {
  try {
    for (const win of BrowserWindow.getAllWindows()) send(win)
  } catch {
    // 非 Electron 环境（单元测试）忽略
  }
}

function emitChanged() {
  if (Date.now() < suppressUntil || pauseCount > 0) return
  eachWindow((win) => win.webContents.send('library-changed'))
}

export function notifyLibraryChanged(): void {
  eachWindow((win) => win.webContents.send('library-changed'))
}

function stopWatcher() {
  if (watcher) {
    try {
      watcher.close()
    } catch {
      // ignore
    }
    watcher = null
  }
}

function startWatcher() {
  if (!ENABLE_FS_WATCH) return
  if (pauseCount > 0) return
  stopWatcher()
  const root = getRoot()
  if (!root || !fs.existsSync(root)) return
  try {
    watcher = fs.watch(root, { recursive: true }, () => {
      if (Date.now() < suppressUntil || pauseCount > 0) return
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => emitChanged(), 500)
    })
  } catch {
    // recursive watch may fail on some volumes
  }
}

export function initLibraryWatch(rootGetter: RootGetter): void {
  getRoot = rootGetter
  startWatcher()
}

export function restartLibraryWatch(): void {
  startWatcher()
}

/** 写入期间暂停目录监控（非 Windows 有效；Windows 本身不启用 watch） */
export async function withWatchPaused<T>(fn: () => Promise<T>): Promise<T> {
  pauseCount += 1
  stopWatcher()
  suppressUntil = Date.now() + 1500
  try {
    return await fn()
  } finally {
    pauseCount = Math.max(0, pauseCount - 1)
    setTimeout(() => {
      if (pauseCount === 0) startWatcher()
    }, 200)
  }
}
