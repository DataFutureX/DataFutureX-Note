<script setup lang="ts">
import logoUrl from '@/assets/logo-mark.png'

withDefaults(
  defineProps<{
    size?: number | string
    /** 为空时作为装饰图标（aria-hidden） */
    label?: string
    /** 大尺寸展示时可略加强阴影（默认关闭） */
    enhanced?: boolean
  }>(),
  {
    size: 16,
    label: 'DataFutureX Note',
    enhanced: false
  }
)
</script>

<template>
  <img
    class="logo-mark"
    :class="{ enhanced }"
    :src="logoUrl"
    :width="size"
    :height="size"
    :alt="label || ''"
    :role="label ? 'img' : 'presentation'"
    :aria-label="label || undefined"
    :aria-hidden="label ? undefined : true"
    draggable="false"
  />
</template>

<style scoped>
.logo-mark {
  display: block;
  flex-shrink: 0;
  object-fit: contain;
  border-radius: 0;
  background: transparent;
  user-select: none;
  -webkit-user-drag: none;
}

.enhanced {
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.16));
}
</style>
