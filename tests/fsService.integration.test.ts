import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FileSystemService } from '../electron/main/services/FileSystemService'
import { atomicWrite, isWritableDir } from '../electron/main/utils/pathSafety'

describe('FileSystemService integration', () => {
  let root: string
  let service: FileSystemService

  beforeEach(async () => {
    root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dfx-lib-'))
    service = new FileSystemService(() => root)
  })

  afterEach(async () => {
    await fs.promises.rm(root, { recursive: true, force: true })
  })

  it('validateRoot accepts writable directory', async () => {
    const result = await service.validateRoot(root)
    expect(result.ok).toBe(true)
    expect(await isWritableDir(root)).toBe(true)
  })

  it('create folder / note / save / read roundtrip', async () => {
    const folder = await service.createFolder('.', '工作区')
    expect(folder.name).toBe('工作区')
    expect(fs.existsSync(path.join(root, '工作区'))).toBe(true)

    const note = await service.createNote(folder.id, '会议纪要')
    expect(note.name).toBe('会议纪要')
    expect(note.path.endsWith('会议纪要.md')).toBe(true)

    const body = '# 会议纪要\n\n- 议题 A\n'
    const saved = await service.saveNote(note.id, body)
    expect(saved.mtime).toBeGreaterThan(0)

    const read = await service.readNote(note.id)
    expect(read).toBe(body)

    const tree = await service.scanFolderTree()
    expect(tree[0]?.children.some((c) => c.name === '工作区')).toBe(true)
  })

  it('scanFolderTree sorts notes by requested mode', async () => {
    const a = path.join(root, 'Beta.md')
    const b = path.join(root, 'Alpha.md')
    await fs.promises.writeFile(a, '# Beta\n')
    await new Promise((r) => setTimeout(r, 20))
    await fs.promises.writeFile(b, '# Alpha\n')

    const byName = await service.scanFolderTree('name-asc')
    expect(byName[0].notes.map((n) => n.name)).toEqual(['Alpha', 'Beta'])

    const byMtime = await service.scanFolderTree('mtime-desc')
    expect(byMtime[0].notes.map((n) => n.name)).toEqual(['Alpha', 'Beta'])
  })

  it('atomicWrite creates and updates markdown files', async () => {
    const file = path.join(root, 'atomic.md')
    await atomicWrite(file, 'v1\n')
    expect(await fs.promises.readFile(file, 'utf8')).toBe('v1\n')
    await atomicWrite(file, 'v2\n')
    expect(await fs.promises.readFile(file, 'utf8')).toBe('v2\n')
  })

  it('rejects path traversal on create', async () => {
    await expect(service.createFolder('.', '..\\outside')).rejects.toThrow()
  })
})
