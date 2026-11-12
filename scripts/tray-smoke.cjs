const { app, Tray, nativeImage, Menu } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const root = path.join(__dirname, '..')
const iconPath = path.join(root, 'resources', 'tray-32.png')
const outPath = path.join(root, 'resources', '.tray-smoke.log')

function log(m, x) {
  const line = `[smoke] ${m}${x !== undefined ? ' ' + JSON.stringify(x) : ''}\n`
  try {
    fs.appendFileSync(outPath, line, 'utf8')
  } catch {
    // ignore
  }
}

try {
  fs.writeFileSync(outPath, '', 'utf8')
} catch {
  // ignore
}

app.setAppUserModelId('com.datafuturex.note.smoke.' + Date.now())

app.whenReady().then(() => {
  log('ready', {
    exe: process.execPath,
    electron: process.versions.electron,
    iconPath,
    exists: fs.existsSync(iconPath)
  })

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

  log('bounds1', tray.getBounds())
  log('destroyed', tray.isDestroyed())

  setTimeout(() => {
    log('bounds2', tray.getBounds())
    try {
      tray.displayBalloon({ title: 'Smoke', content: 'tray smoke', iconType: 'info' })
      log('balloon ok')
    } catch (e) {
      log('balloon err', String(e))
    }
    setTimeout(() => {
      log('done')
      app.quit()
    }, 2000)
  }, 1000)
}).catch((e) => {
  log('whenReady failed', String(e))
  app.exit(1)
})
