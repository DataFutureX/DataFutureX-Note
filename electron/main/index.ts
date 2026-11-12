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

// 必须在 app ready 前注册，否则自定义协议无法加载本地图片
registerAssetScheme()
import {
  AccentTheme,
  resolveChromeColors,
  type ResolvedTheme
} from '../../src/types'

// 必须在读取 userData / 构造 SettingsService 之前完成
const writableUserData = bootstrapWritableUserData()
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
const settings = new SettingsService()
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
    title: 'DataFutureX Note',
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
    // 窗口就绪后再建托盘，并允许重试
    trayService.ensure(() => mainWindow, 3)
  })
  // 兜底：加载异常时也尽量把窗口拉起来
  setTimeout(reveal, 2500)
  setTimeout(() => trayService.ensure(() => mainWindow, 2), 1500)

  // 关闭按钮：若托盘已就绪则值守隐藏，否则正常退出
  mainWindow.on('close', (event) => {
    if (!mainWindow) return
    const b = mainWindow.getBounds()
    void settings.update({ windowBounds: b })
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

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) createWindow()
    else trayService.showWindow(mainWindow)
  })
}

app.whenReady().then(async () => {
  if (!gotLock) return
  installAssetProtocol(() => settings.getRootDirectory())
  await settings.load()

  // 若已配置根目录但对当前 Electron 进程不可写，自动切到可写的推荐库，避免「什么都做不了」
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
    if (trayService.hasTray()) {
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

  createWindow()
  watchLibrary()

  // 再兜底一次：部分环境 ready-to-show 不可靠
  setTimeout(() => {
    try {
      trayService.ensure(() => mainWindow, 3)
    } catch (err) {
      console.warn('[DataFutureX-Note] tray init failed:', err)
    }
  }, 1200)

  app.on('activate', () => {
    if (!mainWindow || mainWindow.isDestroyed()) createWindow()
    else trayService.showWindow(mainWindow)
  })
})

app.on('window-all-closed', () => {
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
