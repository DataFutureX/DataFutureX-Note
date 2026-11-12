import { app, BrowserWindow, Menu, Tray, nativeImage, Notification } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import zlib from 'node:zlib'
import { execFile } from 'node:child_process'

function logTray(msg: string, extra?: unknown): void {
  const line = `[TrayService] ${msg}${extra !== undefined ? ' ' + JSON.stringify(extra) : ''}`
  console.log(line)
  try {
    const logPath = path.join(app.getPath('userData'), 'tray-debug.log')
    fs.appendFileSync(logPath, `${new Date().toISOString()} ${line}\n`, 'utf8')
  } catch {
    // ignore
  }
}

function resourcesDir(): string {
  const candidates: string[] = [
    // 开发态优先：仓库 resources（勿让 electron-runtime 的空 resources 抢先）
    path.join(process.cwd(), 'resources'),
    path.join(__dirname, '../../resources'),
    path.join(__dirname, '../../../resources')
  ]
  try {
    candidates.push(path.join(app.getAppPath(), 'resources'))
  } catch {
    // ignore
  }
  try {
    // 打包后 extraResources 在此；开发态 electron-runtime 下通常没有我们的 logo
    if (process.resourcesPath) candidates.push(process.resourcesPath)
  } catch {
    // ignore
  }

  const hasLogo = (dir: string) => {
    try {
      return (
        fs.existsSync(path.join(dir, 'tray-16.png')) ||
        fs.existsSync(path.join(dir, 'tray-32.png')) ||
        fs.existsSync(path.join(dir, 'icon-48.png')) ||
        fs.existsSync(path.join(dir, 'icon.png'))
      )
    } catch {
      return false
    }
  }

  for (const dir of candidates) {
    if (hasLogo(dir)) return dir
  }
  for (const dir of candidates) {
    try {
      if (fs.existsSync(dir)) return dir
    } catch {
      // ignore
    }
  }
  return candidates[0]
}

function buildSolidPng32(): Buffer {
  // 兜底：柔蓝纯色块（#5b8fd9）
  const w = 32
  const h = 32
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) {
    const row = y * (w * 4 + 1)
    raw[row] = 0
    for (let x = 0; x < w; x++) {
      const i = row + 1 + x * 4
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1
      raw[i] = edge ? 255 : 0x5b
      raw[i + 1] = edge ? 255 : 0x8f
      raw[i + 2] = edge ? 255 : 0xd9
      raw[i + 3] = 255
    }
  }
  const compressed = zlib.deflateSync(raw)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const chunks: Buffer[] = []
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const pushChunk = (type: string, data: Buffer) => {
    const typeBuf = Buffer.from(type)
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length, 0)
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(zlib.crc32(Buffer.concat([typeBuf, data])) >>> 0, 0)
    chunks.push(len, typeBuf, data, crc)
  }
  pushChunk('IHDR', ihdr)
  pushChunk('IDAT', compressed)
  pushChunk('IEND', Buffer.alloc(0))
  return Buffer.concat([signature, ...chunks])
}

function promoteTrayInRegistry(exePath: string): void {
  if (process.platform !== 'win32') return
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$exe = '${exePath.replace(/'/g, "''")}'
$root = 'HKCU:\\Control Panel\\NotifyIconSettings'
$n = 0
Get-ChildItem $root | ForEach-Object {
  $p = Get-ItemProperty $_.PSPath
  if ($p.ExecutablePath -and ($p.ExecutablePath -ieq $exe -or $p.ExecutablePath -like '*DataFutureX-Note*\\node_modules\\electron\\dist\\electron.exe')) {
    Set-ItemProperty $_.PSPath -Name IsPromoted -Value 1 -Type DWord
    $n++
    Write-Output ("promoted:" + $_.PSChildName + " tip=" + $p.IconTip)
  }
}
Write-Output ("matched=" + $n)
`
  try {
    const tmp = path.join(app.getPath('userData'), 'dfx-promote-tray.ps1')
    fs.writeFileSync(tmp, script, 'utf8')
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmp],
      { windowsHide: true, timeout: 10000 },
      (err, stdout, stderr) => {
        logTray('promote result', {
          err: err ? String(err.message || err) : null,
          stdout: String(stdout || '').trim(),
          stderr: String(stderr || '').trim()
        })
      }
    )
  } catch (err) {
    logTray('promote write failed', String(err))
  }
}

export class TrayService {
  private tray: Tray | null = null
  private quitting = false
  private balloonShown = false
  private creating = false

  isQuitting(): boolean {
    return this.quitting
  }

  hasTray(): boolean {
    return !!this.tray && !this.tray.isDestroyed()
  }

  markQuit(): void {
    this.quitting = true
  }

  /**
   * 复制到 userData，避免锁住仓库 resources 导致 Vite EBUSY。
   * 开发态不用 GUID：未签名 electron.exe + GUID/AUMID 易导致 Shell_NotifyIcon 静默失败。
   */
  private materializeTrayIcon(): string {
    const dir = resourcesDir()
    // 优先原生 16/32 托盘图（文档折角 logo），避免错误缩放后看不清
    const candidates = ['tray-16.png', 'tray-32.png', 'icon-48.png', 'icon-256.png', 'icon.png']
    let src = ''
    for (const name of candidates) {
      const p = path.join(dir, name)
      try {
        if (fs.existsSync(p) && fs.statSync(p).size > 80) {
          src = p
          break
        }
      } catch {
        // ignore
      }
    }
    if (!src) {
      src = this.ensureFallbackIconFile()
      if (!src) return ''
    }
    try {
      const destDir = path.join(app.getPath('userData'), 'tray-icons')
      fs.mkdirSync(destDir, { recursive: true })
      // 版本后缀：强制替换旧的错误托盘缓存
      const dest = path.join(destDir, 'tray-notify-softblue.png')
      fs.copyFileSync(src, dest)
      return dest
    } catch (err) {
      logTray('materialize failed, use src', String(err))
      return src
    }
  }

  resolveTrayIconPath(): string {
    return this.materializeTrayIcon()
  }

  resolveIconPath(): string {
    const dir = resourcesDir()
    for (const name of ['icon.ico', 'icon-256.png', 'icon.png']) {
      const p = path.join(dir, name)
      try {
        if (fs.existsSync(p) && fs.statSync(p).size > 1000) return p
      } catch {
        // ignore
      }
    }
    return this.resolveTrayIconPath()
  }

  private ensureFallbackIconFile(): string {
    const out = path.join(resourcesDir(), 'tray-fallback-32.png')
    try {
      if (!fs.existsSync(out) || fs.statSync(out).size < 50) {
        fs.writeFileSync(out, buildSolidPng32())
      }
      return out
    } catch (err) {
      logTray('fallback write failed', String(err))
      return ''
    }
  }

  create(getMainWindow: () => BrowserWindow | null): Tray | null {
    if (this.tray && !this.tray.isDestroyed()) return this.tray
    if (this.creating) return this.tray
    this.creating = true
    try {
      if (!app.isReady()) {
        logTray('app not ready')
        return null
      }

      const iconPath = this.materializeTrayIcon()
      const exePath = process.execPath
      logTray('creating', {
        iconPath,
        exists: !!(iconPath && fs.existsSync(iconPath)),
        size: iconPath && fs.existsSync(iconPath) ? fs.statSync(iconPath).size : 0,
        resources: resourcesDir(),
        cwd: process.cwd(),
        exePath,
        aumid: 'com.datafuturex.note',
        electron: process.versions.electron
      })

      // 关键用 NativeImage + 强制 16px（Win 托盘常用尺寸）
      let image: Electron.NativeImage
      if (iconPath && fs.existsSync(iconPath)) {
        image = nativeImage.createFromPath(iconPath)
        if (image.isEmpty()) {
          logTray('nativeImage empty from path, use solid')
          image = nativeImage.createFromBuffer(buildSolidPng32())
        }
      } else {
        image = nativeImage.createFromBuffer(buildSolidPng32())
      }
      // 已是 16px 则不再二次缩放，保留折角与线条细节
      const size = image.getSize()
      const trayImage =
        size.width === 16 && size.height === 16
          ? image
          : image.resize({ width: 16, height: 16, quality: 'best' })

      // 不用 GUID：开发态共用未签名 electron.exe，GUID 极易导致「对象有了但系统托盘不注册」
      const tray = new Tray(trayImage)
      tray.setToolTip('DataFutureX Note')
      tray.setContextMenu(
        Menu.buildFromTemplate([
          {
            label: '显示主窗口',
            click: () => this.showWindow(getMainWindow())
          },
          { type: 'separator' },
          {
            label: '退出',
            click: () => {
              this.markQuit()
              app.quit()
            }
          }
        ])
      )
      tray.on('double-click', () => this.showWindow(getMainWindow()))
      tray.on('click', () => this.showWindow(getMainWindow()))

      try {
        tray.setImage(trayImage)
      } catch (err) {
        logTray('setImage failed', String(err))
      }

      this.tray = tray

      let bounds: Electron.Rectangle | null = null
      try {
        bounds = tray.getBounds()
      } catch {
        bounds = null
      }
      logTray('ready', {
        destroyed: tray.isDestroyed(),
        bounds,
        // bounds 全 0 通常表示 Windows 未真正挂上通知区图标
        likelyHiddenOrMissing: !bounds || (bounds.width === 0 && bounds.height === 0)
      })

      setTimeout(() => promoteTrayInRegistry(exePath), 500)
      setTimeout(() => promoteTrayInRegistry(exePath), 2500)

      if (!this.balloonShown) {
        this.balloonShown = true
        setTimeout(() => {
          try {
            if (!tray.isDestroyed()) {
              tray.displayBalloon({
                title: 'DataFutureX Note 已值守',
                content: '请查看任务栏右下角；若没有，点 ^ 展开隐藏图标。',
                iconType: 'info'
              })
            }
          } catch (err) {
            logTray('balloon failed', String(err))
          }
          try {
            if (Notification.isSupported()) {
              const n = new Notification({
                title: 'DataFutureX Note 已值守',
                body: '托盘图标应已出现。看不到时请点任务栏 ^ 展开。'
              })
              n.show()
            }
          } catch (err) {
            logTray('notification failed', String(err))
          }
          try {
            logTray('bounds after delay', tray.isDestroyed() ? null : tray.getBounds())
          } catch (err) {
            logTray('bounds after delay failed', String(err))
          }
        }, 900)
      }

      return tray
    } catch (err) {
      logTray('create failed', String(err))
      this.tray = null
      return null
    } finally {
      this.creating = false
    }
  }

  ensure(getMainWindow: () => BrowserWindow | null, retries = 5): void {
    if (this.hasTray()) {
      logTray('already has tray')
      return
    }
    const tryCreate = (left: number) => {
      if (this.hasTray() || this.quitting) return
      const t = this.create(getMainWindow)
      if (!t && left > 0) {
        logTray('retry', { left })
        setTimeout(() => tryCreate(left - 1), 800)
      } else if (!t) {
        logTray('give up')
      }
    }
    tryCreate(retries)
  }

  showWindow(win: BrowserWindow | null): void {
    if (!win || win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }

  hideToTray(win: BrowserWindow | null): void {
    if (!win || win.isDestroyed()) return
    if (!this.hasTray()) this.ensure(() => win, 3)
    win.hide()
  }

  destroy(): void {
    try {
      this.tray?.destroy()
    } catch {
      // ignore
    }
    this.tray = null
  }
}
