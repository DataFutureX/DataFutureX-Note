import { describe, expect, it } from 'vitest'
import path from 'node:path'
import {
  assertInsideRoot,
  normalizePath,
  toRelativeId,
  validateFileName
} from '../electron/main/utils/pathSafety'

describe('pathSafety', () => {
  const root = path.resolve('D:/DataFutureX/Notes')

  it('blocks path traversal outside root', () => {
    expect(() => assertInsideRoot(root, path.join(root, '..', 'secret'))).toThrow()
  })

  it('allows paths inside root', () => {
    const inside = path.join(root, '技术文档', 'a.md')
    expect(assertInsideRoot(root, inside)).toBe(path.resolve(inside))
  })

  it('validates windows filenames', () => {
    expect(validateFileName('你好')).toBe('你好.md')
    expect(() => validateFileName('a:b')).toThrow()
    expect(() => validateFileName('CON')).toThrow()
  })

  it('normalizes relative ids', () => {
    const abs = path.join(root, '工作记录', '会议.md')
    expect(toRelativeId(root, abs)).toBe(normalizePath('工作记录/会议.md'))
  })
})
