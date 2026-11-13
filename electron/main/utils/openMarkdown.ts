import fs from 'node:fs'
import path from 'node:path'
import type { SettingsService } from '../services/SettingsService'
import { toRelativeId } from './pathSafety'

export interface OpenMarkdownRequest {
  filePath: string
  rootDirectory: string
  noteId: string
  folderId: string
  hideFolder: true
}

function isPathInside(child: string, parent: string): boolean {
  const c = path.resolve(child)
  const p = path.resolve(parent)
  const pSep = p.endsWith(path.sep) ? p : p + path.sep
  return c === p || c.startsWith(pSep)
}

/** 从命令行参数中提取要打开的 Markdown 绝对路径 */
export function extractMarkdownPath(argv: string[]): string | null {
  for (const raw of argv) {
    if (!raw || raw.startsWith('-')) continue
    let p = raw.trim().replace(/^["']+|["']+$/g, '')
    if (!p) continue
    // 跳过可执行文件 / 入口脚本
    if (/\.(exe|js|mjs|cjs|asar)$/i.test(p) && !/\.(md|markdown)$/i.test(p)) continue
    try {
      const abs = path.resolve(p)
      if (!/\.(md|markdown)$/i.test(abs)) continue
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue
      return abs
    } catch {
      // ignore
    }
  }
  return null
}

function folderIdFromNoteId(noteId: string): string {
  const normalized = noteId.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/')
  if (idx <= 0) return '.'
  return normalized.slice(0, idx) || '.'
}

/**
 * 准备用本程序打开外部 MD：
 * - 若文件已在当前笔记库内，保留库根，直接打开相对路径
 * - 否则以文件所在目录为临时笔记库根
 * - 默认隐藏目录栏
 */
export async function prepareOpenMarkdown(
  absFilePath: string,
  settings: SettingsService
): Promise<OpenMarkdownRequest> {
  const filePath = path.resolve(absFilePath)
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw Object.assign(new Error('文件不存在'), { code: 'FILE_NOT_FOUND' })
  }
  if (!/\.(md|markdown)$/i.test(filePath)) {
    throw Object.assign(new Error('仅支持 Markdown 文件'), { code: 'INVALID_FILE' })
  }

  const currentRoot = settings.getRootDirectory()
  let rootDirectory: string
  let noteId: string

  if (currentRoot && isPathInside(filePath, currentRoot)) {
    rootDirectory = path.resolve(currentRoot)
    noteId = toRelativeId(rootDirectory, filePath)
  } else {
    rootDirectory = path.dirname(filePath)
    noteId = toRelativeId(rootDirectory, filePath)
    await settings.setRootDirectory(rootDirectory)
  }

  const folderId = folderIdFromNoteId(noteId)
  const prev = settings.get()
  await settings.update({
    lastNoteId: noteId,
    lastFolderId: folderId,
    panelLayout: {
      ...prev.panelLayout,
      folderCollapsed: true
    }
  })

  return {
    filePath,
    rootDirectory,
    noteId,
    folderId,
    hideFolder: true
  }
}
