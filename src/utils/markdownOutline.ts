import type { ChapterHeading } from '@/types'

export interface ChapterNode extends ChapterHeading {
  children: ChapterNode[]
}

/** 从 Markdown 正文提取标题章节（忽略代码块内的 #） */
export function extractChapters(markdown: string): ChapterHeading[] {
  const lines = (markdown || '').split(/\r?\n/)
  const chapters: ChapterHeading[] = []
  let inFence = false
  const used = new Map<string, number>()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fence = line.trim().match(/^(`{3,}|~{3,})/)
    if (fence) {
      inFence = !inFence
      continue
    }
    if (inFence) continue

    const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (!match) continue
    const level = match[1].length
    const text = match[2]
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_`~]/g, '')
      .trim()
    if (!text) continue
    const base = slugify(text)
    const count = (used.get(base) || 0) + 1
    used.set(base, count)
    const id = count === 1 ? base : `${base}-${count}`
    chapters.push({ id, level, text, line: i + 1 })
  }
  return chapters
}

/** 按标题层级组装为树 */
export function buildChapterTree(chapters: ChapterHeading[]): ChapterNode[] {
  const roots: ChapterNode[] = []
  const stack: ChapterNode[] = []
  for (const ch of chapters) {
    const node: ChapterNode = { ...ch, children: [] }
    while (stack.length && stack[stack.length - 1].level >= ch.level) {
      stack.pop()
    }
    if (!stack.length) roots.push(node)
    else stack[stack.length - 1].children.push(node)
    stack.push(node)
  }
  return roots
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w\u4e00-\u9fff-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'heading'
  )
}
