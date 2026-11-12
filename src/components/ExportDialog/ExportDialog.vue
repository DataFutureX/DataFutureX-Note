<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useLibraryStore } from '@/stores/library'

const visible = defineModel<boolean>('visible', { default: false })
const library = useLibraryStore()
const exporting = ref(false)

async function doExport(type: 'md' | 'docx' | 'pdf') {
  if (!library.selectedNoteId) {
    ElMessage.warning('请先打开一篇笔记')
    return
  }
  exporting.value = true
  try {
    let result = null
    if (type === 'md') result = await window.noteAPI.exportMarkdown(library.selectedNoteId)
    if (type === 'docx') result = await window.noteAPI.exportWord(library.selectedNoteId)
    if (type === 'pdf') result = await window.noteAPI.exportPdf(library.selectedNoteId)
    if (result) {
      ElMessage.success(`已导出：${result.path}`)
      visible.value = false
    }
  } catch (e) {
    ElMessage.error((e as { message?: string })?.message || '导出失败')
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <el-dialog v-model="visible" title="导出笔记" width="420px">
    <p>将当前笔记导出为其他格式（不会修改原始 Markdown 文件）。</p>
    <div class="actions">
      <button class="btn" :disabled="exporting" @click="doExport('md')">导出 Markdown</button>
      <button class="btn" :disabled="exporting" @click="doExport('docx')">导出 Word (DOCX)</button>
      <button class="btn primary" :disabled="exporting" @click="doExport('pdf')">导出 PDF</button>
    </div>
  </el-dialog>
</template>

<style scoped>
.actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 16px;
}
.actions .btn {
  justify-content: center;
  padding: 10px;
}
</style>
