/**
 * Windows 下部分目录中的 electron.exe 无法注册托盘图标（Shell_NotifyIcon 失败）。
 * 将运行时复制到 %LOCALAPPDATA%\DataFutureX-Note\electron-runtime，
 * 并通过 ELECTRON_OVERRIDE_DIST_PATH 让开发态使用该副本。
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const srcDist = path.join(root, 'node_modules', 'electron', 'dist')
const runtimeDir = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
  'DataFutureX-Note',
  'electron-runtime'
)
const marker = path.join(runtimeDir, '.runtime-version')
const pkgPath = path.join(root, 'node_modules', 'electron', 'package.json')

function electronVersion() {
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version || 'unknown'
  } catch {
    return 'unknown'
  }
}

function main() {
  if (process.platform !== 'win32') {
    console.log('[prepare-electron-runtime] skip (non-windows)')
    return
  }
  if (!fs.existsSync(path.join(srcDist, 'electron.exe'))) {
    console.warn('[prepare-electron-runtime] missing node_modules/electron/dist/electron.exe')
    return
  }

  const ver = electronVersion()
  const needCopy =
    !fs.existsSync(path.join(runtimeDir, 'electron.exe')) ||
    !fs.existsSync(marker) ||
    fs.readFileSync(marker, 'utf8').trim() !== ver

  if (needCopy) {
    try {
      fs.mkdirSync(path.dirname(runtimeDir), { recursive: true })
      fs.rmSync(runtimeDir, { recursive: true, force: true })
      fs.cpSync(srcDist, runtimeDir, { recursive: true })
      fs.writeFileSync(marker, ver, 'utf8')
      console.log('[prepare-electron-runtime] synced', ver, '->', runtimeDir)
    } catch (err) {
      // 运行中的 electron 可能锁文件；若已有可用运行时则继续
      if (fs.existsSync(path.join(runtimeDir, 'electron.exe'))) {
        console.warn('[prepare-electron-runtime] sync failed, reuse existing:', err)
      } else {
        console.warn('[prepare-electron-runtime] sync failed:', err)
        return
      }
    }
  } else {
    console.log('[prepare-electron-runtime] up to date', runtimeDir)
  }

  // 供 npm scripts 读取
  const outEnv = path.join(root, '.tmp', 'electron-runtime-path.txt')
  fs.mkdirSync(path.dirname(outEnv), { recursive: true })
  fs.writeFileSync(outEnv, runtimeDir, 'utf8')
}

main()
