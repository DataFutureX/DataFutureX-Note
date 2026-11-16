<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js'
import 'highlight.js/styles/github.css'
import { useSettingsStore } from '@/stores/settings'
import { applyScrollPosition, readScrollPosition, resolveNoteScrollEl } from '@/utils/notePosition'

const props = defineProps<{ content: string; noteDir?: string; noteId?: string | null }>()
const html = ref('')
const rootEl = ref<HTMLElement | null>(null)
const settingsStore = useSettingsStore()

let boundScrollEl: HTMLElement | null = null
let positionSaveTimer: ReturnType<typeof setTimeout> | null = null
let restoringPosition = false
let trackedNoteId: string | null = null

const md: MarkdownIt = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  highlight(str: string, lang: string): string {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang, ignoreIllegals: true }).value}</code></pre>`
      } catch {
        // fallthrough
      }
    }
    const escaped = str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    return `<pre class="hljs"><code>${escaped}</code></pre>`
  }
})

function saveCurrentPosition(opts?: { flush?: boolean }) {
  const noteId = trackedNoteId || props.noteId || null
  if (!noteId || restoringPosition) return
  const el = resolveNoteScrollEl(rootEl.value)
  if (!el) return
  boundScrollEl = el
  settingsStore.rememberNotePosition(noteId, readScrollPosition(el), opts)
}

function scheduleSavePosition() {
  if (positionSaveTimer) clearTimeout(positionSaveTimer)
  positionSaveTimer = setTimeout(() => {
    positionSaveTimer = null
    saveCurrentPosition()
  }, 250)
}

function onScrollCapture() {
  if (restoringPosition) return
  scheduleSavePosition()
}

function bindScrollListener() {
  const el = resolveNoteScrollEl(rootEl.value)
  if (!el) return
  if (boundScrollEl === el) return
  boundScrollEl?.removeEventListener('scroll', onScrollCapture)
  boundScrollEl = el
  boundScrollEl.addEventListener('scroll', onScrollCapture, { passive: true })
}

function restorePositionForNote(noteId: string | null | undefined) {
  if (!noteId) return
  const pos = settingsStore.getNotePosition(noteId)
  if (!pos) return
  if (!(pos.scrollTop > 0 || pos.scrollRatio > 0)) return
  restoringPosition = true
  const tryRestore = (attempt: number) => {
    bindScrollListener()
    const el = resolveNoteScrollEl(rootEl.value)
    const ok = applyScrollPosition(el, pos)
    if (!ok && attempt < 12) {
      window.setTimeout(() => tryRestore(attempt + 1), 50 + attempt * 40)
    } else if (attempt < 6) {
      window.setTimeout(() => tryRestore(attempt + 1), 80)
    } else {
      restoringPosition = false
    }
  }
  void nextTick(() => tryRestore(0))
}

async function render() {
  let rendered = md.render(props.content || '')
  // 处理相对图片路径
  const imgRegex = /<img\s+([^>]*?)src="([^"]+)"([^>]*)>/gi
  const matches = [...rendered.matchAll(imgRegex)]
  for (const match of matches) {
    const src = match[2]
    if (/^(https?:|data:|file:|dfx-asset:|blob:)/i.test(src)) continue
    if (!props.noteDir) continue
    const relative = props.noteDir === '.' ? src.replace(/^\.\//, '') : `${props.noteDir}/${src.replace(/^\.\//, '')}`
    try {
      const url = await window.noteAPI.getLocalFileUrl(relative.replace(/\\/g, '/'))
      if (url) {
        rendered = rendered.replace(match[0], `<img ${match[1]}src="${url}"${match[3]}>`)
      }
    } catch {
      // keep original
    }
  }
  html.value = DOMPurify.sanitize(rendered, {
    ADD_ATTR: ['target', 'rel']
  })
  restorePositionForNote(props.noteId)
}

watch(() => [props.content, props.noteDir], () => void render(), { immediate: true })

watch(
  () => props.noteId,
  (next, prev) => {
    if (prev && prev !== next) saveCurrentPosition({ flush: true })
    trackedNoteId = next || null
    restorePositionForNote(next)
  }
)

onMounted(() => {
  trackedNoteId = props.noteId || null
  document.addEventListener('click', onClick)
  void nextTick(() => {
    bindScrollListener()
    restorePositionForNote(props.noteId)
  })
})

onBeforeUnmount(() => {
  saveCurrentPosition({ flush: true })
  document.removeEventListener('click', onClick)
  boundScrollEl?.removeEventListener('scroll', onScrollCapture)
  boundScrollEl = null
  if (positionSaveTimer) clearTimeout(positionSaveTimer)
})

function onClick(e: MouseEvent) {
  const target = e.target as HTMLElement | null
  const a = target?.closest?.('a') as HTMLAnchorElement | null
  if (!a) return
  const href = a.getAttribute('href')
  if (href && /^https?:/i.test(href)) {
    e.preventDefault()
    void window.noteAPI.openExternal(href)
  }
}

const safeHtml = computed(() => html.value)
</script>

<template>
  <div ref="rootEl" class="markdown-body" v-html="safeHtml" />
</template>
