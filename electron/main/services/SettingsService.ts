import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { AccentTheme, AppSettings, DEFAULT_SETTINGS } from '../../../src/types'
import { atomicWrite, ensureDir } from '../utils/pathSafety'

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

export class SettingsService {
  private settingsPath: string
  private settings: AppSettings = {
    ...DEFAULT_SETTINGS,
    panelLayout: { ...DEFAULT_SETTINGS.panelLayout },
    notePositions: { ...DEFAULT_SETTINGS.notePositions },
    recentNotes: [...DEFAULT_SETTINGS.recentNotes]
  }

  constructor() {
    this.settingsPath = path.join(app.getPath('userData'), 'settings.json')
  }

  async load(): Promise<AppSettings> {
    try {
      const raw = await fs.promises.readFile(this.settingsPath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<AppSettings>
      this.settings = {
        ...DEFAULT_SETTINGS,
        ...parsed,
        accentTheme: normalizeAccentTheme(parsed.accentTheme),
        panelLayout: {
          ...DEFAULT_SETTINGS.panelLayout,
          ...(parsed.panelLayout || {})
        },
        notePositions: {
          ...DEFAULT_SETTINGS.notePositions,
          ...(parsed.notePositions || {})
        },
        recentNotes: Array.isArray(parsed.recentNotes)
          ? parsed.recentNotes.slice(0, 10)
          : [...DEFAULT_SETTINGS.recentNotes]
      }
    } catch {
      this.settings = {
        ...DEFAULT_SETTINGS,
        panelLayout: { ...DEFAULT_SETTINGS.panelLayout },
        notePositions: { ...DEFAULT_SETTINGS.notePositions },
        recentNotes: [...DEFAULT_SETTINGS.recentNotes]
      }
    }
    return this.get()
  }

  get(): AppSettings {
    return JSON.parse(JSON.stringify(this.settings)) as AppSettings
  }

  async update(partial: Partial<AppSettings>): Promise<AppSettings> {
    let recentNotes =
      partial.recentNotes !== undefined
        ? [...partial.recentNotes].slice(0, 10)
        : [...(this.settings.recentNotes || [])]

    // 仅更新 lastNoteId 时，自动补进最近列表（兜底渲染进程未带 recentNotes 的情况）
    const lastNoteId =
      partial.lastNoteId !== undefined ? partial.lastNoteId : this.settings.lastNoteId
    if (lastNoteId && !recentNotes.some((n) => n.id === lastNoteId)) {
      const name = lastNoteId.split(/[/\\]/).pop()?.replace(/\.md$/i, '') || lastNoteId
      const folderId =
        partial.lastFolderId !== undefined
          ? partial.lastFolderId || '.'
          : this.settings.lastFolderId || '.'
      recentNotes = [
        { id: lastNoteId, name, folderId, openedAt: Date.now() },
        ...recentNotes.filter((n) => n.id !== lastNoteId)
      ].slice(0, 10)
    } else if (lastNoteId && recentNotes[0]?.id !== lastNoteId) {
      const hit = recentNotes.find((n) => n.id === lastNoteId)
      if (hit) {
        recentNotes = [{ ...hit, openedAt: Date.now() }, ...recentNotes.filter((n) => n.id !== lastNoteId)]
      }
    }

    this.settings = {
      ...this.settings,
      ...partial,
      accentTheme: normalizeAccentTheme(
        partial.accentTheme !== undefined ? partial.accentTheme : this.settings.accentTheme
      ),
      panelLayout: {
        ...this.settings.panelLayout,
        ...(partial.panelLayout || {})
      },
      notePositions:
        partial.notePositions !== undefined
          ? { ...partial.notePositions }
          : { ...(this.settings.notePositions || {}) },
      recentNotes
    }
    // 持久化失败不阻断主题等内存设置生效
    try {
      await this.persist()
    } catch (err) {
      console.warn('[SettingsService] persist failed:', err)
    }
    return this.get()
  }

  getRootDirectory(): string | null {
    return this.settings.rootDirectory
  }

  async setRootDirectory(dir: string): Promise<void> {
    await this.update({ rootDirectory: dir })
  }

  private async persist(): Promise<void> {
    await ensureDir(path.dirname(this.settingsPath))
    await atomicWrite(this.settingsPath, JSON.stringify(this.settings, null, 2))
  }
}
