<script setup lang="ts">
import { ref } from 'vue';
import BackgroundPanel from './BackgroundPanel.vue';
import MainVideoPanel from './MainVideoPanel.vue';
import LogoPanel from './LogoPanel.vue';
import TextPanel from './TextPanel.vue';

type Tab = 'background' | 'video' | 'logo' | 'text';
const active = ref<Tab>('background');

const tabs: { id: Tab; label: string }[] = [
  { id: 'background', label: 'Фон' },
  { id: 'video', label: 'Видео' },
  { id: 'logo', label: 'Лого' },
  { id: 'text', label: 'Текст' },
];
</script>

<template>
  <div class="wrap">
    <nav class="tabs" role="tablist">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        class="tab"
        :class="{ active: tab.id === active }"
        role="tab"
        :aria-selected="tab.id === active"
        @click="active = tab.id"
      >{{ tab.label }}</button>
    </nav>
    <section class="body">
      <BackgroundPanel v-if="active === 'background'" />
      <MainVideoPanel v-else-if="active === 'video'" />
      <LogoPanel v-else-if="active === 'logo'" />
      <TextPanel v-else />
    </section>
  </div>
</template>

<style scoped>
.wrap {
  display: flex;
  flex-direction: column;
  background: var(--bg-elev);
  border-top: 1px solid var(--border);
}
.tabs {
  display: flex;
  gap: 4px;
  padding: 8px 12px 4px;
  overflow-x: auto;
  scrollbar-width: none;
}
.tabs::-webkit-scrollbar {
  display: none;
}
.tab {
  padding: 8px 14px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-muted);
  background: transparent;
  white-space: nowrap;
}
.tab.active {
  background: var(--bg-elev-2);
  color: var(--text);
}
.body {
  max-height: 260px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
</style>
