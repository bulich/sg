<script setup lang="ts">
const props = defineProps<{
  modelValue: number;
  label: string;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: number];
}>();

function onInput(e: Event) {
  const value = Number((e.target as HTMLInputElement).value);
  emit('update:modelValue', value);
}

function onNumber(e: Event) {
  const raw = (e.target as HTMLInputElement).value;
  const num = Number(raw);
  if (Number.isNaN(num)) return;
  const clamped = Math.min(props.max, Math.max(props.min, num));
  emit('update:modelValue', clamped);
}
</script>

<template>
  <div class="row">
    <div class="head">
      <label class="label">{{ label }}</label>
      <div class="value-wrap">
        <input
          class="number"
          type="number"
          :value="modelValue"
          :min="min"
          :max="max"
          :step="step ?? 1"
          @input="onNumber"
        />
        <span v-if="unit" class="unit">{{ unit }}</span>
      </div>
    </div>
    <input
      type="range"
      :min="min"
      :max="max"
      :step="step ?? 1"
      :value="modelValue"
      @input="onInput"
    />
  </div>
</template>

<style scoped>
.row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 0;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.label {
  font-size: 13px;
  color: var(--text-muted);
}
.value-wrap {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.number {
  width: 72px;
  padding: 4px 8px;
  font-variant-numeric: tabular-nums;
  text-align: right;
  font-size: 13px;
}
.number::-webkit-outer-spin-button,
.number::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.number[type='number'] {
  -moz-appearance: textfield;
}
.unit {
  color: var(--text-muted);
  font-size: 12px;
}
input[type='range'] {
  width: 100%;
  accent-color: var(--accent);
  height: 28px;
  background: transparent;
  margin: 0;
}
</style>
