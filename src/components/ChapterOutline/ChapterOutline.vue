<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useLibraryStore } from '@/stores/library'
import { buildChapterTree, extractChapters } from '@/utils/markdownOutline'
import ChapterTreeNode from './ChapterTreeNode.vue'

const library = useLibraryStore()
/** id -> true 表示折叠 */
const collapsed = ref<Record<string, boolean>>({})

const tree = computed(() => buildChapterTree(extractChapters(library.content)))

watch(
  () => library.selectedNoteId,
  () => {
    collapsed.value = {}
  }
)

function toggle(id: string) {
  collapsed.value = { ...collapsed.value, [id]: !collapsed.value[id] }
}

function jumpTo(line: number, text: string) {
  library.requestJumpToHeading({ line, text })
}
</script>

<template>
  <div class="chapter-list">
    <div v-if="!library.selectedNoteId" class="empty-state" style="height: 180px">
      <div>在左侧目录中选择一篇笔记</div>
      <div class="hint">将在此树形展示该笔记的 Markdown 章节</div>
    </div>
    <template v-else>
      <div v-if="!tree.length" class="empty-state" style="height: 140px">
        <div>暂无章节</div>
        <div class="hint">使用 # / ## / ### 标题即可生成大纲树</div>
      </div>
      <ul v-else class="tree" role="tree">
        <ChapterTreeNode
          v-for="node in tree"
          :key="node.id + '-' + node.line"
          :node="node"
          :open-map="collapsed"
          @toggle="toggle"
          @jump="jumpTo"
        />
      </ul>
    </template>
  </div>
</template>

<style scoped>
.chapter-list {
  padding: 8px 6px 16px;
  height: 100%;
  overflow: auto;
}

.hint {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 6px;
}

.tree {
  list-style: none;
  margin: 0;
  padding: 0;
}
</style>
