import fs from 'node:fs'
import path from 'node:path'
import { BrowserWindow } from 'electron'
import MarkdownIt from 'markdown-it'
import { ExportOptions, ExportResult } from '../../../src/types'
import { FileSystemService } from './FileSystemService'
import { assertInsideRoot, noteDisplayName } from '../utils/pathSafety'

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export class PdfExportService {
  constructor(private fsService: FileSystemService) {}

  async export(
    noteId: string,
    savePath: string,
    options: ExportOptions = {},
    parentWin: BrowserWindow | null
  ): Promise<ExportResult> {
    const content = await this.fsService.readNote(noteId)
    const notePath = this.fsService.resolveId(noteId)
    const noteDir = path.dirname(notePath)
    const root = this.fsService.requireRoot()
    const title = noteDisplayName(path.basename(notePath))

    let htmlBody = md.render(content)
    // 将相对图片转为 file://，并限制在根目录内
    htmlBody = htmlBody.replace(/<img\s+[^>]*src="([^"]+)"[^>]*>/gi, (full, src: string) => {
      if (/^https?:/i.test(src) || src.startsWith('data:')) return full
      try {
        const abs = assertInsideRoot(root, path.resolve(noteDir, src))
        const fileUrl = 'file:///' + abs.replace(/\\/g, '/')
        return full.replace(src, fileUrl)
      } catch {
        return `<p>[图片无法显示: ${escapeHtml(src)}]</p>`
      }
    })

    const marginCm = options.marginsCm ?? 2.54
    // Electron printToPDF 边距单位为英寸
    const marginIn = marginCm / 2.54
    const printHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A4; margin: ${marginCm}cm; }
  body {
    font-family: "Microsoft YaHei", "SimSun", sans-serif;
    font-size: 12pt;
    line-height: 1.7;
    color: #222;
  }
  h1 { font-size: 16pt; margin: 1.2em 0 0.6em; }
  h2 { font-size: 14pt; margin: 1.1em 0 0.5em; }
  h3 { font-size: 12pt; margin: 1em 0 0.4em; }
  h4,h5,h6 { font-size: 12pt; }
  pre, code { font-family: Consolas, "Courier New", monospace; font-size: 10pt; }
  pre {
    background: #f5f5f5;
    padding: 12px;
    border-radius: 4px;
    white-space: pre-wrap;
    word-break: break-word;
    page-break-inside: avoid;
  }
  code { background: #f0f0f0; padding: 1px 4px; border-radius: 2px; }
  blockquote {
    border-left: 4px solid #ccc;
    margin: 0.8em 0;
    padding: 0.2em 0 0.2em 1em;
    color: #555;
  }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; page-break-inside: avoid; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
  th { background: #f7f7f7; }
  img { max-width: 100%; height: auto; }
  a { color: #0563c1; }
  hr { border: none; border-top: 1px solid #ddd; margin: 1.5em 0; }
</style>
</head>
<body>
${htmlBody}
</body>
</html>`

    const win = new BrowserWindow({
      show: false,
      parent: parentWin ?? undefined,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: false
      }
    })

    try {
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(printHtml)}`)
      await new Promise((r) => setTimeout(r, 400))
      const pdf = await win.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        // Electron 44+：边距单位为英寸，不再支持 marginType
        margins: {
          top: marginIn,
          bottom: marginIn,
          left: marginIn,
          right: marginIn
        },
        displayHeaderFooter: options.includeFooter !== false,
        headerTemplate: options.includeHeader
          ? `<div style="font-size:8pt;width:100%;text-align:center;color:#888;">${escapeHtml(title)}</div>`
          : '<span></span>',
        footerTemplate:
          options.includeFooter !== false
            ? `<div style="font-size:8pt;width:100%;text-align:center;color:#888;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`
            : '<span></span>'
      })
      await fs.promises.writeFile(savePath, pdf)
      return { path: savePath, format: 'pdf' }
    } finally {
      win.destroy()
    }
  }
}
