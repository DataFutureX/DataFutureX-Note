import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { atomicWrite, ensureDir, pathExists } from '../utils/pathSafety'

interface DraftRecord {
  noteId: string
  content: string
  updatedAt: number
}

export class RecoveryService {
  private dir: string

  constructor() {
    this.dir = path.join(app.getPath('userData'), 'recovery')
  }

  private draftPath(noteId: string): string {
    const safe = Buffer.from(noteId).toString('base64url')
    return path.join(this.dir, `${safe}.json`)
  }

  async saveDraft(noteId: string, content: string): Promise<void> {
    try {
      await ensureDir(this.dir)
      const record: DraftRecord = { noteId, content, updatedAt: Date.now() }
      await atomicWrite(this.draftPath(noteId), JSON.stringify(record))
    } catch (err) {
      // 草稿失败不得阻断正常编辑/保存
      console.warn('[RecoveryService] saveDraft failed:', err)
    }
  }

  async loadDraft(noteId: string): Promise<string | null> {
    const p = this.draftPath(noteId)
    if (!(await pathExists(p))) return null
    try {
      const raw = await fs.promises.readFile(p, 'utf8')
      const record = JSON.parse(raw) as DraftRecord
      return record.content
    } catch {
      return null
    }
  }

  async clearDraft(noteId: string): Promise<void> {
    const p = this.draftPath(noteId)
    if (await pathExists(p)) {
      await fs.promises.unlink(p)
    }
  }

  async listDrafts(): Promise<DraftRecord[]> {
    await ensureDir(this.dir)
    const files = await fs.promises.readdir(this.dir)
    const list: DraftRecord[] = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        const raw = await fs.promises.readFile(path.join(this.dir, file), 'utf8')
        list.push(JSON.parse(raw) as DraftRecord)
      } catch {
        // ignore broken draft
      }
    }
    return list
  }
}
