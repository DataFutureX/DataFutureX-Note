import fs from 'node:fs'
import path from 'node:path'
import { BrowserWindow } from 'electron'

type RootGetter = () => string | null

let getRoot: RootGetter = () => null
let watcher: fs.FSWatcher | null = null
let debounceTimer: NodeJS.Timeout | null = null
let restartTimer: NodeJS.Timeout | null = null
let pauseCount = 0
let suppressUntil = 0

const DEBOUNCE_MS = 400
const SUPPRESS_AFTER_WRITE_MS = 1500

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

function scheduleEmit() {
  if (Date.now() < suppressUntil || pauseCount > 0) return
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    emitChanged()
  }, DEBOUNCE_MS)
}

/** 本进程主动通知（多窗口同步）；不受 pause/suppress 限制 */
export function notifyLibraryChanged(): void {
  eachWindow((win) => win.webContents.send('library-changed'))
}

/** 忽略原子写临时文件、隐藏文件、assets 附件等噪音事件 */
function shouldIgnoreWatchPath(filename: string | null | undefined): boolean {
  if (!filename) return false
  const normalized = filename.replace(/\\/g, '/')
  const base = path.posix.basename(normalized)
  const lower = base.toLowerCase()

  if (base.startsWith('.')) return true
  if (lower.startsWith('dfx-tmp-') || lower.startsWith('dfx-write-test-')) return true
  if (lower.endsWith('.tmp') || lower.endsWith('.temp') || lower.endsWith('~')) return true
  if (/(^|\/)assets(\/|$)/i.test(normalized)) return true
  if (lower === 'node_modules' || /(^|\/)node_modules(\/|$)/i.test(normalized)) return true
  return false
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

function scheduleRestart(delayMs = 800) {
  if (restartTimer) clearTimeout(restartTimer)
  restartTimer = setTimeout(() => {
    restartTimer = null
    if (pauseCount === 0) startWatcher()
  }, delayMs)
}

function startWatcher() {
  if (pauseCount > 0) return
  stopWatcher()
  const root = getRoot()
  if (!root || !fs.existsSync(root)) return
  try {
    watcher = fs.watch(root, { recursive: true }, (_eventType, filename) => {
      if (shouldIgnoreWatchPath(filename == null ? null : String(filename))) return
      scheduleEmit()
    })
    watcher.on('error', () => {
      // Windows 上偶发 EPERM/ENOENT：关闭后延迟重建
      stopWatcher()
      scheduleRestart()
    })
  } catch {
    // recursive watch 在部分网络盘/权限下会失败，稍后重试
    scheduleRestart(2000)
  }
}

export function initLibraryWatch(rootGetter: RootGetter): void {
  getRoot = rootGetter
  startWatcher()
}

export function restartLibraryWatch(): void {
  startWatcher()
}

/** 写入期间暂停目录监控，避免 Windows 上 rename/原子写触发 EPERM */
export async function withWatchPaused<T>(fn: () => Promise<T>): Promise<T> {
  pauseCount += 1
  stopWatcher()
  suppressUntil = Date.now() + SUPPRESS_AFTER_WRITE_MS
  try {
    return await fn()
  } finally {
    pauseCount = Math.max(0, pauseCount - 1)
    setTimeout(() => {
      if (pauseCount === 0) startWatcher()
    }, 200)
  }
}
