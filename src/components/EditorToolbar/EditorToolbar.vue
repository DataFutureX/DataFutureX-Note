<script setup lang="ts">
export type FormatCommand =
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'heading4'
  | 'heading5'
  | 'bold'
  | 'italic'
  | 'strike'
  | 'inlineCode'
  | 'codeBlock'
  | 'link'
  | 'image'
  | 'pasteScreenshot'
  | 'ul'
  | 'ol'
  | 'quote'
  | 'table'
  | 'hr'
  | 'undo'
  | 'redo'

defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ command: [FormatCommand] }>()

const groups: {
  items: { id: FormatCommand; title: string }[]
}[] = [
  {
    items: [
      { id: 'heading1', title: '一级标题 Ctrl+1' },
      { id: 'heading2', title: '二级标题 Ctrl+2' },
      { id: 'heading3', title: '三级标题 Ctrl+3' },
      { id: 'heading4', title: '四级标题 Ctrl+4' },
      { id: 'heading5', title: '五级标题 Ctrl+5' }
    ]
  },
  {
    items: [
      { id: 'bold', title: '加粗 Ctrl+B' },
      { id: 'italic', title: '斜体 Ctrl+I' },
      { id: 'strike', title: '删除线 Ctrl+D' },
      { id: 'inlineCode', title: '行内代码 Ctrl+E' }
    ]
  },
  {
    items: [
      { id: 'ul', title: '无序列表' },
      { id: 'ol', title: '有序列表' },
      { id: 'quote', title: '引用' },
      { id: 'codeBlock', title: '代码块 Ctrl+Shift+K' },
      { id: 'table', title: '表格' },
      { id: 'hr', title: '分隔线' }
    ]
  },
  {
    items: [
      { id: 'link', title: '链接 Ctrl+K' },
      { id: 'image', title: '插入图片' },
      { id: 'pasteScreenshot', title: '粘贴截图 Ctrl+V' }
    ]
  },
  {
    items: [
      { id: 'undo', title: '撤销 Ctrl+Z' },
      { id: 'redo', title: '重做 Ctrl+Y' }
    ]
  }
]

function run(id: FormatCommand) {
  emit('command', id)
}
</script>

<template>
  <div class="editor-toolbar" role="toolbar" aria-label="编辑工具栏">
    <template v-for="(group, gi) in groups" :key="gi">
      <div v-if="gi > 0" class="sep" />
      <button
        v-for="item in group.items"
        :key="item.id"
        type="button"
        class="tb-btn"
        :title="item.title"
        :disabled="disabled"
        @mousedown.prevent
        @click="run(item.id)"
      >
        <!-- heading -->
        <svg v-if="item.id === 'heading1'" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 5v14h2.2v-5.6H11V19h2.2V5H11v5.2H6.2V5H4zm13.2 6.2V19H19V7.8c-.7.6-1.6 1.1-2.6 1.4v2z" />
        </svg>
        <svg v-else-if="item.id === 'heading2'" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3.5 5v14h2.1v-5.6h4.5V19h2.1V5H10.1v5.2H5.6V5H3.5zm10.8 8.4c0-2.2 1.7-3.5 4.1-3.5 1.2 0 2.2.3 3 .9l-1 1.5c-.5-.4-1.2-.7-2-.7-1.1 0-1.8.6-1.8 1.5 0 .9.7 1.4 2.3 2.1 2 .9 3.2 1.8 3.2 3.7 0 2.3-1.8 3.7-4.5 3.7-1.5 0-2.8-.4-3.8-1.2l1.1-1.6c.7.6 1.6.9 2.6.9 1.2 0 2-.6 2-1.5 0-.9-.7-1.4-2.4-2.2-1.9-.8-3.1-1.8-3.1-3.6z" />
        </svg>
        <svg v-else-if="item.id === 'heading3'" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3.5 5v14h2.1v-5.6h4.5V19h2.1V5H10.1v5.2H5.6V5H3.5zm11.2 1.8h5.8v1.8h-3.4l2.1 2.1c.7-.2 1.4-.3 2-.3 2.3 0 3.8 1.4 3.8 3.5S23.5 17.6 21 17.6c-1.4 0-2.6-.4-3.5-1.2l1.1-1.6c.6.5 1.4.8 2.3.8 1.1 0 1.8-.6 1.8-1.5s-.7-1.5-1.9-1.5c-.7 0-1.4.2-2.1.6l-1.3-1.3 2.8-2.8h-4.7V6.8z" />
        </svg>
        <span v-else-if="item.id === 'heading4'" class="tb-text">H4</span>
        <span v-else-if="item.id === 'heading5'" class="tb-text">H5</span>
        <!-- style -->
        <svg v-else-if="item.id === 'bold'" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 5h5.8c2.7 0 4.5 1.5 4.5 3.7 0 1.5-.8 2.7-2.1 3.3 1.7.5 2.8 1.9 2.8 3.7C18 18.4 16 20 13.1 20H7V5zm2.3 2.1v4.2h3.2c1.4 0 2.2-.7 2.2-1.9s-.8-2.3-2.3-2.3H9.3zm0 6.3V17.9h3.7c1.5 0 2.4-.8 2.4-2.2s-.9-2.3-2.5-2.3H9.3z" />
        </svg>
        <svg v-else-if="item.id === 'italic'" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M10 5h8.2v2.1h-2.7l-3.3 9.8h2.8V20H6.8v-2.1h2.7L12.8 7.1H10V5z" />
        </svg>
        <svg v-else-if="item.id === 'strike'" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 11h18v2H3v-2zm8.2-6c2.6 0 4.4 1.2 4.8 3.2l-2.1.4c-.2-1.1-1.1-1.7-2.6-1.7-1.5 0-2.5.6-2.5 1.6 0 .7.4 1.2 1.6 1.6H4.9C4.5 8.5 6.3 5 11.2 5zM9.4 14.2c.3 1.1 1.2 1.7 2.6 1.7 1.5 0 2.5-.6 2.5-1.7 0-.4-.1-.7-.4-1h2.3c.2.5.3 1.1.3 1.7 0 2.4-1.9 4-4.8 4-3.2 0-5.1-1.6-5.4-4.1l2.3-.6z" />
        </svg>
        <svg v-else-if="item.id === 'inlineCode'" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8.2 7.2 3.5 12l4.7 4.8 1.5-1.5L6.5 12l3.2-3.3L8.2 7.2zm7.6 0-1.5 1.5L17.5 12l-3.2 3.3 1.5 1.5L20.5 12l-4.7-4.8z" />
        </svg>
        <!-- structure -->
        <svg v-else-if="item.id === 'ul'" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 6h13v2H8V6zm0 5h13v2H8v-2zm0 5h13v2H8v-2zM3.5 6.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm0 5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm0 5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z" />
        </svg>
        <svg v-else-if="item.id === 'ol'" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 6h13v2H8V6zm0 5h13v2H8v-2zm0 5h13v2H8v-2zM3 5h2.2v5H3.8V6.6H3V5zm0 7.2h3v1.5H4.4l1.6 1.6V17H3v-1.5h1.8L3 13.7v-1.5z" />
        </svg>
        <svg v-else-if="item.id === 'quote'" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7.2 17.5 9 14.2c-2.2-.4-3.6-1.8-3.6-4.1C5.4 7.5 7.2 6 9.6 6c2.2 0 3.8 1.5 3.8 3.7 0 2.8-2.1 5.3-5.2 7.8l-1-.9zm8.2 0 1.8-3.3c-2.2-.4-3.6-1.8-3.6-4.1 0-2.6 1.8-4.1 4.2-4.1 2.2 0 3.8 1.5 3.8 3.7 0 2.8-2.1 5.3-5.2 7.8l-1-.9z" />
        </svg>
        <svg v-else-if="item.id === 'codeBlock'" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0L19.2 12l-4.6-4.6L16 6l6 6-6 6-1.4-1.4zM13.1 6l-2.2 12h2.1l2.2-12h-2.1z" />
        </svg>
        <svg v-else-if="item.id === 'table'" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 4h18v16H3V4zm2 2v3h14V6H5zm0 5v3h6v-3H5zm8 0v3h6v-3h-6zm-8 5v3h6v-3H5zm8 0v3h6v-3h-6z" />
        </svg>
        <svg v-else-if="item.id === 'hr'" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 11h18v2H3v-2z" />
        </svg>
        <!-- media -->
        <svg v-else-if="item.id === 'link'" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M10.5 13.5a4 4 0 0 0 5.7.1l2.1-2.1a4 4 0 0 0-5.7-5.7l-1.2 1.2 1.4 1.4 1.2-1.2a2 2 0 1 1 2.8 2.8l-2.1 2.1a2 2 0 0 1-2.8-.1l-1.4 1.5zm3-3a4 4 0 0 0-5.7-.1L5.7 12.5a4 4 0 0 0 5.7 5.7l1.2-1.2-1.4-1.4-1.2 1.2a2 2 0 1 1-2.8-2.8l2.1-2.1a2 2 0 0 1 2.8.1l1.4-1.5z" />
        </svg>
        <svg v-else-if="item.id === 'image'" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1 10.5 3.5-3.5 2.5 2.5 3.5-4.5L19 15.5V7H5v8.5zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />
        </svg>
        <svg v-else-if="item.id === 'pasteScreenshot'" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M8 4h3.2V2.8h1.6V4H16a2 2 0 0 1 2 2v2.2h-1.6V6.4a.4.4 0 0 0-.4-.4H8.4a.4.4 0 0 0-.4.4v1.8H6.4V6a2 2 0 0 1 1.6-2zM6.4 9.2H17.6v10.4a1.6 1.6 0 0 1-1.6 1.6H8a1.6 1.6 0 0 1-1.6-1.6V9.2zm2.4 3.2 2.4 2.8 1.6-1.8 2.8 3.4H8.8l0-4.4z"
          />
        </svg>
        <!-- history -->
        <svg v-else-if="item.id === 'undo'" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12.5 7a6.5 6.5 0 1 1-6.1 4.2l1.9.6A4.5 4.5 0 1 0 12.5 9H9.2l2.3 2.3-1.4 1.4L5.4 8.4 10.1 3.7l1.4 1.4L9.2 7h3.3z" />
        </svg>
        <svg v-else-if="item.id === 'redo'" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M11.5 7a6.5 6.5 0 1 0 6.1 4.2l-1.9.6A4.5 4.5 0 1 1 11.5 9h3.3l-2.3 2.3 1.4 1.4 4.7-4.7-4.7-4.7-1.4 1.4L14.8 7h-3.3z" />
        </svg>
      </button>
    </template>
  </div>
</template>

<style scoped>
.editor-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  padding: 4px 10px;
  min-height: 36px;
  border-bottom: 1px solid var(--border-color);
  background: var(--toolbar-bg);
  flex-shrink: 0;
  user-select: none;
}

.sep {
  width: 1px;
  height: 18px;
  margin: 0 4px;
  background: var(--border-color);
  flex-shrink: 0;
}

.tb-btn {
  appearance: none;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  width: 30px;
  height: 28px;
  padding: 0;
  border-radius: 4px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.tb-btn svg {
  width: 16px;
  height: 16px;
  fill: currentColor;
}

.tb-text {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1;
}

.tb-btn:hover:not(:disabled) {
  background: var(--hover-bg);
  color: var(--accent-color);
  border-color: var(--border-color);
}

.tb-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
