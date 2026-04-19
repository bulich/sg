<script setup lang="ts">
import { RouterView, useRoute } from 'vue-router';
import { ref, onMounted, computed } from 'vue';
import Toast from '@/components/common/Toast.vue';
import { registerToast } from '@/composables/useToast';
import { logs } from '@/debug/logBus';

const toastRef = ref<InstanceType<typeof Toast> | null>(null);
const route = useRoute();

onMounted(() => {
  registerToast(toastRef);
});

const showFab = computed(() => route.name !== 'logs');
const errorCount = computed(() => logs.filter((l) => l.level === 'error').length);
</script>

<template>
  <RouterView />
  <Toast ref="toastRef" />
  <router-link
    v-if="showFab"
    :to="{ name: 'logs' }"
    class="logs-fab"
    aria-label="Логи"
  >
    Логи<span v-if="errorCount" class="badge">{{ errorCount }}</span>
  </router-link>
</template>

<style scoped>
.logs-fab {
  position: fixed;
  left: 12px;
  bottom: calc(12px + env(safe-area-inset-bottom));
  padding: 8px 14px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  backdrop-filter: blur(6px);
  z-index: 1000;
  text-decoration: none;
}
.badge {
  background: #e5484d;
  color: #fff;
  border-radius: 999px;
  padding: 1px 6px;
  font-size: 11px;
  min-width: 18px;
  text-align: center;
}
</style>
