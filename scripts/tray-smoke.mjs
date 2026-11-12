import { app, Tray, nativeImage, Menu } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const iconPath = path.join(root, 'resources', 'tray-32.png')

app.setAppUserModelId('com.datafuturex.note.smoke.' + Date.now())

app.whenReady().then(() => {
  const log = (m, x) => console.log('[smoke]', m, x ?? '')
  log('exe', process.execPath)
  log('icon', { iconPath, exists: fs.existsSync(iconPath) })

  let img = nativeImage.createFromPath(iconPath)
  if (img.isEmpty()) {
    log('empty image')
    app.exit(2)
    return
  }
  img = img.resize({ width: 16, height: 16 })

  const tray = new Tray(img)
  tray.setToolTip('DFX Tray Smoke')
  tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Quit', click: () => app.quit() }]))

  const bounds = tray.getBounds()
  log('bounds', bounds)
  log('destroyed', tray.isDestroyed())

  setTimeout(() => {
    log('bounds2', tray.getBounds())
    try {
      tray.displayBalloon({ title: 'Smoke', content: 'tray smoke', iconType: 'info' })
    } catch (e) {
      log('balloon err', String(e))
    }
    setTimeout(() => app.quit(), 2500)
  }, 1000)
})
