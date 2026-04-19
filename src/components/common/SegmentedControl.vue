<script setup lang="ts" generic="T extends string | number">
const props = defineProps<{
  modelValue: T;
  options: { value: T; label: string }[];
}>();
defineEmits<{
  'update:modelValue': [value: T];
}>();
void props;
</script>

<template>
  <div class="segmented" role="tablist">
    <button
      v-for="opt in options"
      :key="String(opt.value)"
      type="button"
      class="segment"
      :class="{ active: opt.value === modelValue }"
      role="tab"
      :aria-selected="opt.value === modelValue"
      @click="$emit('update:modelValue', opt.value)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>

<style scoped>
.segmented {
  display: inline-flex;
  background: var(--bg-elev-2);
  border-radius: 999px;
  padding: 3px;
  gap: 2px;
}
.segment {
  flex: 1;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  border-radius: 999px;
  transition: background 0.15s ease, color 0.15s ease;
  white-space: nowrap;
}
.segment.active {
  background: var(--accent);
  color: #fff;
}
</style>
