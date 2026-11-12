<script setup lang="ts">
import { computed } from 'vue'
import AppMenuBar, { type MenuAction } from '@/components/AppMenuBar/AppMenuBar.vue'
import LogoMark from '@/components/Brand/LogoMark.vue'
import { useSettingsStore } from '@/stores/settings'

const emit = defineEmits<{ action: [MenuAction] }>()
const settingsStore = useSettingsStore()

const folderCollapsed = computed(() => settingsStore.settings.panelLayout.folderCollapsed)
const chapterCollapsed = computed(() => settingsStore.settings.panelLayout.noteCollapsed)
const minimalMode = computed(() => folderCollapsed.value && chapterCollapsed.value)

function onAction(action: MenuAction) {
  emit('action', action)
}

function toggleFolder() {
  emit('action', 'view:toggle-folder')
}

function toggleChapter() {
  emit('action', 'view:toggle-chapter')
}

function toggleMinimal() {
  emit('action', 'view:toggle-minimal')
}
</script>

<template>
  <header class="shell-titlebar">
    <div class="title-left">
      <button
        class="sidebar-toggle no-drag"
        type="button"
        :class="{ active: !folderCollapsed }"
        :title="folderCollapsed ? '显示目录' : '隐藏目录'"
        aria-label="显示/隐藏目录"
        @click="toggleFolder"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M4 5.5h16v13H4zM9 5.5v13"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <span class="title-name">DataFutureX Note</span>
      <div class="title-menu no-drag">
        <AppMenuBar @action="onAction" />
        <button
          class="sidebar-toggle chapter-toggle"
          type="button"
          :class="{ active: !chapterCollapsed }"
          :title="chapterCollapsed ? '显示章节' : '隐藏章节'"
          aria-label="显示/隐藏章节"
          @click="toggleChapter"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M5 6.5h14M5 12h10M5 17.5h12"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
    <div class="title-spacer" />
    <button
      class="sidebar-toggle minimal-toggle no-drag"
      type="button"
      :class="{ active: minimalMode }"
      :title="minimalMode ? '退出极简' : '极简写作'"
      aria-label="极简写作"
      @click="toggleMinimal"
    >
      <LogoMark class="minimal-logo" :size="16" label="" />
    </button>
  </header>
</template>

<style scoped>
.shell-titlebar {
  height: var(--shell-titlebar-height, 36px);
  display: flex;
  align-items: center;
  padding: 0 138px 0 10px; /* 右侧留给 Windows 原生按钮 */
  background: var(--toolbar-bg);
  /* 底边线改由 .app-body border-top 绘制，避免被 Windows titleBarOverlay 盖住右侧 */
  border-bottom: none;
  flex-shrink: 0;
  -webkit-app-region: drag;
  user-select: none;
  z-index: 100;
}

.title-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.title-spacer {
  flex: 1;
  min-width: 8px;
  height: 100%;
}

.minimal-toggle {
  margin-right: 2px;
}

.minimal-logo {
  width: 16px;
  height: 16px;
}

.minimal-toggle.active .minimal-logo {
  box-shadow: 0 0 0 1.5px var(--accent-color);
  border-radius: 3px;
}

.sidebar-toggle {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
}

.sidebar-toggle:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}

.sidebar-toggle.active {
  color: var(--accent-color);
  background: var(--selection-bg);
}

.sidebar-toggle svg {
  width: 15px;
  height: 15px;
  display: block;
}

.title-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--accent-color);
  white-space: nowrap;
}

.title-menu {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.chapter-toggle {
  margin-left: 2px;
}

.no-drag {
  -webkit-app-region: no-drag;
}

:deep(.app-menubar.inline) {
  margin: 0;
}
</style>
