import fs from 'node:fs'
import path from 'node:path'
import { SearchResult } from '../../../src/types'
import { FileSystemService } from './FileSystemService'
import { noteDisplayName, toRelativeId } from '../utils/pathSafety'

export class SearchService {
  constructor(private fsService: FileSystemService) {}

  async search(keyword: string): Promise<SearchResult[]> {
    const q = keyword.trim().toLowerCase()
    if (!q) return []
    const root = this.fsService.requireRoot()
    const results: SearchResult[] = []
    await this.walk(root, root, q, results)
    return results.slice(0, 200)
  }

  private async walk(
    root: string,
    dir: string,
    q: string,
    results: SearchResult[]
  ): Promise<void> {
    let entries
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await this.walk(root, full, q, results)
        continue
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue
      const name = noteDisplayName(entry.name)
      const matchesTitle = name.toLowerCase().includes(q)
      let content = ''
      try {
        content = await fs.promises.readFile(full, 'utf8')
      } catch {
        continue
      }
      const lower = content.toLowerCase()
      const matchesContent = lower.includes(q)
      if (!matchesTitle && !matchesContent) continue
      const stat = await fs.promises.stat(full)
      const idx = lower.indexOf(q)
      let snippet = ''
      if (idx >= 0) {
        const start = Math.max(0, idx - 40)
        const end = Math.min(content.length, idx + q.length + 60)
        snippet = (start > 0 ? '…' : '') + content.slice(start, end).replace(/\s+/g, ' ') + (end < content.length ? '…' : '')
      } else {
        snippet = content.slice(0, 80).replace(/\s+/g, ' ')
      }
      results.push({
        note: {
          id: toRelativeId(root, full),
          name,
          folderId: toRelativeId(root, path.dirname(full)),
          path: toRelativeId(root, full),
          mtime: stat.mtimeMs,
          size: stat.size
        },
        matchesTitle,
        matchesContent,
        snippet
      })
    }
  }
}
