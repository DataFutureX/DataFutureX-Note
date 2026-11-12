import { describe, expect, it } from 'vitest'
import { FileSystemService } from '../electron/main/services/FileSystemService'
import type { Note } from '../src/types'

describe('note sorting', () => {
  const service = new FileSystemService(() => 'D:/tmp')

  const notes: Note[] = [
    { id: 'a.md', name: 'Beta', folderId: '.', path: 'a.md', mtime: 100, size: 1 },
    { id: 'b.md', name: 'Alpha', folderId: '.', path: 'b.md', mtime: 200, size: 1 },
    { id: 'c.md', name: 'Alpha', folderId: '.', path: 'c.md', mtime: 150, size: 1 }
  ]

  it('sorts by mtime desc with name tie-break', () => {
    const sorted = service.sortNotes(notes, 'mtime-desc')
    expect(sorted.map((n) => n.id)).toEqual(['b.md', 'c.md', 'a.md'])
  })

  it('sorts by name asc with mtime tie-break', () => {
    const sorted = service.sortNotes(notes, 'name-asc')
    expect(sorted[0].name).toBe('Alpha')
    expect(sorted[0].mtime).toBe(200)
  })
})
