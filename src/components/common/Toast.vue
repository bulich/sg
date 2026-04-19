<script setup lang="ts">
import { ref } from 'vue';

const visible = ref(false);
const message = ref('');
const kind = ref<'info' | 'error' | 'success'>('info');
let timer: number | null = null;

function show(text: string, options?: { kind?: 'info' | 'error' | 'success'; duration?: number }) {
  message.value = text;
  kind.value = options?.kind ?? 'info';
  visible.value = true;
  if (timer) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    visible.value = false;
  }, options?.duration ?? 3000);
}

defineExpose({ show });
</script>

<template>
  <Transition name="toast">
    <div v-if="visible" class="toast" :class="'kind-' + kind" role="status">
      {{ message }}
    </div>
  </Transition>
</template>

<style scoped>
.toast {
  position: fixed;
  left: 50%;
  bottom: calc(100px + var(--safe-bottom));
  transform: translateX(-50%);
  background: var(--bg-elev-2);
  color: var(--text);
  padding: 12px 18px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 500;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  z-index: 200;
  max-width: calc(100vw - 32px);
  text-align: center;
}
.kind-error {
  background: var(--danger);
  color: #fff;
}
.kind-success {
  background: #34c759;
  color: #fff;
}
.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 10px);
}
</style>
