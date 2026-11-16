<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { FolderNode, Note } from '@/types'
import { formatAbsoluteMtime, formatRelativeMtime } from '@/utils/relativeTime'

const DND_NOTE = 'application/x-dfx-note'
const DND_FOLDER = 'application/x-dfx-folder'

const props = defineProps<{
  node: FolderNode
  depth: number
  expanded: Record<string, boolean>
  selectedFolderId: string | null
  selectedNoteId: string | null
  renamingId: string | null
  dropTargetId: string | null
  draggingId: string | null
}>()

const emit = defineEmits<{
  toggle: [id: string]
  selectFolder: [node: FolderNode]
  selectNote: [note: Note]
  contextFolder: [node: FolderNode, e: MouseEvent]
  contextNote: [note: Note, e: MouseEvent]
  renameFolder: [node: FolderNode]
  renameNote: [note: Note]
  commitFolder: [node: FolderNode, name: string]
  commitNote: [note: Note, name: string]
  cancelRename: []
  dragStart: [payload: { kind: 'note'; note: Note } | { kind: 'folder'; node: FolderNode }]
  dragEnd: []
  dragOverFolder: [folderId: string, allowed: boolean]
  dropOnFolder: [folderId: string, dt: DataTransfer | null]
}>()

const draft = ref('')
const rootEl = ref<HTMLElement | null>(null)

const isOpen = () => props.expanded[props.node.id] ?? props.depth < 1
const hasChildren = () => props.node.children.length > 0 || props.node.notes.length > 0
const isRenamingFolder = () => props.renamingId === props.node.id
const isRenamingNote = (note: Note) => props.renamingId === note.id
const isDropTarget = () => props.dropTargetId === props.node.id
const isDraggingSelf = () => props.draggingId === props.node.id

async function focusRenameInput() {
  await nextTick()
  const input = rootEl.value?.querySelector<HTMLInputElement>('input.rename-input')
  if (!input) return
  input.focus()
  input.select()
}

watch(
  () => props.renamingId,
  async (id) => {
    if (id === props.node.id) {
      draft.value = props.node.name
      await focusRenameInput()
      return
    }
    const note = props.node.notes.find((n) => n.id === id)
    if (note) {
      draft.value = note.name
      await focusRenameInput()
    }
  }
)

function onFolderDblClick(e: MouseEvent) {
  e.stopPropagation()
  if (props.node.isRoot) return
  emit('renameFolder', props.node)
}

function onNoteDblClick(note: Note, e: MouseEvent) {
  e.stopPropagation()
  emit('renameNote', note)
}

function submitFolder() {
  emit('commitFolder', props.node, draft.value)
}

function submitNote(note: Note) {
  emit('commitNote', note, draft.value)
}

function onFolderDragStart(e: DragEvent) {
  if (props.node.isRoot || isRenamingFolder()) {
    e.preventDefault()
    return
  }
  const dt = e.dataTransfer
  if (!dt) return
  dt.effectAllowed = 'move'
  const payload = JSON.stringify({ folderId: props.node.id })
  dt.setData(DND_FOLDER, payload)
  dt.setData('text/plain', payload)
  emit('dragStart', { kind: 'folder', node: props.node })
}

function onNoteDragStart(note: Note, e: DragEvent) {
  if (isRenamingNote(note)) {
    e.preventDefault()
    return
  }
  const dt = e.dataTransfer
  if (!dt) return
  dt.effectAllowed = 'move'
  const payload = JSON.stringify({ noteId: note.id, folderId: note.folderId })
  dt.setData(DND_NOTE, payload)
  dt.setData('text/plain', payload)
  emit('dragStart', { kind: 'note', note })
}

function isFolderDragPayload(): boolean {
  const id = props.draggingId
  if (!id) return false
  return !id.toLowerCase().endsWith('.md')
}

function onFolderDragOver(e: DragEvent) {
  // 禁止拖入自身或子孙目录
  if (
    props.draggingId &&
    isFolderDragPayload() &&
    (props.draggingId === props.node.id || props.node.id.startsWith(`${props.draggingId}/`))
  ) {
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'none'
    emit('dragOverFolder', props.node.id, false)
    return
  }
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  emit('dragOverFolder', props.node.id, true)
}

function onFolderDrop(e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()
  emit('dropOnFolder', props.node.id, e.dataTransfer)
}
</script>

<template>
  <div ref="rootEl" class="tree-node">
    <div
      class="tree-row folder"
      :class="{
        active: selectedFolderId === node.id && !selectedNoteId,
        current: selectedFolderId === node.id,
        'drop-over': isDropTarget(),
        dragging: isDraggingSelf()
      }"
      :style="{ paddingLeft: `${10 + depth * 14}px` }"
      :draggable="!node.isRoot && !isRenamingFolder()"
      @click="emit('selectFolder', node)"
      @dblclick="onFolderDblClick"
      @contextmenu="emit('contextFolder', node, $event)"
      @dragstart="onFolderDragStart"
      @dragend="emit('dragEnd')"
      @dragover="onFolderDragOver"
      @drop="onFolderDrop"
    >
      <span class="twist" @click.stop="emit('toggle', node.id)">
        {{ hasChildren() ? (isOpen() ? '▾' : '▸') : '·' }}
      </span>
      <span class="icon folder-icon" :class="{ root: node.isRoot }" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <!-- 根目录：双层文件夹 -->
          <template v-if="node.isRoot">
            <path d="M5 8.2h14.2v1.4H5z" opacity="0.45" />
            <path
              d="M3.8 9.2A2 2 0 0 1 5.8 7.2h4l1.3 1.5h7.3A2 2 0 0 1 20.4 10.7v6.6a2 2 0 0 1-2 2H5.8a2 2 0 0 1-2-2V9.2z"
            />
          </template>
          <!-- 普通文件夹 -->
          <path
            v-else
            d="M3.5 7.2A2.2 2.2 0 0 1 5.7 5h4.1l1.5 1.8h7A2.2 2.2 0 0 1 20.5 9v8.3a2.2 2.2 0 0 1-2.2 2.2H5.7A2.2 2.2 0 0 1 3.5 17.3V7.2z"
          />
        </svg>
      </span>
      <input
        v-if="isRenamingFolder()"
        v-model="draft"
        class="rename-input"
        @click.stop
        @keydown.enter.prevent="submitFolder"
        @keydown.esc.prevent="emit('cancelRename')"
        @blur="submitFolder"
      />
      <span v-else class="label" :title="`${node.path}（拖动可移动 · 双击重命名）`">{{
        node.name
      }}</span>
      <span v-if="node.notes.length && !isRenamingFolder()" class="count">{{ node.notes.length }}</span>
    </div>

    <template v-if="isOpen()">
      <div
        v-for="note in node.notes"
        :key="note.id"
        class="tree-row note"
        :class="{ active: selectedNoteId === note.id, dragging: draggingId === note.id }"
        :style="{ paddingLeft: `${10 + (depth + 1) * 14}px` }"
        :draggable="!isRenamingNote(note)"
        @click.stop="emit('selectNote', note)"
        @dblclick="onNoteDblClick(note, $event)"
        @contextmenu.stop="emit('contextNote', note, $event)"
        @dragstart="onNoteDragStart(note, $event)"
        @dragend="emit('dragEnd')"
      >
        <span class="twist">·</span>
        <span class="icon note-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path
              d="M6.5 3.8h7.6L18.2 7.9v12.3a1.7 1.7 0 0 1-1.7 1.7H6.5a1.7 1.7 0 0 1-1.7-1.7V5.5a1.7 1.7 0 0 1 1.7-1.7z"
            />
            <path
              d="M14 3.9v3.8h3.8M8.4 12h7.2M8.4 15.2h5.2"
              fill="none"
              stroke="var(--panel-bg, #fff)"
              stroke-width="1.55"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </span>
        <input
          v-if="isRenamingNote(note)"
          v-model="draft"
          class="rename-input"
          @click.stop
          @keydown.enter.prevent="submitNote(note)"
          @keydown.esc.prevent="emit('cancelRename')"
          @blur="submitNote(note)"
        />
        <span v-else class="label" :title="`${note.path}（拖动可移动 · 双击重命名）`">{{
          note.name
        }}</span>
        <span
          v-if="!isRenamingNote(note) && note.mtime"
          class="mtime"
          :title="formatAbsoluteMtime(note.mtime)"
        >{{ formatRelativeMtime(note.mtime) }}</span>
      </div>

      <FolderTreeNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        :expanded="expanded"
        :selected-folder-id="selectedFolderId"
        :selected-note-id="selectedNoteId"
        :renaming-id="renamingId"
        :drop-target-id="dropTargetId"
        :dragging-id="draggingId"
        @toggle="emit('toggle', $event)"
        @select-folder="emit('selectFolder', $event)"
        @select-note="emit('selectNote', $event)"
        @context-folder="(n, e) => emit('contextFolder', n, e)"
        @context-note="(n, e) => emit('contextNote', n, e)"
        @rename-folder="emit('renameFolder', $event)"
        @rename-note="emit('renameNote', $event)"
        @commit-folder="(n, name) => emit('commitFolder', n, name)"
        @commit-note="(n, name) => emit('commitNote', n, name)"
        @cancel-rename="emit('cancelRename')"
        @drag-start="emit('dragStart', $event)"
        @drag-end="emit('dragEnd')"
        @drag-over-folder="(id, allowed) => emit('dragOverFolder', id, allowed)"
        @drop-on-folder="(id, dt) => emit('dropOnFolder', id, dt)"
      />
    </template>
  </div>
</template>

<style scoped>
.tree-row {
  display: flex;
  align-items: center;
  gap: 3px;
  height: 30px;
  cursor: pointer;
  border-radius: 4px;
  margin: 0 6px;
  padding-right: 8px;
}

.tree-row:hover {
  background: var(--hover-bg);
}

.tree-row.active {
  background: var(--tree-active);
  color: var(--accent-color);
}

.tree-row.folder.current:not(.active) {
  color: var(--accent-color);
}

.tree-row.folder.drop-over {
  background: color-mix(in srgb, var(--accent-color) 18%, transparent);
  outline: 1px dashed var(--accent-color);
  outline-offset: -1px;
}

.tree-row.dragging {
  opacity: 0.45;
}

.tree-row.note {
  font-size: 12.5px;
}

.twist {
  width: 14px;
  text-align: center;
  color: var(--text-muted);
  flex-shrink: 0;
}

.icon {
  font-size: 12px;
  flex-shrink: 0;
}

.folder-icon,
.note-icon {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-color);
}

.folder-icon svg,
.note-icon svg {
  width: 15px;
  height: 15px;
  display: block;
  fill: currentColor;
}

.tree-row.folder:hover .folder-icon,
.tree-row.folder.active .folder-icon,
.tree-row.folder.current .folder-icon,
.tree-row.note:hover .note-icon,
.tree-row.note.active .note-icon {
  color: var(--accent-hover);
}

.label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.mtime {
  flex-shrink: 0;
  margin-left: 6px;
  font-size: 10px;
  color: var(--text-muted);
  white-space: nowrap;
  letter-spacing: 0;
}

.tree-row.note.active .mtime {
  color: color-mix(in srgb, var(--accent-color) 70%, var(--text-muted));
}

.rename-input {
  flex: 1;
  min-width: 0;
  height: 22px;
  border: 1px solid var(--accent-color);
  border-radius: 4px;
  padding: 0 6px;
  background: var(--panel-bg);
  color: var(--text-primary);
  font-size: 12px;
  outline: none;
}

.count {
  font-size: 10px;
  color: var(--text-muted);
  background: var(--hover-bg);
  border-radius: 8px;
  padding: 0 6px;
  line-height: 16px;
  flex-shrink: 0;
}

.tree-row.active .count {
  background: transparent;
  color: var(--accent-color);
}
</style>
