/**
 * 从 resources/brand-source.jpg|png 生成透明底品牌图标（应用 / 托盘 / 安装包）
 * 实际处理在 generate-icon.py（Pillow）
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const py = path.join(__dirname, 'generate-icon.py')

const runners = [
  ['python', [py]],
  ['py', ['-3', py]],
  ['python3', [py]]
]

let lastErr = ''
for (const [cmd, args] of runners) {
  const r = spawnSync(cmd, args, {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })
  if (r.error) {
    lastErr = String(r.error.message || r.error)
    continue
  }
  if (r.stdout) process.stdout.write(r.stdout)
  if (r.stderr) process.stderr.write(r.stderr)
  if (r.status === 0) process.exit(0)
  lastErr = r.stderr || r.stdout || `exit ${r.status}`
}

console.error('[generate-icon] failed to run Python:', lastErr)
process.exit(1)
