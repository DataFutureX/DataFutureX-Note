/**
 * 用自研安装器包装 win-unpacked：
 * stub.exe + marker + app.zip → DataFutureX-Note-v{version}-{YYYYMMDD-HHmmss}-Setup.exe
 * 彻底摆脱 NSIS 临时目录 / 写入失败问题。
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { zipSync } from './zip-dir.mjs'
import { createBuildInfo, displayVersion, writeBuildInfo } from './build-info.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const releaseDir = path.join(root, 'release')
const unpackedDir = path.join(releaseDir, 'win-unpacked')
const marker = Buffer.from('DFX_APP_PAYLOAD_V1', 'ascii')

function findCsc() {
  const windir = process.env.WINDIR || 'C:\\Windows'
  const x86 = path.join(windir, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe')
  const x64 = path.join(windir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe')
  // 优先 x86，与常见环境兼容
  if (fs.existsSync(x86)) return x86
  if (fs.existsSync(x64)) return x64
  throw new Error('csc.exe not found')
}

function compileStub(outExe) {
  const csc = findCsc()
  const cs = path.join(root, 'scripts', 'dfx-installer-stub.cs')
  const icon = path.join(root, 'resources', 'icon.ico')
  // 优先用较大 PNG 作为安装向导 Logo；否则回退 icon.png
  const logoCandidates = [
    path.join(root, 'resources', 'icon-256.png'),
    path.join(root, 'resources', 'icon.png'),
    path.join(root, 'resources', 'icon-48.png')
  ]
  const logoPng = logoCandidates.find((p) => fs.existsSync(p))
  const args = [
    '/nologo',
    '/optimize+',
    '/target:winexe',
    '/platform:anycpu',
    '/r:System.IO.Compression.dll',
    '/r:System.IO.Compression.FileSystem.dll',
    '/r:System.Windows.Forms.dll',
    '/r:System.Drawing.dll',
    `/out:${outExe}`,
  ]
  if (fs.existsSync(icon)) args.push(`/win32icon:${icon}`)
  if (logoPng) args.push(`/resource:${logoPng},DfxInstaller.Logo.png`)
  args.push(cs)
  const r = spawnSync(csc, args, { cwd: root, encoding: 'utf8' })
  if (r.status !== 0) {
    throw new Error(`csc failed:\n${r.stdout || ''}\n${r.stderr || ''}`)
  }
}

function main() {
  if (process.platform !== 'win32') {
    console.log('[wrap-installer] skip (non-Windows)')
    return
  }
  if (!fs.existsSync(unpackedDir)) {
    throw new Error(`missing ${unpackedDir}, build --dir first`)
  }

  // 以打包完成时刻为准写入版本与时间戳
  const info = createBuildInfo()
  const resourcesDir = path.join(unpackedDir, 'resources')
  fs.mkdirSync(resourcesDir, { recursive: true })
  writeBuildInfo(
    [
      path.join(root, 'resources', 'build-info.json'),
      path.join(unpackedDir, 'build-info.json'),
      path.join(resourcesDir, 'build-info.json')
    ],
    info
  )

  const setupName = `DataFutureX-Note-${displayVersion(info.version)}-${info.buildTag}-Setup.exe`
  const setupPath = path.join(releaseDir, setupName)
  const stubPath = path.join(releaseDir, `_dfx-installer-stub-${process.pid}.exe`)
  const zipPath = path.join(releaseDir, `_dfx-app-${process.pid}.zip`)

  console.log('[wrap-installer] zipping win-unpacked ...')
  console.log('[wrap-installer] build', info.displayVersion, info.buildTime)
  zipSync(unpackedDir, zipPath)

  try {
    compileStub(stubPath)
    const stub = fs.readFileSync(stubPath)
    const zip = fs.readFileSync(zipPath)
    fs.writeFileSync(setupPath, Buffer.concat([stub, marker, zip]))
    // 去掉从网络区下载标记，避免“打开文件-安全警告”拦截
    try {
      spawnSync(
        'powershell.exe',
        ['-NoProfile', '-Command', `Unblock-File -LiteralPath '${setupPath.replace(/'/g, "''")}'`],
        { encoding: 'utf8' }
      )
    } catch {}
    console.log(
      '[wrap-installer]',
      setupName,
      `(stub ${stub.length} + zip ${zip.length})`
    )

    // 清理旧 NSIS / portable / blockmap，以及无时间戳的旧 Setup 名
    for (const name of fs.readdirSync(releaseDir)) {
      if (
        /^DataFutureX-Note-.*-Setup\.exe\.blockmap$/i.test(name) ||
        /^DataFutureX-Note-.*-Portable\.exe$/i.test(name) ||
        // 无时间戳的旧命名，例如 DataFutureX-Note-1.0.0-Setup.exe
        /^DataFutureX-Note-v?\d+\.\d+\.\d+-Setup\.exe$/i.test(name) ||
        name === '安装.cmd'
      ) {
        try {
          fs.unlinkSync(path.join(releaseDir, name))
        } catch {}
      }
    }
  } finally {
    for (const p of [stubPath, zipPath]) {
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p)
      } catch {}
    }
  }
}

main()
