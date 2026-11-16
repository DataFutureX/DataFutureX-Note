<script setup lang="ts">
import { computed, useId } from 'vue'

const props = withDefaults(
  defineProps<{
    size?: number | string
    /** 为空时作为装饰图标（aria-hidden） */
    label?: string
    /** 启用贴面立体浮雕效果（适合欢迎页 / 关于等大尺寸展示） */
    enhanced?: boolean
  }>(),
  {
    size: 16,
    label: 'DataFutureX Note',
    enhanced: false
  }
)

const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
const ids = computed(() => ({
  face: `logo-face-${uid}`,
  gloss: `logo-gloss-${uid}`,
  clip: `logo-clip-${uid}`
}))

const viewBox = computed(() => (props.enhanced ? '0 0 34 34' : '0 0 32 32'))
</script>

<template>
  <svg
    class="logo-mark"
    :class="{ enhanced }"
    xmlns="http://www.w3.org/2000/svg"
    :viewBox="viewBox"
    :role="label ? 'img' : 'presentation'"
    :aria-label="label || undefined"
    :aria-hidden="label ? undefined : true"
    :width="size"
    :height="size"
  >
    <defs v-if="enhanced">
      <!-- 干净浅到主题色，少杂质 -->
      <linearGradient :id="ids.face" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="color-mix(in srgb, var(--accent-color) 72%, white)" />
        <stop offset="55%" stop-color="var(--accent-color)" />
        <stop offset="100%" stop-color="var(--accent-hover)" />
      </linearGradient>
      <linearGradient :id="ids.gloss" x1="4" y1="4" x2="28" y2="12" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.45" />
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
      </linearGradient>
      <clipPath :id="ids.clip">
        <polygon points="4,4 28,4 28,22 22,28 4,28" />
      </clipPath>
    </defs>

    <template v-if="enhanced">
      <!-- 扁薄厚度 -->
      <polygon points="28,4 30.2,5.5 30.2,23.5 28,22" fill="var(--accent-hover)" />
      <polygon points="4,28 5.5,30.2 23.5,30.2 28,28 22,28" fill="color-mix(in srgb, var(--accent-hover) 78%, black)" />
      <polygon points="28,22 30.2,23.5 28.6,25.4 23.5,30.2 22,28" fill="color-mix(in srgb, var(--accent-hover) 62%, black)" />
    </template>

    <polygon
      class="mark"
      points="4,4 28,4 28,22 22,28 4,28"
      :fill="enhanced ? `url(#${ids.face})` : undefined"
    />
    <polygon
      class="fold"
      points="22,28 28,22 22,22"
      :fill="enhanced ? 'var(--accent-hover)' : undefined"
    />

    <g v-if="enhanced" :clip-path="`url(#${ids.clip})`">
      <rect x="4" y="4" width="24" height="9" :fill="`url(#${ids.gloss})`" />
      <path d="M5 5 L27 5 L27 6.2 Q16 5.5 5 6.3 Z" fill="#ffffff" opacity="0.55" />
    </g>

    <polygon
      v-if="enhanced"
      points="4,4 28,4 28,22 22,28 4,28"
      fill="none"
      stroke="rgba(255,255,255,0.3)"
      stroke-width="0.7"
    />
    <polyline
      v-if="enhanced"
      points="22,28 28,22"
      fill="none"
      stroke="rgba(0,0,0,0.16)"
      stroke-width="0.7"
    />

    <rect class="line" x="9" y="10" width="12" height="2.2" rx="1.1" />
    <rect class="line" x="9" y="14.5" width="10" height="2.2" rx="1.1" opacity="0.94" />
    <rect class="line" x="9" y="19" width="7" height="2.2" rx="1.1" opacity="0.84" />
  </svg>
</template>

<style scoped>
.logo-mark {
  display: block;
  flex-shrink: 0;
  border-radius: 3px;
  overflow: visible;
}

.mark {
  fill: var(--accent-color);
}

.fold {
  fill: var(--accent-hover);
}

.line {
  fill: #ffffff;
}

.enhanced {
  border-radius: 8px;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.12));
}
</style>
