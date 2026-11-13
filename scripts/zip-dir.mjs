/**
 * 无第三方依赖的目录打 zip（store/deflate 由 zlib 负责）。
 * 产出标准 ZIP，供 .NET ZipFile.ExtractToDirectory 解压。
 */
import fs from 'node:fs'
import path from 'node:path'
import { deflateRawSync, crc32 } from 'node:zlib'

function walk(dir, base = dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const st = fs.statSync(full)
    const rel = path.relative(base, full).split(path.sep).join('/')
    if (st.isDirectory()) {
      walk(full, base, out)
    } else if (st.isFile()) {
      out.push({ full, rel, size: st.size, mtime: st.mtime })
    }
  }
  return out
}

function dosDateTime(d) {
  const years = Math.max(0, d.getFullYear() - 1980)
  const dosDate = (years << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() / 2)
  return { dosDate, dosTime }
}

function u16(n) {
  const b = Buffer.alloc(2)
  b.writeUInt16LE(n, 0)
  return b
}
function u32(n) {
  const b = Buffer.alloc(4)
  b.writeUInt32LE(n >>> 0, 0)
  return b
}

/**
 * @param {string} sourceDir
 * @param {string} outZip
 */
export function zipSync(sourceDir, outZip) {
  const files = walk(sourceDir)
  const localParts = []
  const centralParts = []
  let offset = 0

  for (const f of files) {
    const data = fs.readFileSync(f.full)
    const nameBuf = Buffer.from(f.rel, 'utf8')
    const compressed = deflateRawSync(data)
    const useStore = compressed.length >= data.length
    const payload = useStore ? data : compressed
    const method = useStore ? 0 : 8
    const checksum = crc32(data) >>> 0
    const { dosDate, dosTime } = dosDateTime(f.mtime)

    const localHeader = Buffer.concat([
      u32(0x04034b50),
      u16(20), // version needed
      u16(0x0800), // utf-8 general purpose bit
      u16(method),
      u16(dosTime),
      u16(dosDate),
      u32(checksum),
      u32(payload.length),
      u32(data.length),
      u16(nameBuf.length),
      u16(0), // extra
      nameBuf,
      payload,
    ])

    const central = Buffer.concat([
      u32(0x02014b50),
      u16(20), // version made by
      u16(20), // version needed
      u16(0x0800),
      u16(method),
      u16(dosTime),
      u16(dosDate),
      u32(checksum),
      u32(payload.length),
      u32(data.length),
      u16(nameBuf.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBuf,
    ])

    localParts.push(localHeader)
    centralParts.push(central)
    offset += localHeader.length
  }

  const centralDir = Buffer.concat(centralParts)
  const locals = Buffer.concat(localParts)
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDir.length),
    u32(locals.length),
    u16(0),
  ])

  fs.writeFileSync(outZip, Buffer.concat([locals, centralDir, end]))
}
