<script setup lang="ts">
import { useRouter } from 'vue-router';
import { logs, clearLogs } from '@/debug/logBus';

const router = useRouter();

function fmtTime(t: number) {
  const d = new Date(t);
  return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

async function copyAll() {
  const text = logs
    .map((l) => `[${fmtTime(l.time)}] ${l.level.toUpperCase()} ${l.text}`)
    .join('\n');
  try {
    await navigator.clipboard.writeText(text);
    alert('Скопировано');
  } catch {
    alert('Не удалось скопировать. Выдели текст вручную.');
  }
}
</script>

<template>
  <main class="logs">
    <header class="header">
      <button class="back" @click="router.back()">← Назад</button>
      <h1>Логи</h1>
      <div class="actions">
        <button @click="copyAll">Копировать</button>
        <button @click="clearLogs">Очистить</button>
      </div>
    </header>
    <div v-if="!logs.length" class="empty">Логов нет</div>
    <ol v-else class="list">
      <li v-for="l in logs" :key="l.id" :class="['entry', l.level]">
        <div class="meta">
          <span class="time">{{ fmtTime(l.time) }}</span>
          <span class="level">{{ l.level }}</span>
        </div>
        <pre class="text">{{ l.text }}</pre>
      </li>
    </ol>
  </main>
</template>

<style scoped>
.logs {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  height: 100%;
}
.header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}
h1 {
  font-size: 16px;
  font-weight: 600;
  flex: 1;
}
.actions {
  display: flex;
  gap: 8px;
}
.actions button,
.back {
  padding: 6px 12px;
  border-radius: 8px;
  background: var(--bg-elev);
  color: var(--text);
  font-size: 13px;
}
.empty {
  padding: 40px;
  text-align: center;
  color: var(--text-muted);
}
.list {
  list-style: none;
  margin: 0;
  padding: 8px 12px;
  overflow: auto;
  flex: 1;
  font-family: ui-monospace, Menlo, monospace;
  font-size: 12px;
}
.entry {
  border-bottom: 1px solid var(--border);
  padding: 6px 0;
}
.meta {
  display: flex;
  gap: 8px;
  color: var(--text-muted);
  font-size: 11px;
}
.level {
  text-transform: uppercase;
  font-weight: 600;
}
.entry.warn .level { color: #d99a00; }
.entry.error .level { color: #e5484d; }
.text {
  margin: 2px 0 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text);
}
.entry.error .text { color: #ff7377; }
</style>
