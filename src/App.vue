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
let unwatchOpenNote: (() => void) | null = null

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

let watchRefreshTimer: ReturnType<typeof setTimeout> | null = null

async function bindLibraryWatch() {
  unwatch?.()
  if (watchRefreshTimer) {
    clearTimeout(watchRefreshTimer)
    watchRefreshTimer = null
  }
  unwatch = window.noteAPI.watchLibrary(() => {
    // 外部文件变更：合并短时间内的多次事件，静默刷新目录树
    if (watchRefreshTimer) clearTimeout(watchRefreshTimer)
    watchRefreshTimer = setTimeout(() => {
      watchRefreshTimer = null
      void libraryStore.refreshTree(true, { quiet: true })
    }, 350)
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

/** 托盘「最近笔记」快捷打开 */
async function applyOpenNoteById(req: { noteId: string; folderId?: string | null }) {
  showSettings.value = false
  hasRoot.value = await libraryStore.ensureRoot()
  if (!hasRoot.value) return
  await libraryStore.refreshTree(false)
  const folderId = req.folderId || null
  if (folderId) {
    try {
      await libraryStore.loadNotes(folderId)
    } catch {
      // ignore
    }
  }
  try {
    await libraryStore.selectNote(req.noteId, true)
  } catch (e) {
    console.warn('[open-note-by-id] selectNote failed:', e)
  }
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

function onFlushPositions() {
  void settingsStore.flushNotePositions()
}

onMounted(async () => {
  await settingsStore.init()
  unwatchOpenMd = window.noteAPI.onOpenMarkdownFile((req) => {
    void applyOpenMarkdown(req)
  })
  unwatchOpenNote = window.noteAPI.onOpenNoteById((req) => {
    void applyOpenNoteById(req)
  })
  window.addEventListener('beforeunload', onFlushPositions)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') onFlushPositions()
  })
  // 先出壳，再后台灌库
  ready.value = true
  void bootLibraryInBackground()
})

onUnmounted(() => {
  onFlushPositions()
  window.removeEventListener('beforeunload', onFlushPositions)
  unwatch?.()
  unwatchOpenMd?.()
  unwatchOpenNote?.()
  if (watchRefreshTimer) {
    clearTimeout(watchRefreshTimer)
    watchRefreshTimer = null
  }
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
    case 'help:shortcuts': {
      const groups: { title: string; items: { keys: string; desc: string }[] }[] = [
        {
          title: '通用',
          items: [
            { keys: 'Ctrl+S', desc: '保存当前笔记' },
            { keys: 'Ctrl+N', desc: '新建笔记' },
            { keys: 'Ctrl+F', desc: '搜索笔记' },
            { keys: 'Alt+F4', desc: '退出应用' }
          ]
        },
        {
          title: '编辑格式',
          items: [
            { keys: 'Ctrl+B', desc: '加粗' },
            { keys: 'Ctrl+I', desc: '斜体' },
            { keys: 'Ctrl+D', desc: '删除线' },
            { keys: 'Ctrl+E', desc: '行内代码' },
            { keys: 'Ctrl+K', desc: '插入链接' },
            { keys: 'Ctrl+Shift+K', desc: '插入代码块' },
            { keys: 'Ctrl+Shift+I', desc: '插入图片占位' },
            { keys: 'Ctrl+V', desc: '粘贴（优先粘贴截图）' }
          ]
        },
        {
          title: '标题与列表',
          items: [
            { keys: 'Ctrl+1', desc: '一级标题' },
            { keys: 'Ctrl+2', desc: '二级标题' },
            { keys: 'Ctrl+3', desc: '三级标题' },
            { keys: 'Ctrl+4', desc: '四级标题' },
            { keys: 'Ctrl+5', desc: '五级标题' },
            { keys: 'Ctrl+Shift+Q', desc: '引用' },
            { keys: 'Ctrl+Shift+L', desc: '无序列表' },
            { keys: 'Ctrl+Shift+O', desc: '有序列表' }
          ]
        },
        {
          title: '撤销重做',
          items: [
            { keys: 'Ctrl+Z', desc: '撤销' },
            { keys: 'Ctrl+Y / Ctrl+Shift+Z', desc: '重做' }
          ]
        }
      ]
      await ElMessageBox({
        title: '快捷键说明',
        message: h(
          'div',
          { class: 'shortcuts-dialog' },
          groups.map((g) =>
            h('section', { class: 'shortcuts-group' }, [
              h('h3', { class: 'shortcuts-group-title' }, g.title),
              h(
                'ul',
                { class: 'shortcuts-list' },
                g.items.map((item) =>
                  h('li', { class: 'shortcuts-row' }, [
                    h('kbd', { class: 'shortcuts-keys' }, item.keys),
                    h('span', { class: 'shortcuts-desc' }, item.desc)
                  ])
                )
              )
            ])
          )
        ),
        confirmButtonText: '知道了',
        customClass: 'shortcuts-message-box',
        dangerouslyUseHTMLString: false
      })
      return
    }
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
