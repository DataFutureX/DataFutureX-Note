import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)

// Use compiled main bundle helpers via dynamic import of TS sources through vitest-like path
// Minimal smoke: create temp library and exercise zip + markdown files

const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dfx-smoke-'))
const folder = path.join(root, '技术文档')
await fs.promises.mkdir(folder, { recursive: true })
const note = path.join(folder, '欢迎.md')
await fs.promises.writeFile(note, '# 欢迎\n\n这是 DataFutureX-Note 冒烟测试。\n\n| A | B |\n|---|---|\n| 1 | 2 |\n', 'utf8')
await fs.promises.mkdir(path.join(folder, '空目录'), { recursive: true })

const AdmZip = require('adm-zip')
const zipPath = path.join(root, 'backup.zip')
const zip = new AdmZip()
zip.addLocalFolder(root, '')
zip.writeZip(zipPath)
const check = new AdmZip(zipPath)
const entries = check.getEntries().map((e) => e.entryName)
if (!entries.some((e) => e.includes('欢迎.md'))) throw new Error('backup missing note')

const importDir = path.join(root, 'imported')
await fs.promises.mkdir(importDir)
check.extractAllTo(importDir, true)

console.log('SMOKE OK')
console.log('root=', root)
console.log('zip=', zipPath)
console.log('entries=', entries.length)
