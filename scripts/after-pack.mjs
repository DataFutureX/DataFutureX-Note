/**
 * 打包后将 Logo（resources/icon.ico）写入 Windows 可执行文件，
 * 使桌面 / 开始菜单快捷方式显示应用 Logo，而非 Electron 默认图标。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return

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

  const { rcedit } = await import('@electron/rcedit')
  await rcedit(exePath, {
    icon: iconPath,
    'version-string': {
      ProductName: 'DataFutureX Note',
      FileDescription: 'DataFutureX Note 数字未来笔记',
      CompanyName: 'DataFutureX',
      LegalCopyright: 'Copyright © DataFutureX'
    }
  })
  console.log('[afterPack] Embedded Logo into', path.basename(exePath), '←', iconPath)
}
