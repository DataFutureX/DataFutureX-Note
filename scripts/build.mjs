/**
 * Windows 下 %LOCALAPPDATA%\electron-builder\Cache 常被沙箱/策略写成只读，
 * 导致 NSIS 下载失败（mkdir ...\nsis: Access is denied）。
 * 构建时强制使用仓库内可写缓存目录。
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const cacheDir = path.join(root, '.electron-builder-cache')
const tempDir = path.join(root, '.tmp', 'nsis-temp')
fs.mkdirSync(cacheDir, { recursive: true })
fs.mkdirSync(tempDir, { recursive: true })

const args = process.argv.slice(2)
const env = {
  ...process.env,
  ELECTRON_BUILDER_CACHE: cacheDir,
  // makensis 的 !tempfile 依赖 TMP/TEMP；沙箱下系统 Temp 常不可写
  TEMP: tempDir,
  TMP: tempDir,
  TMPDIR: tempDir
}

console.log('[build] ELECTRON_BUILDER_CACHE =', cacheDir)
console.log('[build] TEMP/TMP =', tempDir)

function run(cmd, cmdArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, {
      cwd: root,
      env,
      stdio: 'inherit',
      shell: process.platform === 'win32'
    })
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${cmd} exited with ${code}`))
    })
  })
}

async function main() {
  const mode = args[0] || 'full'
  const builderArgs =
    mode === 'dir'
      ? ['electron-builder', '--win', '--x64', '--dir']
      : mode === 'pack'
        ? ['electron-builder', '--win', '--x64']
        : null

  if (mode === 'full' || mode === 'dir') {
    await run('npx', ['vue-tsc', '--noEmit'])
    await run('npx', ['vite', 'build'])
  }

  if (mode === 'full' || mode === 'pack' || mode === 'dir') {
    const ebArgs =
      builderArgs || ['electron-builder', '--win', '--x64', ...args.slice(1)]
    await run('npx', ebArgs)
  }
}

main().catch((err) => {
  console.error('[build]', err.message || err)
  process.exit(1)
})
