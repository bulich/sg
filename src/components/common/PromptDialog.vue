<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
  open: boolean;
  title: string;
  placeholder?: string;
  initial?: string;
  confirmLabel?: string;
}>();

const emit = defineEmits<{
  confirm: [value: string];
  close: [];
}>();

const value = ref(props.initial ?? '');

watch(
  () => props.open,
  (open) => {
    if (open) value.value = props.initial ?? '';
  },
);

function confirm() {
  const v = value.value.trim();
  if (v) emit('confirm', v);
}
</script>

<template>
  <Transition name="fade">
    <div v-if="open" class="backdrop" @click.self="emit('close')">
      <div class="dialog" role="dialog" aria-modal="true">
        <h2>{{ title }}</h2>
        <input
          v-model="value"
          :placeholder="placeholder"
          autofocus
          @keydown.enter="confirm"
        />
        <div class="actions">
          <button class="secondary" type="button" @click="emit('close')">Отмена</button>
          <button class="primary" type="button" @click="confirm">
            {{ confirmLabel ?? 'ОК' }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 100;
}
.dialog {
  width: 100%;
  max-width: 360px;
  background: var(--bg-elev);
  border-radius: var(--radius-lg);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
h2 {
  font-size: 18px;
}
input {
  padding: 12px;
}
.actions {
  display: flex;
  gap: 8px;
}
.actions button {
  flex: 1;
  padding: 12px;
  border-radius: var(--radius-md);
  font-weight: 600;
}
.primary {
  background: var(--accent);
  color: #fff;
}
.secondary {
  background: var(--bg-elev-2);
  color: var(--text);
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
