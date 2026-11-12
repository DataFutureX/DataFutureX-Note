/** 从 Markdown 正文取第一行有效文字作为笔记标题 */
export function titleFromFirstLine(markdown: string): string | null {
  const lines = (markdown || '').split(/\r?\n/)
  let inFence = false
  for (const raw of lines) {
    const line = raw ?? ''
    const fence = line.trim().match(/^(`{3,}|~{3,})/)
    if (fence) {
      inFence = !inFence
      continue
    }
    if (inFence) continue

    let text = line.trim()
    if (!text) continue
    // 去掉 ATX 标题标记
    text = text.replace(/^#{1,6}\s+/, '').replace(/\s+#+\s*$/, '')
    // 去掉常见行内标记
    text = text
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_`~]/g, '')
      .trim()
    if (!text) continue
    return sanitizeNoteTitle(text)
  }
  return null
}

/** 清洗为可用作 Windows 文件名的标题（不含 .md） */
export function sanitizeNoteTitle(raw: string): string {
  let text = (raw || '').trim().slice(0, 80)
  text = text.replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim()
  text = text.replace(/[. ]+$/g, '')
  if (!text) return '未命名笔记'
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(text)) return `笔记-${text}`
  return text
}
