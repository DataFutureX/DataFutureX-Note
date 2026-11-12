<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js'
import 'highlight.js/styles/github.css'

const props = defineProps<{ content: string; noteDir?: string }>()
const html = ref('')

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
}

watch(() => [props.content, props.noteDir], () => void render(), { immediate: true })

onMounted(() => {
  // 外部链接走系统浏览器
  document.addEventListener('click', onClick)
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
  <div class="markdown-body" v-html="safeHtml" />
</template>
