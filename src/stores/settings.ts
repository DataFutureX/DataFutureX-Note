import { defineStore } from 'pinia'
import { computed, ref, toRaw } from 'vue'
import {
  AccentTheme,
  AppSettings,
  DEFAULT_SETTINGS,
  NoteViewPosition,
  RecentNoteEntry,
  ResolvedTheme,
  SortMode,
  ThemePreference
} from '@/types'
import { pruneNotePositions } from '@/utils/notePosition'

const MAX_RECENT_NOTES = 10

/** Electron IPC 无法克隆 Vue Proxy，必须先打成纯 JSON */
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(toRaw(value))) as T
}

function normalizeAccentTheme(value: unknown): AccentTheme {
  if (value === 'github') return 'mono' // 兼容旧设置
  if (
    value === 'amber' ||
    value === 'blue' ||
    value === 'paper' ||
    value === 'green' ||
    value === 'mono'
  ) {
    return value
  }
  return DEFAULT_SETTINGS.accentTheme
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>({
    ...DEFAULT_SETTINGS,
    panelLayout: { ...DEFAULT_SETTINGS.panelLayout },
    notePositions: { ...DEFAULT_SETTINGS.notePositions },
    recentNotes: [...DEFAULT_SETTINGS.recentNotes]
  })
  const systemTheme = ref<ResolvedTheme>('light')
  const loaded = ref(false)
  let positionPersistTimer: ReturnType<typeof setTimeout> | null = null
  let pendingPositions: Record<string, NoteViewPosition> | null = null

  const resolvedTheme = computed<ResolvedTheme>(() => {
    if (settings.value.theme === 'system') return systemTheme.value
    return settings.value.theme
  })

  function applyAccentTheme(accent: AccentTheme) {
    document.documentElement.setAttribute('data-accent', accent)
  }

  function applyDomTheme(theme: ResolvedTheme) {
    const dark = theme === 'dark'
    const root = document.documentElement
    const accent = normalizeAccentTheme(settings.value.accentTheme)
    // 只在 html 上挂 dark / data-theme / data-accent，避免 body.dark 覆盖主题色深色变体
    root.classList.toggle('dark', dark)
    document.body?.classList.remove('dark')
    root.setAttribute('data-theme', theme)
    root.style.colorScheme = theme
    applyAccentTheme(accent)
    try {
      void window.noteAPI.setTitleBarOverlayTheme(theme, accent)
    } catch {
      // 标题栏主题失败不影响主界面
    }
  }

  async function init() {
    const loadedSettings = await window.noteAPI.getSettings()
    settings.value = {
      ...loadedSettings,
      accentTheme: normalizeAccentTheme(loadedSettings.accentTheme),
      panelLayout: { ...DEFAULT_SETTINGS.panelLayout, ...(loadedSettings.panelLayout || {}) },
      notePositions: { ...DEFAULT_SETTINGS.notePositions, ...(loadedSettings.notePositions || {}) },
      recentNotes: Array.isArray(loadedSettings.recentNotes)
        ? loadedSettings.recentNotes.slice(0, MAX_RECENT_NOTES)
        : [...DEFAULT_SETTINGS.recentNotes]
    }
    systemTheme.value = await window.noteAPI.getSystemTheme()
    applyDomTheme(resolvedTheme.value)
    window.noteAPI.onSystemThemeChanged((theme) => {
      systemTheme.value = theme
      if (settings.value.theme === 'system') {
        applyDomTheme(theme)
      }
    })
    loaded.value = true
  }

  async function update(partial: Partial<AppSettings>) {
    // 其它设置落盘时一并带上未刷盘的阅读位置，避免主进程旧值回写冲掉内存
    const positionsToSend = plain(
      partial.notePositions !== undefined
        ? partial.notePositions
        : pendingPositions || settings.value.notePositions || {}
    )
    const recentToSend =
      partial.recentNotes !== undefined
        ? plain(partial.recentNotes)
        : plain(settings.value.recentNotes || [])
    const payload = plain({
      ...partial,
      notePositions: positionsToSend,
      // 始终带上最近列表，避免其它字段更新时把主进程里的列表冲掉后又读回空
      recentNotes: recentToSend
    } as Partial<AppSettings>)
    settings.value = {
      ...settings.value,
      ...payload,
      accentTheme: normalizeAccentTheme(payload.accentTheme ?? settings.value.accentTheme),
      panelLayout: {
        ...settings.value.panelLayout,
        ...(payload.panelLayout || {})
      },
      notePositions: { ...(positionsToSend || {}) },
      recentNotes: [...(recentToSend || [])]
    }
    if (partial.theme || partial.accentTheme) {
      applyDomTheme(resolvedTheme.value)
    }
    try {
      const saved = await window.noteAPI.updateSettings(payload)
      if (pendingPositions && JSON.stringify(pendingPositions) === JSON.stringify(positionsToSend)) {
        pendingPositions = null
      }
      settings.value = {
        ...saved,
        accentTheme: normalizeAccentTheme(saved.accentTheme),
        notePositions: {
          ...DEFAULT_SETTINGS.notePositions,
          ...(saved.notePositions || {}),
          ...(pendingPositions || {})
        },
        recentNotes: Array.isArray(saved.recentNotes)
          ? saved.recentNotes.slice(0, MAX_RECENT_NOTES)
          : [...(settings.value.recentNotes || [])]
      }
    } catch (err) {
      console.warn('[settings] updateSettings failed:', err)
    }
    applyDomTheme(resolvedTheme.value)
    return settings.value
  }

  /** 立即把阅读位置刷到主进程（切换笔记 / 退出前调用） */
  async function flushNotePositions() {
    if (positionPersistTimer) {
      clearTimeout(positionPersistTimer)
      positionPersistTimer = null
    }
    const payload = plain(pendingPositions || settings.value.notePositions || {})
    if (!payload || !Object.keys(payload).length) return
    pendingPositions = null
    try {
      const saved = await window.noteAPI.updateSettings({
        notePositions: payload,
        recentNotes: plain(settings.value.recentNotes || [])
      })
      settings.value = {
        ...settings.value,
        ...saved,
        accentTheme: normalizeAccentTheme(saved.accentTheme),
        notePositions: {
          ...DEFAULT_SETTINGS.notePositions,
          ...(saved.notePositions || payload)
        },
        recentNotes: Array.isArray(saved.recentNotes)
          ? saved.recentNotes.slice(0, MAX_RECENT_NOTES)
          : [...(settings.value.recentNotes || [])]
      }
    } catch (err) {
      console.warn('[settings] flushNotePositions failed:', err)
      pendingPositions = payload
    }
  }

  async function setTheme(theme: ThemePreference) {
    // 立即切换：先改偏好，再解析生效主题并刷 DOM
    settings.value = { ...settings.value, theme }
    if (theme === 'system') {
      try {
        systemTheme.value = await window.noteAPI.getSystemTheme()
      } catch {
        // 保留缓存
      }
    }
    applyDomTheme(resolvedTheme.value)
    try {
      settings.value = await window.noteAPI.updateSettings({ theme })
      settings.value.accentTheme = normalizeAccentTheme(settings.value.accentTheme)
      if (theme === 'system') {
        systemTheme.value = await window.noteAPI.getSystemTheme()
      }
      applyDomTheme(resolvedTheme.value)
    } catch (err) {
      console.warn('[settings] setTheme persist failed:', err)
    }
  }

  async function setAccentTheme(accentTheme: AccentTheme) {
    const next = normalizeAccentTheme(accentTheme)
    settings.value = { ...settings.value, accentTheme: next }
    // 完整套用：保证深/浅色走当前主题色对应变体，并刷新标题栏
    applyDomTheme(resolvedTheme.value)
    try {
      settings.value = await window.noteAPI.updateSettings({ accentTheme: next })
      settings.value.accentTheme = normalizeAccentTheme(settings.value.accentTheme)
      applyDomTheme(resolvedTheme.value)
    } catch (err) {
      console.warn('[settings] setAccentTheme persist failed:', err)
    }
  }

  async function setSortMode(sortMode: SortMode) {
    await update({ sortMode })
  }

  /** 记入最近打开（立即更新内存并落盘，供托盘菜单，最多 10 条） */
  function buildRecentNotes(
    note: Pick<RecentNoteEntry, 'id' | 'name' | 'folderId'>
  ): RecentNoteEntry[] {
    const next: RecentNoteEntry = {
      id: note.id,
      name: (note.name || note.id).replace(/\.md$/i, ''),
      folderId: note.folderId || '.',
      openedAt: Date.now()
    }
    const recentNotes = [
      next,
      ...(settings.value.recentNotes || []).filter((n) => n.id !== note.id)
    ].slice(0, MAX_RECENT_NOTES)
    settings.value = { ...settings.value, recentNotes }
    return recentNotes
  }

  /** 立即把最近笔记列表刷到主进程（托盘菜单依赖主进程 settings） */
  async function flushRecentNotes(recentNotes?: RecentNoteEntry[]) {
    const list = plain(
      (recentNotes || settings.value.recentNotes || []).slice(0, MAX_RECENT_NOTES)
    )
    settings.value = { ...settings.value, recentNotes: list }
    try {
      const saved = await window.noteAPI.updateSettings({
        recentNotes: list
      })
      settings.value = {
        ...settings.value,
        ...saved,
        accentTheme: normalizeAccentTheme(saved.accentTheme),
        recentNotes: Array.isArray(saved.recentNotes)
          ? saved.recentNotes.slice(0, MAX_RECENT_NOTES)
          : list,
        notePositions: {
          ...DEFAULT_SETTINGS.notePositions,
          ...(saved.notePositions || {}),
          ...(pendingPositions || plain(settings.value.notePositions || {}))
        }
      }
    } catch (err) {
      console.warn('[settings] flushRecentNotes failed:', err)
    }
  }

  function getNotePosition(noteId: string | null | undefined): NoteViewPosition | null {
    if (!noteId) return null
    return settings.value.notePositions?.[noteId] || null
  }

  /** 记忆阅读/编辑位置（防抖落盘，最多保留约 120 篇） */
  function rememberNotePosition(
    noteId: string | null | undefined,
    pos: Pick<NoteViewPosition, 'scrollTop' | 'scrollRatio' | 'cursorOffset'>,
    opts?: { flush?: boolean }
  ) {
    if (!noteId) return
    // 避免把「尚未排版完成」的 0 位置覆盖已有有效记忆
    const prev = settings.value.notePositions?.[noteId]
    const scrollTop = pos.scrollTop || 0
    const scrollRatio = pos.scrollRatio || 0
    if (
      prev &&
      scrollTop <= 0 &&
      scrollRatio <= 0 &&
      (pos.cursorOffset == null || pos.cursorOffset <= 0) &&
      (prev.scrollTop > 0 || prev.scrollRatio > 0 || (prev.cursorOffset ?? 0) > 0)
    ) {
      return
    }
    const next: NoteViewPosition = {
      scrollTop,
      scrollRatio,
      cursorOffset: pos.cursorOffset,
      updatedAt: Date.now()
    }
    const map = pruneNotePositions({
      ...(settings.value.notePositions || {}),
      [noteId]: next
    })
    settings.value = { ...settings.value, notePositions: map }
    pendingPositions = map
    if (opts?.flush) {
      void flushNotePositions()
      return
    }
    if (positionPersistTimer) clearTimeout(positionPersistTimer)
    positionPersistTimer = setTimeout(() => {
      positionPersistTimer = null
      void flushNotePositions()
    }, 400)
  }

  return {
    settings,
    systemTheme,
    resolvedTheme,
    loaded,
    init,
    update,
    setTheme,
    setAccentTheme,
    setSortMode,
    getNotePosition,
    rememberNotePosition,
    flushNotePositions,
    buildRecentNotes,
    flushRecentNotes,
    applyDomTheme,
    applyAccentTheme
  }
})
