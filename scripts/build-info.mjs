/**
 * 读写打包信息：版本 v1.0.0 + 打包时间戳
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

export function readPkgVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const raw = String(pkg.version || '1.0.0').replace(/^v/i, '')
  return raw
}

/** 展示用：v1.0.0 */
export function displayVersion(semver = readPkgVersion()) {
  const v = String(semver).replace(/^v/i, '')
  return `v${v}`
}

/** 本地时间 YYYYMMDD-HHmmss */
export function formatBuildTag(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-` +
    `${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`
  )
}

/** 本地时间 YYYY-MM-DD HH:mm:ss */
export function formatBuildTime(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ` +
    `${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`
  )
}

export function createBuildInfo(date = new Date()) {
  const version = readPkgVersion()
  return {
    version,
    displayVersion: displayVersion(version),
    buildTime: formatBuildTime(date),
    buildTag: formatBuildTag(date)
  }
}

export function writeBuildInfo(targets, info = createBuildInfo()) {
  const text = `${JSON.stringify(info, null, 2)}\n`
  for (const target of targets) {
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, text, 'utf8')
  }
  return info
}
