import { describe, expect, it } from 'vitest'
import { formatRelativeMtime } from '../src/utils/relativeTime'

describe('formatRelativeMtime', () => {
  const now = new Date('2026-11-13T12:00:00').getTime()

  it('1天内显示小时前或刚刚', () => {
    expect(formatRelativeMtime(now - 30_000, now)).toBe('刚刚')
    expect(formatRelativeMtime(now - 2 * 3600_000, now)).toBe('2小时前')
    expect(formatRelativeMtime(now - 23 * 3600_000, now)).toBe('23小时前')
  })

  it('7天内显示天前', () => {
    expect(formatRelativeMtime(now - 1 * 86400_000, now)).toBe('1天前')
    expect(formatRelativeMtime(now - 6 * 86400_000, now)).toBe('6天前')
  })

  it('超过7天显示月日', () => {
    expect(formatRelativeMtime(now - 10 * 86400_000, now)).toBe('11月3日')
  })

  it('超过约1个月显示几个月前', () => {
    expect(formatRelativeMtime(now - 45 * 86400_000, now)).toBe('1个月前')
    expect(formatRelativeMtime(now - 95 * 86400_000, now)).toBe('3个月前')
  })
})
