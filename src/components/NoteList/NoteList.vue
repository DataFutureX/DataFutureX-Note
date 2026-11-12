<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { useLibraryStore } from '@/stores/library'

const library = useLibraryStore()

function formatTime(ms: number) {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

async function openNote(id: string) {
  await library.selectNote(id)
}

async function onContext(noteId: string, name: string, e: MouseEvent) {
  e.preventDefault()
  try {
    const { value } = await ElMessageBox.prompt(
      '输入新名称，或输入 DELETE 删除，COPY 复制',
      `笔记：${name}`,
      { inputValue: name, confirmButtonText: '确定', cancelButtonText: '取消' }
    )
    const v = value.trim()
    if (v.toUpperCase() === 'DELETE') {
      await ElMessageBox.confirm(`将笔记「${name}」移入回收站？`, '移入回收站', { type: 'warning' })
      await library.deleteNote(noteId)
      ElMessage.success('已移入回收站')
      return
    }
    if (v.toUpperCase() === 'COPY') {
      await library.copyNote(noteId)
      ElMessage.success('已复制')
      return
    }
    if (v && v !== name) {
      await library.renameNote(noteId, v)
      ElMessage.success('已重命名')
    }
  } catch {
    // cancelled
  }
}
</script>

<template>
  <div class="note-list">
    <div v-if="!library.notes.length" class="empty-state" style="height: 200px">
      <div>当前文件夹暂无笔记</div>
    </div>
    <div
      v-for="note in library.notes"
      :key="note.id"
      class="note-item"
      :class="{ active: library.selectedNoteId === note.id }"
      @click="openNote(note.id)"
      @contextmenu="onContext(note.id, note.name, $event)"
    >
      <div class="title">{{ note.name }}</div>
      <div class="meta">{{ formatTime(note.mtime) }}</div>
    </div>
  </div>
</template>

<style scoped>
.note-list {
  padding: 6px;
}

.note-item {
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 4px;
}

.note-item:hover {
  background: var(--hover-bg);
}

.note-item.active {
  background: var(--tree-active);
}

.title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta {
  font-size: 11px;
  color: var(--text-muted);
}
</style>
