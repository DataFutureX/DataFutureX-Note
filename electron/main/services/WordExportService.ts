import fs from 'node:fs'
import path from 'node:path'
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  ExternalHyperlink,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from 'docx'
import MarkdownIt from 'markdown-it'
import { ExportOptions, ExportResult } from '../../../src/types'
import { FileSystemService } from './FileSystemService'
import { assertInsideRoot, noteDisplayName } from '../utils/pathSafety'

const md = new MarkdownIt({ html: false, linkify: true, breaks: false })

type Token = ReturnType<MarkdownIt['parse']>[number]

export class WordExportService {
  constructor(private fsService: FileSystemService) {}

  async export(noteId: string, savePath: string, options: ExportOptions = {}): Promise<ExportResult> {
    const content = await this.fsService.readNote(noteId)
    const notePath = this.fsService.resolveId(noteId)
    const noteDir = path.dirname(notePath)
    const tokens = md.parse(content, {})
    const children = await this.tokensToBlocks(tokens, noteDir)

    const margin = Math.round(((options.marginsCm ?? 2.54) / 2.54) * 1440)

    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              margin: { top: margin, bottom: margin, left: margin, right: margin }
            }
          },
          children: children.length
            ? children
            : [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: noteDisplayName(path.basename(notePath)),
                      font: 'Microsoft YaHei'
                    })
                  ]
                })
              ]
        }
      ]
    })

    const buffer = await Packer.toBuffer(doc)
    await fs.promises.writeFile(savePath, buffer)
    return { path: savePath, format: 'docx' }
  }

  private async tokensToBlocks(tokens: Token[], noteDir: string): Promise<(Paragraph | Table)[]> {
    const blocks: (Paragraph | Table)[] = []
    let i = 0
    while (i < tokens.length) {
      const token = tokens[i]
      if (token.type === 'heading_open') {
        const inline = tokens[i + 1]
        const level = Number(token.tag.replace('h', '')) as 1 | 2 | 3 | 4 | 5 | 6
        const headingMap: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
          1: HeadingLevel.HEADING_1,
          2: HeadingLevel.HEADING_2,
          3: HeadingLevel.HEADING_3,
          4: HeadingLevel.HEADING_4,
          5: HeadingLevel.HEADING_5,
          6: HeadingLevel.HEADING_6
        }
        blocks.push(
          new Paragraph({
            heading: headingMap[level] || HeadingLevel.HEADING_1,
            children: this.inlineToRuns(inline)
          })
        )
        i += 3
        continue
      }
      if (token.type === 'paragraph_open') {
        const inline = tokens[i + 1]
        const imagePara = await this.tryImageParagraph(inline, noteDir)
        if (imagePara) {
          blocks.push(imagePara)
        } else {
          blocks.push(new Paragraph({ children: this.inlineToRuns(inline) }))
        }
        i += 3
        continue
      }
      if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
        const ordered = token.type === 'ordered_list_open'
        i += 1
        let idx = 1
        while (i < tokens.length && tokens[i].type !== 'bullet_list_close' && tokens[i].type !== 'ordered_list_close') {
          if (tokens[i].type === 'list_item_open') {
            i += 1
            while (i < tokens.length && tokens[i].type !== 'list_item_close') {
              if (tokens[i].type === 'paragraph_open') {
                const inline = tokens[i + 1]
                blocks.push(
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: ordered ? `${idx}. ` : '• ',
                        font: 'Microsoft YaHei'
                      }),
                      ...this.inlineToRuns(inline)
                    ]
                  })
                )
                i += 3
              } else {
                i += 1
              }
            }
            idx += 1
            i += 1
          } else {
            i += 1
          }
        }
        i += 1
        continue
      }
      if (token.type === 'blockquote_open') {
        i += 1
        while (i < tokens.length && tokens[i].type !== 'blockquote_close') {
          if (tokens[i].type === 'paragraph_open') {
            const inline = tokens[i + 1]
            blocks.push(
              new Paragraph({
                children: [
                  new TextRun({ text: '│ ', color: '888888', font: 'Microsoft YaHei' }),
                  ...this.inlineToRuns(inline, { italics: true, color: '555555' })
                ]
              })
            )
            i += 3
          } else {
            i += 1
          }
        }
        i += 1
        continue
      }
      if (token.type === 'fence' || token.type === 'code_block') {
        const lines = (token.content || '').replace(/\n$/, '').split('\n')
        for (const line of lines) {
          blocks.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: line || ' ',
                  font: 'Consolas',
                  size: 20
                })
              ],
              shading: { type: 'clear', fill: 'F5F5F5' }
            })
          )
        }
        i += 1
        continue
      }
      if (token.type === 'hr') {
        blocks.push(
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC' } },
            children: []
          })
        )
        i += 1
        continue
      }
      if (token.type === 'table_open') {
        const { table, nextIndex } = this.parseTable(tokens, i)
        blocks.push(table)
        i = nextIndex
        continue
      }
      i += 1
    }
    return blocks
  }

  private inlineToRuns(
    inline: Token | undefined,
    base: { italics?: boolean; color?: string } = {}
  ): (TextRun | ExternalHyperlink)[] {
    if (!inline || inline.type !== 'inline') {
      return [new TextRun({ text: '', font: 'Microsoft YaHei' })]
    }
    const runs: (TextRun | ExternalHyperlink)[] = []
    const children = inline.children || []
    let bold = false
    let italic = !!base.italics
    let strike = false
    let code = false
    let linkHref: string | null = null

    const pushText = (text: string) => {
      const run = new TextRun({
        text,
        bold,
        italics: italic,
        strike,
        font: code ? 'Consolas' : 'Microsoft YaHei',
        size: code ? 20 : 24,
        color: base.color,
        shading: code ? { type: 'clear', fill: 'F0F0F0' } : undefined
      })
      if (linkHref) {
        runs.push(
          new ExternalHyperlink({
            children: [
              new TextRun({
                text,
                bold,
                italics: italic,
                strike,
                font: 'Microsoft YaHei',
                color: '0563C1',
                underline: {}
              })
            ],
            link: linkHref
          })
        )
      } else {
        runs.push(run)
      }
    }

    for (const child of children) {
      if (child.type === 'text') pushText(child.content)
      else if (child.type === 'code_inline') {
        code = true
        pushText(child.content)
        code = false
      } else if (child.type === 'softbreak' || child.type === 'hardbreak') pushText('\n')
      else if (child.type === 'strong_open') bold = true
      else if (child.type === 'strong_close') bold = false
      else if (child.type === 'em_open') italic = true
      else if (child.type === 'em_close') italic = !!base.italics
      else if (child.type === 's_open') strike = true
      else if (child.type === 's_close') strike = false
      else if (child.type === 'link_open') linkHref = child.attrGet('href')
      else if (child.type === 'link_close') linkHref = null
      else if (child.type === 'image') pushText(`[图片: ${child.content || child.attrGet('alt') || ''}]`)
    }
    if (!runs.length) runs.push(new TextRun({ text: '', font: 'Microsoft YaHei' }))
    return runs
  }

  private async tryImageParagraph(inline: Token | undefined, noteDir: string): Promise<Paragraph | null> {
    if (!inline || inline.type !== 'inline') return null
    const img = (inline.children || []).find((c) => c.type === 'image')
    if (!img) return null
    const src = img.attrGet('src')
    if (!src || src.startsWith('http')) return null
    const abs = path.resolve(noteDir, src)
    try {
      const root = this.fsService.requireRoot()
      assertInsideRoot(root, abs)
      const data = await fs.promises.readFile(abs)
      const ext = path.extname(abs).toLowerCase()
      const type = ext === '.png' ? 'png' : ext === '.jpg' || ext === '.jpeg' ? 'jpg' : ext === '.gif' ? 'gif' : 'png'
      return new Paragraph({
        children: [
          new ImageRun({
            type,
            data,
            transformation: { width: 500, height: 300 },
            altText: { title: img.content || 'image', description: img.content || 'image', name: img.content || 'image' }
          })
        ]
      })
    } catch {
      return new Paragraph({
        children: [new TextRun({ text: `[图片无法嵌入: ${src}]`, font: 'Microsoft YaHei', color: '999999' })]
      })
    }
  }

  private parseTable(tokens: Token[], start: number): { table: Table; nextIndex: number } {
    const rows: TableRow[] = []
    let i = start + 1
    let isHeader = false
    while (i < tokens.length && tokens[i].type !== 'table_close') {
      if (tokens[i].type === 'thead_open') {
        isHeader = true
        i += 1
        continue
      }
      if (tokens[i].type === 'thead_close') {
        isHeader = false
        i += 1
        continue
      }
      if (tokens[i].type === 'tr_open') {
        const cells: TableCell[] = []
        i += 1
        while (i < tokens.length && tokens[i].type !== 'tr_close') {
          if (tokens[i].type === 'th_open' || tokens[i].type === 'td_open') {
            const inline = tokens[i + 1]
            const text =
              inline?.type === 'inline'
                ? (inline.children || []).map((c) => (c.type === 'text' || c.type === 'code_inline' ? c.content : '')).join('')
                : ''
            cells.push(
              new TableCell({
                width: { size: 2000, type: WidthType.DXA },
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
                  bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
                  left: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
                  right: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }
                },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text,
                        bold: isHeader || tokens[i].type === 'th_open',
                        font: 'Microsoft YaHei',
                        size: 22
                      })
                    ]
                  })
                ]
              })
            )
            i += 3
          } else {
            i += 1
          }
        }
        rows.push(new TableRow({ children: cells }))
        i += 1
        continue
      }
      i += 1
    }
    return {
      table: new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows
      }),
      nextIndex: i + 1
    }
  }
}
