import type { MenuAction } from '@/components/AppMenuBar/AppMenuBar.vue'

const EVENT = 'dfx-menu-action'

export function emitMenuAction(action: MenuAction) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: action }))
}

export function onMenuAction(handler: (action: MenuAction) => void): () => void {
  const listener = (e: Event) => {
    handler((e as CustomEvent<MenuAction>).detail)
  }
  window.addEventListener(EVENT, listener)
  return () => window.removeEventListener(EVENT, listener)
}
