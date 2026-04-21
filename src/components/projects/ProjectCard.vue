<script setup lang="ts">
import { computed } from 'vue';
import type { Project } from '@/types/editor';

const props = defineProps<{ project: Project }>();
const emit = defineEmits<{
  open: [id: string];
  menu: [id: string];
}>();

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const updatedLabel = computed(() => formatDate(props.project.updatedAt));
const createdLabel = computed(() => formatDate(props.project.createdAt));
</script>

<template>
  <li class="card" @click="emit('open', project.id)">
    <div class="info">
      <div class="name">{{ project.name }}</div>
      <div class="meta">
        <span class="meta-item created">Создан {{ createdLabel }}</span>
        <span class="meta-sep" aria-hidden="true">·</span>
        <span class="meta-item">Изменён {{ updatedLabel }}</span>
      </div>
    </div>
    <button type="button" class="more" aria-label="Меню" @click.stop="emit('menu', project.id)">⋯</button>
  </li>
</template>

<style scoped>
.card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--bg-elev);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background 0.15s ease, transform 0.1s ease;
}
.card:hover {
  background: var(--bg-elev-2);
}
.card:active {
  transform: scale(0.995);
}
.info {
  flex: 1;
  min-width: 0;
}
.name {
  font-weight: 600;
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta {
  margin-top: 4px;
  color: var(--text-muted);
  font-size: 12px;
  display: flex;
  gap: 6px;
  align-items: center;
}
.meta-sep {
  opacity: 0.6;
}
@media (max-width: 480px) {
  .meta-item.created,
  .meta-sep {
    display: none;
  }
}
.more {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  color: var(--text-muted);
  font-size: 18px;
  line-height: 1;
  flex-shrink: 0;
}
.more:hover {
  background: var(--bg-elev-2);
}
</style>
