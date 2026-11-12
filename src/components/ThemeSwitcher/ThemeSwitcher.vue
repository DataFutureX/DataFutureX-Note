<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings'
import type { ThemePreference } from '@/types'

const settingsStore = useSettingsStore()

async function setTheme(theme: ThemePreference) {
  await settingsStore.setTheme(theme)
}
</script>

<template>
  <div class="theme-switch">
    <button
      class="btn ghost"
      :class="{ active: settingsStore.settings.theme === 'light' }"
      title="浅色"
      @click="setTheme('light')"
    >
      浅色
    </button>
    <button
      class="btn ghost"
      :class="{ active: settingsStore.settings.theme === 'dark' }"
      title="深色"
      @click="setTheme('dark')"
    >
      深色
    </button>
    <button
      class="btn ghost"
      :class="{ active: settingsStore.settings.theme === 'system' }"
      title="跟随系统"
      @click="setTheme('system')"
    >
      系统
    </button>
  </div>
</template>

<style scoped>
.theme-switch {
  display: inline-flex;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.theme-switch .btn {
  border: none;
  border-radius: 0;
  padding: 5px 8px;
}

.theme-switch .btn.active {
  background: var(--selection-bg);
  color: var(--accent-color);
}
</style>
