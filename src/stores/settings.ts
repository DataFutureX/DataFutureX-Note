import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  AccentTheme,
  AppSettings,
  DEFAULT_SETTINGS,
  ResolvedTheme,
  SortMode,
  ThemePreference
} from '@/types'

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
    panelLayout: { ...DEFAULT_SETTINGS.panelLayout }
  })
  const systemTheme = ref<ResolvedTheme>('light')
  const loaded = ref(false)

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
      panelLayout: { ...DEFAULT_SETTINGS.panelLayout, ...(loadedSettings.panelLayout || {}) }
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
    settings.value = {
      ...settings.value,
      ...partial,
      accentTheme: normalizeAccentTheme(partial.accentTheme ?? settings.value.accentTheme),
      panelLayout: {
        ...settings.value.panelLayout,
        ...(partial.panelLayout || {})
      }
    }
    if (partial.theme || partial.accentTheme) {
      applyDomTheme(resolvedTheme.value)
    }
    try {
      settings.value = await window.noteAPI.updateSettings(partial)
      settings.value.accentTheme = normalizeAccentTheme(settings.value.accentTheme)
    } catch (err) {
      console.warn('[settings] updateSettings failed:', err)
    }
    applyDomTheme(resolvedTheme.value)
    return settings.value
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
    applyDomTheme,
    applyAccentTheme
  }
})
