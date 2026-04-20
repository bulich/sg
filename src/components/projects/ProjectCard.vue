<script setup lang="ts">
import { computed } from 'vue';
import type { Project } from '@/types/editor';

const props = defineProps<{ project: Project }>();
const emit = defineEmits<{
  open: [id: string];
  menu: [id: string];
}>();

const dateLabel = computed(() => {
  const d = new Date(props.project.updatedAt);
  return d.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'short',
  });
});
</script>

<template>
  <article class="card" @click="emit('open', project.id)">
    <div class="thumb">
      <div class="empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="6" y="3" width="12" height="18" rx="2" />
          <circle cx="12" cy="15" r="3" />
        </svg>
      </div>
    </div>
    <footer class="meta">
      <div class="name">{{ project.name }}</div>
      <button type="button" class="more" aria-label="Меню" @click.stop="emit('menu', project.id)">⋯</button>
    </footer>
    <div class="date">{{ dateLabel }}</div>
  </article>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  background: var(--bg-elev);
  border-radius: var(--radius-lg);
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.15s ease;
}
.card:active {
  transform: scale(0.98);
}
.thumb {
  position: relative;
  aspect-ratio: 9 / 16;
  background: var(--bg-elev-2);
  overflow: hidden;
}
.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-dim);
}
.meta {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 10px 4px;
}
.name {
  flex: 1;
  font-weight: 600;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.more {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  color: var(--text-muted);
  font-size: 18px;
  line-height: 1;
}
.more:hover {
  background: var(--bg-elev-2);
}
.date {
  padding: 0 10px 10px;
  font-size: 12px;
  color: var(--text-muted);
}
</style>
