import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { extractMarkdownPath } from '../electron/main/utils/openMarkdown'

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
