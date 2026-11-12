import { net, protocol } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { assertInsideRoot } from './pathSafety'

/** 自定义协议：在 webSecurity 下安全加载笔记库内本地图片 */
export const ASSET_SCHEME = 'dfx-asset'

export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: ASSET_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
        bypassCSP: true
      }
    }
  ])
}

export function installAssetProtocol(getRoot: () => string | null): void {
  protocol.handle(ASSET_SCHEME, (request) => {
    try {
      const root = getRoot()
      if (!root) {
        return new Response('no library root', { status: 404 })
      }
      const url = new URL(request.url)
      // dfx-asset://local/folder/assets/a.png → /folder/assets/a.png
      const rel = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
      if (!rel || rel.includes('..')) {
        return new Response('invalid path', { status: 400 })
      }
      const abs = assertInsideRoot(root, path.resolve(root, rel))
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
        return new Response('not found', { status: 404 })
      }
      return net.fetch(pathToFileURL(abs).href)
    } catch {
      return new Response('forbidden', { status: 403 })
    }
  })
}

/** 将库内相对路径转为可在渲染进程加载的 URL */
export function toAssetUrl(relativePath: string): string {
  const cleaned = relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
  const encoded = cleaned
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/')
  return `${ASSET_SCHEME}://local/${encoded}`
}
