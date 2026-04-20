<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useProjectsStore } from '@/stores/projects';
import ProjectCard from '@/components/projects/ProjectCard.vue';
import ActionSheet from '@/components/common/ActionSheet.vue';
import PromptDialog from '@/components/common/PromptDialog.vue';
import { toast } from '@/composables/useToast';
import { VideoValidationError } from '@/video/validation';

const router = useRouter();
const store = useProjectsStore();

const menuProjectId = ref<string | null>(null);
const renameProjectId = ref<string | null>(null);
const createOpen = ref(false);
const importing = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
let pendingName = '';

const menuProject = computed(() =>
  menuProjectId.value ? store.projects.find((p) => p.id === menuProjectId.value) ?? null : null,
);
const renameProject = computed(() =>
  renameProjectId.value ? store.projects.find((p) => p.id === renameProjectId.value) ?? null : null,
);

onMounted(() => {
  store.loadAll();
});

function openProject(id: string) {
  router.push({ name: 'editor', params: { id } });
}

function openMenu(id: string) {
  menuProjectId.value = id;
}

function closeMenu() {
  menuProjectId.value = null;
}

function startRename() {
  renameProjectId.value = menuProjectId.value;
  closeMenu();
}

async function confirmRename(name: string) {
  if (renameProjectId.value) {
    await store.rename(renameProjectId.value, name);
  }
  renameProjectId.value = null;
}

async function confirmDelete() {
  if (menuProjectId.value) {
    await store.remove(menuProjectId.value);
  }
  closeMenu();
}

function confirmCreate(name: string) {
  pendingName = name;
  createOpen.value = false;
  fileInput.value?.click();
}

async function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;

  importing.value = true;
  try {
    const project = await store.create(pendingName || 'Без названия');
    try {
      await store.importVideo(project.id, file);
      router.push({ name: 'editor', params: { id: project.id } });
    } catch (err) {
      await store.remove(project.id);
      throw err;
    }
  } catch (err) {
    const message = err instanceof VideoValidationError
      ? err.message
      : err instanceof Error
        ? err.message
        : 'Не удалось импортировать видео';
    toast().show(message, { kind: 'error', duration: 5000 });
  } finally {
    importing.value = false;
  }
}
</script>

<template>
  <main class="page">
    <header class="header">
      <h1>Проекты</h1>
      <router-link :to="{ name: 'logs' }" class="logs-btn" aria-label="Логи">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 6h16" />
          <path d="M4 12h16" />
          <path d="M4 18h10" />
        </svg>
        <span>Логи</span>
      </router-link>
    </header>

    <section v-if="store.loading" class="state muted">Загрузка…</section>
    <section v-else-if="store.projects.length === 0" class="empty">
      <div class="empty-illo">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
          <rect x="5" y="2" width="14" height="20" rx="3" />
          <circle cx="12" cy="15" r="3" />
        </svg>
      </div>
      <h2>Нет проектов</h2>
      <p class="muted">Создайте первый проект, чтобы начать</p>
    </section>

    <section v-else class="grid">
      <ProjectCard
        v-for="project in store.projects"
        :key="project.id"
        :project="project"
        @open="openProject"
        @menu="openMenu"
      />
    </section>

    <button
      type="button"
      class="fab"
      aria-label="Новый проект"
      :disabled="importing"
      @click="createOpen = true"
    >
      <svg v-if="!importing" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
      <span v-else class="spinner" aria-hidden="true"></span>
    </button>

    <input
      ref="fileInput"
      type="file"
      accept="video/mp4,video/quicktime"
      hidden
      @change="onFileSelected"
    />

    <ActionSheet :open="menuProject !== null" :title="menuProject?.name" @close="closeMenu">
      <button class="sheet-btn" type="button" @click="startRename">Переименовать</button>
      <button class="sheet-btn danger" type="button" @click="confirmDelete">Удалить</button>
    </ActionSheet>

    <PromptDialog
      :open="renameProject !== null"
      title="Переименовать"
      :initial="renameProject?.name ?? ''"
      confirm-label="Сохранить"
      @confirm="confirmRename"
      @close="renameProjectId = null"
    />

    <PromptDialog
      :open="createOpen"
      title="Новый проект"
      placeholder="Название"
      initial="Без названия"
      confirm-label="Создать"
      @confirm="confirmCreate"
      @close="createOpen = false"
    />
  </main>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  flex: 1;
  position: relative;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
}
h1 {
  font-size: 28px;
}
.logs-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 999px;
  background: var(--bg-elev);
  color: var(--text);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
}
.logs-btn:hover {
  background: var(--bg-elev-2);
}
.state,
.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  text-align: center;
}
.empty-illo {
  color: var(--text-dim);
  margin-bottom: 16px;
}
.empty h2 {
  font-size: 20px;
  margin-bottom: 8px;
}
.muted {
  color: var(--text-muted);
}
.grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  padding: 12px 16px 120px;
}
@media (min-width: 640px) {
  .grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
@media (min-width: 960px) {
  .grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
.fab {
  position: fixed;
  right: calc(20px + var(--safe-right));
  bottom: calc(24px + var(--safe-bottom));
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 24px rgba(10, 132, 255, 0.35);
  transition: transform 0.15s ease;
}
.fab:active {
  transform: scale(0.95);
}
.fab[disabled] {
  opacity: 0.7;
}
.spinner {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2.5px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.sheet-btn {
  padding: 14px;
  border-radius: var(--radius-md);
  text-align: center;
  background: var(--bg-elev-2);
  margin-bottom: 2px;
  font-weight: 500;
}
.sheet-btn.danger {
  color: var(--danger);
}
</style>
