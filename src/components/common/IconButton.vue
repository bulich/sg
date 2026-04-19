<script setup lang="ts">
defineProps<{
  label?: string;
  variant?: 'ghost' | 'solid' | 'danger';
}>();
</script>

<template>
  <button
    type="button"
    class="icon-btn"
    :class="['variant-' + (variant ?? 'ghost')]"
    :aria-label="label"
  >
    <slot />
  </button>
</template>

<style scoped>
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  border-radius: 999px;
  transition: background 0.15s ease, transform 0.1s ease;
}
.icon-btn:active {
  transform: scale(0.95);
}
.variant-ghost {
  background: transparent;
  color: var(--text);
}
.variant-ghost:hover {
  background: var(--bg-elev);
}
.variant-solid {
  background: var(--accent);
  color: #fff;
}
.variant-danger {
  background: var(--bg-elev);
  color: var(--danger);
}
</style>
