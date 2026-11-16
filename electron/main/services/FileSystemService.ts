import fs from 'node:fs'
import path from 'node:path'
import { FolderNode, Note, SortMode } from '../../../src/types'
import {
  assertInsideRoot,
  atomicWrite,
  fromRelativeId,
  isWritableDir,
  noteDisplayName,
  pathExists,
  toRelativeId,
  validateFileName
} from '../utils/pathSafety'
import { notifyLibraryChanged, withWatchPaused } from '../utils/libraryWatch'

export class FileSystemService {
  constructor(private getRoot: () => string | null) {}

  requireRoot(): string {
    const root = this.getRoot()
    if (!root) {
      throw Object.assign(new Error('尚未设置笔记库根目录'), { code: 'NO_ROOT' })
    }
    return root
  }

  async validateRoot(dir: string): Promise<{ ok: boolean; message?: string }> {
    if (!(await pathExists(dir))) {
      return { ok: false, message: '目录不存在' }
    }
    const stat = await fs.promises.stat(dir)
    if (!stat.isDirectory()) {
      return { ok: false, message: '所选路径不是目录' }
    }
    if (!(await isWritableDir(dir))) {
      return {
        ok: false,
        message: [
          '目录对当前应用不可写（常见于 Windows 受控文件夹访问拦截 electron.exe）。',
          `路径：${dir}`,
          '处理：把 electron.exe / DataFutureX-Note 加入「允许的应用」，或改用欢迎页「使用推荐笔记库」。'
        ].join('\n')
      }
    }
    return { ok: true }
  }

  resolveId(id: string): string {
    return fromRelativeId(this.requireRoot(), id)
  }

  toId(absolutePath: string): string {
    return toRelativeId(this.requireRoot(), absolutePath)
  }

  async scanFolderTree(sort: SortMode = 'name-asc'): Promise<FolderNode[]> {
    const root = this.requireRoot()
    const rootNode = await this.buildFolderNode(root, true, sort)
    return [rootNode]
  }

  private async buildFolderNode(dir: string, isRoot = false, sort: SortMode = 'name-asc'): Promise<FolderNode> {
    const root = this.requireRoot()
    const folderId = toRelativeId(root, dir)
    let entries: fs.Dirent[]
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true })
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code
      if (code === 'ENOENT' || code === 'EACCES' || code === 'EPERM') {
        return {
          id: folderId,
          name: isRoot ? path.basename(dir) || dir : path.basename(dir),
          path: folderId,
          children: [],
          notes: [],
          isRoot
        }
      }
      throw err
    }
    const dirEntries = entries.filter((entry) => {
      if (entry.name.startsWith('.')) return false
      if (entry.name === 'node_modules') return false
      if (entry.isDirectory() && entry.name.toLowerCase() === 'assets') return false
      return true
    })

    const noteEntries = dirEntries.filter(
      (entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md')
    )
    const folderEntries = dirEntries.filter((entry) => entry.isDirectory())

    // 同层笔记并行 stat
    const notes = (
      await Promise.all(
        noteEntries.map(async (entry) => {
          const childPath = path.join(dir, entry.name)
          try {
            const stat = await fs.promises.stat(childPath)
            return {
              id: toRelativeId(root, childPath),
              name: noteDisplayName(entry.name),
              folderId,
              path: toRelativeId(root, childPath),
              mtime: stat.mtimeMs,
              size: stat.size
            } satisfies Note
          } catch (err) {
            const code = (err as NodeJS.ErrnoException)?.code
            if (code === 'ENOENT' || code === 'EACCES' || code === 'EPERM') return null
            throw err
          }
        })
      )
    ).filter((n): n is Note => !!n)

    // 同层子目录并行展开（内部仍递归）
    const childItems = (
      await Promise.all(
        folderEntries.map(async (entry) => {
          const childPath = path.join(dir, entry.name)
          try {
            try {
              assertInsideRoot(root, await fs.promises.realpath(childPath))
            } catch {
              return null
            }
            const childStat = await fs.promises.stat(childPath)
            return {
              node: await this.buildFolderNode(childPath, false, sort),
              mtime: childStat.mtimeMs,
              name: entry.name
            }
          } catch (err) {
            const code = (err as NodeJS.ErrnoException)?.code
            if (code === 'ENOENT' || code === 'EACCES' || code === 'EPERM') return null
            throw err
          }
        })
      )
    ).filter((item): item is { node: FolderNode; mtime: number; name: string } => !!item)

    const children = this.sortFolderItems(childItems, sort)
    const sortedNotes = this.sortNotes(notes, sort)
    return {
      id: folderId,
      name: isRoot ? path.basename(dir) || dir : path.basename(dir),
      path: folderId,
      children,
      notes: sortedNotes,
      isRoot
    }
  }

  private sortFolderItems(
    items: { node: FolderNode; mtime: number; name: string }[],
    sort: SortMode
  ): FolderNode[] {
    const sorted = [...items]
    sorted.sort((a, b) => {
      if (sort === 'mtime-desc' || sort === 'mtime-asc') {
        const diff = a.mtime - b.mtime
        if (diff !== 0) return sort === 'mtime-desc' ? -diff : diff
        return a.name.localeCompare(b.name, 'zh-CN')
      }
      const nameDiff = a.name.localeCompare(b.name, 'zh-CN')
      if (nameDiff !== 0) return sort === 'name-desc' ? -nameDiff : nameDiff
      return b.mtime - a.mtime
    })
    return sorted.map((item) => item.node)
  }

  async listNotes(folderId: string, sort: SortMode): Promise<Note[]> {
    const root = this.requireRoot()
    const dir = this.resolveId(folderId)
    let entries: fs.Dirent[]
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true })
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code
      if (code === 'ENOENT' || code === 'EACCES' || code === 'EPERM') return []
      throw err
    }
    const mdEntries = entries.filter(
      (entry) => entry.isFile() && !entry.name.startsWith('.') && entry.name.toLowerCase().endsWith('.md')
    )
    const notes = (
      await Promise.all(
        mdEntries.map(async (entry) => {
          const full = path.join(dir, entry.name)
          try {
            const stat = await fs.promises.stat(full)
            return {
              id: toRelativeId(root, full),
              name: noteDisplayName(entry.name),
              folderId,
              path: toRelativeId(root, full),
              mtime: stat.mtimeMs,
              size: stat.size
            } satisfies Note
          } catch (err) {
            const code = (err as NodeJS.ErrnoException)?.code
            if (code === 'ENOENT' || code === 'EACCES' || code === 'EPERM') return null
            throw err
          }
        })
      )
    ).filter((n): n is Note => !!n)
    return this.sortNotes(notes, sort)
  }

  sortNotes(notes: Note[], sort: SortMode): Note[] {
    const sorted = [...notes]
    sorted.sort((a, b) => {
      if (sort === 'mtime-desc' || sort === 'mtime-asc') {
        const diff = a.mtime - b.mtime
        if (diff !== 0) return sort === 'mtime-desc' ? -diff : diff
        return a.name.localeCompare(b.name, 'zh-CN')
      }
      const nameDiff = a.name.localeCompare(b.name, 'zh-CN')
      if (nameDiff !== 0) return sort === 'name-desc' ? -nameDiff : nameDiff
      return b.mtime - a.mtime
    })
    return sorted
  }

  async createFolder(parentId: string, name: string): Promise<FolderNode> {
    const root = this.requireRoot()
    const safeName = validateFileName(name, true)
    const parent = this.resolveId(parentId)
    const target = path.join(parent, safeName)
    assertInsideRoot(root, target)
    if (await pathExists(target)) {
      throw Object.assign(new Error('同名文件夹已存在'), { code: 'NAME_CONFLICT' })
    }
    await withWatchPaused(async () => {
      await fs.promises.mkdir(target)
    })
    notifyLibraryChanged()
    return {
      id: toRelativeId(root, target),
      name: safeName,
      path: toRelativeId(root, target),
      children: [],
      notes: []
    }
  }

  async renameFolder(folderId: string, name: string): Promise<FolderNode> {
    const root = this.requireRoot()
    if (folderId === '.' || path.resolve(this.resolveId(folderId)) === path.resolve(root)) {
      throw Object.assign(new Error('根目录不可重命名'), { code: 'ROOT_PROTECTED' })
    }
    const safeName = validateFileName(name, true)
    const current = this.resolveId(folderId)
    const target = path.join(path.dirname(current), safeName)
    assertInsideRoot(root, target)
    if (await pathExists(target)) {
      throw Object.assign(new Error('同名文件夹已存在'), { code: 'NAME_CONFLICT' })
    }
    await withWatchPaused(async () => {
      await fs.promises.rename(current, target)
    })
    notifyLibraryChanged()
    return {
      id: toRelativeId(root, target),
      name: safeName,
      path: toRelativeId(root, target),
      children: [],
      notes: []
    }
  }

  async deleteFolder(folderId: string): Promise<void> {
    const root = this.requireRoot()
    if (folderId === '.' || path.resolve(this.resolveId(folderId)) === path.resolve(root)) {
      throw Object.assign(new Error('根目录不可删除'), { code: 'ROOT_PROTECTED' })
    }
    const current = this.resolveId(folderId)
    assertInsideRoot(root, current)
    await withWatchPaused(async () => {
      await fs.promises.rm(current, { recursive: true, force: false })
    })
    notifyLibraryChanged()
  }

  async createNote(folderId: string, name: string): Promise<Note> {
    const root = this.requireRoot()
    const fileName = validateFileName(name, false)
    const dir = this.resolveId(folderId)
    const full = path.join(dir, fileName)
    assertInsideRoot(root, full)
    if (await pathExists(full)) {
      throw Object.assign(new Error('同名笔记已存在'), { code: 'NAME_CONFLICT' })
    }
    const content = `# ${noteDisplayName(fileName)}\n\n`
    await withWatchPaused(async () => {
      await atomicWrite(full, content)
    })
    notifyLibraryChanged()
    const stat = await fs.promises.stat(full)
    return {
      id: toRelativeId(root, full),
      name: noteDisplayName(fileName),
      folderId,
      path: toRelativeId(root, full),
      mtime: stat.mtimeMs,
      size: stat.size
    }
  }

  async readNote(noteId: string): Promise<string> {
    const full = this.resolveId(noteId)
    return fs.promises.readFile(full, 'utf8')
  }

  async saveNote(noteId: string, content: string, expectedMtime?: number): Promise<{ mtime: number }> {
    const full = this.resolveId(noteId)
    if (expectedMtime != null) {
      const stat = await fs.promises.stat(full)
      // Windows 时间戳精度与连续保存会导致细微差异，放宽到 2s
      if (Math.abs(stat.mtimeMs - expectedMtime) > 2000) {
        throw Object.assign(new Error('文件已被外部修改，请先刷新或确认覆盖'), {
          code: 'CONFLICT_EXTERNAL'
        })
      }
    }
    await withWatchPaused(async () => {
      await atomicWrite(full, content)
    })
    notifyLibraryChanged()
    const stat = await fs.promises.stat(full)
    return { mtime: stat.mtimeMs }
  }

  async renameNote(noteId: string, name: string): Promise<Note> {
    const root = this.requireRoot()
    const fileName = validateFileName(name, false)
    const current = this.resolveId(noteId)
    const target = path.join(path.dirname(current), fileName)
    assertInsideRoot(root, target)
    if (await pathExists(target)) {
      throw Object.assign(new Error('同名笔记已存在'), { code: 'NAME_CONFLICT' })
    }
    await withWatchPaused(async () => {
      await fs.promises.rename(current, target)
    })
    notifyLibraryChanged()
    const stat = await fs.promises.stat(target)
    const folderId = toRelativeId(root, path.dirname(target))
    return {
      id: toRelativeId(root, target),
      name: noteDisplayName(fileName),
      folderId,
      path: toRelativeId(root, target),
      mtime: stat.mtimeMs,
      size: stat.size
    }
  }

  async deleteNote(noteId: string): Promise<void> {
    const full = this.resolveId(noteId)
    await withWatchPaused(async () => {
      await fs.promises.unlink(full)
    })
    notifyLibraryChanged()
  }

  async moveNote(noteId: string, targetFolderId: string): Promise<Note> {
    const root = this.requireRoot()
    const current = this.resolveId(noteId)
    const targetDir = this.resolveId(targetFolderId)
    const target = path.join(targetDir, path.basename(current))
    assertInsideRoot(root, target)
    if (path.resolve(current) === path.resolve(target)) {
      const stat = await fs.promises.stat(current)
      return {
        id: noteId,
        name: noteDisplayName(path.basename(current)),
        folderId: toRelativeId(root, targetDir),
        path: noteId,
        mtime: stat.mtimeMs,
        size: stat.size
      }
    }
    if (await pathExists(target)) {
      throw Object.assign(new Error('目标位置已存在同名笔记'), { code: 'NAME_CONFLICT' })
    }
    // 先迁移正文里引用的 ./assets，避免移动后图片裂开
    await withWatchPaused(async () => {
      await this.copyReferencedAssets(current, path.dirname(current), targetDir)
      await fs.promises.rename(current, target)
    })
    notifyLibraryChanged()
    const stat = await fs.promises.stat(target)
    const folderId = toRelativeId(root, targetDir)
    return {
      id: toRelativeId(root, target),
      name: noteDisplayName(path.basename(target)),
      folderId,
      path: toRelativeId(root, target),
      mtime: stat.mtimeMs,
      size: stat.size
    }
  }

  /** 复制 Markdown 中引用的 ./assets 文件到目标目录 */
  private async copyReferencedAssets(
    notePath: string,
    sourceDir: string,
    targetDir: string
  ): Promise<void> {
    let content = ''
    try {
      content = await fs.promises.readFile(notePath, 'utf8')
    } catch {
      return
    }
    const refs = new Set<string>()
    const re = /!\[[^\]]*]\(\s*(?:\.\.?\/)?assets\/([^)\s]+)\s*\)/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(content))) {
      const name = m[1]?.replace(/[?#].*$/, '').trim()
      if (name && !name.includes('..') && !name.includes('/') && !name.includes('\\')) {
        refs.add(name)
      }
    }
    if (!refs.size) return
    const srcAssets = path.join(sourceDir, 'assets')
    const dstAssets = path.join(targetDir, 'assets')
    await fs.promises.mkdir(dstAssets, { recursive: true })
    for (const name of refs) {
      const from = path.join(srcAssets, name)
      const to = path.join(dstAssets, name)
      assertInsideRoot(this.requireRoot(), from)
      assertInsideRoot(this.requireRoot(), to)
      if (!(await pathExists(from))) continue
      if (await pathExists(to)) continue
      await fs.promises.copyFile(from, to)
    }
  }

  async moveFolder(folderId: string, targetParentId: string): Promise<FolderNode> {
    const root = this.requireRoot()
    if (folderId === '.' || path.resolve(this.resolveId(folderId)) === path.resolve(root)) {
      throw Object.assign(new Error('根目录不可移动'), { code: 'ROOT_PROTECTED' })
    }
    const current = this.resolveId(folderId)
    const targetParent = this.resolveId(targetParentId)
    const currentResolved = path.resolve(current)
    const parentResolved = path.resolve(targetParent)
    if (
      parentResolved === currentResolved ||
      parentResolved.startsWith(currentResolved + path.sep)
    ) {
      throw Object.assign(new Error('不能将文件夹移动到自身或其子目录中'), {
        code: 'INVALID_MOVE'
      })
    }
    const target = path.join(targetParent, path.basename(current))
    assertInsideRoot(root, target)
    if (path.resolve(path.dirname(current)) === parentResolved) {
      return {
        id: folderId,
        name: path.basename(current),
        path: folderId,
        children: [],
        notes: []
      }
    }
    if (await pathExists(target)) {
      throw Object.assign(new Error('目标位置已存在同名文件夹'), { code: 'NAME_CONFLICT' })
    }
    await withWatchPaused(async () => {
      await fs.promises.rename(current, target)
    })
    notifyLibraryChanged()
    return {
      id: toRelativeId(root, target),
      name: path.basename(target),
      path: toRelativeId(root, target),
      children: [],
      notes: []
    }
  }

  async saveNoteAsset(
    noteId: string,
    fileName: string,
    base64Data: string
  ): Promise<{ relativePath: string; absolutePath: string }> {
    const root = this.requireRoot()
    const notePath = this.resolveId(noteId)
    const noteDir = path.dirname(notePath)
    const base = (fileName.replace(/\.[^.]+$/, '') || 'image').trim() || 'image'
    const safe = validateFileName(base, true)
    const ext = path.extname(fileName) || '.png'
    const assetsDir = path.join(noteDir, 'assets')
    await fs.promises.mkdir(assetsDir, { recursive: true })
    let targetName = `${safe}${ext}`
    let target = path.join(assetsDir, targetName)
    let i = 1
    while (await pathExists(target)) {
      targetName = `${safe}-${i}${ext}`
      target = path.join(assetsDir, targetName)
      i += 1
    }
    assertInsideRoot(root, target)
    const raw = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data
    // assets 写入对目录树无影响，且 watch 已忽略 assets；无需 pause/notify
    await fs.promises.writeFile(target, Buffer.from(raw, 'base64'))
    return {
      relativePath: `./assets/${targetName}`,
      absolutePath: target
    }
  }

  async copyNote(noteId: string): Promise<Note> {
    const root = this.requireRoot()
    const current = this.resolveId(noteId)
    const dir = path.dirname(current)
    const base = noteDisplayName(path.basename(current))
    let candidate = `${base} - 副本.md`
    let i = 2
    while (await pathExists(path.join(dir, candidate))) {
      candidate = `${base} - 副本${i}.md`
      i += 1
    }
    const target = path.join(dir, candidate)
    assertInsideRoot(root, target)
    await withWatchPaused(async () => {
      await fs.promises.copyFile(current, target)
    })
    notifyLibraryChanged()
    const stat = await fs.promises.stat(target)
    return {
      id: toRelativeId(root, target),
      name: noteDisplayName(candidate),
      folderId: toRelativeId(root, dir),
      path: toRelativeId(root, target),
      mtime: stat.mtimeMs,
      size: stat.size
    }
  }
}
