<script setup lang="ts">
import { computed, defineAsyncComponent, h, onMounted, onUnmounted, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useSettingsStore } from '@/stores/settings'
import { useLibraryStore } from '@/stores/library'
import TitleBar from '@/components/TitleBar/TitleBar.vue'
import type { MenuAction } from '@/components/AppMenuBar/AppMenuBar.vue'
import { emitMenuAction } from '@/utils/menuBus'
import LogoMark from '@/components/Brand/LogoMark.vue'
import type { OpenMarkdownRequest } from '@/types'
import { DEFAULT_SETTINGS } from '@/types'

const WelcomeView = defineAsyncComponent(() => import('@/views/WelcomeView.vue'))
const MainView = defineAsyncComponent(() => import('@/views/MainView.vue'))
const SettingsView = defineAsyncComponent(() => import('@/views/SettingsView.vue'))

const settingsStore = useSettingsStore()
const libraryStore = useLibraryStore()
const ready = ref(false)
const libraryBooting = ref(false)
const hasRoot = ref(false)
const showSettings = ref(false)
let unwatch: (() => void) | null = null
let unwatchOpenMd: (() => void) | null = null

const currentView = computed(() => {
  if (!ready.value) return 'loading'
  if (!hasRoot.value) return 'welcome'
  if (showSettings.value) return 'settings'
  return 'main'
})

watch(
  () => settingsStore.resolvedTheme,
  (theme) => {
    settingsStore.applyDomTheme(theme)
  }
)

async function bindLibraryWatch() {
  unwatch?.()
  unwatch = window.noteAPI.watchLibrary(() => {
    void libraryStore.refreshTree(true)
  })
}

/** 用本程序打开外部 MD：刷新库、打开笔记，并默认隐藏目录 */
async function applyOpenMarkdown(req: OpenMarkdownRequest) {
  showSettings.value = false
  const loaded = await window.noteAPI.getSettings()
  settingsStore.settings = {
    ...loaded,
    accentTheme: loaded.accentTheme || DEFAULT_SETTINGS.accentTheme,
    panelLayout: {
      ...DEFAULT_SETTINGS.panelLayout,
      ...(loaded.panelLayout || {}),
      folderCollapsed: true
    }
  }
  settingsStore.applyDomTheme(settingsStore.resolvedTheme)
  hasRoot.value = true
  await libraryStore.refreshTree(false)
  try {
    if (req.folderId) await libraryStore.loadNotes(req.folderId)
  } catch {
    // ignore
  }
  try {
    await libraryStore.selectNote(req.noteId, true)
  } catch (e) {
    console.warn('[open-markdown] selectNote failed:', e)
  }
  void settingsStore.update({
    panelLayout: {
      ...settingsStore.settings.panelLayout,
      folderCollapsed: true
    }
  })
  await bindLibraryWatch()
}

/** 后台加载库与上次笔记，不阻塞首屏出壳 */
async function bootLibraryInBackground() {
  libraryBooting.value = true
  try {
    const pending = await window.noteAPI.consumeOpenMarkdownRequest()
    if (pending) {
      await applyOpenMarkdown(pending)
      return
    }
    hasRoot.value = await libraryStore.ensureRoot()
    if (!hasRoot.value) return
    await libraryStore.refreshTree()
    const lastFolder = settingsStore.settings.lastFolderId
    const lastNote = settingsStore.settings.lastNoteId
    // refreshTree 已按选中夹填充 notes；仅当 lastFolder 与当前不一致时再拉
    if (lastFolder && lastFolder !== libraryStore.selectedFolderId) {
      try {
        await libraryStore.loadNotes(lastFolder)
      } catch {
        // ignore
      }
    }
    if (settingsStore.settings.startupBehavior === 'last-note' && lastNote) {
      try {
        await libraryStore.selectNote(lastNote, true)
      } catch {
        // ignore
      }
    }
    await bindLibraryWatch()
  } finally {
    libraryBooting.value = false
  }
}

onMounted(async () => {
  await settingsStore.init()
  unwatchOpenMd = window.noteAPI.onOpenMarkdownFile((req) => {
    void applyOpenMarkdown(req)
  })
  // 先出壳，再后台灌库
  ready.value = true
  void bootLibraryInBackground()
})

onUnmounted(() => {
  unwatch?.()
  unwatchOpenMd?.()
})

async function onRootReady() {
  hasRoot.value = true
  await libraryStore.refreshTree()
  await bindLibraryWatch()
}

function openSettings() {
  showSettings.value = true
}

function closeSettings() {
  showSettings.value = false
}

async function onTitleMenuAction(action: MenuAction) {
  switch (action) {
    case 'file:settings':
      openSettings()
      return
    case 'file:exit':
      await window.noteAPI.appQuit()
      return
    case 'window:minimize':
      await window.noteAPI.windowMinimize()
      return
    case 'window:maximize':
      await window.noteAPI.windowMaximizeToggle()
      return
    case 'window:close':
      await window.noteAPI.windowClose()
      return
    case 'view:theme-light':
      await settingsStore.setTheme('light')
      return
    case 'view:theme-dark':
      await settingsStore.setTheme('dark')
      return
    case 'view:theme-system':
      await settingsStore.setTheme('system')
      return
    case 'view:accent-amber':
      await settingsStore.setAccentTheme('amber')
      return
    case 'view:accent-blue':
      await settingsStore.setAccentTheme('blue')
      return
    case 'view:accent-paper':
      await settingsStore.setAccentTheme('paper')
      return
    case 'view:accent-green':
      await settingsStore.setAccentTheme('green')
      return
    case 'view:accent-mono':
      await settingsStore.setAccentTheme('mono')
      return
    case 'help:shortcuts':
      await ElMessageBox.alert(
        [
          'Ctrl+S  保存',
          'Ctrl+N  新建笔记',
          'Ctrl+F  搜索',
          'Ctrl+1～5  一级～五级标题',
          'Ctrl+B / I / D  加粗 / 斜体 / 删除线'
        ].join('\n'),
        '快捷键说明',
        { confirmButtonText: '知道了' }
      )
      return
    case 'help:about': {
      const info = await window.noteAPI.getAppInfo()
      const homepage = info.homepage || 'https://www.datafuturex.cn/'
      await ElMessageBox({
        title: '关于',
        message: h('div', { class: 'about-dialog' }, [
          h(LogoMark, { class: 'about-dialog-logo', size: 72, enhanced: true }),
          h('p', { class: 'about-dialog-name' }, info.name),
          h('p', { class: 'about-dialog-meta' }, `版本 ${info.version}`),
          ...(info.buildTime
            ? [h('p', { class: 'about-dialog-meta' }, `打包时间 ${info.buildTime}`)]
            : []),
          h('p', { class: 'about-dialog-meta' }, info.copyright),
          h(
            'a',
            {
              class: 'about-dialog-link',
              href: homepage,
              onClick: (e: MouseEvent) => {
                e.preventDefault()
                void window.noteAPI.openExternal(homepage)
              }
            },
            homepage
          )
        ]),
        confirmButtonText: '关闭',
        customClass: 'about-message-box'
      })
      return
    }
    default:
      emitMenuAction(action)
  }
}
</script>

<template>
  <div class="app-shell" :class="{ dark: settingsStore.resolvedTheme === 'dark' }">
    <TitleBar @action="onTitleMenuAction" />
    <div class="app-body">
      <div v-if="currentView === 'loading'" class="empty-state">正在启动 DataFutureX Note…</div>
      <WelcomeView v-else-if="currentView === 'welcome'" @ready="onRootReady" />
      <SettingsView
        v-else-if="currentView === 'settings'"
        @close="closeSettings"
        @root-changed="onRootReady"
      />
      <MainView v-else />
      <div v-if="libraryBooting && currentView === 'main'" class="boot-hint">正在加载笔记库…</div>
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--app-bg);
  color: var(--text-primary);
  overflow: hidden;
}

.app-body {
  flex: 1;
  min-height: 0;
  position: relative;
  /* 与标题栏底边衔接，避免 Windows titleBarOverlay 盖住右侧分割线 */
  border-top: 1px solid var(--border-color);
}

.boot-hint {
  position: absolute;
  right: 12px;
  bottom: 10px;
  z-index: 20;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  color: var(--text-secondary);
  background: color-mix(in srgb, var(--panel-bg) 88%, transparent);
  border: 1px solid var(--border-color);
  pointer-events: none;
}
</style>
