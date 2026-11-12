<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ipcErrorMessage } from '@/utils/ipcError'
import type { SelfCheckReport } from '@/types'
import LogoMark from '@/components/Brand/LogoMark.vue'

const emit = defineEmits<{ ready: [] }>()
const selecting = ref(false)
const error = ref('')
const selfCheckText = ref('')

async function chooseRoot() {
  selecting.value = true
  error.value = ''
  try {
    const dir = await window.noteAPI.selectRootDirectory()
    if (!dir) {
      selecting.value = false
      return
    }
    ElMessage.success(`已选择笔记库：${dir}`)
    emit('ready')
  } catch (e) {
    error.value = ipcErrorMessage(e, '选择目录失败')
  } finally {
    selecting.value = false
  }
}

async function useRecommended() {
  selecting.value = true
  error.value = ''
  try {
    const dir = await window.noteAPI.useDefaultLibrary()
    ElMessage.success(`已使用推荐笔记库：${dir}`)
    emit('ready')
  } catch (e) {
    error.value = ipcErrorMessage(e, '创建推荐笔记库失败')
  } finally {
    selecting.value = false
  }
}

async function runSelfCheck() {
  try {
    const report: SelfCheckReport = await window.noteAPI.runSelfCheck()
    const lines = [
      `结果：${report.ok ? '通过' : '未通过'}`,
      `userData：${report.userData}`,
      `笔记库：${report.rootDirectory || '(未设置)'}`,
      '',
      ...report.steps.map((s) => `${s.ok ? '[OK]' : '[FAIL]'} ${s.name}${s.detail ? ` — ${s.detail}` : ''}`),
      '',
      '写入探针：',
      ...report.probes.map((p) => `${p.writable ? '[OK]' : '[FAIL]'} ${p.path}${p.error ? ` (${p.error})` : ''}`)
    ]
    selfCheckText.value = lines.join('\n')
    await ElMessageBox.alert(selfCheckText.value, '环境自检', {
      confirmButtonText: '关闭',
      customClass: 'selfcheck-box'
    })
  } catch (e) {
    error.value = ipcErrorMessage(e, '自检失败')
  }
}
</script>

<template>
  <div class="welcome">
    <div class="welcome-card">
      <LogoMark class="logo" :size="56" />
      <h1>DataFutureX Note</h1>
      <p class="desc">
        本地优先的 Markdown 笔记软件。笔记保存在您指定的 PC 目录中，使用标准文件夹与 `.md` 文件，可随时用其他编辑器打开。
      </p>
      <ul class="features">
        <li>目录 / 章节 / 内容三栏管理</li>
        <li>类 Typora 即时渲染：在预览上直接编辑</li>
        <li>整库或文件夹 ZIP 备份与导入</li>
        <li>导出 Word / PDF，支持浅色深色主题</li>
      </ul>
      <button class="btn primary" :disabled="selecting" @click="useRecommended">
        {{ selecting ? '处理中…' : '使用推荐笔记库（可写）' }}
      </button>
      <button class="btn" :disabled="selecting" @click="chooseRoot">选择其他本地目录…</button>
      <button class="btn ghost" :disabled="selecting" @click="runSelfCheck">运行环境自检</button>
      <p v-if="error" class="error">{{ error }}</p>
      <p class="hint">
        若选择 Documents / 桌面等目录后无法保存，多半是 Windows「受控文件夹访问」拦截了 electron.exe。请改用推荐笔记库，或把本应用加入允许列表。
      </p>
    </div>
  </div>
</template>

<style scoped>
.welcome {
  height: 100%;
  display: grid;
  place-items: center;
  background:
    radial-gradient(ellipse at 20% 20%, rgba(43, 109, 229, 0.18), transparent 45%),
    radial-gradient(ellipse at 80% 80%, rgba(43, 109, 229, 0.1), transparent 40%),
    var(--app-bg);
  padding: 24px;
}

.welcome-card {
  width: min(560px, 100%);
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 40px 36px;
  box-shadow: var(--shadow-soft);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.logo {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  margin-bottom: 6px;
  display: block;
}

h1 {
  margin: 0;
  font-size: 28px;
}

.desc {
  color: var(--text-secondary);
  line-height: 1.7;
  margin: 0 0 8px;
}

.features {
  margin: 0 0 12px;
  padding-left: 18px;
  color: var(--text-secondary);
  line-height: 1.8;
}

.btn.primary {
  width: 100%;
  justify-content: center;
  padding: 12px 16px;
  font-size: 14px;
}

.btn {
  width: 100%;
  justify-content: center;
}

.error {
  color: var(--danger-color);
  margin: 4px 0 0;
  white-space: pre-wrap;
}

.hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.6;
}
</style>
