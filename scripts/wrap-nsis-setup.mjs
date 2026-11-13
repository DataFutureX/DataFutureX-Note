/**
 * 把 electron-builder 产出的 NSIS Setup 包进单文件 stub：
 * stub.exe + marker + setup-core.exe → 最终 Setup.exe
 * 用户只需双击一个安装程序。
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const releaseDir = path.join(root, 'release')
const marker = Buffer.from('DFX_NSIS_PAYLOAD_V1', 'ascii')
const csc =
  process.env.WINDIR
    ? path.join(process.env.WINDIR, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe')
    : 'csc.exe'

function findSetupArtifacts() {
  if (!fs.existsSync(releaseDir)) return []
  return fs
    .readdirSync(releaseDir)
    .filter((n) => /^DataFutureX-Note-.*-Setup\.exe$/i.test(n))
    .map((n) => path.join(releaseDir, n))
}

function compileStub(outExe) {
  const cs = path.join(root, 'scripts', 'nsis-setup-stub.cs')
  const icon = path.join(root, 'resources', 'icon.ico')
  const args = ['/nologo', '/optimize+', '/target:winexe', `/out:${outExe}`, cs]
  if (fs.existsSync(icon)) args.splice(args.length - 1, 0, `/win32icon:${icon}`)
  const r = spawnSync(csc, args, { cwd: root, encoding: 'utf8' })
  if (r.status !== 0) {
    throw new Error(`csc failed:\n${r.stdout || ''}\n${r.stderr || ''}`)
  }
}

function wrapOne(setupPath) {
  const corePath = setupPath.replace(/\.exe$/i, '.core.exe')
  const stubPath = path.join(releaseDir, `_dfx-setup-stub-${process.pid}.exe`)
  fs.renameSync(setupPath, corePath)
  try {
    compileStub(stubPath)
    const stub = fs.readFileSync(stubPath)
    const core = fs.readFileSync(corePath)
    fs.writeFileSync(setupPath, Buffer.concat([stub, marker, core]))
    console.log(
      '[wrap-nsis] ',
      path.basename(setupPath),
      `(stub ${stub.length} + payload ${core.length})`
    )
    // 成功后才删除 core；失败则把 core 还原为 Setup，避免丢包
    fs.unlinkSync(corePath)
    const blockmap = `${setupPath}.blockmap`
    if (fs.existsSync(blockmap)) fs.unlinkSync(blockmap)
  } catch (err) {
    if (!fs.existsSync(setupPath) && fs.existsSync(corePath)) {
      fs.renameSync(corePath, setupPath)
    }
    throw err
  } finally {
    try {
      if (fs.existsSync(stubPath)) fs.unlinkSync(stubPath)
    } catch {}
  }
}

function main() {
  if (process.platform !== 'win32') {
    console.log('[wrap-nsis] skip (non-Windows)')
    return
  }
  if (!fs.existsSync(csc)) {
    throw new Error(`csc.exe not found: ${csc}`)
  }
  const setups = findSetupArtifacts()
  if (setups.length === 0) {
    console.log('[wrap-nsis] no Setup.exe to wrap')
    return
  }
  for (const s of setups) wrapOne(s)
}

main()
