<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) emit('close');
}

onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

const links = [
  { to: { name: 'projects' }, label: 'Главная' },
  { to: { name: 'logs' }, label: 'Логи' },
];
</script>

<template>
  <Transition name="drawer">
    <div v-if="open" class="backdrop" @click.self="emit('close')">
      <aside class="drawer" role="dialog" aria-modal="true">
        <header class="drawer-head">
          <span class="title">Меню</span>
          <button class="close" type="button" aria-label="Закрыть" @click="emit('close')">✕</button>
        </header>
        <nav class="nav">
          <router-link
            v-for="link in links"
            :key="link.label"
            :to="link.to"
            class="link"
            @click="emit('close')"
          >
            {{ link.label }}
          </router-link>
        </nav>
      </aside>
    </div>
  </Transition>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 100;
}
.drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(80vw, 320px);
  background: var(--bg-elev);
  padding: calc(12px + var(--safe-top)) calc(12px + var(--safe-right)) calc(12px + var(--safe-bottom)) 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px 12px;
}
.title {
  font-size: 18px;
  font-weight: 600;
}
.close {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  color: var(--text-muted);
  font-size: 16px;
}
.close:hover {
  background: var(--bg-elev-2);
}
.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.link {
  padding: 12px 14px;
  border-radius: var(--radius-md);
  color: var(--text);
  text-decoration: none;
  font-size: 15px;
  font-weight: 500;
}
.link:hover {
  background: var(--bg-elev-2);
}
.link.router-link-exact-active {
  background: var(--bg-elev-2);
  color: var(--accent);
}
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.2s ease;
}
.drawer-enter-active .drawer,
.drawer-leave-active .drawer {
  transition: transform 0.25s ease;
}
.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}
.drawer-enter-from .drawer,
.drawer-leave-to .drawer {
  transform: translateX(100%);
}
</style>
