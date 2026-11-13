/**
 * 打包后将 Logo（resources/icon.ico）写入 Windows 可执行文件，
 * 确保桌面快捷方式显示应用 Logo，而不是 Electron 默认图标。
 *
 * 使用 scripts/bin/rcedit-x64.exe（不依赖 npm 上的 @electron/rcedit）。
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return

  // 跳过 NSIS 卸载器临时包，避免改坏安装包结构
  const outDir = context.appOutDir || ''
  if (outDir.includes('__uninstaller-nsis') || outDir.includes('.eked')) {
    console.log('[afterPack] skip uninstaller staging dir')
    return
  }

  const projectDir = context.packager?.projectDir || path.join(__dirname, '..')
  const iconPath = [
    path.join(projectDir, 'resources', 'icon.ico'),
    path.join(projectDir, 'build', 'icon.ico')
  ].find((p) => fs.existsSync(p))

  if (!iconPath) {
    console.warn('[afterPack] Logo icon.ico not found, skip embedding')
    return
  }

  const productFilename = context.packager.appInfo.productFilename
  const exePath = path.join(context.appOutDir, `${productFilename}.exe`)
  if (!fs.existsSync(exePath)) {
    console.warn('[afterPack] exe not found:', exePath)
    return
  }

  const rcedit = path.join(projectDir, 'scripts', 'bin', 'rcedit-x64.exe')
  if (!fs.existsSync(rcedit)) {
    console.warn('[afterPack] rcedit-x64.exe missing at', rcedit)
    return
  }

  const result = spawnSync(
    rcedit,
    [
      exePath,
      '--set-icon',
      iconPath,
      '--set-version-string',
      'ProductName',
      'DataFutureX Note',
      '--set-version-string',
      'FileDescription',
      'DataFutureX Note 数字未来笔记',
      '--set-version-string',
      'CompanyName',
      'DataFutureX',
      '--set-version-string',
      'LegalCopyright',
      'Copyright © DataFutureX'
    ],
    { encoding: 'utf8' }
  )

  if (result.status !== 0) {
    console.warn('[afterPack] rcedit failed:', result.stderr || result.stdout || result.error)
    return
  }

  // 同步一份 Logo 到安装根目录旁，供 NSIS 快捷方式引用
  const sideIcon = path.join(context.appOutDir, 'icon.ico')
  fs.copyFileSync(iconPath, sideIcon)

  console.log('[afterPack] Embedded Logo into', path.basename(exePath))
}
