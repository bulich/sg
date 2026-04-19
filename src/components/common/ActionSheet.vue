<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue';

const props = defineProps<{
  open: boolean;
  title?: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) emit('close');
}

onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <Transition name="sheet">
    <div v-if="open" class="backdrop" @click.self="emit('close')">
      <div class="sheet" role="dialog" aria-modal="true">
        <header v-if="title" class="sheet-title">{{ title }}</header>
        <div class="sheet-body">
          <slot />
        </div>
        <button class="cancel" type="button" @click="emit('close')">Отмена</button>
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
  align-items: flex-end;
  z-index: 100;
}
.sheet {
  width: 100%;
  background: var(--bg-elev);
  border-top-left-radius: 20px;
  border-top-right-radius: 20px;
  padding: 8px 12px calc(12px + var(--safe-bottom));
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sheet-title {
  text-align: center;
  padding: 12px;
  color: var(--text-muted);
  font-size: 13px;
  border-bottom: 1px solid var(--border);
}
.sheet-body {
  display: flex;
  flex-direction: column;
}
.cancel {
  margin-top: 8px;
  background: var(--bg-elev-2);
  border-radius: var(--radius-md);
  padding: 14px;
  font-weight: 600;
}
.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 0.2s ease;
}
.sheet-enter-active .sheet,
.sheet-leave-active .sheet {
  transition: transform 0.25s ease;
}
.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}
.sheet-enter-from .sheet,
.sheet-leave-to .sheet {
  transform: translateY(100%);
}
</style>
