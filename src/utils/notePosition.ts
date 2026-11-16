import type { NoteViewPosition } from '@/types'

const MAX_POSITIONS = 120

export function pruneNotePositions(
  map: Record<string, NoteViewPosition>
): Record<string, NoteViewPosition> {
  const entries = Object.entries(map || {})
  if (entries.length <= MAX_POSITIONS) return { ...map }
  entries.sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0))
  return Object.fromEntries(entries.slice(0, MAX_POSITIONS))
}

function isScrollable(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el)
  const oy = style.overflowY
  if (!(oy === 'auto' || oy === 'scroll' || oy === 'overlay')) return false
  return el.scrollHeight > el.clientHeight + 2
}

/** 在 root 内部找实际可滚动节点 */
export function findScrollElement(root: HTMLElement | null): HTMLElement | null {
  if (!root) return null
  const selectors = [
    '.cm-scroller',
    '.vditor-content',
    '.vditor-ir',
    '.vditor-reset',
    '.markdown-body',
    '.preview-pane',
    '.editor-pane'
  ]
  let fallback: HTMLElement | null = null
  for (const sel of selectors) {
    const el =
      (root.matches?.(sel) ? root : null) ||
      (root.querySelector(sel) as HTMLElement | null)
    if (!el) continue
    if (!fallback) fallback = el
    if (isScrollable(el)) return el
  }
  // 再扫一层常见滚动祖先
  const all = root.querySelectorAll<HTMLElement>('*')
  for (const el of Array.from(all)) {
    if (isScrollable(el)) return el
  }
  return fallback || (isScrollable(root) ? root : null)
}

/** 从起点向上找可滚动父级；找不到再向下找 */
export function findScrollParent(start: HTMLElement | null): HTMLElement | null {
  let cur: HTMLElement | null = start
  let best: HTMLElement | null = null
  while (cur) {
    if (isScrollable(cur)) return cur
    const style = window.getComputedStyle(cur)
    const oy = style.overflowY
    if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && !best) {
      best = cur
    }
    cur = cur.parentElement
  }
  return findScrollElement(start) || best
}

/** 解析笔记视图真实滚动容器（优先内部，再父级） */
export function resolveNoteScrollEl(root: HTMLElement | null): HTMLElement | null {
  if (!root) return null
  const inner = findScrollElement(root)
  if (inner && isScrollable(inner)) return inner
  const parent = findScrollParent(root.parentElement || root)
  if (parent && isScrollable(parent)) return parent
  return inner || parent || root
}

export function readScrollPosition(el: HTMLElement | null): Pick<NoteViewPosition, 'scrollTop' | 'scrollRatio'> {
  if (!el) return { scrollTop: 0, scrollRatio: 0 }
  const max = Math.max(0, el.scrollHeight - el.clientHeight)
  const scrollTop = el.scrollTop || 0
  return {
    scrollTop,
    scrollRatio: max > 0 ? Math.min(1, Math.max(0, scrollTop / max)) : 0
  }
}

export function applyScrollPosition(
  el: HTMLElement | null,
  pos: Pick<NoteViewPosition, 'scrollTop' | 'scrollRatio'> | null | undefined
): boolean {
  if (!el || !pos) return false
  const max = Math.max(0, el.scrollHeight - el.clientHeight)
  if (max <= 0) return false
  const byRatio =
    typeof pos.scrollRatio === 'number' ? pos.scrollRatio * max : Number.NaN
  const target = Number.isFinite(byRatio) ? byRatio : pos.scrollTop || 0
  el.scrollTop = Math.min(max, Math.max(0, target))
  return Math.abs(el.scrollTop - target) < 4 || el.scrollTop > 0
}
