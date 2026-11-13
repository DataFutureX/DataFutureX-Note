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
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('open-markdown-file', req)
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
  // 任务栏/窗口必须用高清多尺寸图标，禁止误用 16px 托盘图（会被放大发糊）
  const candidates = [
    path.join(process.cwd(), 'resources', 'icon.ico'),
    path.join(__dirname, '../../resources/icon.ico'),
    path.join(process.cwd(), 'resources', 'icon-256.png'),
    path.join(process.cwd(), 'resources', 'icon.png'),
    path.join(__dirname, '../../resources/icon.png')
  ]
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p) && fs.statSync(p).size > 1000) return p
    } catch {
      // ignore
    }
  }
  return undefined
}

function createWindow(): void {
  const bounds = settings.get().windowBounds
  const resolved = themeService.resolve(settings.get().theme)
  const chrome = resolveChromeColors(resolved, settings.get().accentTheme)
  const icon = resolveWindowIcon()
  // 避免上次异常坐标把窗口开到屏幕外
  const useBounds =
    bounds &&
    typeof bounds.width === 'number' &&
    typeof bounds.height === 'number' &&
    bounds.width >= 800 &&
    bounds.height >= 500
  mainWindow = new BrowserWindow({
    width: useBounds ? bounds!.width : 1280,
    height: useBounds ? bounds!.height : 800,
    x: useBounds ? bounds!.x : undefined,
    y: useBounds ? bounds!.y : undefined,
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

  const reveal = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
  mainWindow.once('ready-to-show', () => {
    reveal()
    // 主实例：窗口就绪后再建托盘；查看进程不挂托盘
    if (!viewerMode) trayService.ensure(() => mainWindow, 3)
  })
  // 兜底：加载异常时也尽量把窗口拉起来
  setTimeout(reveal, 2500)
  if (!viewerMode) setTimeout(() => trayService.ensure(() => mainWindow, 2), 1500)

  // 关闭按钮：主实例有托盘则值守隐藏；查看进程直接关闭
  mainWindow.on('close', (event) => {
    if (!mainWindow) return
    const b = mainWindow.getBounds()
    void settings.update({ windowBounds: b })
    if (viewerMode) return
    if (!trayService.isQuitting() && trayService.hasTray()) {
      event.preventDefault()
      trayService.hideToTray(mainWindow)
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow?.webContents.getURL()) {
      event.preventDefault()
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    }
  })

  if (VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    void mainWindow.loadFile(path.join(process.env.DIST!, 'index.html'))
  }
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
      if (!mainWindow || mainWindow.isDestroyed()) createWindow()
      else trayService.showWindow(mainWindow)
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
    if (!mainWindow || mainWindow.isDestroyed()) createWindow()
    else if (!viewerMode) trayService.showWindow(mainWindow)
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

  // 启动参数 / macOS open-file 中的 Markdown
  const launchMd = pendingOsOpenFile || extractMarkdownPath(process.argv)
  pendingOsOpenFile = null
  if (launchMd) {
    if (viewerMode || isMarkdownInLibrary(launchMd, settings.getRootDirectory())) {
      await queueOpenMarkdown(launchMd)
    } else {
      // 库外文件另开查看进程，主窗口仍进原笔记库
      spawnMarkdownViewer(launchMd)
    }
  }

  // 主实例：若已配置根目录但对当前 Electron 进程不可写，自动切到可写的推荐库
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

  themeService.applyPreference(settings.get().theme)
  // 菜单改由渲染进程第一栏承载，隐藏系统默认 File/Edit/View/Window/Help
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

  // 生效主题变化 → 更新窗口铬（标题栏/背景，跟随当前主题色）
  themeService.onUpdated((theme) => {
    applyChromeTheme(theme, settings.get().accentTheme)
  })

  // OS 主题变化单独通知渲染进程（仅「跟随系统」时使用，避免被 light/dark 强制值污染）
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
    writableUserData
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
    const win = BrowserWindow.getFocusedWindow() || mainWindow
    if (!win) return
    const b = win.getBounds()
    void settings.update({ windowBounds: b })
    if (!viewerMode && trayService.hasTray()) {
      trayService.hideToTray(win)
    } else {
      trayService.markQuit()
      win.close()
    }
  })
  ipcMain.handle('appQuit', async () => {
    trayService.markQuit()
    app.quit()
  })

  ipcMain.handle('consumeOpenMarkdownRequest', async () => takePendingOpenMarkdown())

  createWindow()
  watchLibrary()

  // 再兜底一次：部分环境 ready-to-show 不可靠
  if (!viewerMode) {
    setTimeout(() => {
      try {
        trayService.ensure(() => mainWindow, 3)
      } catch (err) {
        console.warn('[DataFutureX-Note] tray init failed:', err)
      }
    }, 1200)
  }

  app.on('activate', () => {
    if (!mainWindow || mainWindow.isDestroyed()) createWindow()
    else if (!viewerMode) trayService.showWindow(mainWindow)
    else {
      mainWindow.show()
      mainWindow.focus()
    }
  })
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
