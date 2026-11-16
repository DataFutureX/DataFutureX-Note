import { app, BrowserWindow, ipcMain, Menu, nativeTheme, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { SettingsService } from './services/SettingsService'
import { FileSystemService } from './services/FileSystemService'
import { FolderService } from './services/FolderService'
import { NoteService } from './services/NoteService'
import { SearchService } from './services/SearchService'
import { BackupService } from './services/BackupService'
import { ImportService } from './services/ImportService'
import { WordExportService } from './services/WordExportService'
import { PdfExportService } from './services/PdfExportService'
import { ThemeService } from './services/ThemeService'
import { RecoveryService } from './services/RecoveryService'
import { TrashService } from './services/TrashService'
import { TrayService } from './services/TrayService'
import { registerIpc } from './ipc'
import { initLibraryWatch, restartLibraryWatch } from './utils/libraryWatch'
import {
  bootstrapWritableUserData,
  canWriteSync,
  defaultLibraryDir
} from './utils/appPaths'
import { ensureDir, isWritableDir } from './utils/pathSafety'
import { installAssetProtocol, registerAssetScheme } from './utils/assetProtocol'
import {
  extractMarkdownPath,
  isMarkdownInLibrary,
  isViewerMode,
  prepareOpenMarkdown,
  type OpenMarkdownRequest
} from './utils/openMarkdown'
import { isolateViewerUserData, spawnMarkdownViewer } from './utils/openMarkdownViewer'

// 必须在 app ready 前注册，否则自定义协议无法加载本地图片
registerAssetScheme()
import {
  AccentTheme,
  resolveChromeColors,
  type ResolvedTheme
} from '../../src/types'

// 必须在读取 userData / 构造 SettingsService 之前完成
const writableUserData = bootstrapWritableUserData()
/** 库外 MD 独立查看进程：隔离 userData，避免改写主笔记库配置 */
const viewerMode = isViewerMode()
if (viewerMode) {
  isolateViewerUserData(writableUserData)
}
try {
  app.setAppUserModelId('com.datafuturex.note')
} catch {
  // ignore
}

process.env.DIST = path.join(__dirname, '../../dist')
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, '../public')

let mainWindow: BrowserWindow | null = null
/** 待打开的外部 Markdown（启动参数 / 二次实例 / open-file） */
let pendingOpenMarkdown: OpenMarkdownRequest | null = null
const settings = new SettingsService()

function takePendingOpenMarkdown(): OpenMarkdownRequest | null {
  const req = pendingOpenMarkdown
  pendingOpenMarkdown = null
  return req
}

async function queueOpenMarkdown(filePath: string): Promise<OpenMarkdownRequest | null> {
  try {
    const req = await prepareOpenMarkdown(filePath, settings)
    pendingOpenMarkdown = req
    return req
  } catch (err) {
    console.warn('[DataFutureX-Note] open markdown failed:', err)
    return null
  }
}

function sendOpenMarkdown(req: OpenMarkdownRequest): void {
  const win = getAliveMainWindow()
  if (!win || win.isDestroyed()) return
  win.webContents.send('open-markdown-file', req)
}
const fsService = new FileSystemService(() => settings.getRootDirectory())
const trashService = new TrashService(fsService)
const folderService = new FolderService(fsService, trashService)
const noteService = new NoteService(fsService, trashService)
const searchService = new SearchService(fsService)
const backupService = new BackupService(fsService)
const importService = new ImportService(fsService)
const wordExport = new WordExportService(fsService)
const pdfExport = new PdfExportService(fsService)
const themeService = new ThemeService()
const recovery = new RecoveryService()
const trayService = new TrayService()

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

function resolveWindowIcon(): string | undefined {
  // 任务栏/窗口必须用高清多尺寸图标，禁止误用损坏的 16-only ICO 或托盘小图
  const resourcesPath = typeof process.resourcesPath === 'string' ? process.resourcesPath : ''
  const candidates = [
    path.join(resourcesPath, 'icon.ico'),
    path.join(resourcesPath, 'icon-256.png'),
    path.join(resourcesPath, 'icon.png'),
    path.join(process.cwd(), 'icon.ico'),
    path.join(process.cwd(), 'resources', 'icon.ico'),
    path.join(process.cwd(), 'resources', 'icon-256.png'),
    path.join(process.cwd(), 'resources', 'icon.png'),
    path.join(__dirname, '../../resources/icon.ico'),
    path.join(__dirname, '../../resources/icon-256.png'),
    path.join(__dirname, '../../resources/icon.png')
  ]
  for (const p of candidates) {
    try {
      // 完整多尺寸 ICO ≈ 100KB+；坏的 16-only ICO 约 1KB
      if (p && fs.existsSync(p) && fs.statSync(p).size > 8000) return p
    } catch {
      // ignore
    }
  }
  return undefined
}

function getAliveMainWindow(): BrowserWindow | null {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow
  const first = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
  mainWindow = first || null
  return mainWindow
}

function createWindow(opts?: { secondary?: boolean; openNoteId?: string; openFolderId?: string | null }): BrowserWindow {
  const secondary = !!opts?.secondary
  const bounds = settings.get().windowBounds
  const resolved = themeService.resolve(settings.get().theme)
  const chrome = resolveChromeColors(resolved, settings.get().accentTheme)
  const icon = resolveWindowIcon()
  // 避免上次异常坐标把窗口开到屏幕外
  const useBounds =
    !secondary &&
    bounds &&
    typeof bounds.width === 'number' &&
    typeof bounds.height === 'number' &&
    bounds.width >= 800 &&
    bounds.height >= 500

  let x = useBounds ? bounds!.x : undefined
  let y = useBounds ? bounds!.y : undefined
  if (secondary) {
    const anchor = getAliveMainWindow()
    if (anchor && !anchor.isDestroyed()) {
      const b = anchor.getBounds()
      x = b.x + 32
      y = b.y + 32
    } else if (bounds) {
      x = (bounds.x || 80) + 32
      y = (bounds.y || 80) + 32
    }
  }

  const win = new BrowserWindow({
    width: useBounds ? bounds!.width : 1280,
    height: useBounds ? bounds!.height : 800,
    x,
    y,
    minWidth: 1000,
    minHeight: 650,
    title: viewerMode ? 'DataFutureX Note — 查看' : 'DataFutureX Note',
    show: false,
    icon,
    backgroundColor: chrome.color,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: chrome.color,
      symbolColor: chrome.symbolColor,
      height: 40
    },
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true
    }
  })

  if (!secondary || !mainWindow || mainWindow.isDestroyed()) {
    mainWindow = win
  }

  const reveal = () => {
    if (win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }
  win.once('ready-to-show', () => {
    reveal()
    // 主实例：窗口显示后再建托盘，避免拖慢首屏
    if (!viewerMode && !secondary) {
      setTimeout(() => {
        try {
          trayService.ensure(() => getAliveMainWindow(), 2)
          wireTrayMenuActions()
        } catch (err) {
          console.warn('[DataFutureX-Note] tray init failed:', err)
        }
      }, 800)
    }
    if (opts?.openNoteId) {
      win.webContents.send('open-note-by-id', {
        noteId: opts.openNoteId,
        folderId: opts.openFolderId ?? null
      })
    }
  })
  // 兜底：加载异常时也尽量把窗口拉起来
  setTimeout(reveal, 2500)

  // 关闭：仅最后一扇主窗在托盘值守时隐藏；其它窗口直接关闭
  win.on('close', (event) => {
    if (win.isDestroyed()) return
    const b = win.getBounds()
    void settings.update({ windowBounds: b })
    if (viewerMode) return
    const others = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w !== win)
    if (!trayService.isQuitting() && trayService.hasTray() && others.length === 0) {
      event.preventDefault()
      trayService.hideToTray(win)
      return
    }
    if (mainWindow === win) {
      mainWindow = others[0] || null
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) {
      event.preventDefault()
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    }
  })

  if (VITE_DEV_SERVER_URL) {
    void win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    void win.loadFile(path.join(process.env.DIST!, 'index.html'))
  }
  return win
}

function showOrCreateMainWindow(): BrowserWindow {
  const win = getAliveMainWindow()
  if (win) {
    trayService.showWindow(win)
    return win
  }
  return createWindow()
}

function openNoteFromTray(note: { id: string; name: string; folderId?: string }): void {
  const win = showOrCreateMainWindow()
  const payload = { noteId: note.id, folderId: note.folderId ?? null }
  const send = () => {
    if (win.isDestroyed()) return
    win.webContents.send('open-note-by-id', payload)
  }
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', send)
  } else {
    // 稍延后，避免窗口刚从托盘恢复时渲染进程未就绪
    setTimeout(send, 50)
  }
}

function wireTrayMenuActions(): void {
  trayService.setMenuActions({
    showMainWindow: () => {
      showOrCreateMainWindow()
    },
    openNewWindow: () => {
      createWindow({ secondary: true })
    },
    openRecentNote: (note) => openNoteFromTray(note),
    getRecentNotes: () => {
      const s = settings.get()
      let list = (s.recentNotes || []).filter((n) => n && n.id)
      // 兜底：列表为空但有 lastNoteId 时仍展示
      if (!list.length && s.lastNoteId) {
        const name =
          s.lastNoteId.split(/[/\\]/).pop()?.replace(/\.md$/i, '') || s.lastNoteId
        list = [
          {
            id: s.lastNoteId,
            name,
            folderId: s.lastFolderId || '.',
            openedAt: Date.now()
          }
        ]
      }
      return list.map((n) => ({
        id: n.id,
        name: n.name || n.id,
        folderId: n.folderId
      }))
    }
  })
}

function watchLibrary(): void {
  initLibraryWatch(() => settings.getRootDirectory())
  ipcMain.on('restart-library-watch', () => restartLibraryWatch())
}

/** 主实例单开；查看进程可多开且不抢锁 */
const gotLock = viewerMode ? true : app.requestSingleInstanceLock()
if (!viewerMode && !gotLock) {
  app.quit()
} else if (!viewerMode) {
  app.on('second-instance', (_event, commandLine) => {
    void (async () => {
      const md = extractMarkdownPath(commandLine)
      if (md) {
        if (isMarkdownInLibrary(md, settings.getRootDirectory())) {
          await openMarkdownPath(md, { focusMain: true })
          return
        }
        // 库外 MD：另开查看进程，不改动主笔记库、不强拉主窗口
        spawnMarkdownViewer(md)
        return
      }
      showOrCreateMainWindow()
    })()
  })
}

/** macOS 可能在 ready 前收到 open-file，先暂存，待设置加载后再分流 */
let pendingOsOpenFile: string | null = null

async function openMarkdownPath(filePath: string, opts?: { focusMain?: boolean }): Promise<void> {
  if (!viewerMode && !isMarkdownInLibrary(filePath, settings.getRootDirectory())) {
    spawnMarkdownViewer(filePath)
    return
  }
  const req = await queueOpenMarkdown(filePath)
  if (req && mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoading()) {
    sendOpenMarkdown(req)
    pendingOpenMarkdown = null
  }
  if (opts?.focusMain) {
    showOrCreateMainWindow()
  }
}

// macOS：Finder 打开文件
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  if (!app.isReady()) {
    pendingOsOpenFile = filePath
    return
  }
  void openMarkdownPath(filePath, { focusMain: isMarkdownInLibrary(filePath, settings.getRootDirectory()) })
})

app.whenReady().then(async () => {
  if (!gotLock) return
  installAssetProtocol(() => settings.getRootDirectory())
  await settings.load()

  themeService.applyPreference(settings.get().theme)
  Menu.setApplicationMenu(null)

  const applyChromeTheme = (theme: ResolvedTheme, accent?: AccentTheme) => {
    const chrome = resolveChromeColors(theme, accent ?? settings.get().accentTheme)
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        win.setBackgroundColor(chrome.color)
      } catch {
        // ignore
      }
      try {
        win.setTitleBarOverlay({
          color: chrome.color,
          symbolColor: chrome.symbolColor,
          height: 40
        })
      } catch {
        // ignore if unsupported
      }
    }
  }

  themeService.onUpdated((theme) => {
    applyChromeTheme(theme, settings.get().accentTheme)
  })

  nativeTheme.on('updated', () => {
    const osTheme = themeService.getOsTheme()
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('system-theme-changed', osTheme)
    }
  })

  ipcMain.handle(
    'setTitleBarOverlayTheme',
    async (_e, theme: 'light' | 'dark', accent?: AccentTheme) => {
      applyChromeTheme(theme === 'dark' ? 'dark' : 'light', accent)
    }
  )

  registerIpc({
    settings,
    fsService,
    folderService,
    noteService,
    searchService,
    backupService,
    importService,
    wordExport,
    pdfExport,
    themeService,
    recovery,
    trashService,
    writableUserData,
    onSettingsUpdated: () => trayService.refreshContextMenu()
  })

  ipcMain.handle('windowMinimize', async () => {
    BrowserWindow.getFocusedWindow()?.minimize()
  })
  ipcMain.handle('windowMaximizeToggle', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.handle('windowClose', async () => {
    const win = BrowserWindow.getFocusedWindow() || getAliveMainWindow()
    if (!win) return
    const b = win.getBounds()
    void settings.update({ windowBounds: b })
    const others = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w !== win)
    if (!viewerMode && trayService.hasTray() && others.length === 0) {
      trayService.hideToTray(win)
    } else {
      win.close()
    }
  })
  ipcMain.handle('appQuit', async () => {
    trayService.markQuit()
    app.quit()
  })

  ipcMain.handle('consumeOpenMarkdownRequest', async () => takePendingOpenMarkdown())

  // 先出窗，再处理后台启动任务（打开 MD / 可写探测 / 托盘）
  createWindow()
  wireTrayMenuActions()
  watchLibrary()

  app.on('activate', () => {
    showOrCreateMainWindow()
  })

  void (async () => {
    const launchMd = pendingOsOpenFile || extractMarkdownPath(process.argv)
    pendingOsOpenFile = null
    if (launchMd) {
      if (viewerMode || isMarkdownInLibrary(launchMd, settings.getRootDirectory())) {
        // 留给渲染进程 consumeOpenMarkdownRequest / onOpenMarkdownFile
        await queueOpenMarkdown(launchMd)
        if (pendingOpenMarkdown) sendOpenMarkdown(pendingOpenMarkdown)
      } else {
        spawnMarkdownViewer(launchMd)
      }
    }

    if (!viewerMode) {
      const configuredRoot = settings.getRootDirectory()
      if (configuredRoot) {
        const writable = await isWritableDir(configuredRoot)
        if (!writable) {
          const fallback = defaultLibraryDir(writableUserData)
          await ensureDir(fallback)
          if (canWriteSync(fallback)) {
            console.warn(
              `[DataFutureX-Note] 原笔记库不可写，已切换到推荐目录：${fallback}\n原路径：${configuredRoot}`
            )
            await settings.setRootDirectory(fallback)
          } else {
            console.warn(`[DataFutureX-Note] 笔记库不可写：${configuredRoot}`)
            await settings.update({ rootDirectory: null })
          }
        }
      }
    }
  })()
})

app.on('window-all-closed', () => {
  if (viewerMode) {
    app.quit()
    return
  }
  // 有托盘值守时不退出；无托盘则按常规退出
  if (process.platform !== 'darwin' && !trayService.hasTray()) {
    app.quit()
  }
})

app.on('before-quit', () => {
  trayService.markQuit()
})

app.on('will-quit', () => {
  trayService.destroy()
})

process.on('uncaughtException', (err) => {
  console.error('[DataFutureX-Note] uncaughtException:', err)
})

process.on('unhandledRejection', (err) => {
  console.error('[DataFutureX-Note] unhandledRejection:', err)
})
