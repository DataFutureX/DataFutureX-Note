/** 生成截图文件名：screenshot-20261112-183045.png */
export function screenshotFileName(ext = 'png'): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate()),
    '-',
    pad(d.getHours()),
    pad(d.getMinutes()),
    pad(d.getSeconds())
  ].join('')
  return `screenshot-${stamp}.${ext.replace(/^\./, '')}`
}

export async function fileToBase64(file: File | Blob): Promise<string> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** 从浏览器 ClipboardData 提取图片（粘贴截图/复制图片） */
export function imagesFromClipboardData(data: DataTransfer | null): File[] {
  if (!data) return []
  const files: File[] = []
  if (data.files?.length) {
    for (const file of Array.from(data.files)) {
      if (file.type.startsWith('image/')) files.push(file)
    }
  }
  if (files.length) return files
  for (const item of Array.from(data.items || [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const f = item.getAsFile()
      if (f) files.push(f)
    }
  }
  return files
}

/**
 * 将剪贴板图片保存到当前笔记 assets，返回可插入的 Markdown。
 * 优先使用事件里的图片文件；否则读 Electron 系统剪贴板。
 */
export async function saveClipboardImageAsMarkdown(
  noteId: string,
  clipboardData?: DataTransfer | null
): Promise<string | null> {
  const fromEvent = imagesFromClipboardData(clipboardData || null)
  if (fromEvent.length) {
    const parts: string[] = []
    for (const file of fromEvent) {
      const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
      const name = file.name?.includes('.') ? file.name : screenshotFileName(ext)
      const base64 = await fileToBase64(file)
      const saved = await window.noteAPI.saveNoteAsset(noteId, name, base64)
      parts.push(`![截图](${saved.relativePath})`)
    }
    return parts.length ? parts.join('\n') : null
  }

  const clip = await window.noteAPI.readClipboardImage()
  if (!clip) return null
  const saved = await window.noteAPI.saveNoteAsset(
    noteId,
    screenshotFileName(clip.ext),
    clip.base64
  )
  return `![截图](${saved.relativePath})`
}
