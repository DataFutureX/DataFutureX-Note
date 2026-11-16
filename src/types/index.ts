/** 排序模式 */
export type SortMode = 'mtime-desc' | 'mtime-asc' | 'name-asc' | 'name-desc'

/** 主题偏好 */
export type ThemePreference = 'system' | 'light' | 'dark'

/** 实际生效主题 */
export type ResolvedTheme = 'light' | 'dark'

/** 笔记主题色（强调色 / 氛围） */
export type AccentTheme = 'amber' | 'blue' | 'paper' | 'green' | 'mono'

/** 冲突策略 */
export type ConflictStrategy = 'skip' | 'overwrite' | 'keep-both'

/** 保存状态 */
export type SaveStatus = 'saved' | 'saving' | 'dirty' | 'failed'

/** 视图模式：live=Typora 式即时渲染 */
export type ViewMode = 'live' | 'edit' | 'preview' | 'split'

/** 笔记正文版式：铺满整栏 / 居中定宽 */
export type ContentLayoutMode = 'fill' | 'center'

export interface FolderNode {
  id: string
  name: string
  path: string
  children: FolderNode[]
  /** 该目录下的 Markdown 笔记（不含子目录） */
  notes: Note[]
  isRoot?: boolean
}

export interface Note {
  id: string
  name: string
  folderId: string
  path: string
  mtime: number
  size: number
}

/** 笔记内章节（Markdown 标题） */
export interface ChapterHeading {
  id: string
  level: number
  text: string
  /** 1-based 行号 */
  line: number
}

export interface SearchResult {
  note: Note
  matchesTitle: boolean
  matchesContent: boolean
  snippet: string
}

/** 回收站条目 */
export interface TrashItem {
  id: string
  type: 'note' | 'folder'
  name: string
  /** 删除前在库内的相对路径 */
  originalPath: string
  deletedAt: number
  size?: number
}

/** 回收站内文件夹的子项（浏览用） */
export interface TrashContentNode {
  name: string
  type: 'folder' | 'note'
  /** 相对被删文件夹根的路径，用 / 分隔 */
  relativePath: string
}

/** 笔记阅读/编辑位置（按笔记 id 记忆） */
export interface NoteViewPosition {
  scrollTop: number
  /** 0~1，内容高度变化时比绝对 scrollTop 更稳 */
  scrollRatio: number
  /** 源码模式光标偏移；即时渲染可用近似字符偏移 */
  cursorOffset?: number
  updatedAt: number
}

/** 最近打开的笔记（托盘快捷入口） */
export interface RecentNoteEntry {
  id: string
  name: string
  folderId: string
  openedAt: number
}

export interface AppSettings {
  rootDirectory: string | null
  theme: ThemePreference
  /** 主题色：暖黄 / 柔蓝 / 纸感 / 柔绿 / 灰白 */
  accentTheme: AccentTheme
  sortMode: SortMode
  autoSave: boolean
  autoSaveIntervalMs: number
  startupBehavior: 'last-note' | 'default-folder'
  lastNoteId: string | null
  lastFolderId: string | null
  defaultBackupDir: string | null
  windowBounds: {
    x: number
    y: number
    width: number
    height: number
  } | null
  panelLayout: {
    folderWidth: number
    noteWidth: number
    folderCollapsed: boolean
    noteCollapsed: boolean
  }
  /** 各笔记上次阅读/编辑位置 */
  notePositions: Record<string, NoteViewPosition>
  /** 最近打开的笔记（最多 10 条） */
  recentNotes: RecentNoteEntry[]
  /** 笔记显示区域版式：铺满 / 居中 */
  contentLayout: ContentLayoutMode
}

export interface BackupManifestEntry {
  path: string
  type: 'file' | 'dir'
  size?: number
}

export interface BackupManifest {
  fileCount: number
  dirCount: number
  totalSize: number
  entries: BackupManifestEntry[]
}

export interface BackupResult {
  zipPath: string
  fileCount: number
  totalSize: number
}

export interface ImportResult {
  imported: number
  skipped: number
  overwritten: number
  failed: { path: string; reason: string }[]
}

export interface ExportOptions {
  savePath?: string
  pageSize?: 'A4'
  marginsCm?: number
  includeHeader?: boolean
  includeFooter?: boolean
}

export interface ExportResult {
  path: string
  format: 'md' | 'docx' | 'pdf'
}

export interface AppError {
  code: string
  message: string
}

export const DEFAULT_SETTINGS: AppSettings = {
  rootDirectory: null,
  theme: 'system',
  accentTheme: 'blue',
  sortMode: 'mtime-desc',
  autoSave: true,
  autoSaveIntervalMs: 1000,
  startupBehavior: 'last-note',
  lastNoteId: null,
  lastFolderId: null,
  defaultBackupDir: null,
  windowBounds: null,
  notePositions: {},
  recentNotes: [],
  contentLayout: 'fill',
  panelLayout: {
    folderWidth: 220,
    noteWidth: 300,
    folderCollapsed: false,
    noteCollapsed: false
  }
}

export const ACCENT_THEME_OPTIONS: { id: AccentTheme; label: string; hint: string; swatch: string }[] = [
  { id: 'blue', label: '柔蓝', hint: '知识管理（默认）', swatch: '#5b8fd9' },
  { id: 'amber', label: '暖黄', hint: '便签随手记', swatch: '#d97706' },
  { id: 'paper', label: '纸感', hint: '长时间写作', swatch: '#8b7355' },
  { id: 'green', label: '柔绿', hint: '学习专注', swatch: '#059669' },
  { id: 'mono', label: '灰白', hint: '浅灰极简', swatch: '#525252' }
]

/** 窗口铬 / 标题栏颜色：与 CSS 主题色浅/深变体对齐 */
export const ACCENT_CHROME_COLORS: Record<
  AccentTheme,
  Record<ResolvedTheme, { color: string; symbolColor: string }>
> = {
  amber: {
    light: { color: '#faf6ee', symbolColor: '#1f2329' },
    dark: { color: '#1e1a14', symbolColor: '#e8eaed' }
  },
  blue: {
    light: { color: '#f5f8fc', symbolColor: '#1e2430' },
    dark: { color: '#181c26', symbolColor: '#e6eaf2' }
  },
  paper: {
    light: { color: '#f3efe6', symbolColor: '#2c2924' },
    dark: { color: '#1f1c17', symbolColor: '#ebe6dc' }
  },
  green: {
    light: { color: '#f5faf6', symbolColor: '#1f2329' },
    dark: { color: '#161e1a', symbolColor: '#e8eaed' }
  },
  mono: {
    light: { color: '#f5f5f5', symbolColor: '#404040' },
    dark: { color: '#1a1a1a', symbolColor: '#e5e5e5' }
  }
}

export function resolveChromeColors(
  theme: ResolvedTheme,
  accent: AccentTheme = 'blue'
): { color: string; symbolColor: string } {
  const key =
    accent === 'amber' ||
    accent === 'blue' ||
    accent === 'paper' ||
    accent === 'green' ||
    accent === 'mono'
      ? accent
      : 'blue'
  return ACCENT_CHROME_COLORS[key][theme]
}

export interface SelfCheckReport {
  ok: boolean
  userData: string
  rootDirectory: string | null
  appVersion: string
  probes: { path: string; writable: boolean; error?: string }[]
  steps: { name: string; ok: boolean; detail?: string }[]
}

/** 用本程序打开外部 Markdown 时的请求 */
export interface OpenMarkdownRequest {
  filePath: string
  rootDirectory: string
  noteId: string
  folderId: string
  hideFolder: true
}

export interface NoteAPI {
  selectRootDirectory(): Promise<string | null>
  useDefaultLibrary(): Promise<string>
  runSelfCheck(): Promise<SelfCheckReport>
  getRootDirectory(): Promise<string | null>
  setRootDirectory(dir: string): Promise<void>
  getFolderTree(sort?: SortMode): Promise<FolderNode[]>
  createFolder(parentId: string, name: string): Promise<FolderNode>
  renameFolder(folderId: string, name: string): Promise<FolderNode>
  moveFolder(folderId: string, targetParentId: string): Promise<FolderNode>
  deleteFolder(folderId: string): Promise<void>
  refreshLibrary(sort?: SortMode): Promise<FolderNode[]>

  listNotes(folderId: string, sort: SortMode): Promise<Note[]>
  createNote(folderId: string, name: string): Promise<Note>
  readNote(noteId: string): Promise<string>
  saveNote(noteId: string, content: string, expectedMtime?: number): Promise<{ mtime: number }>
  renameNote(noteId: string, name: string): Promise<Note>
  deleteNote(noteId: string): Promise<void>
  moveNote(noteId: string, targetFolderId: string): Promise<Note>
  copyNote(noteId: string): Promise<Note>
  searchNotes(keyword: string): Promise<SearchResult[]>

  listTrash(): Promise<TrashItem[]>
  listTrashContents(trashId: string, relativePath?: string): Promise<TrashContentNode[]>
  restoreTrash(trashId: string): Promise<{ restoredPath: string }>
  purgeTrash(trashId: string): Promise<void>
  emptyTrash(): Promise<number>

  backupFolder(folderId: string): Promise<BackupResult>
  backupLibrary(): Promise<BackupResult>
  inspectBackup(zipPath?: string): Promise<BackupManifest | null>
  importBackup(
    zipPath: string,
    targetFolderId: string,
    strategy: ConflictStrategy
  ): Promise<ImportResult>

  exportMarkdown(noteId: string): Promise<ExportResult | null>
  exportWord(noteId: string, options?: ExportOptions): Promise<ExportResult | null>
  exportPdf(noteId: string, options?: ExportOptions): Promise<ExportResult | null>

  getSettings(): Promise<AppSettings>
  updateSettings(settings: Partial<AppSettings>): Promise<AppSettings>
  getSystemTheme(): Promise<ResolvedTheme>
  onSystemThemeChanged(callback: (theme: ResolvedTheme) => void): () => void

  /** 消费启动/关联打开时的 Markdown 请求（只取一次） */
  consumeOpenMarkdownRequest(): Promise<OpenMarkdownRequest | null>
  /** 运行中再次用本程序打开 .md 时推送 */
  onOpenMarkdownFile(callback: (req: OpenMarkdownRequest) => void): () => void
  /** 托盘「最近笔记」快捷打开 */
  onOpenNoteById(callback: (req: { noteId: string; folderId?: string | null }) => void): () => void

  saveRecoveryDraft(noteId: string, content: string): Promise<void>
  loadRecoveryDraft(noteId: string): Promise<string | null>
  clearRecoveryDraft(noteId: string): Promise<void>
  listRecoveryDrafts(): Promise<{ noteId: string; content: string; updatedAt: number }[]>

  openExternal(url: string): Promise<void>
  getLocalFileUrl(relativePath: string): Promise<string | null>
  getAppInfo(): Promise<{
    name: string
    version: string
    buildTime: string
    homepage: string
    copyright: string
  }>
  showItemInFolder(filePath: string): Promise<void>
  /** 在系统文件管理器中打开/定位库内条目（文件夹或笔记） */
  revealInLibrary(entryId: string): Promise<void>
  selectSavePath(defaultName: string, filters: { name: string; extensions: string[] }[]): Promise<string | null>
  selectOpenFile(filters: { name: string; extensions: string[] }[]): Promise<string | null>
  /** 将图片/附件保存到笔记目录下 assets，返回相对 Markdown 路径 */
  saveNoteAsset(
    noteId: string,
    fileName: string,
    base64Data: string
  ): Promise<{ relativePath: string; absolutePath: string }>
  /** 读取系统剪贴板中的图片（截图），无图时返回 null */
  readClipboardImage(): Promise<{ base64: string; ext: string } | null>

  watchLibrary(callback: () => void): () => void

  windowMinimize(): Promise<void>
  windowMaximizeToggle(): Promise<void>
  windowClose(): Promise<void>
  appQuit(): Promise<void>
  setTitleBarOverlayTheme(theme: ResolvedTheme, accent?: AccentTheme): Promise<void>
}

declare global {
  interface Window {
    noteAPI: NoteAPI
  }
}
