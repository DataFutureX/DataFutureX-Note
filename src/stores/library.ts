import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { FolderNode, Note, SaveStatus, SearchResult, ViewMode } from '@/types'
import { ipcErrorMessage } from '@/utils/ipcError'
import { titleFromFirstLine } from '@/utils/noteTitle'
import { useSettingsStore } from './settings'

function findFolder(nodes: FolderNode[], id: string): FolderNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    const child = findFolder(n.children, id)
    if (child) return child
  }
  return null
}

function findNoteInTree(nodes: FolderNode[], noteId: string): Note | null {
  for (const n of nodes) {
    const hit = n.notes?.find((note) => note.id === noteId)
    if (hit) return hit
    const child = findNoteInTree(n.children, noteId)
    if (child) return child
  }
  return null
}

export const useLibraryStore = defineStore('library', () => {
  const tree = ref<FolderNode[]>([])
  const notes = ref<Note[]>([])
  const selectedFolderId = ref<string | null>(null)
  const selectedNoteId = ref<string | null>(null)
  const content = ref('')
  const originalContent = ref('')
  const noteMtime = ref<number | null>(null)
  const saveStatus = ref<SaveStatus>('saved')
  const viewMode = ref<ViewMode>('live')
  const searchKeyword = ref('')
  const searchResults = ref<SearchResult[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  /** 章节跳转请求：编辑器监听后滚动定位 */
  const jumpRequest = ref<{ line: number; text: string; token: number } | null>(null)

  const settingsStore = useSettingsStore()
  /** 串行化保存，避免自动保存与切换保存并发导致 mtime 冲突 */
  let saveQueue: Promise<void> = Promise.resolve()
  let jumpToken = 0
  let recoveryTimer: ReturnType<typeof setTimeout> | null = null
  let settingsPersistTimer: ReturnType<typeof setTimeout> | null = null
  let pendingSettings: {
    lastNoteId?: string | null
    lastFolderId?: string | null
    recentNotes?: import('@/types').RecentNoteEntry[]
  } = {}

  function scheduleSettingsPersist(partial: {
    lastNoteId?: string | null
    lastFolderId?: string | null
    recentNotes?: import('@/types').RecentNoteEntry[]
  }) {
    pendingSettings = { ...pendingSettings, ...partial }
    if (settingsPersistTimer) clearTimeout(settingsPersistTimer)
    settingsPersistTimer = setTimeout(() => {
      settingsPersistTimer = null
      const payload = pendingSettings
      pendingSettings = {}
      void settingsStore.update(payload)
    }, 400)
  }

  function notesFromTreeFolder(folderId: string): Note[] | null {
    const folder = findFolder(tree.value, folderId)
    if (!folder?.notes) return null
    return folder.notes
  }

  const selectedFolder = computed(() =>
    selectedFolderId.value ? findFolder(tree.value, selectedFolderId.value) : null
  )
  const selectedNote = computed(() => {
    if (!selectedNoteId.value) return null
    return (
      notes.value.find((n) => n.id === selectedNoteId.value) ||
      findNoteInTree(tree.value, selectedNoteId.value)
    )
  })
  const isDirty = computed(() => content.value !== originalContent.value)

  function requestJumpToHeading(payload: { line: number; text: string }) {
    jumpToken += 1
    jumpRequest.value = { ...payload, token: jumpToken }
  }

  async function ensureRoot(): Promise<boolean> {
    const root = await window.noteAPI.getRootDirectory()
    return !!root
  }

  /** 串行化目录树刷新，避免 watch 连发导致竞态 */
  let refreshQueue: Promise<void> = Promise.resolve()

  async function refreshTree(keepSelection = true, options: { quiet?: boolean } = {}) {
    const run = async () => {
      if (!options.quiet) loading.value = true
      error.value = null
      try {
        tree.value = await window.noteAPI.getFolderTree(settingsStore.settings.sortMode)
        if (!keepSelection || !selectedFolderId.value) {
          selectedFolderId.value = tree.value[0]?.id ?? null
        } else if (!findFolder(tree.value, selectedFolderId.value)) {
          selectedFolderId.value = tree.value[0]?.id ?? null
        }
        if (selectedFolderId.value) {
          await loadNotes(selectedFolderId.value)
        }
      } catch (e) {
        error.value = (e as { message?: string })?.message || String(e)
      } finally {
        if (!options.quiet) loading.value = false
      }
    }
    const task = refreshQueue.then(run, run)
    refreshQueue = task.catch(() => undefined)
    return task
  }

  async function loadNotes(folderId: string, options: { force?: boolean } = {}) {
    selectedFolderId.value = folderId
    const cached = !options.force ? notesFromTreeFolder(folderId) : null
    if (cached) {
      notes.value = cached
    } else {
      try {
        notes.value = await window.noteAPI.listNotes(folderId, settingsStore.settings.sortMode)
      } catch (e) {
        notes.value = []
        error.value = ipcErrorMessage(e, '加载笔记列表失败')
      }
    }
    scheduleSettingsPersist({ lastFolderId: folderId })
  }

  /** 选中文件夹（用于在其下新建笔记/子文件夹）；会离开当前笔记 */
  async function selectFolder(folderId: string, force = false) {
    if (!force && isDirty.value && selectedNoteId.value) {
      try {
        await saveCurrent({ silent: true })
      } catch (e) {
        error.value = ipcErrorMessage(e, '保存失败，已取消切换')
        return false
      }
    }
    selectedFolderId.value = folderId
    selectedNoteId.value = null
    content.value = ''
    originalContent.value = ''
    noteMtime.value = null
    saveStatus.value = 'saved'
    await loadNotes(folderId)
    scheduleSettingsPersist({ lastFolderId: folderId, lastNoteId: null })
    return true
  }

  async function selectNote(noteId: string, force = false) {
    // 切换前必须先落盘当前脏笔记，避免写串内容
    if (!force && isDirty.value && selectedNoteId.value && selectedNoteId.value !== noteId) {
      try {
        await saveCurrent({ silent: true })
      } catch (e) {
        error.value = ipcErrorMessage(e, '保存失败，已取消切换')
        return false
      }
    }
    const text = await window.noteAPI.readNote(noteId)
    selectedNoteId.value = noteId
    content.value = text
    originalContent.value = text
    saveStatus.value = 'saved'
    const note =
      notes.value.find((n) => n.id === noteId) || findNoteInTree(tree.value, noteId)
    noteMtime.value = note?.mtime ?? null
    if (note) selectedFolderId.value = note.folderId
    const folderId = note?.folderId ?? selectedFolderId.value
    const recentNotes = settingsStore.buildRecentNotes({
      id: noteId,
      name: note?.name || noteId.split(/[/\\]/).pop() || noteId,
      folderId: folderId || '.'
    })
    scheduleSettingsPersist({
      lastNoteId: noteId,
      lastFolderId: folderId,
      recentNotes
    })
    // 托盘菜单读主进程 settings，最近列表需立刻落盘，不能只靠防抖
    void settingsStore.flushRecentNotes(recentNotes)
    // 恢复草稿移出关键路径
    void (async () => {
      try {
        const draft = await window.noteAPI.loadRecoveryDraft(noteId)
        if (selectedNoteId.value !== noteId) return
        if (draft && draft !== text) {
          await window.noteAPI.clearRecoveryDraft(noteId)
        }
      } catch {
        // ignore
      }
    })()
    return true
  }

  async function createFolder(name: string) {
    const parentId = selectedFolderId.value || '.'
    await window.noteAPI.createFolder(parentId, name)
    await refreshTree(true)
    selectedFolderId.value = parentId
    await loadNotes(parentId)
  }

  async function createNote(name: string) {
    if (isDirty.value && selectedNoteId.value) {
      try {
        await saveCurrent({ silent: true })
      } catch (e) {
        // 不静默吞掉：把错误抛给 UI，避免「点了新建却什么都没发生」
        throw e
      }
    }
    const folderId = selectedFolderId.value || '.'
    const note = await window.noteAPI.createNote(folderId, name)
    await refreshTree(true)
    await loadNotes(folderId)
    await selectNote(note.id, true)
  }

  /** 按正文第一行同步文件名；同名冲突时自动追加序号 */
  async function syncFileNameFromContent(noteId: string, markdown: string): Promise<string> {
    const desired = titleFromFirstLine(markdown)
    if (!desired) return noteId
    const current =
      notes.value.find((n) => n.id === noteId) || findNoteInTree(tree.value, noteId)
    if (!current || current.name === desired) return noteId

    let candidate = desired
    for (let i = 2; i <= 50; i++) {
      try {
        const note = await window.noteAPI.renameNote(noteId, candidate)
        if (selectedNoteId.value === noteId) selectedNoteId.value = note.id
        scheduleSettingsPersist({
          lastNoteId: note.id,
          lastFolderId: note.folderId
        })
        if (selectedFolderId.value) await loadNotes(selectedFolderId.value, { force: true })
        return note.id
      } catch (e) {
        const msg = ipcErrorMessage(e)
        const code = (e as { code?: string })?.code
        if (code === 'NAME_CONFLICT' || msg.includes('同名')) {
          candidate = `${desired} (${i})`
          continue
        }
        console.warn('[library] auto rename failed:', e)
        return noteId
      }
    }
    return noteId
  }

  async function saveCurrent(options: { silent?: boolean } = {}) {
    if (!selectedNoteId.value) return
    let noteId = selectedNoteId.value
    const payload = content.value
    const expected = noteMtime.value ?? undefined

    const run = async () => {
      saveStatus.value = 'saving'
      try {
        const result = await window.noteAPI.saveNote(noteId, payload, expected)
        // 仅当仍是同一笔记且内容未被更新覆盖时提交状态
        if (selectedNoteId.value === noteId && content.value === payload) {
          originalContent.value = payload
          noteMtime.value = result.mtime
          saveStatus.value = 'saved'
          await window.noteAPI.clearRecoveryDraft(noteId)
          noteId = await syncFileNameFromContent(noteId, payload)
        } else if (selectedNoteId.value === noteId) {
          noteMtime.value = result.mtime
          if (content.value === originalContent.value) saveStatus.value = 'saved'
        }
        if (selectedFolderId.value) {
          const folderId = selectedFolderId.value
          // 局部刷新当前夹列表，避免整树扫描
          const list = await window.noteAPI.listNotes(folderId, settingsStore.settings.sortMode)
          if (selectedFolderId.value === folderId) notes.value = list
          const folder = findFolder(tree.value, folderId)
          if (folder) folder.notes = list
        }
      } catch (e) {
        const err = e as { code?: string; message?: string }
        const code = err.code || (typeof err.message === 'string' && err.message.includes('CONFLICT') ? 'CONFLICT_EXTERNAL' : '')
        const isConflict =
          code === 'CONFLICT_EXTERNAL' || ipcErrorMessage(e).includes('外部修改')
        if (isConflict) {
          // 静默切换/自动保存：直接覆盖，避免打断写作
          if (options.silent) {
            const result = await window.noteAPI.saveNote(noteId, payload)
            if (selectedNoteId.value === noteId) {
              originalContent.value = payload
              noteMtime.value = result.mtime
              saveStatus.value = 'saved'
              await window.noteAPI.clearRecoveryDraft(noteId)
              await syncFileNameFromContent(noteId, payload)
            }
            return
          }
          const overwrite = window.confirm(`${ipcErrorMessage(e)}\n是否强制覆盖？`)
          if (overwrite) {
            const result = await window.noteAPI.saveNote(noteId, payload)
            if (selectedNoteId.value === noteId) {
              originalContent.value = payload
              noteMtime.value = result.mtime
              saveStatus.value = 'saved'
              await window.noteAPI.clearRecoveryDraft(noteId)
              await syncFileNameFromContent(noteId, payload)
            }
            return
          }
        }
        saveStatus.value = 'failed'
        const wrapped = new Error(ipcErrorMessage(e, '保存失败')) as Error & { code?: string }
        wrapped.code = code || 'SAVE_FAILED'
        throw wrapped
      }
    }

    const task = saveQueue.then(run, run)
    saveQueue = task.catch(() => undefined)
    return task
  }

  function markDirty(next: string) {
    content.value = next
    saveStatus.value = next === originalContent.value ? 'saved' : 'dirty'
    if (selectedNoteId.value && next !== originalContent.value) {
      const noteId = selectedNoteId.value
      if (recoveryTimer) clearTimeout(recoveryTimer)
      recoveryTimer = setTimeout(() => {
        recoveryTimer = null
        if (selectedNoteId.value === noteId && content.value !== originalContent.value) {
          void window.noteAPI.saveRecoveryDraft(noteId, content.value)
        }
      }, 1200)
    }
  }

  async function search(keyword: string) {
    searchKeyword.value = keyword
    if (!keyword.trim()) {
      searchResults.value = []
      return
    }
    searchResults.value = await window.noteAPI.searchNotes(keyword)
  }

  function remapIdAfterFolderRename(oldId: string, newId: string, id: string | null): string | null {
    if (!id) return id
    if (id === oldId) return newId
    const slash = `${oldId}/`
    const back = `${oldId}\\`
    if (id.startsWith(slash)) return `${newId}/${id.slice(slash.length)}`
    if (id.startsWith(back)) return `${newId}\\${id.slice(back.length)}`
    return id
  }

  async function renameFolder(folderId: string, name: string) {
    const next = await window.noteAPI.renameFolder(folderId, name)
    selectedFolderId.value = remapIdAfterFolderRename(folderId, next.id, selectedFolderId.value)
    selectedNoteId.value = remapIdAfterFolderRename(folderId, next.id, selectedNoteId.value)
    await refreshTree(true)
    if (selectedFolderId.value) await loadNotes(selectedFolderId.value)
    await settingsStore.update({
      lastFolderId: selectedFolderId.value,
      lastNoteId: selectedNoteId.value
    })
  }

  async function moveFolder(folderId: string, targetParentId: string) {
    if (isDirty.value && selectedNoteId.value) {
      await saveCurrent({ silent: true })
    }
    const next = await window.noteAPI.moveFolder(folderId, targetParentId)
    selectedFolderId.value = remapIdAfterFolderRename(folderId, next.id, selectedFolderId.value)
    selectedNoteId.value = remapIdAfterFolderRename(folderId, next.id, selectedNoteId.value)
    await refreshTree(true)
    if (selectedFolderId.value) await loadNotes(selectedFolderId.value)
    await settingsStore.update({
      lastFolderId: selectedFolderId.value,
      lastNoteId: selectedNoteId.value
    })
    return next
  }

  async function deleteFolder(folderId: string) {
    await window.noteAPI.deleteFolder(folderId)
    if (selectedFolderId.value === folderId) selectedFolderId.value = tree.value[0]?.id ?? null
    await refreshTree()
  }

  async function renameNote(noteId: string, name: string) {
    const note = await window.noteAPI.renameNote(noteId, name)
    if (selectedNoteId.value === noteId) {
      selectedNoteId.value = note.id
      selectedFolderId.value = note.folderId
    }
    await refreshTree(true)
    if (selectedFolderId.value) await loadNotes(selectedFolderId.value)
    await settingsStore.update({
      lastNoteId: selectedNoteId.value,
      lastFolderId: selectedFolderId.value
    })
  }

  async function moveNote(noteId: string, targetFolderId: string) {
    if (isDirty.value && selectedNoteId.value) {
      await saveCurrent({ silent: true })
    }
    const note = await window.noteAPI.moveNote(noteId, targetFolderId)
    if (selectedNoteId.value === noteId) {
      selectedNoteId.value = note.id
      selectedFolderId.value = note.folderId
    }
    await refreshTree(true)
    if (selectedFolderId.value) await loadNotes(selectedFolderId.value)
    await settingsStore.update({
      lastNoteId: selectedNoteId.value,
      lastFolderId: selectedFolderId.value
    })
    return note
  }

  async function deleteNote(noteId: string) {
    await window.noteAPI.deleteNote(noteId)
    if (selectedNoteId.value === noteId) {
      selectedNoteId.value = null
      content.value = ''
      originalContent.value = ''
      saveStatus.value = 'saved'
    }
    await refreshTree(true)
    if (selectedFolderId.value) await loadNotes(selectedFolderId.value)
  }

  async function copyNote(noteId: string) {
    if (isDirty.value && selectedNoteId.value) {
      try {
        await saveCurrent({ silent: true })
      } catch {
        return
      }
    }
    const note = await window.noteAPI.copyNote(noteId)
    await refreshTree(true)
    if (selectedFolderId.value) await loadNotes(selectedFolderId.value)
    await selectNote(note.id, true)
  }

  return {
    tree,
    notes,
    selectedFolderId,
    selectedNoteId,
    content,
    originalContent,
    noteMtime,
    saveStatus,
    viewMode,
    searchKeyword,
    searchResults,
    loading,
    error,
    jumpRequest,
    selectedFolder,
    selectedNote,
    isDirty,
    ensureRoot,
    refreshTree,
    loadNotes,
    selectFolder,
    selectNote,
    createFolder,
    createNote,
    saveCurrent,
    markDirty,
    search,
    renameFolder,
    moveFolder,
    deleteFolder,
    renameNote,
    moveNote,
    deleteNote,
    copyNote,
    requestJumpToHeading
  }
})
