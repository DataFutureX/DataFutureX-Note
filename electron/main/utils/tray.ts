import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

let tray: Tray | null = null
let quitting = false

export function isAppQuitting(): boolean {
  return quitting
}

export function requestAppQuit(): void {
  quitting = true
  app.quit()
}

function resolveAppIcon(): string {
  const candidates = [
    path.join(process.cwd(), 'resources', 'icon.ico'),
    path.join(process.cwd(), 'resources', 'icon.png'),
    path.join(__dirname, '../../../resources/icon.ico'),
    path.join(__dirname, '../../../resources/icon.png'),
    path.join(process.resourcesPath || '', 'icon.ico'),
    path.join(process.resourcesPath || '', 'icon.png')
  ]
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p
  }
  return ''
}

export function getAppIconPath(): string {
  return resolveAppIcon()
}

function showMainWindow(getWindow: () => BrowserWindow | null, createWindow: () => void) {
  let win = getWindow()
  if (!win || win.isDestroyed()) {
    createWindow()
    win = getWindow()
  }
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

/** 创建系统托盘值守图标 */
export function createTray(deps: {
  getWindow: () => BrowserWindow | null
  createWindow: () => void
}): Tray {
  if (tray && !tray.isDestroyed()) return tray

  const iconPath = resolveAppIcon()
  const image = iconPath
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty()

  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image)
  tray.setToolTip('DataFutureX Note')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => showMainWindow(deps.getWindow, deps.createWindow)
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => requestAppQuit()
    }
  ])
  tray.setContextMenu(contextMenu)

  tray.on('double-click', () => showMainWindow(deps.getWindow, deps.createWindow))
  tray.on('click', () => {
    // Windows 单击托盘：显示/聚焦主窗口
    if (process.platform === 'win32') {
      showMainWindow(deps.getWindow, deps.createWindow)
    }
  })

  return tray
}

export function destroyTray(): void {
  if (tray && !tray.isDestroyed()) {
    tray.destroy()
  }
  tray = null
}
