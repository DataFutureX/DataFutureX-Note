import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { TrashContentNode, TrashItem } from '../../../src/types'
import { FileSystemService } from './FileSystemService'
import {
  assertInsideRoot,
  ensureDir,
  noteDisplayName,
  pathExists,
  toRelativeId
} from '../utils/pathSafety'
import { notifyLibraryChanged, withWatchPaused } from '../utils/libraryWatch'

const TRASH_DIR = '.trash'

type TrashMeta = TrashItem & {
  /** data 目录内实际落盘名称 */
  storedName: string
}

export class TrashService {
  constructor(private fsService: FileSystemService) {}

  private trashRoot(): string {
    const root = this.fsService.requireRoot()
    return path.join(root, TRASH_DIR)
  }

  private entryDir(id: string): string {
    return path.join(this.trashRoot(), id)
  }

  private async readMeta(id: string): Promise<TrashMeta> {
    const metaPath = path.join(this.entryDir(id), 'meta.json')
    const raw = await fs.promises.readFile(metaPath, 'utf8')
    return JSON.parse(raw) as TrashMeta
  }

  private async writeMeta(meta: TrashMeta): Promise<void> {
    const dir = this.entryDir(meta.id)
    await ensureDir(dir)
    await fs.promises.writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8')
  }

  async list(): Promise<TrashItem[]> {
    const root = this.trashRoot()
    if (!(await pathExists(root))) return []
    const entries = await fs.promises.readdir(root, { withFileTypes: true })
    const items: TrashItem[] = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      try {
        const meta = await this.readMeta(entry.name)
        items.push({
          id: meta.id,
          type: meta.type,
          name: meta.name,
          originalPath: meta.originalPath,
          deletedAt: meta.deletedAt,
          size: meta.size
        })
      } catch {
        // skip broken entries
      }
    }
    items.sort((a, b) => b.deletedAt - a.deletedAt)
    return items
  }

  /** 浏览回收站中某个已删文件夹的内容（relativePath 相对该文件夹根） */
  async listContents(trashId: string, relativePath = ''): Promise<TrashContentNode[]> {
    const meta = await this.readMeta(trashId)
    if (meta.type !== 'folder') {
      throw Object.assign(new Error('仅文件夹支持查看内容'), { code: 'NOT_FOLDER' })
    }
    const folderRoot = path.join(this.entryDir(trashId), 'data', meta.storedName)
    const rel = relativePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
    const target = rel
      ? path.join(folderRoot, ...rel.split('/').filter(Boolean))
      : folderRoot
    const resolvedRoot = path.resolve(folderRoot)
    const resolvedTarget = path.resolve(target)
    const rootWithSep = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep
    if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(rootWithSep)) {
      throw Object.assign(new Error('路径非法'), { code: 'PATH_OUTSIDE_ROOT' })
    }
    if (!(await pathExists(resolvedTarget))) {
      throw Object.assign(new Error('内容不存在'), { code: 'TRASH_MISSING' })
    }
    const st = await fs.promises.stat(resolvedTarget)
    if (!st.isDirectory()) {
      throw Object.assign(new Error('目标不是文件夹'), { code: 'INVALID_TARGET' })
    }

    const entries = await fs.promises.readdir(resolvedTarget, { withFileTypes: true })
    const folders: TrashContentNode[] = []
    const notes: TrashContentNode[] = []
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const childRel = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        folders.push({ name: entry.name, type: 'folder', relativePath: childRel })
        continue
      }
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        notes.push({
          name: noteDisplayName(entry.name),
          type: 'note',
          relativePath: childRel
        })
      }
    }
    folders.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    notes.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    return [...folders, ...notes]
  }

  async moveNoteToTrash(noteId: string): Promise<TrashItem> {
    const root = this.fsService.requireRoot()
    const abs = this.fsService.resolveId(noteId)
    assertInsideRoot(root, abs)
    const st = await fs.promises.stat(abs)
    if (!st.isFile()) {
      throw Object.assign(new Error('目标不是笔记文件'), { code: 'INVALID_TARGET' })
    }
    const id = crypto.randomUUID()
    const storedName = path.basename(abs)
    const dataDir = path.join(this.entryDir(id), 'data')
    const dest = path.join(dataDir, storedName)
    const meta: TrashMeta = {
      id,
      type: 'note',
      name: noteDisplayName(storedName),
      originalPath: toRelativeId(root, abs),
      deletedAt: Date.now(),
      size: st.size,
      storedName
    }
    await withWatchPaused(async () => {
      await ensureDir(dataDir)
      await fs.promises.rename(abs, dest)
      await this.writeMeta(meta)
    })
    notifyLibraryChanged()
    return meta
  }

  async moveFolderToTrash(folderId: string): Promise<TrashItem> {
    const root = this.fsService.requireRoot()
    if (folderId === '.' || path.resolve(this.fsService.resolveId(folderId)) === path.resolve(root)) {
      throw Object.assign(new Error('根目录不可删除'), { code: 'ROOT_PROTECTED' })
    }
    const abs = this.fsService.resolveId(folderId)
    assertInsideRoot(root, abs)
    const st = await fs.promises.stat(abs)
    if (!st.isDirectory()) {
      throw Object.assign(new Error('目标不是文件夹'), { code: 'INVALID_TARGET' })
    }
    const id = crypto.randomUUID()
    const storedName = path.basename(abs)
    const dataDir = path.join(this.entryDir(id), 'data')
    const dest = path.join(dataDir, storedName)
    const meta: TrashMeta = {
      id,
      type: 'folder',
      name: storedName,
      originalPath: toRelativeId(root, abs),
      deletedAt: Date.now(),
      storedName
    }
    await withWatchPaused(async () => {
      await ensureDir(dataDir)
      await fs.promises.rename(abs, dest)
      await this.writeMeta(meta)
    })
    notifyLibraryChanged()
    return meta
  }

  private async uniqueTarget(preferred: string): Promise<string> {
    if (!(await pathExists(preferred))) return preferred
    const dir = path.dirname(preferred)
    const base = path.basename(preferred)
    const ext = path.extname(base)
    const stem = ext ? base.slice(0, -ext.length) : base
    for (let i = 1; i <= 200; i++) {
      const candidate = path.join(dir, ext ? `${stem} (${i})${ext}` : `${stem} (${i})`)
      if (!(await pathExists(candidate))) return candidate
    }
    throw Object.assign(new Error('无法生成可用恢复路径'), { code: 'RESTORE_CONFLICT' })
  }

  async restore(trashId: string): Promise<{ restoredPath: string }> {
    const root = this.fsService.requireRoot()
    const meta = await this.readMeta(trashId)
    const src = path.join(this.entryDir(trashId), 'data', meta.storedName)
    if (!(await pathExists(src))) {
      throw Object.assign(new Error('回收站内容缺失'), { code: 'TRASH_MISSING' })
    }
    const preferred = path.join(root, meta.originalPath.replace(/\//g, path.sep))
    assertInsideRoot(root, preferred)
    await ensureDir(path.dirname(preferred))
    const target = await this.uniqueTarget(preferred)
    assertInsideRoot(root, target)

    await withWatchPaused(async () => {
      await fs.promises.rename(src, target)
      await fs.promises.rm(this.entryDir(trashId), { recursive: true, force: true })
    })
    notifyLibraryChanged()
    return { restoredPath: toRelativeId(root, target) }
  }

  async purge(trashId: string): Promise<void> {
    const dir = this.entryDir(trashId)
    if (!(await pathExists(dir))) return
    await withWatchPaused(async () => {
      await fs.promises.rm(dir, { recursive: true, force: true })
    })
  }

  async empty(): Promise<number> {
    const items = await this.list()
    for (const item of items) {
      await this.purge(item.id)
    }
    return items.length
  }
}
