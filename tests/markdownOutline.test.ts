import { describe, expect, it } from 'vitest'
import { buildChapterTree, extractChapters } from '../src/utils/markdownOutline'
import { sanitizeNoteTitle, titleFromFirstLine } from '../src/utils/noteTitle'

describe('markdownOutline', () => {
  it('extracts headings and ignores fenced code', () => {
    const md = `# 总览

简介

## 安装

\`\`\`bash
# not a heading
echo hi
\`\`\`

### 细节

## 使用
`
    const chapters = extractChapters(md)
    expect(chapters.map((c) => c.text)).toEqual(['总览', '安装', '细节', '使用'])
    expect(chapters.map((c) => c.level)).toEqual([1, 2, 3, 2])
  })

  it('builds nested chapter tree', () => {
    const chapters = extractChapters(`# A\n\n## B\n\n### C\n\n## D\n\n# E\n`)
    const tree = buildChapterTree(chapters)
    expect(tree).toHaveLength(2)
    expect(tree[0].text).toBe('A')
    expect(tree[0].children.map((c) => c.text)).toEqual(['B', 'D'])
    expect(tree[0].children[0].children[0].text).toBe('C')
    expect(tree[1].text).toBe('E')
  })
})

describe('noteTitle', () => {
  it('uses first heading line as title', () => {
    expect(titleFromFirstLine('# 我的笔记\n\n正文')).toBe('我的笔记')
  })

  it('skips blank and code fence lines', () => {
    expect(titleFromFirstLine('\n\n```\n# x\n```\n第一行标题\n')).toBe('第一行标题')
  })

  it('sanitizes illegal filename characters', () => {
    expect(sanitizeNoteTitle('a:b/c*d?')).toBe('a b c d')
  })
})
