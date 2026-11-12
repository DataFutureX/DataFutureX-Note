/** 解析 Electron IPC / 业务错误为可读文案 */
export function ipcErrorMessage(err: unknown, fallback = '操作失败'): string {
  if (err == null) return fallback
  if (typeof err === 'string') {
    return parseInvokePayload(err) || err || fallback
  }
  if (typeof err === 'object') {
    const anyErr = err as { code?: string; message?: string }
    if (typeof anyErr.message === 'string' && anyErr.message) {
      const parsed = parseInvokePayload(anyErr.message)
      if (parsed) return parsed
      if (anyErr.message.includes('[object Object]')) {
        return anyErr.code ? `操作失败（${anyErr.code}）` : fallback
      }
      return anyErr.message
    }
  }
  return fallback
}

function parseInvokePayload(message: string): string | null {
  const matched = message.match(/Error invoking remote method '[^']+':\s*([\s\S]+)$/)
  if (!matched) return null
  const payload = matched[1].trim()
  if (payload === '[object Object]') return null
  try {
    const parsed = JSON.parse(payload) as { message?: string; code?: string }
    if (parsed?.message) return parsed.message
  } catch {
    // 非 JSON，直接使用剩余文本
  }
  return payload
}
