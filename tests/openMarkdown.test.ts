import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  VIEWER_FLAG,
  buildViewerLaunchArgs,
  extractMarkdownPath,
  isMarkdownInLibrary,
  isViewerMode
} from '../electron/main/utils/openMarkdown'

describe('extractMarkdownPath', () => {
  const tmpFiles: string[] = []

  afterEach(() => {
    for (const f of tmpFiles) {
      try {
        fs.unlinkSync(f)
      } catch {
        // ignore
      }
    }
    tmpFiles.length = 0
  })

  it('从 argv 中识别 md 文件', () => {
    const file = path.join(os.tmpdir(), `dfx-open-${Date.now()}.md`)
    fs.writeFileSync(file, '# hi\n', 'utf8')
    tmpFiles.push(file)
    expect(extractMarkdownPath(['electron.exe', '.', file])).toBe(path.resolve(file))
  })

  it('忽略非 md 与不存在的路径', () => {
    expect(extractMarkdownPath(['electron.exe', 'D:\\a.txt', '--inspect'])).toBeNull()
  })
})

describe('viewer mode helpers', () => {
  it('识别 --dfx-viewer', () => {
    expect(isViewerMode(['exe', VIEWER_FLAG, 'a.md'])).toBe(true)
    expect(isViewerMode(['exe', 'a.md'])).toBe(false)
  })

  it('判断文件是否在笔记库内', () => {
    const root = path.join('D:', 'Notes')
    const inside = path.join(root, 'a', 'b.md')
    const outside = path.join('D:', 'Other', 'c.md')
    expect(isMarkdownInLibrary(inside, root)).toBe(true)
    expect(isMarkdownInLibrary(outside, root)).toBe(false)
    expect(isMarkdownInLibrary(inside, null)).toBe(false)
  })

  it('构造打包态查看进程参数', () => {
    const md = path.resolve('D:\\tmp\\x.md')
    expect(buildViewerLaunchArgs(md, { isPackaged: true, argv: ['app.exe'] })).toEqual([
      VIEWER_FLAG,
      md
    ])
  })

  it('构造开发态查看进程参数（保留入口脚本）', () => {
    const md = path.resolve('D:\\tmp\\y.md')
    const entry = path.join('dist-electron', 'main', 'index.js')
    expect(
      buildViewerLaunchArgs(md, { isPackaged: false, argv: ['electron.exe', entry] })
    ).toEqual([entry, VIEWER_FLAG, md])
  })
})
