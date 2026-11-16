<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import FolderTree from '@/components/FolderTree/FolderTree.vue'
import ChapterOutline from '@/components/ChapterOutline/ChapterOutline.vue'
import MarkdownEditor from '@/components/MarkdownEditor/MarkdownEditor.vue'
import MarkdownLiveEditor from '@/components/MarkdownLiveEditor/MarkdownLiveEditor.vue'
import MarkdownPreview from '@/components/MarkdownPreview/MarkdownPreview.vue'
import ExportDialog from '@/components/ExportDialog/ExportDialog.vue'
import TrashDialog from '@/components/TrashDialog/TrashDialog.vue'
import EditorToolbar, { type FormatCommand } from '@/components/EditorToolbar/EditorToolbar.vue'
import type { MenuAction } from '@/components/AppMenuBar/AppMenuBar.vue'
import { useLibraryStore } from '@/stores/library'
import { useSettingsStore } from '@/stores/settings'
import type { SortMode, ViewMode } from '@/types'
import { applyFormatCommand, type FormatTarget } from '@/utils/formatCommands'
import { ipcErrorMessage } from '@/utils/ipcError'
import { onMenuAction } from '@/utils/menuBus'

const library = useLibraryStore()
const settingsStore = useSettingsStore()

const folderWidth = ref(settingsStore.settings.panelLayout.folderWidth)
const noteWidth = ref(settingsStore.settings.panelLayout.noteWidth)
/** 与标题栏共用 settings，避免本地 ref 不同步 */
const folderCollapsed = computed({
  get: () => settingsStore.settings.panelLayout.folderCollapsed,
  set: (v: boolean) => {
    void settingsStore.update({
      panelLayout: {
        ...settingsStore.settings.panelLayout,
        folderWidth: folderWidth.value,
        noteWidth: noteWidth.value,
        folderCollapsed: v
      }
    })
  }
})
const noteCollapsed = computed({
  get: () => settingsStore.settings.panelLayout.noteCollapsed,
  set: (v: boolean) => {
    void settingsStore.update({
      panelLayout: {
        ...settingsStore.settings.panelLayout,
        folderWidth: folderWidth.value,
        noteWidth: noteWidth.value,
        noteCollapsed: v
      }
    })
  }
})
const showExport = ref(false)
const showTrash = ref(false)
const showSearch = ref(false)
const searchInput = ref('')
/** 目录底栏搜索：默认仅图标，展开后才显示输入框 */
const searchBarOpen = ref(false)
const createMenuOpen = ref(false)
const sortMenuOpen = ref(false)
const viewMenuOpen = ref(false)
const titleEditing = ref(false)
const titleDraft = ref('')
const titleInputRef = ref<HTMLInputElement | null>(null)
const refreshingTree = ref(false)

const sortOptions: { id: SortMode; label: string }[] = [
  { id: 'mtime-desc', label: '修改时间 ↓' },
  { id: 'mtime-asc', label: '修改时间 ↑' },
  { id: 'name-asc', label: '名称 A-Z' },
  { id: 'name-desc', label: '名称 Z-A' }
]

const sortLabel = computed(
  () =>
    sortOptions.find((o) => o.id === settingsStore.settings.sortMode)?.label || '排序'
)
const liveEditorRef = ref<FormatTarget | null>(null)
const sourceEditorRef = ref<FormatTarget | null>(null)
let saveTimer: ReturnType<typeof setTimeout> | null = null
let resizing: 'folder' | 'note' | null = null

const viewModeOptions: { id: ViewMode; label: string }[] = [
  { id: 'live', label: '即时' },
  { id: 'edit', label: '源码' },
  { id: 'split', label: '分屏' },
  { id: 'preview', label: '预览' }
]

const viewModeLabel = computed(
  () => viewModeOptions.find((o) => o.id === library.viewMode)?.label || '视图'
)

function toggleCreateMenu(e?: MouseEvent) {
  e?.stopPropagation()
  sortMenuOpen.value = false
  viewMenuOpen.value = false
  createMenuOpen.value = !createMenuOpen.value
}

function closeCreateMenu() {
  createMenuOpen.value = false
}

function toggleSortMenu(e?: MouseEvent) {
  e?.stopPropagation()
  createMenuOpen.value = false
  viewMenuOpen.value = false
  sortMenuOpen.value = !sortMenuOpen.value
}

function closeSortMenu() {
  sortMenuOpen.value = false
}

function toggleViewMenu(e?: MouseEvent) {
  e?.stopPropagation()
  createMenuOpen.value = false
  sortMenuOpen.value = false
  viewMenuOpen.value = !viewMenuOpen.value
}

function closeViewMenu() {
  viewMenuOpen.value = false
}

async function pickSort(mode: SortMode) {
  sortMenuOpen.value = false
  await changeSort(mode)
}

function pickViewMode(mode: ViewMode) {
  viewMenuOpen.value = false
  setViewMode(mode)
}

async function pickCreate(kind: 'note' | 'folder') {
  createMenuOpen.value = false
  if (kind === 'note') await newNote()
  else await newFolder()
}

const showEditorToolbar = computed(
  () => !!library.selectedNoteId && library.viewMode !== 'preview'
)

async function insertImageFromPicker(target: FormatTarget) {
  if (!library.selectedNoteId) return
  try {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.multiple = true
    const files = await new Promise<FileList | null>((resolve) => {
      input.onchange = () => resolve(input.files)
      input.click()
    })
    if (!files?.length) return
    const parts: string[] = []
    for (const file of Array.from(files)) {
      const buffer = await file.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let binary = ''
      const chunk = 0x8000
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
      }
      const saved = await window.noteAPI.saveNoteAsset(
        library.selectedNoteId,
        file.name || 'image.png',
        btoa(binary)
      )
      const alt = file.name.replace(/\.[^.]+$/, '')
      parts.push(`![${alt}](${saved.relativePath})`)
    }
    if (parts.length) {
      target.focus?.()
      target.insert(parts.join('\n'))
    }
  } catch (e) {
    ElMessage.error(ipcErrorMessage(e, '插入图片失败'))
  }
}

async function pasteScreenshot(target: FormatTarget) {
  if (!library.selectedNoteId) {
    ElMessage.warning('请先打开一篇笔记')
    return
  }
  try {
    target.focus?.()
    const ok = target.pasteClipboardImage
      ? await target.pasteClipboardImage()
      : false
    if (!ok) {
      // 通用回退：直接读系统剪贴板并插入
      const { saveClipboardImageAsMarkdown } = await import('@/utils/clipboardImage')
      const md = await saveClipboardImageAsMarkdown(library.selectedNoteId, null)
      if (!md) {
        ElMessage.warning('剪贴板中没有图片，请先截图（如 Win+Shift+S）')
        return
      }
      target.insert(md.endsWith('\n') ? md : `${md}\n`)
    }
    ElMessage.success('已插入截图')
  } catch (e) {
    ElMessage.error(ipcErrorMessage(e, '粘贴截图失败'))
  }
}

function onFormatCommand(cmd: FormatCommand) {
  const target =
    library.viewMode === 'live'
      ? liveEditorRef.value
      : library.viewMode === 'edit' || library.viewMode === 'split'
        ? sourceEditorRef.value
        : null
  if (!target) return
  if (cmd === 'image') {
    void insertImageFromPicker(target)
    return
  }
  if (cmd === 'pasteScreenshot') {
    void pasteScreenshot(target)
    return
  }
  applyFormatCommand(target, cmd)
}

const noteDir = computed(() => {
  if (!library.selectedNote?.path) return '.'
  const p = library.selectedNote.path
  const idx = p.lastIndexOf('/')
  return idx >= 0 ? p.slice(0, idx) : '.'
})

const saveLabel = computed(() => {
  switch (library.saveStatus) {
    case 'saving':
      return '保存中'
    case 'dirty':
      return '未保存'
    case 'failed':
      return '保存失败'
    default:
      return '已保存'
  }
})

watch(
  () => library.content,
  () => {
    if (!settingsStore.settings.autoSave) return
    if (library.saveStatus !== 'dirty') return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      void library.saveCurrent({ silent: true }).catch((e) => {
        const msg = ipcErrorMessage(e, '自动保存失败')
        const denied = msg.includes('无法写入') || msg.includes('WRITE_DENIED') || msg.includes('EPERM')
        if (denied) {
          // 权限/占用问题下停止自动保存，避免刷屏
          void settingsStore.update({ autoSave: false })
          ElMessageBox.alert(msg, '无法保存笔记', { confirmButtonText: '知道了', type: 'error' })
          return
        }
        ElMessage.error(msg)
      })
    }, settingsStore.settings.autoSaveIntervalMs)
  }
)

function onContentUpdate(val: string) {
  library.markDirty(val)
}

function isDialogCancel(e: unknown): boolean {
  return e === 'cancel' || e === 'close' || (e as { action?: string })?.action === 'cancel'
}

async function newFolder() {
  try {
    const parent = library.selectedFolder
    const parentLabel = parent?.isRoot
      ? parent.name || '根目录'
      : parent?.name || '根目录'
    const { value } = await ElMessageBox.prompt(
      `将在「${parentLabel}」下创建子文件夹`,
      '新建文件夹',
      {
        inputValue: '新建文件夹',
        confirmButtonText: '创建',
        cancelButtonText: '取消'
      }
    )
    if (value?.trim()) {
      await library.createFolder(value.trim())
      ElMessage.success(`已在「${parentLabel}」下创建`)
    }
  } catch (e) {
    if (isDialogCancel(e)) return
    ElMessage.error(ipcErrorMessage(e, '创建文件夹失败'))
  }
}

async function newNote() {
  try {
    const parent = library.selectedFolder
    const parentLabel = parent?.isRoot
      ? parent.name || '根目录'
      : parent?.name || '根目录'
    const { value } = await ElMessageBox.prompt(
      `将在「${parentLabel}」下创建笔记`,
      '新建笔记',
      {
        inputValue: '未命名笔记',
        confirmButtonText: '创建',
        cancelButtonText: '取消'
      }
    )
    if (value?.trim()) {
      await library.createNote(value.trim())
      ElMessage.success('笔记已创建')
    }
  } catch (e) {
    if (isDialogCancel(e)) return
    const msg = ipcErrorMessage(e, '创建笔记失败')
    if (msg.includes('无法写入') || msg.includes('WRITE_DENIED') || msg.includes('EPERM')) {
      await ElMessageBox.alert(msg, '无法创建笔记', { confirmButtonText: '知道了', type: 'error' })
      return
    }
    ElMessage.error(msg)
  }
}

async function manualSave() {
  try {
    await library.saveCurrent()
    ElMessage.success('已保存')
  } catch (e) {
    const msg = ipcErrorMessage(e, '保存失败')
    if (msg.includes('无法写入') || msg.includes('EPERM')) {
      await ElMessageBox.alert(msg, '无法保存笔记', { confirmButtonText: '知道了', type: 'error' })
      return
    }
    ElMessage.error(msg)
  }
}

async function refreshFolderTree() {
  if (refreshingTree.value) return
  refreshingTree.value = true
  try {
    await library.refreshTree(true)
  } catch (e) {
    ElMessage.error(ipcErrorMessage(e, '刷新目录失败'))
  } finally {
    refreshingTree.value = false
  }
}

async function startTitleEdit() {
  const note = library.selectedNote
  if (!note || titleEditing.value) return
  titleDraft.value = note.name
  titleEditing.value = true
  await nextTick()
  titleInputRef.value?.focus()
  titleInputRef.value?.select()
}

function cancelTitleEdit() {
  titleEditing.value = false
  titleDraft.value = ''
}

async function commitTitleEdit() {
  if (!titleEditing.value) return
  const note = library.selectedNote
  const next = titleDraft.value.trim()
  titleEditing.value = false
  if (!note) return
  if (!next || next === note.name) return
  try {
    await library.renameNote(note.id, next)
    ElMessage.success('笔记已重命名')
  } catch (e) {
    ElMessage.error(ipcErrorMessage(e, '重命名失败'))
  }
}

watch(
  () => library.selectedNoteId,
  () => {
    if (titleEditing.value) cancelTitleEdit()
  }
)

async function changeSort(mode: SortMode) {
  await settingsStore.setSortMode(mode)
  // 笔记展示在左侧目录树中，必须按新排序重扫树
  await library.refreshTree(true)
}

function setViewMode(mode: ViewMode) {
  library.viewMode = mode
}

async function doSearch() {
  const keyword = searchInput.value.trim()
  if (!keyword) {
    openSearchBar()
    return
  }
  await library.search(keyword)
  showSearch.value = true
}

function openSearchBar() {
  searchBarOpen.value = true
  requestAnimationFrame(() => {
    const el = document.getElementById('global-search') as HTMLInputElement | null
    el?.focus()
    el?.select()
  })
}

function closeSearchBar() {
  searchBarOpen.value = false
}

function onSearchBlur(e: FocusEvent) {
  const next = e.relatedTarget as HTMLElement | null
  if (next?.closest('.folder-search')) return
  // 无关键字时失焦收起，保留已输入内容时保持展开
  if (!searchInput.value.trim()) closeSearchBar()
}

function onSearchKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    if (searchInput.value) {
      searchInput.value = ''
      return
    }
    closeSearchBar()
  }
}

async function openSearchResult(noteId: string, folderId: string) {
  await library.loadNotes(folderId)
  await library.selectNote(noteId)
  showSearch.value = false
}

async function backupLibrary() {
  try {
    const result = await window.noteAPI.backupLibrary()
    ElMessage.success(`备份完成：${result.zipPath}`)
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.code !== 'CANCELLED') ElMessage.error(err.message || '备份失败')
  }
}

async function backupFolder() {
  if (!library.selectedFolderId) return
  try {
    const result = await window.noteAPI.backupFolder(library.selectedFolderId)
    ElMessage.success(`备份完成：${result.zipPath}`)
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.code !== 'CANCELLED') ElMessage.error(err.message || '备份失败')
  }
}

async function importBackup() {
  try {
    const zipPath = await window.noteAPI.selectOpenFile([{ name: 'ZIP', extensions: ['zip'] }])
    if (!zipPath) return
    const manifest = await window.noteAPI.inspectBackup(zipPath)
    if (!manifest) return
    await ElMessageBox.confirm(
      `备份包含 ${manifest.fileCount} 个文件、约 ${(manifest.totalSize / 1024).toFixed(1)} KB。\n将导入到当前选中文件夹（冲突时跳过同名文件）。`,
      '导入备份',
      { confirmButtonText: '开始导入', cancelButtonText: '取消' }
    )
    const target = library.selectedFolderId || '.'
    const result = await window.noteAPI.importBackup(zipPath, target, 'skip')
    await library.refreshTree()
    ElMessage.success(
      `导入完成：新增 ${result.imported}，跳过 ${result.skipped}，失败 ${result.failed.length}`
    )
  } catch (e) {
    if (e !== 'cancel') ElMessage.error((e as { message?: string })?.message || '导入失败')
  }
}

async function persistPanelLayout() {
  await settingsStore.update({
    panelLayout: {
      folderWidth: folderWidth.value,
      noteWidth: noteWidth.value,
      folderCollapsed: folderCollapsed.value,
      noteCollapsed: noteCollapsed.value
    }
  })
}

function setFolderCollapsed(v: boolean) {
  folderCollapsed.value = v
}

function setNoteCollapsed(v: boolean) {
  noteCollapsed.value = v
}

function startResize(which: 'folder' | 'note', e: MouseEvent) {
  resizing = which
  const startX = e.clientX
  const startFolder = folderWidth.value
  const startNote = noteWidth.value
  const onMove = (ev: MouseEvent) => {
    const dx = ev.clientX - startX
    if (resizing === 'folder') folderWidth.value = Math.min(420, Math.max(160, startFolder + dx))
    if (resizing === 'note') noteWidth.value = Math.min(480, Math.max(180, startNote + dx))
  }
  const onUp = () => {
    resizing = null
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    void persistPanelLayout()
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

function onKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    void manualSave()
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
    e.preventDefault()
    void newNote()
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
    e.preventDefault()
    openSearchBar()
  }
  // Ctrl+1..5 → H1..H5（即时模式；源码/分屏由 CodeMirror keymap 处理）
  if (
    (e.ctrlKey || e.metaKey) &&
    !e.altKey &&
    !e.shiftKey &&
    /^[1-5]$/.test(e.key) &&
    library.selectedNoteId &&
    library.viewMode === 'live'
  ) {
    const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase()
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return
    e.preventDefault()
    onFormatCommand(`heading${e.key}` as FormatCommand)
  }
}

async function handleMenuAction(action: MenuAction) {
  switch (action) {
    case 'file:new-note':
      await newNote()
      break
    case 'file:new-folder':
      await newFolder()
      break
    case 'file:save':
      await manualSave()
      break
    case 'file:export':
      showExport.value = true
      break
    case 'file:backup-library':
      await backupLibrary()
      break
    case 'file:backup-folder':
      await backupFolder()
      break
    case 'file:import':
      await importBackup()
      break
    case 'file:trash':
      showTrash.value = true
      break
    case 'edit:search': {
      openSearchBar()
      break
    }
    case 'edit:refresh':
      await refreshFolderTree()
      break
    case 'view:live':
      setViewMode('live')
      break
    case 'view:edit':
      setViewMode('edit')
      break
    case 'view:split':
      setViewMode('split')
      break
    case 'view:preview':
      setViewMode('preview')
      break
    case 'view:toggle-folder':
      setFolderCollapsed(!folderCollapsed.value)
      break
    case 'view:toggle-chapter':
      setNoteCollapsed(!noteCollapsed.value)
      break
    case 'view:toggle-minimal': {
      const minimal = folderCollapsed.value && noteCollapsed.value
      void settingsStore.update({
        panelLayout: {
          ...settingsStore.settings.panelLayout,
          folderWidth: folderWidth.value,
          noteWidth: noteWidth.value,
          folderCollapsed: !minimal,
          noteCollapsed: !minimal
        }
      })
      break
    }
    default:
      break
  }
}

let offMenu: (() => void) | null = null

function closeAllMenus() {
  closeCreateMenu()
  closeSortMenu()
  closeViewMenu()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('click', closeAllMenus)
  offMenu = onMenuAction((action) => {
    void handleMenuAction(action)
  })
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('click', closeAllMenus)
  offMenu?.()
  if (saveTimer) clearTimeout(saveTimer)
})
</script>

<template>
  <div class="main-shell">
    <div class="main-panes">
      <aside
        v-show="!folderCollapsed"
        class="pane folder-pane"
        :style="{ width: folderWidth + 'px' }"
      >
        <div class="pane-header folder-header">
          <span class="pane-label">目录</span>
          <div class="folder-header-actions">
            <button
              class="btn header-icon-btn"
              type="button"
              title="刷新目录"
              aria-label="刷新目录"
              :disabled="refreshingTree"
              @click="refreshFolderTree"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                :class="{ spinning: refreshingTree }"
              >
                <path
                  d="M19.5 12a7.5 7.5 0 1 1-2.1-5.2"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                />
                <path
                  d="M17.2 3.8v4.2h4.2"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
            <div class="sort-menu" @click.stop>
              <button
                class="btn header-icon-btn"
                type="button"
                :class="{ open: sortMenuOpen }"
                :title="`排序：${sortLabel}`"
                aria-label="排序"
                @click="toggleSortMenu"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M8 4v14M8 18l-3-3M8 18l3-3M14 6h6M14 12h4M14 18h2"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
              <div v-if="sortMenuOpen" class="sort-panel" role="menu">
                <button
                  v-for="opt in sortOptions"
                  :key="opt.id"
                  type="button"
                  class="sort-item"
                  :class="{ active: settingsStore.settings.sortMode === opt.id }"
                  role="menuitem"
                  @click="pickSort(opt.id)"
                >
                  {{ opt.label }}
                </button>
              </div>
            </div>
          </div>
        </div>
        <div class="pane-actions">
          <div class="create-menu" @click.stop>
            <button
              class="btn primary create-trigger"
              type="button"
              :class="{ open: createMenuOpen }"
              title="新建"
              @click="toggleCreateMenu"
            >
              新建
              <span class="caret">{{ createMenuOpen ? '▴' : '▾' }}</span>
            </button>
            <div v-if="createMenuOpen" class="create-panel" role="menu">
              <button type="button" class="create-item" role="menuitem" @click="pickCreate('note')">
                新建笔记
              </button>
              <button type="button" class="create-item" role="menuitem" @click="pickCreate('folder')">
                新建文件夹
              </button>
            </div>
          </div>
        </div>
        <div class="pane-body">
          <FolderTree :nodes="library.tree" />
        </div>
        <div class="folder-search" :class="{ expanded: searchBarOpen }">
          <template v-if="searchBarOpen">
            <input
              id="global-search"
              v-model="searchInput"
              placeholder="搜索标题或正文…"
              @keydown.enter="doSearch"
              @keydown="onSearchKeydown"
              @blur="onSearchBlur"
            />
            <button
              class="btn search-trigger"
              type="button"
              title="搜索"
              aria-label="搜索"
              @mousedown.prevent
              @click="doSearch"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle
                  cx="11"
                  cy="11"
                  r="6.5"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                />
                <path
                  d="M16.2 16.2L20 20"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                />
              </svg>
            </button>
            <button
              class="btn search-trigger search-close"
              type="button"
              title="收起"
              aria-label="收起搜索"
              @mousedown.prevent
              @click="closeSearchBar"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M7 7l10 10M17 7L7 17"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                />
              </svg>
            </button>
          </template>
          <button
            v-else
            class="btn search-trigger search-open"
            type="button"
            title="搜索（Ctrl+F）"
            aria-label="打开搜索"
            @click="openSearchBar"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle
                cx="11"
                cy="11"
                r="6.5"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
              />
              <path
                d="M16.2 16.2L20 20"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </div>
      </aside>
      <div
        v-show="!folderCollapsed"
        class="resizer"
        @mousedown="startResize('folder', $event)"
      />

      <aside
        v-show="!noteCollapsed"
        class="pane note-pane"
        :style="{ width: noteWidth + 'px' }"
      >
        <div class="pane-header">
          <span class="pane-label">章节</span>
        </div>
        <div class="pane-subheader outline-subheader">
          <span
            v-if="library.selectedNoteId"
            class="outline-note-name"
            :title="library.selectedNote?.name || '未命名'"
          >
            {{ library.selectedNote?.name || '未命名' }}
          </span>
          <span v-else class="outline-note-name muted">未打开笔记</span>
        </div>
        <div class="pane-body">
          <ChapterOutline />
        </div>
      </aside>
      <div
        v-show="!noteCollapsed"
        class="resizer"
        @mousedown="startResize('note', $event)"
      />

      <section class="pane content-pane">
        <div class="pane-header content-titlebar">
          <input
            v-if="library.selectedNoteId && titleEditing"
            ref="titleInputRef"
            v-model="titleDraft"
            class="note-title-input"
            maxlength="120"
            aria-label="修改笔记文件名"
            @keydown.enter.prevent="commitTitleEdit"
            @keydown.esc.prevent="cancelTitleEdit"
            @blur="commitTitleEdit"
          />
          <button
            v-else-if="library.selectedNoteId"
            type="button"
            class="note-title editable"
            title="点击修改文件名"
            @click="startTitleEdit"
          >
            {{ library.selectedNote?.name || '未命名' }}
          </button>
          <span v-else class="note-title">未打开笔记</span>
          <div v-if="library.selectedNoteId" class="save-status">
            <span class="status-dot" :class="library.saveStatus" />
            {{ saveLabel }}
          </div>
        </div>
        <div class="editor-tools-row">
          <div class="editor-tools-main">
            <EditorToolbar
              v-if="library.selectedNoteId && showEditorToolbar"
              @command="onFormatCommand"
            />
          </div>
          <div v-if="library.selectedNoteId" class="view-mode-menu" @click.stop>
            <button
              class="btn view-trigger"
              type="button"
              :class="{ open: viewMenuOpen }"
              title="视图模式"
              @click="toggleViewMenu"
            >
              {{ viewModeLabel }}
              <span class="caret">{{ viewMenuOpen ? '▴' : '▾' }}</span>
            </button>
            <div v-if="viewMenuOpen" class="view-panel" role="menu">
              <button
                v-for="opt in viewModeOptions"
                :key="opt.id"
                type="button"
                class="view-item"
                :class="{ active: library.viewMode === opt.id }"
                role="menuitem"
                @click="pickViewMode(opt.id)"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>
        </div>
        <div v-if="!library.selectedNoteId" class="empty-state">
          <div>选择或新建一篇笔记开始写作</div>
        </div>
        <div v-else class="content-area" :class="library.viewMode">
          <div v-if="library.viewMode === 'live'" class="editor-pane live-pane">
            <MarkdownLiveEditor
              ref="liveEditorRef"
              :model-value="library.content"
              :note-id="library.selectedNoteId"
              :note-dir="noteDir"
              @update:model-value="onContentUpdate"
            />
          </div>
          <div v-if="library.viewMode === 'edit' || library.viewMode === 'split'" class="editor-pane">
            <MarkdownEditor
              ref="sourceEditorRef"
              :model-value="library.content"
              :note-id="library.selectedNoteId"
              @update:model-value="onContentUpdate"
            />
          </div>
          <div v-if="library.viewMode === 'preview' || library.viewMode === 'split'" class="preview-pane">
            <MarkdownPreview :content="library.content" :note-dir="noteDir" />
          </div>
        </div>
      </section>
    </div>

    <ExportDialog v-model:visible="showExport" />
    <TrashDialog v-model:visible="showTrash" />

    <el-drawer v-model="showSearch" title="搜索结果" size="380px">
      <div v-if="!library.searchResults.length" class="empty-state" style="height: 160px">无匹配结果</div>
      <div
        v-for="item in library.searchResults"
        :key="item.note.id"
        class="search-item"
        @click="openSearchResult(item.note.id, item.note.folderId)"
      >
        <div class="title">{{ item.note.name }}</div>
        <div class="path">{{ item.note.path }}</div>
        <div class="snippet">{{ item.snippet }}</div>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.folder-pane {
  position: relative;
}

.folder-pane .pane-body {
  padding-bottom: 40px;
}

.folder-search {
  position: absolute;
  left: 8px;
  bottom: 8px;
  z-index: 6;
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 0;
  margin: 0;
  border: none;
  background: transparent;
  box-sizing: border-box;
}

.folder-search.expanded {
  left: 8px;
  right: 8px;
  padding: 6px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--panel-bg);
  box-shadow: var(--shadow-soft);
}

.folder-search input {
  flex: 1;
  min-width: 0;
  height: 28px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 0 8px;
  background: var(--panel-bg);
  color: var(--text-primary);
  font-size: 12px;
}

.folder-search input:focus {
  outline: none;
  border-color: var(--accent-color);
}

.folder-search .search-trigger {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  padding: 0;
  justify-content: center;
  color: var(--text-secondary);
}

.folder-search .search-open {
  color: var(--text-secondary);
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-soft);
}

.folder-search .search-trigger:hover {
  color: var(--accent-color);
  border-color: var(--accent-color);
}

.folder-search .search-trigger svg {
  width: 14px;
  height: 14px;
  display: block;
}

.folder-header {
  gap: 8px;
}

.folder-header-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
  flex-shrink: 0;
}

.sort-menu {
  position: relative;
  flex-shrink: 0;
}

.header-icon-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  justify-content: center;
  color: var(--text-secondary);
  border-color: transparent;
  background: transparent;
}

.header-icon-btn:hover:not(:disabled) {
  background: var(--hover-bg);
  color: var(--text-primary);
}

.header-icon-btn.open {
  border-color: var(--accent-color);
  color: var(--accent-color);
}

.header-icon-btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.header-icon-btn svg {
  width: 14px;
  height: 14px;
  display: block;
}

.header-icon-btn svg.spinning {
  animation: refresh-spin 0.8s linear infinite;
}

@keyframes refresh-spin {
  to {
    transform: rotate(360deg);
  }
}

.sort-panel {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 30;
  min-width: 128px;
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
  padding: 4px;
}

.sort-item {
  width: 100%;
  display: block;
  border: none;
  background: transparent;
  color: var(--text-primary);
  text-align: left;
  padding: 8px 10px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.sort-item:hover,
.sort-item.active {
  background: var(--selection-bg);
  color: var(--accent-color);
}

.editor-tools-row {
  display: flex;
  align-items: center;
  height: var(--pane-subheader-height, 36px);
  box-sizing: border-box;
  border-bottom: 1px solid var(--border-color);
  background: var(--toolbar-bg);
  flex-shrink: 0;
}

.editor-tools-main {
  flex: 1;
  min-width: 0;
}

.editor-tools-main :deep(.editor-toolbar) {
  border-bottom: none;
  height: 100%;
  min-height: 0;
  padding: 0 8px;
  flex-wrap: nowrap;
  overflow-x: auto;
  box-sizing: border-box;
}

.view-mode-menu {
  position: relative;
  display: flex;
  align-items: center;
  padding: 0 8px;
  border-left: 1px solid var(--border-color);
  flex-shrink: 0;
}

.view-trigger {
  height: 28px;
  min-width: 72px;
  justify-content: center;
  gap: 6px;
  font-size: 12px;
}

.view-trigger.open {
  border-color: var(--accent-color);
  color: var(--accent-color);
}

.view-panel {
  position: absolute;
  top: calc(100% + 4px);
  right: 8px;
  z-index: 40;
  min-width: 110px;
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
  padding: 4px;
}

.view-item {
  width: 100%;
  display: block;
  border: none;
  background: transparent;
  color: var(--text-primary);
  text-align: left;
  padding: 8px 10px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.view-item:hover,
.view-item.active {
  background: var(--selection-bg);
  color: var(--accent-color);
}

.content-titlebar {
  gap: 12px;
}

.outline-subheader {
  /* 与左侧「新建」、右侧编辑工具栏同一高度，保证三列内容区顶边对齐 */
  min-width: 0;
}

.outline-note-name {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.outline-note-name.muted {
  font-weight: 400;
  color: var(--text-muted);
}

.content-titlebar .note-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.01em;
}

.content-titlebar .note-title.editable {
  border: none;
  background: transparent;
  padding: 0;
  margin: 0;
  text-align: left;
  cursor: text;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  flex: 1;
  min-width: 0;
}

.content-titlebar .note-title.editable:hover {
  color: var(--accent-color);
}

.content-titlebar .note-title-input {
  flex: 1;
  min-width: 0;
  height: 28px;
  border: 1px solid var(--accent-color);
  border-radius: 4px;
  padding: 0 8px;
  background: var(--panel-bg);
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 600;
  outline: none;
}

.save-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 400;
  color: var(--text-muted);
  flex-shrink: 0;
  margin-left: auto;
  opacity: 0.85;
}

.save-status :deep(.status-dot),
.save-status .status-dot {
  width: 6px;
  height: 6px;
  opacity: 0.75;
}

.main-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.folder-pane,
.note-pane {
  flex-shrink: 0;
}

.pane-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  height: var(--pane-subheader-height, 36px);
  padding: 0 8px;
  box-sizing: border-box;
  border-bottom: 1px solid var(--border-color);
  background: var(--toolbar-bg);
  flex-shrink: 0;
}

.create-menu {
  position: relative;
  flex: 1;
  min-width: 0;
}

.create-trigger {
  width: 100%;
  height: 28px;
  justify-content: center;
  gap: 6px;
  padding: 0 8px;
  font-size: 12px;
}

.create-trigger.open {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
  color: #fff;
}

.caret {
  font-size: 10px;
  opacity: 0.8;
}

.create-panel {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 30;
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
  padding: 4px;
}

.create-item {
  width: 100%;
  display: block;
  border: none;
  background: transparent;
  color: var(--text-primary);
  text-align: left;
  padding: 8px 10px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.create-item:hover {
  background: var(--selection-bg);
  color: var(--accent-color);
}

.content-pane {
  flex: 1;
}

.content-area {
  flex: 1;
  display: flex;
  min-height: 0;
  height: calc(100% - 0px);
}

.content-area.live .editor-pane,
.content-area.edit .editor-pane,
.content-area.preview .preview-pane {
  width: 100%;
}

.content-area.split .editor-pane,
.content-area.split .preview-pane {
  width: 50%;
}

.content-area.live .live-pane {
  overflow: hidden;
}

.editor-pane,
.preview-pane {
  min-width: 0;
  height: 100%;
  overflow: auto;
  background: var(--editor-bg);
}

.preview-pane {
  border-left: 1px solid var(--border-color);
  background: var(--preview-bg);
}

.collapse-tab {
  writing-mode: vertical-rl;
  padding: 12px 4px;
  border-right: 1px solid var(--border-color);
}

.search-item {
  padding: 12px;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
}

.search-item:hover {
  background: var(--hover-bg);
}

.search-item .title {
  font-weight: 600;
}

.search-item .path {
  font-size: 11px;
  color: var(--text-muted);
  margin: 4px 0;
}

.search-item .snippet {
  font-size: 12px;
  color: var(--text-secondary);
}

.pane {
  height: 100%;
}

.content-pane {
  display: flex;
  flex-direction: column;
}

.content-pane .content-area,
.content-pane .empty-state {
  flex: 1;
  min-height: 0;
}
</style>
