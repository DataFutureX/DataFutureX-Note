import fs from 'node:fs'
import path from 'node:path'
import { dialog, BrowserWindow } from 'electron'
import { BackupManifest, BackupResult } from '../../../src/types'
import { FileSystemService } from './FileSystemService'
import { assertInsideRoot, toRelativeId } from '../utils/pathSafety'

async function loadAdmZip() {
  const mod = await import('adm-zip')
  return mod.default
}

function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

export class BackupService {
  constructor(private fsService: FileSystemService) {}

  async backupLibrary(win: BrowserWindow | null): Promise<BackupResult> {
    return this.backupFolder('.', win, true)
  }

  async backupFolder(
    folderId: string,
    win: BrowserWindow | null,
    isFull = false
  ): Promise<BackupResult> {
    const root = this.fsService.requireRoot()
    const source = this.fsService.resolveId(folderId)
    assertInsideRoot(root, source)
    const baseName = isFull || folderId === '.'
      ? `DataFutureX-Note-Full-${stamp()}.zip`
      : `DataFutureX-Note-${path.basename(source)}-${stamp()}.zip`

    const result = await dialog.showSaveDialog(win ?? undefined!, {
      title: '保存备份',
      defaultPath: baseName,
      filters: [{ name: 'ZIP 备份', extensions: ['zip'] }]
    })
    if (result.canceled || !result.filePath) {
      throw Object.assign(new Error('用户取消备份'), { code: 'CANCELLED' })
    }

    const zipPath = result.filePath.endsWith('.zip') ? result.filePath : `${result.filePath}.zip`
    const AdmZip = await loadAdmZip()
    const zip = new AdmZip()
    let fileCount = 0
    let totalSize = 0

    const addDir = async (dir: string, zipPrefix: string) => {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true })
      let hasChild = false
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          hasChild = true
          await addDir(full, path.posix.join(zipPrefix, entry.name))
        } else if (entry.isFile()) {
          hasChild = true
          const data = await fs.promises.readFile(full)
          zip.addFile(path.posix.join(zipPrefix, entry.name), data)
          fileCount += 1
          totalSize += data.length
        }
      }
      if (!hasChild && zipPrefix) {
        // 保留空文件夹
        zip.addFile(path.posix.join(zipPrefix, '/'), Buffer.alloc(0))
      }
    }

    const prefix = isFull || folderId === '.' ? '' : path.basename(source)
    await addDir(source, prefix)
    zip.writeZip(zipPath)

    // 校验可读
    const check = new AdmZip(zipPath)
    check.getEntries()

    return { zipPath, fileCount, totalSize }
  }

  async inspect(zipPath: string): Promise<BackupManifest> {
    const AdmZip = await loadAdmZip()
    const zip = new AdmZip(zipPath)
    const entries = zip.getEntries()
    let fileCount = 0
    let dirCount = 0
    let totalSize = 0
    const list: BackupManifest['entries'] = []
    const dirs = new Set<string>()

    for (const entry of entries) {
      const name = entry.entryName.replace(/\\/g, '/')
      if (entry.isDirectory || name.endsWith('/')) {
        const d = name.replace(/\/$/, '')
        if (d) {
          dirs.add(d)
          list.push({ path: d, type: 'dir' })
          dirCount += 1
        }
      } else {
        fileCount += 1
        totalSize += entry.header.size
        list.push({ path: name, type: 'file', size: entry.header.size })
        const parent = path.posix.dirname(name)
        if (parent && parent !== '.') dirs.add(parent)
      }
    }

    return { fileCount, dirCount: dirs.size || dirCount, totalSize, entries: list }
  }
}
