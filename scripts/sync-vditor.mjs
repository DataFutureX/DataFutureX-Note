import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(root, 'node_modules', 'vditor', 'dist')
const dest = path.join(root, 'public', 'vditor', 'dist')

if (!fs.existsSync(src)) {
  console.warn('[sync-vditor] vditor not installed, skip')
  process.exit(0)
}

fs.mkdirSync(dest, { recursive: true })
fs.cpSync(src, dest, { recursive: true })
console.log('[sync-vditor] synced to public/vditor/dist')
