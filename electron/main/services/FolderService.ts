import { FolderNode, SortMode } from '../../../src/types'
import { FileSystemService } from './FileSystemService'
import { TrashService } from './TrashService'

export class FolderService {
  constructor(
    private fsService: FileSystemService,
    private trashService?: TrashService
  ) {}

  getTree(sort: SortMode = 'name-asc'): Promise<FolderNode[]> {
    return this.fsService.scanFolderTree(sort)
  }

  create(parentId: string, name: string): Promise<FolderNode> {
    return this.fsService.createFolder(parentId, name)
  }

  rename(folderId: string, name: string): Promise<FolderNode> {
    return this.fsService.renameFolder(folderId, name)
  }

  move(folderId: string, targetParentId: string): Promise<FolderNode> {
    return this.fsService.moveFolder(folderId, targetParentId)
  }

  async delete(folderId: string): Promise<void> {
    if (this.trashService) {
      await this.trashService.moveFolderToTrash(folderId)
      return
    }
    await this.fsService.deleteFolder(folderId)
  }
}
