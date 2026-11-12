import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const require = createRequire(import.meta.url)

// 先同步托盘可用的 Electron 运行时（Windows）
await import('./prepare-electron-runtime.mjs')

const runtimePathFile = path.join(root, '.tmp', 'electron-runtime-path.txt')
const env = { ...process.env }
if (process.platform === 'win32' && fs.existsSync(runtimePathFile)) {
  const runtimeDir = fs.readFileSync(runtimePathFile, 'utf8').trim()
  if (runtimeDir && fs.existsSync(path.join(runtimeDir, 'electron.exe'))) {
    env.ELECTRON_OVERRIDE_DIST_PATH = runtimeDir
    console.log('[dev] ELECTRON_OVERRIDE_DIST_PATH =', runtimeDir)
  }
}

const viteBin = path.join(
  path.dirname(require.resolve('vite/package.json')),
  'bin',
  'vite.js'
)

const child = spawn(process.execPath, [viteBin], {
  cwd: root,
  env,
  stdio: 'inherit',
  shell: false
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 0)
})
