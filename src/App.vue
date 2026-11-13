<script setup lang="ts">
import { computed, h, onMounted, onUnmounted, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useSettingsStore } from '@/stores/settings'
import { useLibraryStore } from '@/stores/library'
import WelcomeView from '@/views/WelcomeView.vue'
import MainView from '@/views/MainView.vue'
import SettingsView from '@/views/SettingsView.vue'
import TitleBar from '@/components/TitleBar/TitleBar.vue'
import type { MenuAction } from '@/components/AppMenuBar/AppMenuBar.vue'
import { emitMenuAction } from '@/utils/menuBus'
import LogoMark from '@/components/Brand/LogoMark.vue'
import type { OpenMarkdownRequest } from '@/types'
import { DEFAULT_SETTINGS } from '@/types'

const settingsStore = useSettingsStore()
const libraryStore = useLibraryStore()
const ready = ref(false)
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
  await settingsStore.update({
    panelLayout: {
      ...settingsStore.settings.panelLayout,
      folderCollapsed: true
    }
  })
  await bindLibraryWatch()
}

onMounted(async () => {
  await settingsStore.init()

  const pending = await window.noteAPI.consumeOpenMarkdownRequest()
  if (pending) {
    await applyOpenMarkdown(pending)
  } else {
    hasRoot.value = await libraryStore.ensureRoot()
    if (hasRoot.value) {
      await libraryStore.refreshTree()
      const lastFolder = settingsStore.settings.lastFolderId
      const lastNote = settingsStore.settings.lastNoteId
      if (lastFolder) {
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
    }
  }

  unwatchOpenMd = window.noteAPI.onOpenMarkdownFile((req) => {
    void applyOpenMarkdown(req)
  })
  ready.value = true
})

onUnmounted(() => {
  unwatch?.()
  unwatchOpenMd?.()
})

async function onRootReady() {
  hasRoot.value = true
  await libraryStore.refreshTree()
  unwatch?.()
  unwatch = window.noteAPI.watchLibrary(() => {
    void libraryStore.refreshTree(true)
  })
}

function openSettings() {
  showSettings.value = true
}

function closeSettings() {
  showSettings.value = false
}

async function onTitleMenuAction(action: MenuAction) {
  // 全局可处理项
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
      await ElMessageBox({
        title: '关于',
        message: h('div', { class: 'about-dialog' }, [
          h(LogoMark, { class: 'about-dialog-logo', size: 56 }),
          h('p', { class: 'about-dialog-name' }, info.name),
          h('p', { class: 'about-dialog-meta' }, `版本 ${info.version}`),
          h('p', { class: 'about-dialog-meta' }, info.copyright)
        ]),
        confirmButtonText: '关闭',
        customClass: 'about-message-box'
      })
      return
    }
    default:
      // 交给主界面处理
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
      <SettingsView v-else-if="currentView === 'settings'" @close="closeSettings" @root-changed="onRootReady" />
      <MainView v-else />
    </div>
  </div>
</template>

<style scoped>
.app-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* 全宽分割线：落在 titleBarOverlay 下方，右侧不会被原生按钮区域截断 */
  border-top: 1px solid var(--border-color);
}
</style>
