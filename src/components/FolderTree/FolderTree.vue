<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FolderNode, Note } from '@/types'
import { useLibraryStore } from '@/stores/library'
import { ipcErrorMessage } from '@/utils/ipcError'
import FolderTreeNode from './FolderTreeNode.vue'

defineProps<{ nodes: FolderNode[] }>()

const library = useLibraryStore()
const expanded = reactive<Record<string, boolean>>({ '.': true })

type CtxMenu =
  | { kind: 'folder'; node: FolderNode; x: number; y: number }
  | { kind: 'note'; note: Note; x: number; y: number }

type DragPayload =
  | { kind: 'note'; noteId: string; folderId: string }
  | { kind: 'folder'; folderId: string }

const ctxMenu = ref<CtxMenu | null>(null)
const renamingId = ref<string | null>(null)
const draggingId = ref<string | null>(null)
const dropTargetId = ref<string | null>(null)
const dragPayload = ref<DragPayload | null>(null)

const DND_NOTE = 'application/x-dfx-note'
const DND_FOLDER = 'application/x-dfx-folder'

function toggle(id: string) {
  expanded[id] = !(expanded[id] ?? true)
}

async function selectFolder(node: FolderNode) {
  closeCtx()
  if (renamingId.value === node.id) return
  expanded[node.id] = true
  await library.selectFolder(node.id)
}

async function selectNote(note: Note) {
  closeCtx()
  if (renamingId.value === note.id) return
  expanded[note.folderId] = true
  await library.loadNotes(note.folderId)
  await library.selectNote(note.id)
}

function closeCtx() {
  ctxMenu.value = null
}

function onContextFolder(node: FolderNode, e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  ctxMenu.value = { kind: 'folder', node, x: e.clientX, y: e.clientY }
}

async function revealInExplorer(entryId: string) {
  closeCtx()
  try {
    await window.noteAPI.revealInLibrary(entryId)
  } catch (e) {
    ElMessage.error(ipcErrorMessage(e, '无法在文件浏览器中打开'))
  }
}

function onContextNote(note: Note, e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  ctxMenu.value = { kind: 'note', note, x: e.clientX, y: e.clientY }
}

function startRenameFolder(node: FolderNode) {
  closeCtx()
  if (node.isRoot) {
    ElMessage.warning('根目录不可重命名')
    return
  }
  renamingId.value = node.id
}

function startRenameNote(note: Note) {
  closeCtx()
  renamingId.value = note.id
}

async function commitRenameFolder(node: FolderNode, name: string) {
  if (renamingId.value !== node.id) return
  renamingId.value = null
  const next = name.trim()
  if (!next || next === node.name) return
  try {
    await library.renameFolder(node.id, next)
    ElMessage.success('文件夹已重命名')
  } catch (e) {
    ElMessage.error(ipcErrorMessage(e, '重命名失败'))
  }
}

async function commitRenameNote(note: Note, name: string) {
  if (renamingId.value !== note.id) return
  renamingId.value = null
  const next = name.trim()
  if (!next || next === note.name) return
  try {
    await library.renameNote(note.id, next)
    ElMessage.success('笔记已重命名')
  } catch (e) {
    ElMessage.error(ipcErrorMessage(e, '重命名失败'))
  }
}

function cancelRename() {
  renamingId.value = null
}

async function renameFolderDialog(node: FolderNode) {
  closeCtx()
  if (node.isRoot) {
    ElMessage.warning('根目录不可重命名')
    return
  }
  try {
    const { value } = await ElMessageBox.prompt('请输入新的文件夹名称', '重命名文件夹', {
      inputValue: node.name,
      confirmButtonText: '确定',
      cancelButtonText: '取消'
    })
    const next = value.trim()
    if (!next || next === node.name) return
    await library.renameFolder(node.id, next)
    ElMessage.success('文件夹已重命名')
  } catch (e) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(ipcErrorMessage(e, '重命名失败'))
  }
}

async function renameNoteDialog(note: Note) {
  closeCtx()
  try {
    const { value } = await ElMessageBox.prompt('请输入新的笔记名称', '重命名笔记', {
      inputValue: note.name,
      confirmButtonText: '确定',
      cancelButtonText: '取消'
    })
    const next = value.trim()
    if (!next || next === note.name) return
    await library.renameNote(note.id, next)
    ElMessage.success('笔记已重命名')
  } catch (e) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(ipcErrorMessage(e, '重命名失败'))
  }
}

async function deleteFolder(node: FolderNode) {
  closeCtx()
  try {
    await ElMessageBox.confirm(
      `将文件夹「${node.name}」及其全部内容移入回收站？`,
      '移入回收站',
      { type: 'warning', confirmButtonText: '移入回收站', cancelButtonText: '取消' }
    )
    await library.deleteFolder(node.id)
    ElMessage.success('已移入回收站')
  } catch (e) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(ipcErrorMessage(e, '删除失败'))
  }
}

async function deleteNote(note: Note) {
  closeCtx()
  try {
    await ElMessageBox.confirm(`将笔记「${note.name}」移入回收站？`, '移入回收站', {
      type: 'warning',
      confirmButtonText: '移入回收站',
      cancelButtonText: '取消'
    })
    await library.deleteNote(note.id)
    ElMessage.success('已移入回收站')
  } catch (e) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(ipcErrorMessage(e, '删除失败'))
  }
}

async function copyNote(note: Note) {
  closeCtx()
  try {
    await library.copyNote(note.id)
    ElMessage.success('已复制')
  } catch (e) {
    ElMessage.error(ipcErrorMessage(e, '复制失败'))
  }
}

async function createNoteInFolder(node: FolderNode) {
  closeCtx()
  const parentLabel = node.isRoot ? node.name || '根目录' : node.name
  try {
    expanded[node.id] = true
    await library.selectFolder(node.id)
    const { value } = await ElMessageBox.prompt(
      `将在「${parentLabel}」下创建笔记`,
      '新建笔记',
      {
        inputValue: '未命名笔记',
        confirmButtonText: '创建',
        cancelButtonText: '取消'
      }
    )
    if (!value?.trim()) return
    await library.createNote(value.trim())
    ElMessage.success('笔记已创建')
  } catch (e) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(ipcErrorMessage(e, '创建笔记失败'))
  }
}

async function createFolderInFolder(node: FolderNode) {
  closeCtx()
  const parentLabel = node.isRoot ? node.name || '根目录' : node.name
  try {
    expanded[node.id] = true
    await library.selectFolder(node.id)
    const { value } = await ElMessageBox.prompt(
      `将在「${parentLabel}」下创建子文件夹`,
      '新建文件夹',
      {
        inputValue: '新建文件夹',
        confirmButtonText: '创建',
        cancelButtonText: '取消'
      }
    )
    if (!value?.trim()) return
    await library.createFolder(value.trim())
    ElMessage.success(`已在「${parentLabel}」下创建`)
  } catch (e) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(ipcErrorMessage(e, '创建文件夹失败'))
  }
}

function onDocClick() {
  closeCtx()
}

function onDragStart(payload: { kind: 'note'; note: Note } | { kind: 'folder'; node: FolderNode }) {
  closeCtx()
  if (payload.kind === 'note') {
    draggingId.value = payload.note.id
    dragPayload.value = {
      kind: 'note',
      noteId: payload.note.id,
      folderId: payload.note.folderId
    }
  } else {
    draggingId.value = payload.node.id
    dragPayload.value = { kind: 'folder', folderId: payload.node.id }
  }
}

function onDragEnd() {
  draggingId.value = null
  dropTargetId.value = null
  dragPayload.value = null
}

function onDragOverFolder(folderId: string, allowed: boolean) {
  dropTargetId.value = allowed ? folderId : null
  if (allowed) expanded[folderId] = true
}

function parseDropData(dt: DataTransfer | null): DragPayload | null {
  if (!dt) return null
  try {
    const noteRaw = dt.getData(DND_NOTE)
    if (noteRaw) {
      const parsed = JSON.parse(noteRaw) as { noteId?: string; folderId?: string }
      if (parsed.noteId) {
        return { kind: 'note', noteId: parsed.noteId, folderId: parsed.folderId || '.' }
      }
    }
    const folderRaw = dt.getData(DND_FOLDER)
    if (folderRaw) {
      const parsed = JSON.parse(folderRaw) as { folderId?: string }
      if (parsed.folderId) return { kind: 'folder', folderId: parsed.folderId }
    }
    const plain = dt.getData('text/plain')
    if (plain) {
      const parsed = JSON.parse(plain) as { noteId?: string; folderId?: string }
      if (parsed.noteId) {
        return { kind: 'note', noteId: parsed.noteId, folderId: parsed.folderId || '.' }
      }
      if (parsed.folderId && !parsed.noteId) {
        return { kind: 'folder', folderId: parsed.folderId }
      }
    }
  } catch {
    // ignore
  }
  return dragPayload.value
}

async function onDropOnFolder(targetFolderId: string, dt: DataTransfer | null) {
  const payload = parseDropData(dt) || dragPayload.value
  dropTargetId.value = null
  draggingId.value = null
  dragPayload.value = null
  if (!payload) return

  try {
    if (payload.kind === 'note') {
      if (payload.folderId === targetFolderId) return
      await library.moveNote(payload.noteId, targetFolderId)
      expanded[targetFolderId] = true
      ElMessage.success('笔记已移动')
      return
    }
    if (payload.folderId === targetFolderId) return
    if (targetFolderId === payload.folderId || targetFolderId.startsWith(`${payload.folderId}/`)) {
      ElMessage.warning('不能移动到自身或其子目录')
      return
    }
    const parentOf = payload.folderId.includes('/')
      ? payload.folderId.slice(0, payload.folderId.lastIndexOf('/'))
      : '.'
    if (parentOf === targetFolderId) return
    await library.moveFolder(payload.folderId, targetFolderId)
    expanded[targetFolderId] = true
    ElMessage.success('文件夹已移动')
  } catch (e) {
    ElMessage.error(ipcErrorMessage(e, '移动失败'))
  }
}

onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div class="tree">
    <FolderTreeNode
      v-for="node in nodes"
      :key="node.id"
      :node="node"
      :depth="0"
      :expanded="expanded"
      :selected-folder-id="library.selectedFolderId"
      :selected-note-id="library.selectedNoteId"
      :renaming-id="renamingId"
      :drop-target-id="dropTargetId"
      :dragging-id="draggingId"
      @toggle="toggle"
      @select-folder="selectFolder"
      @select-note="selectNote"
      @context-folder="onContextFolder"
      @context-note="onContextNote"
      @rename-folder="startRenameFolder"
      @rename-note="startRenameNote"
      @commit-folder="commitRenameFolder"
      @commit-note="commitRenameNote"
      @cancel-rename="cancelRename"
      @drag-start="onDragStart"
      @drag-end="onDragEnd"
      @drag-over-folder="onDragOverFolder"
      @drop-on-folder="onDropOnFolder"
    />

    <div
      v-if="ctxMenu"
      class="ctx-menu"
      :style="{ left: `${ctxMenu.x}px`, top: `${ctxMenu.y}px` }"
      @click.stop
    >
      <template v-if="ctxMenu.kind === 'folder'">
        <button type="button" class="ctx-item" @click="createNoteInFolder(ctxMenu.node)">
          新建笔记
        </button>
        <button type="button" class="ctx-item" @click="createFolderInFolder(ctxMenu.node)">
          新建文件夹
        </button>
        <button type="button" class="ctx-item" @click="revealInExplorer(ctxMenu.node.id)">
          在文件浏览器中打开
        </button>
        <button
          v-if="!ctxMenu.node.isRoot"
          type="button"
          class="ctx-item"
          @click="renameFolderDialog(ctxMenu.node)"
        >
          重命名
        </button>
        <button
          v-if="!ctxMenu.node.isRoot"
          type="button"
          class="ctx-item danger"
          @click="deleteFolder(ctxMenu.node)"
        >
          删除
        </button>
      </template>
      <template v-else>
        <button type="button" class="ctx-item" @click="revealInExplorer(ctxMenu.note.id)">
          在文件浏览器中打开
        </button>
        <button type="button" class="ctx-item" @click="renameNoteDialog(ctxMenu.note)">重命名</button>
        <button type="button" class="ctx-item" @click="copyNote(ctxMenu.note)">复制</button>
        <button type="button" class="ctx-item danger" @click="deleteNote(ctxMenu.note)">删除</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.tree {
  position: relative;
  padding: 6px 0 16px;
  font-size: 13px;
}

.ctx-menu {
  position: fixed;
  z-index: 1000;
  min-width: 120px;
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.14);
  padding: 4px;
}

.ctx-item {
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

.ctx-item:hover {
  background: var(--selection-bg);
  color: var(--accent-color);
}

.ctx-item.danger:hover {
  background: color-mix(in srgb, var(--danger-color) 16%, transparent);
  color: var(--danger-color);
}
</style>
