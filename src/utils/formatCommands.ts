import type { FormatCommand } from '@/components/EditorToolbar/EditorToolbar.vue'

export type FormatTarget = {
  getSelection: () => string
  wrap: (before: string, after?: string) => void
  prefixLines: (prefix: string) => void
  /** 设置/切换标题级别（1-5），会替换已有 # 前缀 */
  setHeading?: (level: number) => void
  insert: (text: string) => void
  pasteClipboardImage?: () => boolean | Promise<boolean>
  undo?: () => void
  redo?: () => void
  focus?: () => void
}

const TABLE_SNIPPET = `| 列1 | 列2 | 列3 |
| --- | --- | --- |
|  |  |  |
`

export function applyFormatCommand(target: FormatTarget, cmd: FormatCommand) {
  target.focus?.()
  switch (cmd) {
    case 'heading1':
    case 'heading2':
    case 'heading3':
    case 'heading4':
    case 'heading5': {
      const level = Number(cmd.replace('heading', ''))
      if (target.setHeading) target.setHeading(level)
      else target.prefixLines(`${'#'.repeat(level)} `)
      break
    }
    case 'bold':
      target.wrap('**')
      break
    case 'italic':
      target.wrap('*')
      break
    case 'strike':
      target.wrap('~~')
      break
    case 'inlineCode':
      target.wrap('`')
      break
    case 'codeBlock':
      target.wrap('\n```\n', '\n```\n')
      break
    case 'link': {
      const sel = target.getSelection()
      if (sel) target.wrap('[', '](url)')
      else target.insert('[链接文字](url)')
      break
    }
    case 'image':
      target.insert('![图片描述](./assets/image.png)')
      break
    case 'ul':
      target.prefixLines('- ')
      break
    case 'ol':
      target.prefixLines('1. ')
      break
    case 'quote':
      target.prefixLines('> ')
      break
    case 'table':
      target.insert(TABLE_SNIPPET)
      break
    case 'hr':
      target.insert('\n---\n')
      break
    case 'undo':
      target.undo?.()
      break
    case 'redo':
      target.redo?.()
      break
    default:
      break
  }
}
