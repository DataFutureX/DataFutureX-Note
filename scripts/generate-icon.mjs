/**
 * 生成柔蓝主题的应用图标 / 托盘图标
 * 扁薄贴面立体：文档折角 + 三行笔记线 + 右侧/底侧薄厚度
 * 主色 #5b8fd9 · 折角/厚度 #4a7bc4
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '../resources')
fs.mkdirSync(outDir, { recursive: true })

const FACE = [0x5b, 0x8f, 0xd9, 255]
const FACE_LIGHT = [0x9b, 0xbe, 0xeb, 255]
const FOLD = [0x4a, 0x7b, 0xc4, 255]
const SIDE = [0x4a, 0x7b, 0xc4, 255]
const BOTTOM = [0x3a, 0x64, 0xa6, 255]
const CORNER = [0x2f, 0x52, 0x8a, 255]
const LINE = [255, 255, 255, 255]
const TRANSPARENT = [0, 0, 0, 0]

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1
  }
  return ~c >>> 0
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type)
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function createPng(size, paint) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1)
    raw[row] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = paint(x, y, size)
      const i = row + 1 + x * 4
      raw[i] = r
      raw[i + 1] = g
      raw[i + 2] = b
      raw[i + 3] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

function pointInPoly(x, y, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0]
    const yi = poly[i][1]
    const xj = poly[j][0]
    const yj = poly[j][1]
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 0.0) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function roundedRect(px, py, x, y, w, h, r) {
  if (px < x || px > x + w || py < y || py > y + h) return false
  const lx = px - x
  const ly = py - y
  if (lx < r && ly < r) return (lx - r) ** 2 + (ly - r) ** 2 <= r * r
  if (lx > w - r && ly < r) return (lx - (w - r)) ** 2 + (ly - r) ** 2 <= r * r
  if (lx < r && ly > h - r) return (lx - r) ** 2 + (ly - (h - r)) ** 2 <= r * r
  if (lx > w - r && ly > h - r) return (lx - (w - r)) ** 2 + (ly - (h - r)) ** 2 <= r * r
  return true
}

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
    255
  ]
}

/**
 * 扁薄贴面立体 logo（对应 LogoMark enhanced）
 * @param padUnits 原 32 坐标系外边距；托盘用更小边距让图标视觉更大
 * @param withDepth 是否绘制薄厚度（应用图标 / 大尺寸开启；极小托盘也可开）
 */
function paintLogo(x, y, size, padUnits = 4, withDepth = true) {
  // 有厚度时内容略收，给右侧/底侧挤出留空
  const depth = withDepth ? 2.2 : 0
  const srcPad = 4
  const srcSpan = 32 - srcPad * 2
  const pad = (padUnits / 32) * size
  // 可用区域扣除厚度投影
  const depthPx = (depth / 32) * (size - pad * 2)
  const usable = size - pad * 2 - depthPx
  const s = usable / srcSpan
  const o = pad - srcPad * s

  const px = x + 0.5
  const py = y + 0.5

  const face = [
    [4 * s + o, 4 * s + o],
    [28 * s + o, 4 * s + o],
    [28 * s + o, 22 * s + o],
    [22 * s + o, 28 * s + o],
    [4 * s + o, 28 * s + o]
  ]
  const fold = [
    [22 * s + o, 28 * s + o],
    [28 * s + o, 22 * s + o],
    [22 * s + o, 22 * s + o]
  ]

  if (withDepth && depthPx >= 0.8) {
    const side = [
      [28 * s + o, 4 * s + o],
      [28 * s + o + depthPx, 4 * s + o + depthPx * 0.7],
      [28 * s + o + depthPx, 22 * s + o + depthPx * 0.7],
      [28 * s + o, 22 * s + o]
    ]
    const bottom = [
      [4 * s + o, 28 * s + o],
      [4 * s + o + depthPx * 0.7, 28 * s + o + depthPx],
      [22 * s + o + depthPx * 0.7, 28 * s + o + depthPx],
      [28 * s + o, 28 * s + o],
      [22 * s + o, 28 * s + o]
    ]
    const corner = [
      [28 * s + o, 22 * s + o],
      [28 * s + o + depthPx, 22 * s + o + depthPx * 0.7],
      [28 * s + o + depthPx * 0.65, 28 * s + o + depthPx * 0.65],
      [22 * s + o + depthPx * 0.7, 28 * s + o + depthPx],
      [22 * s + o, 28 * s + o]
    ]

    if (pointInPoly(px, py, corner)) return CORNER
    if (pointInPoly(px, py, side)) return SIDE
    if (pointInPoly(px, py, bottom)) return BOTTOM
  }

  if (pointInPoly(px, py, fold)) return FOLD
  if (!pointInPoly(px, py, face)) return TRANSPARENT

  const lines = [
    { x: 9 * s + o, y: 10 * s + o, w: 12 * s, h: Math.max(1.1, 2.2 * s) },
    { x: 9 * s + o, y: 14.5 * s + o, w: 10 * s, h: Math.max(1.1, 2.2 * s) },
    { x: 9 * s + o, y: 19 * s + o, w: 7 * s, h: Math.max(1.1, 2.2 * s) }
  ]
  const rr = Math.max(0.55, 1.1 * s)
  for (const line of lines) {
    if (roundedRect(px, py, line.x, line.y, line.w, line.h, rr)) {
      return LINE
    }
  }

  // 顶部干净高光带
  const topY = 4 * s + o
  const faceH = 24 * s
  const localY = (py - topY) / faceH
  const localX = (px - (4 * s + o)) / (24 * s)
  const t = Math.min(1, Math.max(0, (localX + localY) * 0.5))
  let color = mix(FACE_LIGHT, FACE, t * 0.85 + 0.08)

  if (localY < 0.12) {
    const gloss = 1 - localY / 0.12
    color = mix(color, [255, 255, 255, 255], gloss * 0.35)
  } else if (localX > 0.82 || localY > 0.82) {
    const shade = Math.max(localX - 0.82, localY - 0.82) / 0.18
    color = mix(color, FOLD, Math.min(1, shade) * 0.28)
  }

  // 微弱边缘提亮，贴面轮廓更清楚
  const edge =
    Math.min(localX, localY, 1 - Math.max(0, (px - (22 * s + o)) / (6 * s)), 1 - localY)
  if (edge < 0.04) {
    color = mix(color, [255, 255, 255, 255], (1 - edge / 0.04) * 0.22)
  }

  return color
}

function writePng(name, size, padUnits = 4, withDepth = true) {
  const buf = createPng(size, (x, y, s) => paintLogo(x, y, s, padUnits, withDepth))
  fs.writeFileSync(path.join(outDir, name), buf)
  return buf
}

/**
 * Windows Shell / 快捷方式 / csc /win32icon 更吃传统 BMP 条目。
 * ≤48 用 32bpp BMP+AND；256 用 PNG（Vista+）。
 */
function createBmpIconImage(size, paint) {
  const header = Buffer.alloc(40)
  header.writeUInt32LE(40, 0)
  header.writeInt32LE(size, 4)
  header.writeInt32LE(size * 2, 8) // XOR + AND
  header.writeUInt16LE(1, 12)
  header.writeUInt16LE(32, 14)
  header.writeUInt32LE(0, 16)
  header.writeUInt32LE(size * size * 4, 20)

  const xor = Buffer.alloc(size * size * 4)
  const andRowBytes = ((size + 31) >> 5) * 4
  const andMask = Buffer.alloc(andRowBytes * size)

  for (let y = 0; y < size; y++) {
    const srcY = size - 1 - y // BMP 自下而上
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = paint(x, srcY, size)
      const i = (y * size + x) * 4
      xor[i] = b
      xor[i + 1] = g
      xor[i + 2] = r
      xor[i + 3] = a
      if (a < 128) {
        const byteIndex = y * andRowBytes + (x >> 3)
        andMask[byteIndex] |= 0x80 >> (x & 7)
      }
    }
  }
  return Buffer.concat([header, xor, andMask])
}

function writeIco(entries) {
  const count = entries.length
  const headerSize = 6 + count * 16
  let offset = headerSize
  const placed = []
  for (const e of entries) {
    placed.push({ ...e, offset })
    offset += e.buf.length
  }
  const ico = Buffer.alloc(offset)
  ico.writeUInt16LE(0, 0)
  ico.writeUInt16LE(1, 2)
  ico.writeUInt16LE(count, 4)
  placed.forEach((e, i) => {
    const o = 6 + i * 16
    ico[o] = e.size >= 256 ? 0 : e.size
    ico[o + 1] = e.size >= 256 ? 0 : e.size
    ico[o + 2] = 0
    ico[o + 3] = 0
    ico.writeUInt16LE(1, o + 4)
    ico.writeUInt16LE(32, o + 6)
    ico.writeUInt32LE(e.buf.length, o + 8)
    ico.writeUInt32LE(e.offset, o + 12)
    e.buf.copy(ico, e.offset)
  })
  return ico
}

function makeIconEntry(size, padUnits, withDepth, asPng = false) {
  const paint = (x, y, s) => paintLogo(x, y, s, padUnits, withDepth)
  if (asPng || size >= 256) {
    return { size, buf: createPng(size, paint) }
  }
  return { size, buf: createBmpIconImage(size, paint) }
}

// 托盘值守图标：小边距 + 立体厚度
writePng('tray-16.png', 16, 1, true)
writePng('tray-20.png', 20, 1, true)
writePng('tray-24.png', 24, 1, true)
writePng('tray-32.png', 32, 1, true)
writePng('tray-source.png', 64, 1, true)

// 应用 / 桌面快捷方式 / 安装包图标
writePng('icon-48.png', 48, 3, true)
const png256 = writePng('icon-256.png', 256, 3, true)
writePng('icon.png', 256, 3, true)

fs.writeFileSync(
  path.join(outDir, 'icon.ico'),
  writeIco([
    makeIconEntry(16, 3, true),
    makeIconEntry(32, 3, true),
    makeIconEntry(48, 3, true),
    { size: 256, buf: png256 }
  ])
)
fs.writeFileSync(
  path.join(outDir, 'tray.ico'),
  writeIco([
    makeIconEntry(16, 1, true),
    makeIconEntry(20, 1, true),
    makeIconEntry(24, 1, true),
    makeIconEntry(32, 1, true)
  ])
)

// 同步 SVG 资源（桌面/安装/文档用）
const logoMarkSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 34" role="img" aria-label="DataFutureX Note">
  <defs>
    <linearGradient id="face" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#9bbeeb"/>
      <stop offset="55%" stop-color="#5b8fd9"/>
      <stop offset="100%" stop-color="#4a7bc4"/>
    </linearGradient>
  </defs>
  <polygon fill="#4a7bc4" points="28,4 30.2,5.5 30.2,23.5 28,22"/>
  <polygon fill="#3a64a6" points="4,28 5.5,30.2 23.5,30.2 28,28 22,28"/>
  <polygon fill="#2f528a" points="28,22 30.2,23.5 28.6,25.4 23.5,30.2 22,28"/>
  <polygon fill="url(#face)" points="4,4 28,4 28,22 22,28 4,28"/>
  <polygon fill="#4a7bc4" points="22,28 28,22 22,22"/>
  <path d="M5 5 L27 5 L27 6.2 Q16 5.5 5 6.3 Z" fill="#ffffff" opacity="0.55"/>
  <rect x="9" y="10" width="12" height="2.2" rx="1.1" fill="#ffffff"/>
  <rect x="9" y="14.5" width="10" height="2.2" rx="1.1" fill="#ffffff" opacity="0.94"/>
  <rect x="9" y="19" width="7" height="2.2" rx="1.1" fill="#ffffff" opacity="0.84"/>
</svg>
`

const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 136 136" role="img" aria-label="DataFutureX Note">
  <defs>
    <linearGradient id="face" x1="16" y1="16" x2="112" y2="112" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#9bbeeb"/>
      <stop offset="55%" stop-color="#5b8fd9"/>
      <stop offset="100%" stop-color="#4a7bc4"/>
    </linearGradient>
  </defs>
  <polygon fill="#4a7bc4" points="112,16 120.8,22 120.8,94 112,88"/>
  <polygon fill="#3a64a6" points="16,112 22,120.8 94,120.8 112,112 88,112"/>
  <polygon fill="#2f528a" points="112,88 120.8,94 114.4,101.6 94,120.8 88,112"/>
  <polygon fill="url(#face)" points="16,16 112,16 112,88 88,112 16,112"/>
  <polygon fill="#4a7bc4" points="88,112 112,88 88,88"/>
  <path d="M20 20 L108 20 L108 24.8 Q64 22 20 25.2 Z" fill="#ffffff" opacity="0.55"/>
  <rect x="36" y="42" width="48" height="8" rx="4" fill="#ffffff"/>
  <rect x="36" y="58" width="40" height="8" rx="4" fill="#ffffff" opacity="0.94"/>
  <rect x="36" y="74" width="28" height="8" rx="4" fill="#ffffff" opacity="0.84"/>
</svg>
`

fs.writeFileSync(path.join(outDir, 'logo-mark.svg'), logoMarkSvg)
fs.writeFileSync(path.join(outDir, 'logo.svg'), logoSvg)

const publicDir = path.join(__dirname, '../public')
const assetsDir = path.join(__dirname, '../src/assets')
if (fs.existsSync(publicDir)) {
  fs.writeFileSync(path.join(publicDir, 'logo-mark.svg'), logoMarkSvg)
  fs.writeFileSync(path.join(publicDir, 'logo.svg'), logoSvg)
}
if (fs.existsSync(assetsDir)) {
  fs.writeFileSync(path.join(assetsDir, 'logo-mark.svg'), logoMarkSvg)
}

const buildDir = path.join(__dirname, '../build')
fs.mkdirSync(buildDir, { recursive: true })
fs.copyFileSync(path.join(outDir, 'icon.ico'), path.join(buildDir, 'icon.ico'))

console.log('Generated flat-emboss logo icons (app + tray) in resources/ (+ build/icon.ico)')
