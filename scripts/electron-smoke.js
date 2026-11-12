const { app, BrowserWindow, Tray, nativeImage } = require('electron')
const fs = require('fs')
const path = require('path')

const logFile = path.join(__dirname, '../.tmp-smoke.log')
function log(msg) {
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`)
}

fs.writeFileSync(logFile, '')
log('boot')

process.on('uncaughtException', (e) => log('uncaught ' + e.stack))
process.on('unhandledRejection', (e) => log('rejection ' + e))

app.whenReady().then(() => {
  log('ready')
  const win = new BrowserWindow({ width: 800, height: 600, show: true })
  win.loadURL('about:blank')
  log('window created')

  try {
    const icon = path.join(__dirname, '../resources/icon.png')
    log('icon exists ' + fs.existsSync(icon) + ' ' + icon)
    const image = nativeImage.createFromPath(icon)
    log('image empty ' + image.isEmpty() + ' size ' + JSON.stringify(image.getSize()))
    const tray = new Tray(image.resize({ width: 16, height: 16 }))
    tray.setToolTip('smoke')
    log('tray ok')
  } catch (e) {
    log('tray fail ' + e.stack)
  }

  setTimeout(() => {
    log('exit timer')
    app.quit()
  }, 2000)
})
