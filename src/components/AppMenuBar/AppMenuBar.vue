<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

export type MenuAction =
  | 'file:new-note'
  | 'file:new-folder'
  | 'file:save'
  | 'file:export'
  | 'file:backup-library'
  | 'file:backup-folder'
  | 'file:import'
  | 'file:trash'
  | 'file:settings'
  | 'file:exit'
  | 'edit:search'
  | 'edit:refresh'
  | 'view:live'
  | 'view:edit'
  | 'view:split'
  | 'view:preview'
  | 'view:toggle-folder'
  | 'view:toggle-chapter'
  | 'view:toggle-minimal'
  | 'view:theme-light'
  | 'view:theme-dark'
  | 'view:theme-system'
  | 'view:accent-amber'
  | 'view:accent-blue'
  | 'view:accent-paper'
  | 'view:accent-green'
  | 'view:accent-mono'
  | 'window:minimize'
  | 'window:maximize'
  | 'window:close'
  | 'help:about'
  | 'help:shortcuts'

const emit = defineEmits<{ action: [MenuAction] }>()

const openKey = ref<string | null>(null)

const menus: {
  key: string
  label: string
  items: ({ type: 'item'; id: MenuAction; label: string; shortcut?: string } | { type: 'sep' })[]
}[] = [
  {
    key: 'file',
    label: 'File',
    items: [
      { type: 'item', id: 'file:new-note', label: '新建笔记', shortcut: 'Ctrl+N' },
      { type: 'item', id: 'file:new-folder', label: '新建文件夹' },
      { type: 'sep' },
      { type: 'item', id: 'file:save', label: '保存', shortcut: 'Ctrl+S' },
      { type: 'item', id: 'file:export', label: '导出…' },
      { type: 'sep' },
      { type: 'item', id: 'file:backup-library', label: '整库备份' },
      { type: 'item', id: 'file:backup-folder', label: '备份当前文件夹' },
      { type: 'item', id: 'file:import', label: '导入备份…' },
      { type: 'sep' },
      { type: 'item', id: 'file:trash', label: '回收站' },
      { type: 'item', id: 'file:settings', label: '设置' },
      { type: 'item', id: 'file:exit', label: '退出', shortcut: 'Alt+F4' }
    ]
  },
  {
    key: 'edit',
    label: 'Edit',
    items: [
      { type: 'item', id: 'edit:search', label: '搜索', shortcut: 'Ctrl+F' },
      { type: 'item', id: 'edit:refresh', label: '刷新目录' }
    ]
  },
  {
    key: 'view',
    label: 'View',
    items: [
      { type: 'item', id: 'view:live', label: '即时编辑' },
      { type: 'item', id: 'view:edit', label: '源码模式' },
      { type: 'item', id: 'view:split', label: '分屏模式' },
      { type: 'item', id: 'view:preview', label: '预览模式' },
      { type: 'sep' },
      { type: 'item', id: 'view:toggle-folder', label: '显示/隐藏目录' },
      { type: 'item', id: 'view:toggle-chapter', label: '显示/隐藏章节' },
      { type: 'item', id: 'view:toggle-minimal', label: '极简写作' },
      { type: 'sep' },
      { type: 'item', id: 'view:theme-light', label: '浅色主题' },
      { type: 'item', id: 'view:theme-dark', label: '深色主题' },
      { type: 'item', id: 'view:theme-system', label: '跟随系统' },
      { type: 'sep' },
      { type: 'item', id: 'view:accent-amber', label: '主题色：暖黄' },
      { type: 'item', id: 'view:accent-blue', label: '主题色：柔蓝' },
      { type: 'item', id: 'view:accent-paper', label: '主题色：纸感' },
      { type: 'item', id: 'view:accent-green', label: '主题色：柔绿' },
      { type: 'item', id: 'view:accent-mono', label: '主题色：灰白' }
    ]
  },
  {
    key: 'window',
    label: 'Window',
    items: [
      { type: 'item', id: 'window:minimize', label: '最小化' },
      { type: 'item', id: 'window:maximize', label: '最大化 / 还原' },
      { type: 'item', id: 'window:close', label: '关闭窗口' }
    ]
  },
  {
    key: 'help',
    label: 'Help',
    items: [
      { type: 'item', id: 'help:shortcuts', label: '快捷键说明' },
      { type: 'item', id: 'help:about', label: '关于 DataFutureX Note' }
    ]
  }
]

function toggle(key: string) {
  openKey.value = openKey.value === key ? null : key
}

function onEnter(key: string) {
  if (openKey.value) openKey.value = key
}

function pick(id: MenuAction) {
  openKey.value = null
  emit('action', id)
}

function onDocClick(e: MouseEvent) {
  const t = e.target as HTMLElement | null
  if (!t?.closest?.('.app-menubar')) openKey.value = null
}

onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div class="app-menubar inline" role="menubar">
    <div v-for="menu in menus" :key="menu.key" class="menu-root">
      <button
        class="menu-btn"
        :class="{ open: openKey === menu.key }"
        type="button"
        @click.stop="toggle(menu.key)"
        @mouseenter="onEnter(menu.key)"
      >
        {{ menu.label }}
      </button>
      <div v-if="openKey === menu.key" class="menu-panel" role="menu">
        <template v-for="(item, idx) in menu.items" :key="idx">
          <div v-if="item.type === 'sep'" class="menu-sep" />
          <button
            v-else
            class="menu-item"
            type="button"
            role="menuitem"
            @click.stop="pick(item.id)"
          >
            <span>{{ item.label }}</span>
            <span v-if="item.shortcut" class="shortcut">{{ item.shortcut }}</span>
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-menubar.inline {
  display: inline-flex;
  align-items: center;
  height: 28px;
  gap: 0;
  margin-left: 4px;
  margin-right: 8px;
  padding: 0;
  background: transparent;
  border: none;
  flex-shrink: 0;
  user-select: none;
  z-index: 40;
}

.menu-root {
  position: relative;
}

.menu-btn {
  height: 28px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  padding: 0 8px;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
}

.menu-btn:hover,
.menu-btn.open {
  background: var(--hover-bg);
}

.menu-panel {
  position: absolute;
  top: calc(100% + 2px);
  left: 0;
  min-width: 220px;
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  padding: 4px;
  z-index: 200;
}


.menu-item {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  padding: 7px 10px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  text-align: left;
}

.menu-item:hover {
  background: var(--selection-bg);
  color: var(--accent-color);
}

.shortcut {
  color: var(--text-muted);
  font-size: 11px;
}

.menu-sep {
  height: 1px;
  background: var(--border-color);
  margin: 4px 6px;
}
</style>
