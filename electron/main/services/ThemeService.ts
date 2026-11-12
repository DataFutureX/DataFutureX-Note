import { nativeTheme } from 'electron'
import { ResolvedTheme, ThemePreference } from '../../../src/types'

export class ThemeService {
  private preference: ThemePreference = 'system'
  private listeners = new Set<(theme: ResolvedTheme) => void>()

  constructor() {
    nativeTheme.on('updated', () => {
      const theme = this.getEffectiveTheme()
      for (const cb of this.listeners) cb(theme)
    })
  }

  /** 操作系统真实主题（不受 themeSource 强制覆盖影响） */
  getOsTheme(): ResolvedTheme {
    const osDark = (nativeTheme as Electron.NativeTheme & {
      shouldUseDarkColorsForSystemIntegratedUI?: boolean
    }).shouldUseDarkColorsForSystemIntegratedUI
    if (typeof osDark === 'boolean') {
      return osDark ? 'dark' : 'light'
    }
    // 回退：仅在 themeSource=system 时准确
    if (nativeTheme.themeSource === 'system') {
      return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    }
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  }

  /** @deprecated 兼容旧调用，等同 getOsTheme */
  getSystemTheme(): ResolvedTheme {
    return this.getOsTheme()
  }

  getPreference(): ThemePreference {
    return this.preference
  }

  getEffectiveTheme(): ResolvedTheme {
    return this.resolve(this.preference)
  }

  resolve(preference: ThemePreference): ResolvedTheme {
    if (preference === 'system') return this.getOsTheme()
    return preference
  }

  applyPreference(preference: ThemePreference): ResolvedTheme {
    this.preference = preference
    nativeTheme.themeSource = preference === 'system' ? 'system' : preference
    return this.getEffectiveTheme()
  }

  onUpdated(cb: (theme: ResolvedTheme) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }
}
