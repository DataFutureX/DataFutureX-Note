<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type VditorType from 'vditor'
import { useLibraryStore } from '@/stores/library'
import { useSettingsStore } from '@/stores/settings'
import {
  fileToBase64,
  saveClipboardImageAsMarkdown,
  screenshotFileName
} from '@/utils/clipboardImage'

const props = defineProps<{
  modelValue: string
  noteId?: string | null
  noteDir?: string
  readonly?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const host = ref<HTMLDivElement | null>(null)
const settingsStore = useSettingsStore()
const library = useLibraryStore()
let editor: VditorType | null = null
let VditorCtor: typeof VditorType | null = null
let applying = false
let ready = false
let lastJumpToken = 0

async function ensureVditor() {
  if (VditorCtor) return VditorCtor
  const mod = await import('vditor')
  await import('vditor/dist/index.css')
  VditorCtor = mod.default
  return VditorCtor
}

function jumpToHeading(line: number, text: string) {
  if (!host.value) return
  const headings = host.value.querySelectorAll('h1,h2,h3,h4,h5,h6')
  const targetText = text.trim()
  let matched: Element | null = null
  for (const el of Array.from(headings)) {
    if ((el.textContent || '').trim() === targetText) {
      matched = el
      break
    }
  }
  if (!matched && headings.length) {
    // 回退：按出现顺序接近行号不够稳，优先文本包含
    matched =
      Array.from(headings).find((el) => (el.textContent || '').includes(targetText)) || null
  }
  if (matched) {
    matched.scrollIntoView({ behavior: 'smooth', block: 'center' })
    matched.classList.add('dfx-jump-flash')
    window.setTimeout(() => matched?.classList.remove('dfx-jump-flash'), 1200)
    return
  }
  // 再回退：按 markdown 行估算滚动
  void line
}

function vditorCdn(): string {
  // 开发态走 Vite public；打包后相对 index.html 加载，保证离线可用
  return import.meta.env.DEV ? '/vditor' : './vditor'
}

const ABSOLUTE_SRC = /^(https?:|data:|blob:|file:|dfx-asset:)/i

async function resolveLocalImage(src: string): Promise<string> {
  if (!src || ABSOLUTE_SRC.test(src)) return src
  if (!props.noteDir) return src
  const cleaned = src.replace(/^\.\//, '')
  const relative = props.noteDir === '.' ? cleaned : `${props.noteDir}/${cleaned}`
  try {
    return (await window.noteAPI.getLocalFileUrl(relative.replace(/\\/g, '/'))) || src
  } catch {
    return src
  }
}

async function saveImageFiles(files: File[]): Promise<string | null> {
  if (!props.noteId || !files.length) return null
  const parts: string[] = []
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue
    const base64 = await fileToBase64(file)
    const name = file.name?.includes('.')
      ? file.name
      : screenshotFileName((file.type.split('/')[1] || 'png').replace('jpeg', 'jpg'))
    const saved = await window.noteAPI.saveNoteAsset(props.noteId, name, base64)
    const alt = name.replace(/\.[^.]+$/, '') || '图片'
    parts.push(`![${alt}](${saved.relativePath})`)
  }
  return parts.length ? parts.join('\n') : null
}

async function insertClipboardImage(clipboardData?: DataTransfer | null): Promise<boolean> {
  if (!props.noteId || props.readonly) return false
  try {
    const md = await saveClipboardImageAsMarkdown(props.noteId, clipboardData)
    if (!md || !editor) return false
    editor.insertValue(md.endsWith('\n') ? md : `${md}\n`)
    emit('update:modelValue', editor.getValue())
    scheduleRewriteImages()
    return true
  } catch (e) {
    console.error(e)
    return false
  }
}

function onPasteCapture(e: ClipboardEvent) {
  if (!props.noteId || props.readonly) return
  const data = e.clipboardData
  const hasImageInEvent =
    !!data?.items && Array.from(data.items).some((it) => it.type.startsWith('image/'))
  const plain = data?.getData('text/plain') || ''

  // Ctrl+V：优先贴图（截图常同时带空 HTML/文本，不能被文本分支抢走）
  e.preventDefault()
  e.stopPropagation()
  void (async () => {
    if (hasImageInEvent) {
      const ok = await insertClipboardImage(data)
      if (ok) return
    }
    // Win+Shift+S 等：事件里可能没有 image/*，需读系统剪贴板位图
    const fromSystem = await insertClipboardImage(null)
    if (fromSystem) return
    // 无图则按纯文本粘贴
    if (plain && editor) {
      editor.insertValue(plain)
      emit('update:modelValue', editor.getValue())
    }
  })()
}

async function createEditor() {
  if (!host.value) return
  host.value.removeEventListener('paste', onPasteCapture, true)
  editor?.destroy()
  editor = null
  ready = false
  host.value.innerHTML = ''

  const Vditor = await ensureVditor()
  if (!host.value) return
  const isDark = settingsStore.resolvedTheme === 'dark'

  editor = new Vditor(host.value, {
    cdn: vditorCdn(),
    value: props.modelValue || '',
    mode: 'ir',
    height: '100%',
    width: '100%',
    placeholder: '开始写作… 支持在预览中直接编辑（类 Typora）',
    theme: isDark ? 'dark' : 'classic',
    icon: 'ant',
    lang: 'zh_CN',
    // 使用内容区上方自定义工具栏，隐藏 Vditor 自带栏避免图标空白/重复
    toolbarConfig: { hide: true },
    cache: { enable: false },
    tab: '\t',
    undoDelay: 200,
    preview: {
      theme: { current: isDark ? 'dark' : 'light' },
      hljs: {
        style: isDark ? 'native' : 'github',
        lineNumber: false
      },
      markdown: {
        toc: true,
        mark: true,
        footnotes: true,
        autoSpace: true
      },
      actions: []
    },
    toolbar: [],
    counter: { enable: true, type: 'text' },
    outline: { enable: false, position: 'right' },
    hint: { emoji: {}, extend: [] },
    upload: {
      accept: 'image/*',
      multiple: true,
      fieldName: 'file',
      max: 12 * 1024 * 1024,
      handler(files) {
        void (async () => {
          try {
            const md = await saveImageFiles(files)
            if (md && editor) {
              editor.insertValue(md)
              scheduleRewriteImages()
            }
          } catch (e) {
            console.error(e)
          }
        })()
        return null
      }
    },
    after: () => {
      ready = true
      if (props.readonly) editor?.disabled()
      else editor?.enable()
      host.value?.addEventListener('paste', onPasteCapture, true)
      ensureImageObserver()
      scheduleRewriteImages()
    },
    input(value) {
      if (applying) return
      emit('update:modelValue', value)
      scheduleRewriteImages()
    },
    blur(value) {
      if (applying) return
      emit('update:modelValue', value)
    }
  })
}

async function rewriteImages() {
  if (!host.value || !props.noteDir) return
  const imgs = Array.from(host.value.querySelectorAll('.vditor-ir img, .vditor-reset img')) as HTMLImageElement[]
  await Promise.all(
    imgs.map(async (el) => {
      const original = (el.getAttribute('data-src') || '').trim()
      const current = (el.getAttribute('src') || '').trim()
      // 相对路径优先；file:// 在 webSecurity 下会裂图，需换 dfx-asset
      const candidate =
        (original && !ABSOLUTE_SRC.test(original) && original) ||
        (current && !ABSOLUTE_SRC.test(current) && current) ||
        ''
      if (!candidate) return
      const resolved = await resolveLocalImage(candidate)
      if (resolved && resolved !== current) {
        el.setAttribute('data-src', candidate)
        el.setAttribute('src', resolved)
      }
    })
  )
}

let imageObserver: MutationObserver | null = null
let rewriteTimer: ReturnType<typeof setTimeout> | null = null

function scheduleRewriteImages() {
  if (rewriteTimer) clearTimeout(rewriteTimer)
  rewriteTimer = setTimeout(() => {
    rewriteTimer = null
    void rewriteImages()
  }, 120)
}

function ensureImageObserver() {
  if (!host.value || imageObserver) return
  imageObserver = new MutationObserver(() => scheduleRewriteImages())
  imageObserver.observe(host.value, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src']
  })
}

onMounted(async () => {
  await nextTick()
  await createEditor()
})

watch(
  () => props.modelValue,
  (val) => {
    if (!editor || !ready) return
    if (val === editor.getValue()) return
    applying = true
    editor.setValue(val || '', true)
    applying = false
    scheduleRewriteImages()
  }
)

watch(
  () => settingsStore.resolvedTheme,
  (theme) => {
    if (!editor || !ready) {
      void createEditor()
      return
    }
    try {
      const vditorTheme = theme === 'dark' ? 'dark' : 'classic'
      const contentTheme = theme === 'dark' ? 'dark' : 'light'
      editor.setTheme(vditorTheme as 'dark' | 'classic', contentTheme, theme === 'dark' ? 'native' : 'github')
    } catch {
      void createEditor()
    }
  }
)

watch(
  () => props.readonly,
  (v) => {
    if (!editor || !ready) return
    if (v) editor.disabled()
    else editor.enable()
  }
)

watch(
  () => [props.noteDir, props.noteId],
  () => scheduleRewriteImages()
)

watch(
  () => library.jumpRequest,
  (req) => {
    if (!req || req.token === lastJumpToken) return
    lastJumpToken = req.token
    void nextTick(() => jumpToHeading(req.line, req.text))
  }
)

onBeforeUnmount(() => {
  host.value?.removeEventListener('paste', onPasteCapture, true)
  imageObserver?.disconnect()
  imageObserver = null
  if (rewriteTimer) clearTimeout(rewriteTimer)
  editor?.destroy()
  editor = null
})

function getInnerVditor() {
  return (editor as unknown as { vditor?: { undo?: { undo: (v: unknown) => void; redo: (v: unknown) => void } } })
    ?.vditor
}

defineExpose({
  focus: () => editor?.focus(),
  getValue: () => editor?.getValue() || '',
  getSelection: () => editor?.getSelection() || '',
  wrap: (before: string, after = before) => {
    if (!editor) return
    const sel = editor.getSelection()
    if (sel) editor.updateValue(before + sel + after)
    else editor.insertValue(before + after)
  },
  prefixLines: (prefix: string) => {
    if (!editor) return
    const sel = editor.getSelection()
    if (sel) {
      const next = sel
        .split(/\r?\n/)
        .map((line) => (line.startsWith(prefix) ? line.slice(prefix.length) : prefix + line))
        .join('\n')
      editor.updateValue(next)
    } else {
      editor.insertValue(prefix)
    }
  },
  setHeading: (level: number) => {
    if (!editor) return
    const marker = `${'#'.repeat(Math.min(6, Math.max(1, level)))} `
    const applyLine = (line: string) => {
      const matched = line.match(/^(#{1,6}\s+)/)
      if (matched?.[1] === marker) return line.slice(matched[1].length)
      return marker + line.replace(/^(#{1,6}\s+)/, '')
    }
    const sel = editor.getSelection()
    if (sel) {
      editor.updateValue(sel.split(/\r?\n/).map(applyLine).join('\n'))
    } else {
      editor.insertValue(marker)
    }
  },
  insert: (text: string) => {
    editor?.insertValue(text)
  },
  pasteClipboardImage: () => insertClipboardImage(null),
  undo: () => {
    const v = getInnerVditor()
    if (v?.undo) v.undo.undo(v)
  },
  redo: () => {
    const v = getInnerVditor()
    if (v?.undo) v.undo.redo(v)
  }
})
</script>

<template>
  <div class="live-wrap">
    <div ref="host" class="vditor-host" />
  </div>
</template>

<style scoped>
.live-wrap {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--editor-bg);
}

.vditor-host {
  flex: 1;
  min-height: 0;
  border: none !important;
}

:deep(.vditor) {
  border: none;
  height: 100% !important;
  background: var(--editor-bg);
}

:deep(.vditor-toolbar) {
  display: none !important;
}

:deep(.vditor-content) {
  background: var(--editor-bg);
}

:deep(.vditor-ir),
:deep(.vditor-reset) {
  background: var(--editor-bg) !important;
  color: var(--text-primary) !important;
  font-family: var(--font-content) !important;
  font-size: var(--content-font-size, 16px) !important;
  font-weight: var(--content-font-weight, 500);
  line-height: var(--content-line-height, 1.85) !important;
  letter-spacing: 0.02em;
  max-width: none;
  width: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 8px 20px 56px !important;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

:deep(.vditor-ir h1),
:deep(.vditor-ir h2),
:deep(.vditor-ir h3),
:deep(.vditor-ir h4),
:deep(.vditor-ir h5),
:deep(.vditor-ir h6),
:deep(.vditor-reset h1),
:deep(.vditor-reset h2),
:deep(.vditor-reset h3),
:deep(.vditor-reset h4),
:deep(.vditor-reset h5),
:deep(.vditor-reset h6) {
  font-family: var(--font-content) !important;
  font-weight: 700;
  letter-spacing: 0.03em;
}

:deep(.vditor-ir__node--expand .vditor-ir__marker),
:deep(.vditor-ir__marker) {
  color: var(--text-muted) !important;
}

:deep(.vditor-ir h1),
:deep(.vditor-ir h2),
:deep(.vditor-ir h3) {
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 0.2em;
}

:deep(.vditor-ir pre),
:deep(.vditor-ir code) {
  font-family: var(--font-mono);
}

:deep(.vditor-counter) {
  background: transparent;
  color: var(--text-muted);
  border-top: 1px solid var(--border-color);
}

:deep(.vditor-ir img) {
  max-width: 100%;
}

:deep(.dfx-jump-flash) {
  outline: 2px solid var(--accent-color);
  outline-offset: 4px;
  border-radius: 4px;
}
</style>
