<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import ThemeSwitcher from '@/components/ThemeSwitcher/ThemeSwitcher.vue'
import AccentThemeSwitcher from '@/components/ThemeSwitcher/AccentThemeSwitcher.vue'
import { useLibraryStore } from '@/stores/library'
import { useSettingsStore } from '@/stores/settings'
import { ACCENT_THEME_OPTIONS, type SortMode } from '@/types'
import LogoMark from '@/components/Brand/LogoMark.vue'

const emit = defineEmits<{ close: []; 'root-changed': [] }>()
const settingsStore = useSettingsStore()
const libraryStore = useLibraryStore()
const appInfo = ref({ name: '', version: '', buildTime: '', homepage: '', copyright: '' })
const HOMEPAGE = 'https://www.datafuturex.cn/'

async function openHomepage() {
  try {
    await window.noteAPI.openExternal(appInfo.value.homepage || HOMEPAGE)
  } catch {
    // ignore
  }
}
const accentLabel = computed(
  () =>
    ACCENT_THEME_OPTIONS.find((o) => o.id === settingsStore.settings.accentTheme)?.label ||
    settingsStore.settings.accentTheme
)

onMounted(async () => {
  const info = await window.noteAPI.getAppInfo()
  appInfo.value = {
    name: info.name,
    version: info.version,
    buildTime: info.buildTime || '',
    homepage: info.homepage || HOMEPAGE,
    copyright: info.copyright
  }
})

async function switchRoot() {
  try {
    const dir = await window.noteAPI.selectRootDirectory()
    if (dir) {
      ElMessage.success(`已切换笔记库：${dir}`)
      emit('root-changed')
      emit('close')
    }
  } catch (e) {
    ElMessage.error((e as { message?: string })?.message || '切换失败')
  }
}

async function useRecommendedLibrary() {
  try {
    const dir = await window.noteAPI.useDefaultLibrary()
    ElMessage.success(`已切换到推荐笔记库：${dir}`)
    emit('root-changed')
    emit('close')
  } catch (e) {
    ElMessage.error((e as { message?: string })?.message || '切换失败')
  }
}

async function runSelfCheck() {
  try {
    const report = await window.noteAPI.runSelfCheck()
    const text = [
      `结果：${report.ok ? '通过' : '未通过'}`,
      `userData：${report.userData}`,
      `笔记库：${report.rootDirectory || '(未设置)'}`,
      ...report.steps.map((s) => `${s.ok ? '[OK]' : '[FAIL]'} ${s.name}${s.detail ? ` — ${s.detail}` : ''}`)
    ].join('\n')
    ElMessage[report.ok ? 'success' : 'error'](report.ok ? '自检通过' : '自检未通过，请查看详情')
    await ElMessageBox.alert(text, '环境自检', { confirmButtonText: '关闭' })
  } catch (e) {
    ElMessage.error((e as { message?: string })?.message || '自检失败')
  }
}

async function updateAutoSave(val: boolean) {
  await settingsStore.update({ autoSave: val })
}

async function updateInterval(val: number) {
  await settingsStore.update({ autoSaveIntervalMs: val })
}

async function updateSort(mode: SortMode) {
  await settingsStore.setSortMode(mode)
  await libraryStore.refreshTree(true)
}

async function updateStartup(val: 'last-note' | 'default-folder') {
  await settingsStore.update({ startupBehavior: val })
}
</script>

<template>
  <div class="settings">
    <header class="toolbar">
      <button class="btn" @click="emit('close')">← 返回</button>
      <div class="brand">设置</div>
    </header>
    <div class="settings-body">
      <section>
        <h2>笔记库</h2>
        <p class="path">{{ settingsStore.settings.rootDirectory || '未设置' }}</p>
        <div class="btn-row">
          <button class="btn primary" @click="useRecommendedLibrary">使用推荐笔记库</button>
          <button class="btn" @click="switchRoot">选择其他目录…</button>
          <button class="btn" @click="runSelfCheck">环境自检</button>
        </div>
        <p class="hint">若无法新建/保存，请先点「环境自检」。受控文件夹访问拦截时请改用推荐笔记库。</p>
      </section>

      <section>
        <h2>编辑</h2>
        <label class="row">
          <span>自动保存</span>
          <input
            type="checkbox"
            :checked="settingsStore.settings.autoSave"
            @change="updateAutoSave(($event.target as HTMLInputElement).checked)"
          />
        </label>
        <label class="row">
          <span>自动保存间隔（毫秒）</span>
          <input
            type="number"
            min="500"
            step="100"
            :value="settingsStore.settings.autoSaveIntervalMs"
            @change="updateInterval(Number(($event.target as HTMLInputElement).value) || 1000)"
          />
        </label>
        <label class="row">
          <span>默认排序</span>
          <select
            :value="settingsStore.settings.sortMode"
            @change="updateSort(($event.target as HTMLSelectElement).value as SortMode)"
          >
            <option value="mtime-desc">修改时间降序</option>
            <option value="mtime-asc">修改时间升序</option>
            <option value="name-asc">名称升序</option>
            <option value="name-desc">名称降序</option>
          </select>
        </label>
        <label class="row">
          <span>启动行为</span>
          <select
            :value="settingsStore.settings.startupBehavior"
            @change="updateStartup(($event.target as HTMLSelectElement).value as 'last-note' | 'default-folder')"
          >
            <option value="last-note">打开上次笔记</option>
            <option value="default-folder">打开默认目录</option>
          </select>
        </label>
      </section>

      <section>
        <h2>主题</h2>
        <ThemeSwitcher />
        <p class="hint">
          当前实际：{{ accentLabel }} ·
          {{ settingsStore.resolvedTheme === 'dark' ? '深色' : '浅色' }}（切换明暗使用该主题色对应变体）
        </p>
        <h3 class="subhead">主题色</h3>
        <AccentThemeSwitcher />
        <p class="hint">默认柔蓝；亦可选暖黄、纸感、柔绿、灰白，并与浅/深色叠加。</p>
      </section>

      <section class="about-section">
        <h2>关于</h2>
        <div class="about-brand">
          <LogoMark class="about-logo" :size="72" enhanced />
          <div class="about-text">
            <p><strong>{{ appInfo.name }}</strong></p>
            <p>版本 {{ appInfo.version }}</p>
            <p v-if="appInfo.buildTime">打包时间 {{ appInfo.buildTime }}</p>
            <p>{{ appInfo.copyright }}</p>
            <p>
              <a class="homepage-link" href="#" @click.prevent="openHomepage">{{
                appInfo.homepage || HOMEPAGE
              }}</a>
            </p>
            <p class="hint">DataFutureX 数智未来·AI工坊 · 本地优先 · 开放 Markdown 格式</p>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.settings {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--app-bg);
}

.settings-body {
  flex: 1;
  overflow: auto;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  padding: 24px;
  box-sizing: border-box;
}

section {
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
}

h2 {
  margin: 0 0 12px;
  font-size: 16px;
}

.subhead {
  margin: 16px 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.path {
  word-break: break-all;
  color: var(--text-secondary);
}

.btn-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.hint {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 8px;
}

.about-brand {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  overflow: visible;
}

.about-section {
  overflow: visible;
}

.about-logo {
  flex-shrink: 0;
  overflow: visible;
}

.about-text p {
  margin: 0 0 6px;
}

.about-text .hint {
  margin-top: 4px;
}

.homepage-link {
  color: var(--accent-color);
  text-decoration: none;
}

.homepage-link:hover {
  text-decoration: underline;
}

.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin: 10px 0;
}

.row input[type='number'],
.row select {
  height: 30px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--panel-bg);
  color: var(--text-primary);
  padding: 0 8px;
}
</style>
