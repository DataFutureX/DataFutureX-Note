import { Note, SortMode } from '../../../src/types'
import { FileSystemService } from './FileSystemService'
import { TrashService } from './TrashService'

export class NoteService {
  constructor(
    private fsService: FileSystemService,
    private trashService?: TrashService
  ) {}

  list(folderId: string, sort: SortMode): Promise<Note[]> {
    return this.fsService.listNotes(folderId, sort)
  }

  create(folderId: string, name: string): Promise<Note> {
    return this.fsService.createNote(folderId, name)
  }

  read(noteId: string): Promise<string> {
    return this.fsService.readNote(noteId)
  }

  save(noteId: string, content: string, expectedMtime?: number): Promise<{ mtime: number }> {
    return this.fsService.saveNote(noteId, content, expectedMtime)
  }

  rename(noteId: string, name: string): Promise<Note> {
    return this.fsService.renameNote(noteId, name)
  }

  async delete(noteId: string): Promise<void> {
    if (this.trashService) {
      await this.trashService.moveNoteToTrash(noteId)
      return
    }
    await this.fsService.deleteNote(noteId)
  }

  move(noteId: string, targetFolderId: string): Promise<Note> {
    return this.fsService.moveNote(noteId, targetFolderId)
  }

  copy(noteId: string): Promise<Note> {
    return this.fsService.copyNote(noteId)
  }
}
