import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  ConflictStrategy,
  ExportOptions,
  NoteAPI,
  OpenMarkdownRequest,
  ResolvedTheme,
  SortMode
} from '../../src/types'

const noteAPI: NoteAPI = {
  selectRootDirectory: () => ipcRenderer.invoke('selectRootDirectory'),
  useDefaultLibrary: () => ipcRenderer.invoke('useDefaultLibrary'),
  runSelfCheck: () => ipcRenderer.invoke('runSelfCheck'),
  getRootDirectory: () => ipcRenderer.invoke('getRootDirectory'),
  setRootDirectory: (dir) => ipcRenderer.invoke('setRootDirectory', dir),
  getFolderTree: (sort) => ipcRenderer.invoke('getFolderTree', sort),
  createFolder: (parentId, name) => ipcRenderer.invoke('createFolder', parentId, name),
  renameFolder: (folderId, name) => ipcRenderer.invoke('renameFolder', folderId, name),
  moveFolder: (folderId, targetParentId) =>
    ipcRenderer.invoke('moveFolder', folderId, targetParentId),
  deleteFolder: (folderId) => ipcRenderer.invoke('deleteFolder', folderId),
  refreshLibrary: (sort) => ipcRenderer.invoke('refreshLibrary', sort),

  listNotes: (folderId, sort: SortMode) => ipcRenderer.invoke('listNotes', folderId, sort),
  createNote: (folderId, name) => ipcRenderer.invoke('createNote', folderId, name),
  readNote: (noteId) => ipcRenderer.invoke('readNote', noteId),
  saveNote: (noteId, content, expectedMtime) =>
    ipcRenderer.invoke('saveNote', noteId, content, expectedMtime),
  renameNote: (noteId, name) => ipcRenderer.invoke('renameNote', noteId, name),
  deleteNote: (noteId) => ipcRenderer.invoke('deleteNote', noteId),
  moveNote: (noteId, targetFolderId) => ipcRenderer.invoke('moveNote', noteId, targetFolderId),
  copyNote: (noteId) => ipcRenderer.invoke('copyNote', noteId),
  searchNotes: (keyword) => ipcRenderer.invoke('searchNotes', keyword),

  listTrash: () => ipcRenderer.invoke('listTrash'),
  listTrashContents: (trashId, relativePath) =>
    ipcRenderer.invoke('listTrashContents', trashId, relativePath),
  restoreTrash: (trashId) => ipcRenderer.invoke('restoreTrash', trashId),
  purgeTrash: (trashId) => ipcRenderer.invoke('purgeTrash', trashId),
  emptyTrash: () => ipcRenderer.invoke('emptyTrash'),

  backupFolder: (folderId) => ipcRenderer.invoke('backupFolder', folderId),
  backupLibrary: () => ipcRenderer.invoke('backupLibrary'),
  inspectBackup: (zipPath) => ipcRenderer.invoke('inspectBackup', zipPath),
  importBackup: (zipPath, targetFolderId, strategy: ConflictStrategy) =>
    ipcRenderer.invoke('importBackup', zipPath, targetFolderId, strategy),

  exportMarkdown: (noteId) => ipcRenderer.invoke('exportMarkdown', noteId),
  exportWord: (noteId, options?: ExportOptions) => ipcRenderer.invoke('exportWord', noteId, options),
  exportPdf: (noteId, options?: ExportOptions) => ipcRenderer.invoke('exportPdf', noteId, options),

  getSettings: () => ipcRenderer.invoke('getSettings'),
  updateSettings: (partial: Partial<AppSettings>) => ipcRenderer.invoke('updateSettings', partial),
  getSystemTheme: () => ipcRenderer.invoke('getSystemTheme'),
  onSystemThemeChanged: (callback: (theme: ResolvedTheme) => void) => {
    const handler = (_: Electron.IpcRendererEvent, theme: ResolvedTheme) => callback(theme)
    ipcRenderer.on('system-theme-changed', handler)
    return () => ipcRenderer.removeListener('system-theme-changed', handler)
  },
  consumeOpenMarkdownRequest: () => ipcRenderer.invoke('consumeOpenMarkdownRequest'),
  onOpenMarkdownFile: (callback: (req: OpenMarkdownRequest) => void) => {
    const handler = (_: Electron.IpcRendererEvent, req: OpenMarkdownRequest) => callback(req)
    ipcRenderer.on('open-markdown-file', handler)
    return () => ipcRenderer.removeListener('open-markdown-file', handler)
  },
  onOpenNoteById: (callback: (req: { noteId: string; folderId?: string | null }) => void) => {
    const handler = (
      _: Electron.IpcRendererEvent,
      req: { noteId: string; folderId?: string | null }
    ) => callback(req)
    ipcRenderer.on('open-note-by-id', handler)
    return () => ipcRenderer.removeListener('open-note-by-id', handler)
  },

  saveRecoveryDraft: (noteId, content) => ipcRenderer.invoke('saveRecoveryDraft', noteId, content),
  loadRecoveryDraft: (noteId) => ipcRenderer.invoke('loadRecoveryDraft', noteId),
  clearRecoveryDraft: (noteId) => ipcRenderer.invoke('clearRecoveryDraft', noteId),
  listRecoveryDrafts: () => ipcRenderer.invoke('listRecoveryDrafts'),

  openExternal: (url) => ipcRenderer.invoke('openExternal', url),
  getLocalFileUrl: (relativePath) => ipcRenderer.invoke('getLocalFileUrl', relativePath),
  getAppInfo: () => ipcRenderer.invoke('getAppInfo'),
  showItemInFolder: (filePath) => ipcRenderer.invoke('showItemInFolder', filePath),
  revealInLibrary: (entryId) => ipcRenderer.invoke('revealInLibrary', entryId),
  selectSavePath: (defaultName, filters) =>
    ipcRenderer.invoke('selectSavePath', defaultName, filters),
  selectOpenFile: (filters) => ipcRenderer.invoke('selectOpenFile', filters),
  saveNoteAsset: (noteId, fileName, base64Data) =>
    ipcRenderer.invoke('saveNoteAsset', noteId, fileName, base64Data),
  readClipboardImage: () => ipcRenderer.invoke('readClipboardImage'),

  watchLibrary: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('library-changed', handler)
    ipcRenderer.send('restart-library-watch')
    return () => ipcRenderer.removeListener('library-changed', handler)
  },

  windowMinimize: () => ipcRenderer.invoke('windowMinimize'),
  windowMaximizeToggle: () => ipcRenderer.invoke('windowMaximizeToggle'),
  windowClose: () => ipcRenderer.invoke('windowClose'),
  appQuit: () => ipcRenderer.invoke('appQuit'),
  setTitleBarOverlayTheme: (theme, accent) =>
    ipcRenderer.invoke('setTitleBarOverlayTheme', theme, accent)
}

contextBridge.exposeInMainWorld('noteAPI', noteAPI)
