<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings'
import { ACCENT_THEME_OPTIONS, type AccentTheme } from '@/types'

const settingsStore = useSettingsStore()

async function setAccent(accent: AccentTheme) {
  await settingsStore.setAccentTheme(accent)
}
</script>

<template>
  <div class="accent-switch" role="listbox" aria-label="主题色">
    <button
      v-for="opt in ACCENT_THEME_OPTIONS"
      :key="opt.id"
      type="button"
      class="accent-option"
      role="option"
      :aria-selected="settingsStore.settings.accentTheme === opt.id"
      :class="{ active: settingsStore.settings.accentTheme === opt.id }"
      :title="`${opt.label} · ${opt.hint}`"
      @click="setAccent(opt.id)"
    >
      <span class="swatch" :style="{ background: opt.swatch }" />
      <span class="meta">
        <span class="label">{{ opt.label }}</span>
        <span class="hint">{{ opt.hint }}</span>
      </span>
    </button>
  </div>
</template>

<style scoped>
.accent-switch {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.accent-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--panel-bg);
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
}

.accent-option:hover {
  background: var(--hover-bg);
}

.accent-option.active {
  border-color: var(--accent-color);
  box-shadow: 0 0 0 1px var(--accent-color);
  background: var(--selection-bg);
}

.swatch {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
}

.meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.label {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.2;
}

.hint {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.2;
}

@media (max-width: 480px) {
  .accent-switch {
    grid-template-columns: 1fr;
  }
}
</style>
