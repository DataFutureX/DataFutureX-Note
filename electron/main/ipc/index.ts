import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { SettingsService } from '../services/SettingsService'
import { FileSystemService } from '../services/FileSystemService'
import { FolderService } from '../services/FolderService'
import { NoteService } from '../services/NoteService'
import { SearchService } from '../services/SearchService'
import { BackupService } from '../services/BackupService'
import { ImportService } from '../services/ImportService'
import { WordExportService } from '../services/WordExportService'
import { PdfExportService } from '../services/PdfExportService'
import { ThemeService } from '../services/ThemeService'
import { RecoveryService } from '../services/RecoveryService'
import { TrashService } from '../services/TrashService'
import {
  AccentTheme,
  ConflictStrategy,
  ExportOptions,
  resolveChromeColors,
  SortMode,
  ThemePreference
} from '../../../src/types'
import { assertInsideRoot, ensureDir, isWritableDir } from '../utils/pathSafety'
import { defaultLibraryDir, probeWritePaths } from '../utils/writableFs'
import { toAssetUrl } from '../utils/assetProtocol'

type AppBuildInfo = {
  version: string
  displayVersion: string
  buildTime: string
  buildTag?: string
}

function readAppBuildInfo(): AppBuildInfo {
  const fallback: AppBuildInfo = {
    version: '1.0.0',
    displayVersion: 'v1.0.0',
    buildTime: ''
  }
  const candidates = [
    typeof process.resourcesPath === 'string' ? path.join(process.resourcesPath, 'build-info.json') : '',
    path.join(process.cwd(), 'build-info.json'),
    path.join(process.cwd(), 'resources', 'build-info.json'),
    path.join(__dirname, '../../../resources/build-info.json'),
    path.join(__dirname, '../../build-info.json')
  ]
  for (const p of candidates) {
    try {
      if (!p || !fs.existsSync(p)) continue
      const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as Partial<AppBuildInfo>
      const version = String(raw.version || fallback.version).replace(/^v/i, '')
      return {
        version,
        displayVersion: String(raw.displayVersion || `v${version}`),
        buildTime: String(raw.buildTime || ''),
        buildTag: raw.buildTag ? String(raw.buildTag) : undefined
      }
    } catch {
      // ignore
    }
  }
  try {
    const version = String(app.getVersion?.() || fallback.version).replace(/^v/i, '')
    return { ...fallback, version, displayVersion: `v${version}` }
  } catch {
    return fallback
  }
}

function getWin(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null
}

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((err: unknown) => {
    const e = err as { code?: string; message?: string }
    // 必须抛 Error：抛普通对象时渲染进程会变成 [object Object]
    const error = new Error(e?.message || (typeof err === 'string' ? err : '操作失败')) as Error & {
      code?: string
    }
    error.code = e?.code || 'UNKNOWN'
    throw error
  })
}

export function registerIpc(deps: {
  settings: SettingsService
  fsService: FileSystemService
  folderService: FolderService
  noteService: NoteService
  searchService: SearchService
  backupService: BackupService
  importService: ImportService
  wordExport: WordExportService
  pdfExport: PdfExportService
  themeService: ThemeService
  recovery: RecoveryService
  trashService: TrashService
  writableUserData: string
}): void {
  const {
    settings,
    fsService,
    folderService,
    noteService,
    searchService,
    backupService,
    importService,
    wordExport,
    pdfExport,
    themeService,
    recovery,
    trashService,
    writableUserData
  } = deps

  ipcMain.handle('selectRootDirectory', async () =>
    wrap(async () => {
      const result = await dialog.showOpenDialog(getWin() ?? undefined!, {
        title: '选择笔记库根目录',
        properties: ['openDirectory', 'createDirectory']
      })
      if (result.canceled || !result.filePaths[0]) return null
      const dir = result.filePaths[0]
      const check = await fsService.validateRoot(dir)
      if (!check.ok) {
        throw Object.assign(new Error(check.message || '目录无效'), { code: 'INVALID_ROOT' })
      }
      await settings.setRootDirectory(dir)
      return dir
    })
  )

  ipcMain.handle('getRootDirectory', async () => settings.getRootDirectory())

  ipcMain.handle('setRootDirectory', async (_e, dir: string) =>
    wrap(async () => {
      if (typeof dir !== 'string' || !dir) throw Object.assign(new Error('无效目录'), { code: 'INVALID_ROOT' })
      const check = await fsService.validateRoot(dir)
      if (!check.ok) throw Object.assign(new Error(check.message || '目录无效'), { code: 'INVALID_ROOT' })
      await settings.setRootDirectory(dir)
    })
  )

  ipcMain.handle('getFolderTree', async (_e, sort?: SortMode) =>
    wrap(() => folderService.getTree(sort || settings.get().sortMode))
  )
  ipcMain.handle('createFolder', async (_e, parentId: string, name: string) =>
    wrap(() => folderService.create(String(parentId), String(name)))
  )
  ipcMain.handle('renameFolder', async (_e, folderId: string, name: string) =>
    wrap(() => folderService.rename(String(folderId), String(name)))
  )
  ipcMain.handle('moveFolder', async (_e, folderId: string, targetParentId: string) =>
    wrap(() => folderService.move(String(folderId), String(targetParentId)))
  )
  ipcMain.handle('deleteFolder', async (_e, folderId: string) =>
    wrap(() => folderService.delete(String(folderId)))
  )
  ipcMain.handle('refreshLibrary', async (_e, sort?: SortMode) =>
    wrap(() => folderService.getTree(sort || settings.get().sortMode))
  )

  ipcMain.handle('listNotes', async (_e, folderId: string, sort: SortMode) =>
    wrap(() => noteService.list(String(folderId), sort))
  )
  ipcMain.handle('createNote', async (_e, folderId: string, name: string) =>
    wrap(() => noteService.create(String(folderId), String(name)))
  )
  ipcMain.handle('readNote', async (_e, noteId: string) => wrap(() => noteService.read(String(noteId))))
  ipcMain.handle('saveNote', async (_e, noteId: string, content: string, expectedMtime?: number) =>
    wrap(() => noteService.save(String(noteId), String(content), expectedMtime))
  )
  ipcMain.handle('renameNote', async (_e, noteId: string, name: string) =>
    wrap(() => noteService.rename(String(noteId), String(name)))
  )
  ipcMain.handle('deleteNote', async (_e, noteId: string) => wrap(() => noteService.delete(String(noteId))))
  ipcMain.handle('listTrash', async () => wrap(() => trashService.list()))
  ipcMain.handle('listTrashContents', async (_e, trashId: string, relativePath?: string) =>
    wrap(() => trashService.listContents(String(trashId), relativePath ? String(relativePath) : ''))
  )
  ipcMain.handle('restoreTrash', async (_e, trashId: string) =>
    wrap(() => trashService.restore(String(trashId)))
  )
  ipcMain.handle('purgeTrash', async (_e, trashId: string) =>
    wrap(() => trashService.purge(String(trashId)))
  )
  ipcMain.handle('emptyTrash', async () => wrap(() => trashService.empty()))
  ipcMain.handle('moveNote', async (_e, noteId: string, targetFolderId: string) =>
    wrap(() => noteService.move(String(noteId), String(targetFolderId)))
  )
  ipcMain.handle('copyNote', async (_e, noteId: string) => wrap(() => noteService.copy(String(noteId))))
  ipcMain.handle('searchNotes', async (_e, keyword: string) =>
    wrap(() => searchService.search(String(keyword || '')))
  )

  ipcMain.handle('backupFolder', async (_e, folderId: string) =>
    wrap(() => backupService.backupFolder(String(folderId), getWin()))
  )
  ipcMain.handle('backupLibrary', async () => wrap(() => backupService.backupLibrary(getWin())))
  ipcMain.handle('inspectBackup', async (_e, zipPath?: string) =>
    wrap(async () => {
      let target = zipPath
      if (!target) {
        const result = await dialog.showOpenDialog(getWin() ?? undefined!, {
          title: '选择备份 ZIP',
          filters: [{ name: 'ZIP', extensions: ['zip'] }],
          properties: ['openFile']
        })
        if (result.canceled || !result.filePaths[0]) return null
        target = result.filePaths[0]
      }
      return backupService.inspect(target)
    })
  )
  ipcMain.handle(
    'importBackup',
    async (_e, zipPath: string, targetFolderId: string, strategy: ConflictStrategy) =>
      wrap(() =>
        importService.importBackup(String(zipPath), String(targetFolderId), strategy || 'skip')
      )
  )

  ipcMain.handle('exportMarkdown', async (_e, noteId: string) =>
    wrap(async () => {
      const full = fsService.resolveId(String(noteId))
      const defaultName = path.basename(full)
      const result = await dialog.showSaveDialog(getWin() ?? undefined!, {
        title: '导出 Markdown',
        defaultPath: defaultName,
        filters: [{ name: 'Markdown', extensions: ['md'] }]
      })
      if (result.canceled || !result.filePath) return null
      await fs.promises.copyFile(full, result.filePath)
      return { path: result.filePath, format: 'md' as const }
    })
  )

  ipcMain.handle('exportWord', async (_e, noteId: string, options: ExportOptions = {}) =>
    wrap(async () => {
      const full = fsService.resolveId(String(noteId))
      const defaultName = path.basename(full, path.extname(full)) + '.docx'
      const result = await dialog.showSaveDialog(getWin() ?? undefined!, {
        title: '导出 Word',
        defaultPath: options.savePath || defaultName,
        filters: [{ name: 'Word 文档', extensions: ['docx'] }]
      })
      if (result.canceled || !result.filePath) return null
      return wordExport.export(String(noteId), result.filePath, options)
    })
  )

  ipcMain.handle('exportPdf', async (_e, noteId: string, options: ExportOptions = {}) =>
    wrap(async () => {
      const full = fsService.resolveId(String(noteId))
      const defaultName = path.basename(full, path.extname(full)) + '.pdf'
      const result = await dialog.showSaveDialog(getWin() ?? undefined!, {
        title: '导出 PDF',
        defaultPath: options.savePath || defaultName,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      })
      if (result.canceled || !result.filePath) return null
      return pdfExport.export(String(noteId), result.filePath, options, getWin())
    })
  )

  ipcMain.handle('getSettings', async () => settings.get())
  ipcMain.handle('updateSettings', async (_e, partial: Record<string, unknown>) =>
    wrap(async () => {
      // 主题先应用到 Electron，保证原生/标题栏立即变化
      if (typeof partial.theme === 'string') {
        themeService.applyPreference(partial.theme as ThemePreference)
      }
      const next = await settings.update(partial as never)
      if (typeof partial.theme === 'string' || typeof partial.accentTheme === 'string') {
        const effective = themeService.resolve(next.theme)
        const chrome = resolveChromeColors(effective, next.accentTheme as AccentTheme)
        const win = getWin()
        if (win) {
          try {
            win.setBackgroundColor(chrome.color)
            win.setTitleBarOverlay({
              color: chrome.color,
              symbolColor: chrome.symbolColor,
              height: 40
            })
          } catch {
            // ignore
          }
        }
      }
      return next
    })
  )
  ipcMain.handle('getSystemTheme', async () => themeService.getOsTheme())

  ipcMain.handle('saveRecoveryDraft', async (_e, noteId: string, content: string) => {
    await recovery.saveDraft(String(noteId), String(content))
  })
  ipcMain.handle('loadRecoveryDraft', async (_e, noteId: string) =>
    wrap(() => recovery.loadDraft(String(noteId)))
  )
  ipcMain.handle('clearRecoveryDraft', async (_e, noteId: string) =>
    wrap(() => recovery.clearDraft(String(noteId)))
  )
  ipcMain.handle('listRecoveryDrafts', async () => wrap(() => recovery.listDrafts()))

  ipcMain.handle('openExternal', async (_e, url: string) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      const error = new Error('仅允许打开 http/https 链接') as Error & { code?: string }
      error.code = 'INVALID_URL'
      throw error
    }
    await shell.openExternal(url)
  })

  ipcMain.handle('getLocalFileUrl', async (_e, relativePath: string) =>
    wrap(async () => {
      const root = fsService.requireRoot()
      const abs = assertInsideRoot(root, path.resolve(root, String(relativePath)))
      if (!fs.existsSync(abs)) return null
      // 使用自定义协议，避免 webSecurity 拦截 file://（表现为图片裂开）
      return toAssetUrl(path.relative(root, abs).replace(/\\/g, '/'))
    })
  )

  ipcMain.handle('getAppInfo', async () => {
    const info = readAppBuildInfo()
    return {
      name: 'DataFutureX Note',
      version: info.displayVersion,
      buildTime: info.buildTime,
      homepage: 'https://www.datafuturex.cn/',
      copyright: 'Copyright © DataFutureX 数智未来·AI工坊'
    }
  })

  ipcMain.handle('showItemInFolder', async (_e, filePath: string) => {
    shell.showItemInFolder(String(filePath))
  })

  ipcMain.handle('revealInLibrary', async (_e, entryId: string) =>
    wrap(async () => {
      const abs = fsService.resolveId(String(entryId))
      const st = await fs.promises.stat(abs)
      if (st.isDirectory()) {
        const err = await shell.openPath(abs)
        if (err) throw Object.assign(new Error(err || '无法打开文件夹'), { code: 'REVEAL_FAILED' })
        return
      }
      shell.showItemInFolder(abs)
    })
  )

  ipcMain.handle(
    'selectSavePath',
    async (_e, defaultName: string, filters: { name: string; extensions: string[] }[]) => {
      const result = await dialog.showSaveDialog(getWin() ?? undefined!, {
        defaultPath: defaultName,
        filters
      })
      return result.canceled ? null : result.filePath || null
    }
  )

  ipcMain.handle(
    'selectOpenFile',
    async (_e, filters: { name: string; extensions: string[] }[]) => {
      const result = await dialog.showOpenDialog(getWin() ?? undefined!, {
        filters,
        properties: ['openFile']
      })
      return result.canceled ? null : result.filePaths[0] || null
    }
  )

  ipcMain.handle(
    'saveNoteAsset',
    async (_e, noteId: string, fileName: string, base64Data: string) =>
      wrap(() => fsService.saveNoteAsset(String(noteId), String(fileName), String(base64Data)))
  )

  ipcMain.handle('readClipboardImage', async () =>
    wrap(async () => {
      // Electron 44+：异步 Clipboard API；同时兼容旧版 readImage
      const legacy = clipboard as unknown as {
        readImage?: () => Electron.NativeImage
      }
      try {
        const img = legacy.readImage?.()
        if (img && !img.isEmpty()) {
          const png = img.toPNG()
          if (png?.length) {
            return { base64: Buffer.from(png).toString('base64'), ext: 'png' }
          }
        }
      } catch {
        // ignore legacy
      }

      let items: Electron.ClipboardItem[] = []
      try {
        items = await clipboard.read()
      } catch {
        return null
      }
      for (const item of items) {
        const available = item.types || []
        const imageTypes = available.filter((t) => t.startsWith('image/'))
        const ordered = [
          ...['image/png', 'image/jpeg', 'image/webp', 'image/gif'].filter((t) =>
            imageTypes.includes(t)
          ),
          ...imageTypes
        ]
        for (const mime of ordered) {
          try {
            const blob = await item.getType(mime)
            if (!(blob instanceof Blob) || !blob.size) continue
            const ab = await blob.arrayBuffer()
            if (!ab.byteLength) continue
            const ext =
              mime.includes('jpeg') || mime.includes('jpg')
                ? 'jpg'
                : mime.includes('webp')
                  ? 'webp'
                  : mime.includes('gif')
                    ? 'gif'
                    : 'png'
            return { base64: Buffer.from(ab).toString('base64'), ext }
          } catch {
            // 尝试下一个 mime
          }
        }
      }
      return null
    })
  )

  ipcMain.handle('useDefaultLibrary', async () =>
    wrap(async () => {
      const dir = defaultLibraryDir(writableUserData)
      await ensureDir(dir)
      const check = await fsService.validateRoot(dir)
      if (!check.ok) {
        throw Object.assign(new Error(check.message || '推荐目录不可写'), { code: 'INVALID_ROOT' })
      }
      await settings.setRootDirectory(dir)
      // 放入欢迎笔记，方便立刻验证读写
      try {
        await noteService.create('.', '欢迎使用 DataFutureX-Note')
      } catch (e) {
        const code = (e as { code?: string })?.code
        if (code !== 'NAME_CONFLICT') throw e
      }
      return dir
    })
  )

  ipcMain.handle('runSelfCheck', async () =>
    wrap(async () => {
      const root = settings.getRootDirectory()
      const probes = probeWritePaths([
        writableUserData,
        defaultLibraryDir(writableUserData),
        os.tmpdir(),
        ...(root ? [root] : [])
      ])
      const steps: { name: string; ok: boolean; detail?: string }[] = []
      steps.push({
        name: 'userData 可写',
        ok: probes.find((p) => p.path === writableUserData)?.writable === true,
        detail: writableUserData
      })

      let libraryOk = false
      let libraryDetail = root || '(未设置)'
      if (root && (await isWritableDir(root))) {
        const stamp = `自检-${Date.now()}`
        try {
          const folder = await folderService.create('.', stamp)
          const note = await noteService.create(folder.id, '自检笔记')
          await noteService.save(note.id, `# ${stamp}\n\nself-check ok\n`)
          const readBack = await noteService.read(note.id)
          await noteService.delete(note.id)
          await folderService.delete(folder.id)
          libraryOk = readBack.includes('self-check ok')
          libraryDetail = root
        } catch (e) {
          libraryOk = false
          libraryDetail = e instanceof Error ? e.message : String(e)
        }
      }
      steps.push({ name: '笔记库增删改查', ok: libraryOk, detail: libraryDetail })
      steps.push({
        name: '设置持久化目录',
        ok: probes.find((p) => p.path === writableUserData)?.writable === true,
        detail: path.join(writableUserData, 'settings.json')
      })

      return {
        ok: steps.every((s) => s.ok),
        userData: writableUserData,
        rootDirectory: root,
        appVersion: readAppBuildInfo().displayVersion,

        probes,
        steps
      }
    })
  )
}
