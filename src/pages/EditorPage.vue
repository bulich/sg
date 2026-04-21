<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useEditorStore } from '@/stores/editor';
import { useProjectsStore } from '@/stores/projects';
import { usePreviewFrame } from '@/composables/usePreviewFrame';
import { useScene } from '@/composables/useScene';
import { OUTPUT_HEIGHT, OUTPUT_WIDTH } from '@/constants';
import InspectorTabs from '@/components/inspector/InspectorTabs.vue';
import MoveableOverlay from '@/components/editor/MoveableOverlay.vue';
import AppDrawer from '@/components/common/AppDrawer.vue';
import { toast } from '@/composables/useToast';
import { VideoValidationError } from '@/video/validation';

const props = defineProps<{ id: string }>();
const router = useRouter();
const store = useEditorStore();
const projectsStore = useProjectsStore();
const canvasRef = ref<HTMLCanvasElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const replacing = ref(false);
const notFound = ref(false);
const menuOpen = ref(false);

onMounted(async () => {
  const ok = await store.openProject(props.id);
  if (!ok) notFound.value = true;
});

const preview = usePreviewFrame(
  () => store.videoBlob,
  () => store.previewTimeSec,
);

useScene(canvasRef, preview.bitmap, store);

const timeLabel = computed(() => store.previewTimeSec.toFixed(2));

function goBack() {
  void store.flushSave();
  router.push({ name: 'projects' });
}

function goExport() {
  void store.flushSave();
  router.push({ name: 'export', params: { id: props.id } });
}

function pickReplacement() {
  fileInput.value?.click();
}

async function onReplaceFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || replacing.value) return;
  replacing.value = true;
  try {
    await store.flushSave();
    await projectsStore.importVideo(props.id, file);
    await store.openProject(props.id);
    toast().show('Видео заменено', { kind: 'success' });
  } catch (err) {
    const message = err instanceof VideoValidationError
      ? err.message
      : err instanceof Error
        ? err.message
        : 'Не удалось заменить видео';
    toast().show(message, { kind: 'error', duration: 5000 });
  } finally {
    replacing.value = false;
  }
}
</script>

<template>
  <main class="editor">
    <header class="header">
      <button type="button" class="back" aria-label="Назад" @click="goBack">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <h1 class="title">{{ store.project?.name ?? '…' }}</h1>
      <button type="button" class="menu-btn" aria-label="Меню" @click="menuOpen = true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M4 6h16" />
          <path d="M4 12h16" />
          <path d="M4 18h16" />
        </svg>
      </button>
      <input
        ref="fileInput"
        type="file"
        accept="video/mp4,video/quicktime"
        hidden
        @change="onReplaceFile"
      />
    </header>

    <section v-if="notFound" class="stub">Проект не найден</section>

    <section v-else class="preview-wrap">
      <div class="stage">
        <canvas
          ref="canvasRef"
          :width="OUTPUT_WIDTH"
          :height="OUTPUT_HEIGHT"
          class="canvas"
        />
        <MoveableOverlay :canvas="canvasRef" />
        <div v-if="!store.videoBlob" class="overlay empty-state">
          <p>Видео не загружено</p>
          <button type="button" class="load-btn" :disabled="replacing" @click="pickReplacement">
            <span v-if="replacing" class="spinner-sm" aria-hidden="true"></span>
            <span v-else>Загрузить видео</span>
          </button>
        </div>
        <div v-else-if="preview.loading.value && !preview.bitmap.value" class="overlay">
          <span class="spinner" aria-hidden="true"></span>
        </div>
      </div>

      <div v-if="store.videoBlob" class="timeline">
        <input
          type="range"
          :min="0"
          :max="Math.max(0.01, store.duration)"
          step="0.01"
          v-model.number="store.previewTimeSec"
        />
        <span class="time">{{ timeLabel }} с</span>
      </div>
    </section>

    <InspectorTabs class="inspector">
      <template #actions>
        <button
          type="button"
          class="export"
          :disabled="!store.videoBlob || replacing"
          @click="goExport"
        >Экспорт</button>
      </template>
    </InspectorTabs>

    <AppDrawer :open="menuOpen" @close="menuOpen = false" />
  </main>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  flex: 1;
  height: 100%;
}
.header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}
.back {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text);
}
.back:hover {
  background: var(--bg-elev);
}
.menu-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text);
  background: transparent;
}
.menu-btn:hover {
  background: var(--bg-elev);
}
.title {
  flex: 1;
  font-size: 16px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
}
.export {
  padding: 8px 14px;
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
  font-weight: 600;
  font-size: 14px;
}
.export[disabled] {
  opacity: 0.4;
}
.spinner-sm {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  animation: spin 0.8s linear infinite;
}
.preview-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px;
  gap: 12px;
  min-height: 0;
}
.stage {
  position: relative;
  aspect-ratio: 9 / 16;
  max-height: 100%;
  background: #000;
  border-radius: var(--radius-md);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.canvas {
  width: 100%;
  height: 100%;
  display: block;
}
.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
}
.empty-state {
  flex-direction: column;
  gap: 16px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
}
.load-btn {
  background: var(--accent);
  color: #fff;
  font-weight: 600;
  padding: 10px 18px;
  border-radius: 999px;
  font-size: 14px;
}
.load-btn[disabled] {
  opacity: 0.6;
  pointer-events: none;
}
.spinner {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.timeline {
  width: 100%;
  max-width: 480px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.timeline input {
  flex: 1;
  accent-color: var(--accent);
}
.time {
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
  font-size: 13px;
  min-width: 56px;
  text-align: right;
}
.inspector {
  flex-shrink: 0;
}
.stub {
  padding: 40px;
  text-align: center;
  color: var(--text-muted);
}
</style>
