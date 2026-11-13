import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { buildViewerLaunchArgs } from './openMarkdown'

/**
 * 将主进程 userData 隔离到 viewer 子目录，避免改写主笔记库配置。
 * 会尽量复制主题等偏好，但清空 rootDirectory / 最近打开。
 */
export function isolateViewerUserData(mainUserData: string): string {
  const viewerData = path.join(mainUserData, 'viewer-sessions', `pid-${process.pid}`)
  fs.mkdirSync(viewerData, { recursive: true })
  const src = path.join(mainUserData, 'settings.json')
  const dst = path.join(viewerData, 'settings.json')
  try {
    if (fs.existsSync(src)) {
      const raw = JSON.parse(fs.readFileSync(src, 'utf8')) as Record<string, unknown>
      const cloned = {
        ...raw,
        rootDirectory: null,
        lastNoteId: null,
        lastFolderId: null,
        windowBounds: undefined
      }
      fs.writeFileSync(dst, JSON.stringify(cloned, null, 2), 'utf8')
    }
  } catch {
    // ignore — viewer 使用默认设置即可
  }
  app.setPath('userData', viewerData)
  return viewerData
}

/** 另开进程查看库外 Markdown（不改动主实例笔记库） */
export function spawnMarkdownViewer(mdPath: string): boolean {
  try {
    const args = buildViewerLaunchArgs(mdPath, { isPackaged: app.isPackaged })
    const child = spawn(process.execPath, args, {
      detached: true,
      stdio: 'ignore',
      cwd: process.cwd(),
      env: { ...process.env }
    })
    child.unref()
    return true
  } catch (err) {
    console.warn('[DataFutureX-Note] spawn viewer failed:', err)
    return false
  }
}
