<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { EditorState } from '@codemirror/state'
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  drawSelection
} from '@codemirror/view'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  undo,
  redo
} from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { useLibraryStore } from '@/stores/library'
import { useSettingsStore } from '@/stores/settings'
import { saveClipboardImageAsMarkdown } from '@/utils/clipboardImage'
import { applyScrollPosition, readScrollPosition, resolveNoteScrollEl } from '@/utils/notePosition'

const props = defineProps<{ modelValue: string; noteId?: string | null; readonly?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const host = ref<HTMLDivElement | null>(null)
const settingsStore = useSettingsStore()
const library = useLibraryStore()
let view: EditorView | null = null
let applying = false
let lastJumpToken = 0
let boundScrollEl: HTMLElement | null = null
let positionSaveTimer: ReturnType<typeof setTimeout> | null = null
let restoringPosition = false
let trackedNoteId: string | null = null

function saveCurrentPosition(opts?: { flush?: boolean }) {
  const noteId = trackedNoteId || props.noteId || null
  if (!noteId || restoringPosition || !view) return
  const el = resolveNoteScrollEl(host.value)
  if (!el) return
  boundScrollEl = el
  const scroll = readScrollPosition(el)
  settingsStore.rememberNotePosition(
    noteId,
    {
      ...scroll,
      cursorOffset: view.state.selection.main.head
    },
    opts
  )
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
  const el = resolveNoteScrollEl(host.value)
  if (!el) return
  if (boundScrollEl === el) return
  boundScrollEl?.removeEventListener('scroll', onScrollCapture)
  boundScrollEl = el
  boundScrollEl.addEventListener('scroll', onScrollCapture, { passive: true })
}

function restorePositionForNote(noteId: string | null | undefined) {
  if (!noteId || !view) return
  const pos = settingsStore.getNotePosition(noteId)
  if (!pos) return
  if (!(pos.scrollTop > 0 || pos.scrollRatio > 0 || (pos.cursorOffset ?? 0) > 0)) return
  restoringPosition = true
  const docLen = view.state.doc.length
  const cursor = Math.min(Math.max(0, pos.cursorOffset ?? 0), docLen)
  view.dispatch({
    selection: { anchor: cursor, head: cursor },
    effects: EditorView.scrollIntoView(cursor, { y: 'center' })
  })
  const tryRestore = (attempt: number) => {
    bindScrollListener()
    const el = resolveNoteScrollEl(host.value)
    const ok = applyScrollPosition(el, pos)
    if (!ok && attempt < 12) {
      window.setTimeout(() => tryRestore(attempt + 1), 40 + attempt * 30)
    } else if (attempt < 6) {
      window.setTimeout(() => tryRestore(attempt + 1), 60)
    } else {
      restoringPosition = false
    }
  }
  void nextTick(() => tryRestore(0))
}

function jumpToLine(line: number) {
  if (!view) return
  const doc = view.state.doc
  const safeLine = Math.min(Math.max(line, 1), doc.lines)
  const lineObj = doc.line(safeLine)
  view.dispatch({
    selection: { anchor: lineObj.from },
    effects: EditorView.scrollIntoView(lineObj.from, { y: 'center' })
  })
  view.focus()
}

function wrapSelection(view: EditorView, before: string, after = before): boolean {
  const { from, to } = view.state.selection.main
  const text = view.state.sliceDoc(from, to)
  view.dispatch({
    changes: { from, to, insert: before + text + after },
    selection: {
      anchor: from + before.length,
      head: from + before.length + text.length
    },
    userEvent: 'input'
  })
  return true
}

function prefixLines(view: EditorView, prefix: string): boolean {
  const { from, to } = view.state.selection.main
  const startLine = view.state.doc.lineAt(from)
  const endLine = view.state.doc.lineAt(to)
  const changes: { from: number; to: number; insert: string }[] = []
  for (let n = startLine.number; n <= endLine.number; n++) {
    const line = view.state.doc.line(n)
    if (line.text.startsWith(prefix)) {
      changes.push({ from: line.from, to: line.from + prefix.length, insert: '' })
    } else {
      changes.push({ from: line.from, to: line.from, insert: prefix })
    }
  }
  view.dispatch({ changes, userEvent: 'input' })
  return true
}

function setHeadingLines(view: EditorView, level: number): boolean {
  const marker = `${'#'.repeat(Math.min(6, Math.max(1, level)))} `
  const { from, to } = view.state.selection.main
  const startLine = view.state.doc.lineAt(from)
  const endLine = view.state.doc.lineAt(to)
  const changes: { from: number; to: number; insert: string }[] = []
  for (let n = startLine.number; n <= endLine.number; n++) {
    const line = view.state.doc.line(n)
    const matched = line.text.match(/^(#{1,6}\s+)/)
    const oldLen = matched?.[1].length ?? 0
    if (matched?.[1] === marker) {
      changes.push({ from: line.from, to: line.from + oldLen, insert: '' })
    } else {
      changes.push({ from: line.from, to: line.from + oldLen, insert: marker })
    }
  }
  view.dispatch({ changes, userEvent: 'input' })
  return true
}

/** Typora 风格常用快捷键（源码模式） */
function typoraKeymap() {
  return keymap.of([
    {
      key: 'Mod-b',
      run: (v) => wrapSelection(v, '**')
    },
    {
      key: 'Mod-i',
      run: (v) => wrapSelection(v, '*')
    },
    {
      key: 'Mod-d',
      run: (v) => wrapSelection(v, '~~')
    },
    {
      key: 'Mod-k',
      run: (v) => {
        const { from, to } = v.state.selection.main
        const text = v.state.sliceDoc(from, to) || '链接文字'
        v.dispatch({
          changes: { from, to, insert: `[${text}](url)` },
          selection: { anchor: from + text.length + 3, head: from + text.length + 6 },
          userEvent: 'input'
        })
        return true
      }
    },
    {
      key: 'Mod-Shift-k',
      run: (v) => wrapSelection(v, '\n```\n', '\n```\n')
    },
    {
      key: 'Mod-e',
      run: (v) => wrapSelection(v, '`')
    },
    {
      key: 'Mod-Shift-i',
      run: (v) => {
        v.dispatch({
          changes: {
            from: v.state.selection.main.from,
            to: v.state.selection.main.to,
            insert: '![图片描述](./assets/image.png)'
          },
          userEvent: 'input'
        })
        return true
      }
    },
    {
      key: 'Mod-1',
      run: (v) => setHeadingLines(v, 1)
    },
    {
      key: 'Mod-2',
      run: (v) => setHeadingLines(v, 2)
    },
    {
      key: 'Mod-3',
      run: (v) => setHeadingLines(v, 3)
    },
    {
      key: 'Mod-4',
      run: (v) => setHeadingLines(v, 4)
    },
    {
      key: 'Mod-5',
      run: (v) => setHeadingLines(v, 5)
    },
    {
      key: 'Mod-Shift-q',
      run: (v) => prefixLines(v, '> ')
    },
    {
      key: 'Mod-Shift-l',
      run: (v) => prefixLines(v, '- ')
    },
    {
      key: 'Mod-Shift-o',
      run: (v) => prefixLines(v, '1. ')
    },
    {
      key: 'Mod-z',
      run: undo
    },
    {
      key: 'Mod-Shift-z',
      run: redo
    },
    {
      key: 'Mod-y',
      run: redo
    }
  ])
}

function buildExtensions() {
  const themeExt =
    settingsStore.resolvedTheme === 'dark'
      ? oneDark
      : EditorView.theme({
          '&': { backgroundColor: 'var(--editor-bg)', color: 'var(--text-primary)', height: '100%' },
          '.cm-content': {
            caretColor: 'var(--accent-color)',
            fontFamily: 'var(--font-mono)',
            fontSize: '14px',
            lineHeight: '1.7'
          },
          '.cm-gutters': {
            backgroundColor: 'var(--panel-bg)',
            color: 'var(--text-muted)',
            borderRight: '1px solid var(--border-color)'
          }
        })

  return [
    lineNumbers(),
    highlightActiveLine(),
    drawSelection(),
    history(),
    markdown(),
    typoraKeymap(),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    EditorView.lineWrapping,
    EditorView.domEventHandlers({
      paste(event, v) {
        if (!props.noteId || props.readonly) return false
        const data = event.clipboardData
        const hasImageInEvent =
          !!data?.items && Array.from(data.items).some((it) => it.type.startsWith('image/'))
        const plain = data?.getData('text/plain') || ''
        // Ctrl+V：优先贴图，兼容截图剪贴板同时带文本/HTML
        event.preventDefault()
        void (async () => {
          if (hasImageInEvent && (await pasteClipboardImage(v, data))) return
          if (await pasteClipboardImage(v, null)) return
          if (plain) {
            const { from, to } = v.state.selection.main
            v.dispatch({
              changes: { from, to, insert: plain },
              selection: { anchor: from + plain.length },
              userEvent: 'input'
            })
          }
        })()
        return true
      }
    }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged && !applying) {
        emit('update:modelValue', update.state.doc.toString())
      }
      if ((update.docChanged || update.selectionSet) && !applying && !restoringPosition) {
        scheduleSavePosition()
      }
    }),
    EditorState.readOnly.of(!!props.readonly),
    themeExt,
    EditorView.theme({
      '&': { height: '100%' },
      '.cm-scroller': { overflow: 'auto' }
    })
  ]
}

async function pasteClipboardImage(v: EditorView, clipboardData: DataTransfer | null) {
  if (!props.noteId) return false
  try {
    const md = await saveClipboardImageAsMarkdown(props.noteId, clipboardData)
    if (!md) return false
    const text = md.endsWith('\n') ? md : `${md}\n`
    const { from, to } = v.state.selection.main
    v.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length },
      userEvent: 'input'
    })
    return true
  } catch (e) {
    console.error(e)
    return false
  }
}

function createEditor() {
  if (!host.value) return
  view?.destroy()
  view = new EditorView({
    state: EditorState.create({
      doc: props.modelValue,
      extensions: buildExtensions()
    }),
    parent: host.value
  })
  trackedNoteId = props.noteId || null
  bindScrollListener()
  restorePositionForNote(props.noteId)
}

onMounted(() => createEditor())

watch(
  () => props.noteId,
  (next, prev) => {
    if (prev && prev !== next) saveCurrentPosition({ flush: true })
    trackedNoteId = next || null
    if (view && next) {
      void nextTick(() => restorePositionForNote(next))
    }
  }
)

watch(
  () => props.modelValue,
  (val) => {
    if (!view) return
    const current = view.state.doc.toString()
    if (val === current) return
    applying = true
    view.dispatch({
      changes: { from: 0, to: current.length, insert: val }
    })
    applying = false
    restorePositionForNote(props.noteId)
  }
)

watch(() => settingsStore.resolvedTheme, () => createEditor())

watch(
  () => library.jumpRequest,
  (req) => {
    if (!req || req.token === lastJumpToken) return
    lastJumpToken = req.token
    jumpToLine(req.line)
  }
)

onBeforeUnmount(() => {
  saveCurrentPosition({ flush: true })
  boundScrollEl?.removeEventListener('scroll', onScrollCapture)
  boundScrollEl = null
  if (positionSaveTimer) clearTimeout(positionSaveTimer)
  view?.destroy()
  view = null
})

defineExpose({
  focus: () => view?.focus(),
  getSelection: () => {
    if (!view) return ''
    const { from, to } = view.state.selection.main
    return view.state.sliceDoc(from, to)
  },
  insertWrap: (before: string, after = before) => {
    if (view) wrapSelection(view, before, after)
  },
  wrap: (before: string, after = before) => {
    if (view) wrapSelection(view, before, after)
  },
  prefixLines: (prefix: string) => {
    if (view) prefixLines(view, prefix)
  },
  setHeading: (level: number) => {
    if (view) setHeadingLines(view, level)
  },
  insert: (text: string) => {
    if (!view) return
    const { from, to } = view.state.selection.main
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length },
      userEvent: 'input'
    })
  },
  pasteClipboardImage: async () => {
    if (!view) return false
    return pasteClipboardImage(view, null)
  },
  undo: () => {
    if (view) undo(view)
  },
  redo: () => {
    if (view) redo(view)
  }
})
</script>

<template>
  <div ref="host" class="cm-host" />
</template>

<style scoped>
.cm-host {
  height: 100%;
  overflow: hidden;
}
</style>
