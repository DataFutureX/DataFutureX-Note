/**
 * 生成柔蓝主题的应用图标 / 托盘图标（文档折角 + 三行笔记线）
 * 主色 #5b8fd9 · 折角 #4a7bc4
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '../resources')
fs.mkdirSync(outDir, { recursive: true })

const FACE = [0x5b, 0x8f, 0xd9, 255]
const FOLD = [0x4a, 0x7b, 0xc4, 255]
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

/** 对应 logo-mark.svg 几何，按 size 缩放 */
function paintLogo(x, y, size) {
  const s = size / 32
  const face = [
    [4 * s, 4 * s],
    [28 * s, 4 * s],
    [28 * s, 22 * s],
    [22 * s, 28 * s],
    [4 * s, 28 * s]
  ]
  const fold = [
    [22 * s, 28 * s],
    [28 * s, 22 * s],
    [22 * s, 22 * s]
  ]
  if (pointInPoly(x + 0.5, y + 0.5, fold)) return FOLD
  if (!pointInPoly(x + 0.5, y + 0.5, face)) return TRANSPARENT

  const lines = [
    { x: 9 * s, y: 10 * s, w: 12 * s, h: Math.max(1.2, 2.2 * s) },
    { x: 9 * s, y: 14.5 * s, w: 10 * s, h: Math.max(1.2, 2.2 * s) },
    { x: 9 * s, y: 19 * s, w: 7 * s, h: Math.max(1.2, 2.2 * s) }
  ]
  const rr = Math.max(0.6, 1.1 * s)
  for (const line of lines) {
    if (roundedRect(x + 0.5, y + 0.5, line.x, line.y, line.w, line.h, rr)) {
      return LINE
    }
  }
  return FACE
}

function writePng(name, size) {
  const buf = createPng(size, paintLogo)
  fs.writeFileSync(path.join(outDir, name), buf)
  return buf
}

function writeIco(pngBuffers) {
  // 多尺寸 ICO：每个条目嵌入 PNG
  const count = pngBuffers.length
  const headerSize = 6 + count * 16
  let offset = headerSize
  const entries = []
  for (const { size, buf } of pngBuffers) {
    entries.push({ size, buf, offset })
    offset += buf.length
  }
  const ico = Buffer.alloc(offset)
  ico.writeUInt16LE(0, 0)
  ico.writeUInt16LE(1, 2)
  ico.writeUInt16LE(count, 4)
  entries.forEach((e, i) => {
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

const png16 = writePng('tray-16.png', 16)
const png20 = writePng('tray-20.png', 20)
const png24 = writePng('tray-24.png', 24)
const png32 = writePng('tray-32.png', 32)
writePng('icon-48.png', 48)
writePng('tray-source.png', 64)
const png256 = writePng('icon-256.png', 256)
writePng('icon.png', 256)

fs.writeFileSync(
  path.join(outDir, 'icon.ico'),
  writeIco([
    { size: 16, buf: png16 },
    { size: 32, buf: png32 },
    { size: 48, buf: createPng(48, paintLogo) },
    { size: 256, buf: png256 }
  ])
)
fs.writeFileSync(
  path.join(outDir, 'tray.ico'),
  writeIco([
    { size: 16, buf: png16 },
    { size: 20, buf: png20 },
    { size: 24, buf: png24 },
    { size: 32, buf: png32 }
  ])
)

// 同步到 electron-builder buildResources，供安装包 / 快捷方式使用
const buildDir = path.join(__dirname, '../build')
fs.mkdirSync(buildDir, { recursive: true })
fs.copyFileSync(path.join(outDir, 'icon.ico'), path.join(buildDir, 'icon.ico'))

console.log('Generated soft-blue logo icons in resources/ (+ build/icon.ico)')
