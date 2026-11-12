<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { TrashContentNode, TrashItem } from '@/types'
import { useLibraryStore } from '@/stores/library'
import { ipcErrorMessage } from '@/utils/ipcError'
import TrashContentTree from './TrashContentTree.vue'

const visible = defineModel<boolean>('visible', { default: false })
const library = useLibraryStore()
const items = ref<TrashItem[]>([])
const loading = ref(false)

const expanded = reactive<Record<string, boolean>>({})
const contentCache = reactive<Record<string, TrashContentNode[]>>({})
const contentLoading = reactive<Record<string, boolean>>({})
const openPaths = reactive<Record<string, Record<string, boolean>>>({})

async function refresh() {
  loading.value = true
  try {
    items.value = await window.noteAPI.listTrash()
    for (const key of Object.keys(contentCache)) delete contentCache[key]
    for (const key of Object.keys(expanded)) delete expanded[key]
    for (const key of Object.keys(openPaths)) delete openPaths[key]
    for (const key of Object.keys(contentLoading)) delete contentLoading[key]
  } catch (e) {
    ElMessage.error(ipcErrorMessage(e, '加载回收站失败'))
  } finally {
    loading.value = false
  }
}

watch(visible, (v) => {
  if (v) void refresh()
})

function formatTime(ts: number) {
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return String(ts)
  }
}

function cacheKey(trashId: string, relativePath = '') {
  return `${trashId}::${relativePath}`
}

async function loadContents(trashId: string, relativePath = '') {
  const key = cacheKey(trashId, relativePath)
  if (contentCache[key] || contentLoading[key]) return
  contentLoading[key] = true
  try {
    contentCache[key] = await window.noteAPI.listTrashContents(trashId, relativePath)
  } catch (e) {
    ElMessage.error(ipcErrorMessage(e, '加载文件夹内容失败'))
    contentCache[key] = []
  } finally {
    contentLoading[key] = false
  }
}

async function toggleFolderItem(item: TrashItem) {
  if (item.type !== 'folder') return
  const next = !expanded[item.id]
  expanded[item.id] = next
  if (next) {
    if (!openPaths[item.id]) openPaths[item.id] = {}
    await loadContents(item.id, '')
  }
}

async function toggleInnerFolder(trashId: string, node: TrashContentNode) {
  if (node.type !== 'folder') return
  if (!openPaths[trashId]) openPaths[trashId] = {}
  const next = !openPaths[trashId][node.relativePath]
  openPaths[trashId][node.relativePath] = next
  if (next) await loadContents(trashId, node.relativePath)
}

function childrenOf(trashId: string, relativePath = '') {
  return contentCache[cacheKey(trashId, relativePath)] || []
}

function isInnerOpen(trashId: string, relativePath: string) {
  return !!openPaths[trashId]?.[relativePath]
}

function isLoading(trashId: string, relativePath: string) {
  return !!contentLoading[cacheKey(trashId, relativePath)]
}

const folderCount = computed(() => items.value.filter((i) => i.type === 'folder').length)

async function restore(item: TrashItem) {
  try {
    const result = await window.noteAPI.restoreTrash(item.id)
    ElMessage.success(`已恢复：${result.restoredPath}`)
    await library.refreshTree(true)
    await refresh()
  } catch (e) {
    ElMessage.error(ipcErrorMessage(e, '恢复失败'))
  }
}

async function purge(item: TrashItem) {
  try {
    await ElMessageBox.confirm(
      `彻底删除「${item.name}」后不可恢复，确认继续？`,
      '彻底删除',
      { type: 'warning', confirmButtonText: '彻底删除', cancelButtonText: '取消' }
    )
    await window.noteAPI.purgeTrash(item.id)
    ElMessage.success('已彻底删除')
    await refresh()
  } catch (e) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(ipcErrorMessage(e, '删除失败'))
  }
}

async function emptyAll() {
  if (!items.value.length) return
  try {
    await ElMessageBox.confirm(
      `清空回收站将彻底删除 ${items.value.length} 项，不可恢复。确认继续？`,
      '清空回收站',
      { type: 'warning', confirmButtonText: '清空', cancelButtonText: '取消' }
    )
    const n = await window.noteAPI.emptyTrash()
    ElMessage.success(`已清空 ${n} 项`)
    await refresh()
  } catch (e) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(ipcErrorMessage(e, '清空失败'))
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    title="回收站"
    width="680px"
    destroy-on-close
    append-to-body
  >
    <div class="trash-toolbar">
      <span class="hint">
        {{
          loading
            ? '加载中…'
            : `共 ${items.length} 项${folderCount ? `（含 ${folderCount} 个文件夹）` : ''}`
        }}
      </span>
      <button class="btn" type="button" :disabled="!items.length" @click="emptyAll">清空回收站</button>
    </div>
    <div v-if="!loading && !items.length" class="empty">回收站为空</div>
    <div v-else class="trash-list">
      <div v-for="item in items" :key="item.id" class="trash-block">
        <div class="trash-row">
          <div class="main">
            <div class="name">
              <button
                v-if="item.type === 'folder'"
                type="button"
                class="twist"
                :title="expanded[item.id] ? '收起内容' : '查看内容'"
                @click="toggleFolderItem(item)"
              >
                {{ expanded[item.id] ? '▾' : '▸' }}
              </button>
              <span v-else class="twist placeholder">·</span>
              <span class="badge">{{ item.type === 'folder' ? '文件夹' : '笔记' }}</span>
              <button
                v-if="item.type === 'folder'"
                type="button"
                class="name-btn"
                @click="toggleFolderItem(item)"
              >
                {{ item.name }}
              </button>
              <span v-else>{{ item.name }}</span>
            </div>
            <div class="meta">原路径：{{ item.originalPath }}</div>
            <div class="meta">删除于：{{ formatTime(item.deletedAt) }}</div>
          </div>
          <div class="actions">
            <button class="btn" type="button" @click="restore(item)">恢复</button>
            <button class="btn danger" type="button" @click="purge(item)">彻底删除</button>
          </div>
        </div>

        <div v-if="item.type === 'folder' && expanded[item.id]" class="content-panel">
          <div v-if="isLoading(item.id, '')" class="content-hint">加载内容…</div>
          <div v-else-if="!childrenOf(item.id, '').length" class="content-hint">文件夹为空</div>
          <TrashContentTree
            v-else
            :trash-id="item.id"
            :nodes="childrenOf(item.id, '')"
            :depth="0"
            :is-open="isInnerOpen"
            :children-of="childrenOf"
            :loading-of="isLoading"
            @toggle="toggleInnerFolder"
          />
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.trash-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.hint {
  font-size: 12px;
  color: var(--text-secondary);
}

.empty {
  padding: 40px 12px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

.trash-list {
  max-height: 460px;
  overflow: auto;
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.trash-block {
  border-bottom: 1px solid var(--border-color);
}

.trash-block:last-child {
  border-bottom: none;
}

.trash-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
  padding: 12px;
}

.name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.name-btn {
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 600;
  padding: 0;
  cursor: pointer;
}

.name-btn:hover {
  color: var(--accent-color);
}

.twist {
  width: 16px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
  font-size: 12px;
  line-height: 1;
}

.twist.placeholder {
  cursor: default;
}

.badge {
  font-size: 10px;
  font-weight: 500;
  color: var(--accent-color);
  background: var(--selection-bg);
  border-radius: 4px;
  padding: 1px 6px;
  flex-shrink: 0;
}

.meta {
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-muted);
  word-break: break-all;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

.actions .btn {
  min-width: 84px;
  justify-content: center;
}

.content-panel {
  margin: 0 12px 12px;
  padding: 4px 0;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--app-bg);
}

.content-hint {
  padding: 10px 12px;
  font-size: 12px;
  color: var(--text-muted);
}
</style>
