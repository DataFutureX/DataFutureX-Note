<script setup lang="ts">
import type { ChapterNode } from '@/utils/markdownOutline'

defineProps<{
  node: ChapterNode
  openMap: Record<string, boolean>
}>()

const emit = defineEmits<{
  toggle: [id: string]
  jump: [line: number, text: string]
}>()
</script>

<template>
  <li class="tree-item" role="treeitem" :aria-expanded="node.children.length ? !openMap[node.id] : undefined">
    <div class="row" :class="`lv-${node.level}`" @click="emit('jump', node.line, node.text)">
      <button
        v-if="node.children.length"
        type="button"
        class="twist"
        :title="openMap[node.id] ? '展开' : '折叠'"
        @click.stop="emit('toggle', node.id)"
      >
        {{ openMap[node.id] ? '▸' : '▾' }}
      </button>
      <span v-else class="twist spacer" />
      <span class="level">H{{ node.level }}</span>
      <span class="text">{{ node.text }}</span>
    </div>
    <ul v-if="node.children.length && !openMap[node.id]" class="tree" role="group">
      <ChapterTreeNode
        v-for="child in node.children"
        :key="child.id + '-' + child.line"
        :node="child"
        :open-map="openMap"
        @toggle="(id) => emit('toggle', id)"
        @jump="(line, text) => emit('jump', line, text)"
      />
    </ul>
  </li>
</template>

<style scoped>
.tree-item {
  margin: 0;
}

.tree {
  list-style: none;
  margin: 0;
  padding: 0;
}

.row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-primary);
  font-size: 13px;
}

.row:hover {
  background: var(--hover-bg);
}

.row.lv-1 {
  font-weight: 600;
}
.row.lv-2 {
  padding-left: 14px;
}
.row.lv-3 {
  padding-left: 22px;
  font-size: 12.5px;
}
.row.lv-4,
.row.lv-5,
.row.lv-6 {
  padding-left: 30px;
  font-size: 12px;
  color: var(--text-secondary);
}

.twist {
  width: 16px;
  height: 16px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  padding: 0;
  cursor: pointer;
  flex-shrink: 0;
  line-height: 1;
}

.twist.spacer {
  visibility: hidden;
  pointer-events: none;
}

.level {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--text-muted);
  min-width: 18px;
}

.text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
