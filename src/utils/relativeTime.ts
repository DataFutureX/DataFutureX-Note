/** 笔记修改时间的相对展示文案 */
export function formatRelativeMtime(mtime: number, now = Date.now()): string {
  if (!mtime || mtime <= 0) return ''
  const diff = Math.max(0, now - mtime)
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  const month = 30 * day

  // 1 天内：几小时前（不足 1 小时显示刚刚）
  if (diff < day) {
    if (diff < hour) return '刚刚'
    const hours = Math.floor(diff / hour)
    return `${hours}小时前`
  }

  // 7 天内：几天前
  if (diff < 7 * day) {
    const days = Math.floor(diff / day)
    return `${days}天前`
  }

  // 超过 7 天且未满约 1 个月：月日
  if (diff < month) {
    const d = new Date(mtime)
    return `${d.getMonth() + 1}月${d.getDate()}日`
  }

  // 超过约 1 个月：几个月前
  const months = Math.max(1, Math.floor(diff / month))
  return `${months}个月前`
}

/** 完整时间，用于悬停提示 */
export function formatAbsoluteMtime(mtime: number): string {
  if (!mtime || mtime <= 0) return ''
  const d = new Date(mtime)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
