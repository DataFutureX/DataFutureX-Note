<script setup lang="ts">
import type { TrashContentNode } from '@/types'

defineProps<{
  trashId: string
  nodes: TrashContentNode[]
  depth: number
  isOpen: (trashId: string, path: string) => boolean
  childrenOf: (trashId: string, path: string) => TrashContentNode[]
  loadingOf: (trashId: string, path: string) => boolean
}>()

const emit = defineEmits<{
  toggle: [trashId: string, node: TrashContentNode]
}>()
</script>

<template>
  <ul class="content-tree">
    <li v-for="node in nodes" :key="node.relativePath" class="content-node">
      <div
        class="content-row"
        :class="node.type"
        :style="{ paddingLeft: `${10 + depth * 14}px` }"
        @click="node.type === 'folder' && emit('toggle', trashId, node)"
      >
        <span class="twist">
          {{ node.type === 'folder' ? (isOpen(trashId, node.relativePath) ? '▾' : '▸') : '·' }}
        </span>
        <span class="icon">{{ node.type === 'folder' ? '📁' : '📝' }}</span>
        <span class="label">{{ node.name }}</span>
      </div>
      <template v-if="node.type === 'folder' && isOpen(trashId, node.relativePath)">
        <div v-if="loadingOf(trashId, node.relativePath)" class="content-hint nested">加载中…</div>
        <TrashContentTree
          v-else-if="childrenOf(trashId, node.relativePath).length"
          :trash-id="trashId"
          :nodes="childrenOf(trashId, node.relativePath)"
          :depth="depth + 1"
          :is-open="isOpen"
          :children-of="childrenOf"
          :loading-of="loadingOf"
          @toggle="(id, n) => emit('toggle', id, n)"
        />
        <div v-else class="content-hint nested">空文件夹</div>
      </template>
    </li>
  </ul>
</template>

<style scoped>
.content-tree {
  list-style: none;
  margin: 0;
  padding: 0;
}

.content-node {
  list-style: none;
}

.content-row {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  margin: 0 6px;
  padding-right: 8px;
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-primary);
}

.content-row.folder {
  cursor: pointer;
}

.content-row.folder:hover {
  background: var(--hover-bg);
}

.twist {
  width: 14px;
  color: var(--text-muted);
  text-align: center;
  flex-shrink: 0;
}

.icon {
  flex-shrink: 0;
  font-size: 12px;
}

.label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.content-hint.nested {
  padding: 6px 12px 6px 28px;
  font-size: 12px;
  color: var(--text-muted);
}
</style>
