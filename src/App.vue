<script setup lang="ts">
import { RouterView } from 'vue-router';
import { ref, onMounted } from 'vue';
import Toast from '@/components/common/Toast.vue';
import { registerToast } from '@/composables/useToast';

const toastRef = ref<InstanceType<typeof Toast> | null>(null);

onMounted(() => {
  registerToast(toastRef);
});
</script>

<template>
  <RouterView />
  <Toast ref="toastRef" />
</template>
