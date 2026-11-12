<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: number | string
    /** 为空时作为装饰图标（aria-hidden） */
    label?: string
  }>(),
  {
    size: 16,
    label: 'DataFutureX Note'
  }
)
</script>

<template>
  <svg
    class="logo-mark"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 32 32"
    :role="label ? 'img' : 'presentation'"
    :aria-label="label || undefined"
    :aria-hidden="label ? undefined : true"
    :width="size"
    :height="size"
  >
    <polygon class="mark" points="4,4 28,4 28,22 22,28 4,28" />
    <polygon class="fold" points="22,28 28,22 22,22" />
    <rect class="line" x="9" y="10" width="12" height="2.2" rx="1.1" />
    <rect class="line" x="9" y="14.5" width="10" height="2.2" rx="1.1" opacity="0.92" />
    <rect class="line" x="9" y="19" width="7" height="2.2" rx="1.1" opacity="0.8" />
  </svg>
</template>

<style scoped>
.logo-mark {
  display: block;
  flex-shrink: 0;
  border-radius: 3px;
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
</style>
