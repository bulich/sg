<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { getProject, getLogo } from '@/storage/repositories';
import { renderVideoInWorker } from '@/video/workerClient';
import type { Project } from '@/types/editor';
import { useProjectsStore } from '@/stores/projects';
import { useEditorStore } from '@/stores/editor';
import { toast } from '@/composables/useToast';

type Phase = 'loading' | 'ready' | 'rendering' | 'done' | 'error' | 'canceled';

const props = defineProps<{ id: string }>();
const router = useRouter();
const projectsStore = useProjectsStore();
const editorStore = useEditorStore();

const phase = ref<Phase>('loading');
const project = ref<Project | null>(null);
const videoBlob = ref<Blob | null>(null);
const logoBlob = ref<Blob | null>(null);
const errorMessage = ref<string>('');

const resultBlob = ref<Blob | null>(null);
const resultUrl = ref<string>('');
const fileName = computed(() => `${safeFilename(project.value?.name ?? 'shorts')}.mp4`);

const currentSec = ref(0);
const durationSec = ref(0);
const fps = ref(0);
const frames = ref(0);
const startedAt = ref(0);

let abortController: AbortController | null = null;

const percent = computed(() => {
  if (durationSec.value <= 0) return 0;
  return Math.min(100, Math.round((currentSec.value / durationSec.value) * 100));
});

const etaLabel = computed(() => {
  if (currentSec.value <= 0 || durationSec.value <= 0) return '—';
  const elapsed = (performance.now() - startedAt.value) / 1000;
  const fraction = currentSec.value / durationSec.value;
  if (fraction <= 0) return '—';
  const total = elapsed / fraction;
  const remaining = Math.max(0, total - elapsed);
  return formatDuration(remaining);
});

const elapsedLabel = computed(() => {
  if (phase.value !== 'rendering' && phase.value !== 'done') return '—';
  if (!startedAt.value) return '—';
  const e = Math.max(0, (performance.now() - startedAt.value) / 1000);
  return formatDuration(e);
});

const canShare = computed(() => {
  if (typeof navigator === 'undefined' || !resultBlob.value) return false;
  if (!('canShare' in navigator)) return false;
  const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
  try {
    return Boolean(
      nav.canShare?.({
        files: [new File([resultBlob.value], fileName.value, { type: 'video/mp4' })],
      }),
    );
  } catch {
    return false;
  }
});

onMounted(async () => {
  const loaded = await getProject(props.id);
  if (!loaded) {
    phase.value = 'error';
    errorMessage.value = 'Проект не найден';
    return;
  }
  const cached = projectsStore.getSessionVideo(loaded.id);
  if (!cached) {
    phase.value = 'error';
    errorMessage.value = 'Загрузите видео в редакторе';
    return;
  }
  project.value = loaded;
  videoBlob.value = cached.blob;
  if (loaded.settings.logo.assetId) {
    const asset = await getLogo(loaded.settings.logo.assetId);
    if (asset) logoBlob.value = asset.blob;
  }
  durationSec.value = cached.meta.durationSec;
  phase.value = 'ready';
});

onBeforeUnmount(() => {
  abortController?.abort();
  revokeUrl();
});

async function startRender() {
  if (phase.value === 'rendering') return;
  if (!project.value || !videoBlob.value) return;
  phase.value = 'rendering';
  errorMessage.value = '';
  currentSec.value = 0;
  frames.value = 0;
  fps.value = 0;
  startedAt.value = performance.now();
  abortController = new AbortController();

  try {
    const bgTime =
      editorStore.project?.id === props.id
        ? editorStore.previewTimeSec
        : Math.min(0.5, Math.max(0, durationSec.value / 2));
    const blob = await renderVideoInWorker({
      input: videoBlob.value,
      settings: project.value.settings,
      logoBlob: logoBlob.value,
      backgroundTimeSec: bgTime,
      signal: abortController.signal,
      onProgress: (p) => {
        currentSec.value = p.currentSec;
        durationSec.value = p.durationSec;
        frames.value = p.frame;
        fps.value = p.fps;
      },
    });
    resultBlob.value = blob;
    revokeUrl();
    resultUrl.value = URL.createObjectURL(blob);
    phase.value = 'done';
  } catch (err) {
    const aborted =
      err instanceof DOMException && err.name === 'AbortError' ||
      (err instanceof Error && err.message.toLowerCase().includes('abort'));
    if (aborted) {
      phase.value = 'canceled';
    } else {
      phase.value = 'error';
      errorMessage.value = err instanceof Error ? err.message : 'Ошибка экспорта';
      console.error('[export:error]', err);
      toast().show(errorMessage.value, { kind: 'error' });
    }
  } finally {
    abortController = null;
  }
}

function cancelRender() {
  abortController?.abort();
}

async function shareResult() {
  if (!resultBlob.value) return;
  const file = new File([resultBlob.value], fileName.value, { type: 'video/mp4' });
  const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
  try {
    await nav.share?.({ files: [file], title: project.value?.name ?? 'Shorts' });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    toast().show('Не удалось поделиться', { kind: 'error' });
  }
}

function goBack() {
  router.push({ name: 'editor', params: { id: props.id } });
}

function revokeUrl() {
  if (resultUrl.value) {
    URL.revokeObjectURL(resultUrl.value);
    resultUrl.value = '';
  }
}

function safeFilename(name: string): string {
  return name.trim().replace(/[^\p{L}\p{N}\-_ ]+/gu, '_').replace(/\s+/g, '_').slice(0, 60) || 'shorts';
}

function formatDuration(sec: number): string {
  if (!isFinite(sec)) return '—';
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}
</script>

<template>
  <main class="export">
    <header class="header">
      <button type="button" class="back" aria-label="Назад" @click="goBack">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <h1 class="title">Экспорт</h1>
      <span class="spacer" />
    </header>

    <section v-if="phase === 'loading'" class="stub">Загрузка…</section>

    <section v-else-if="phase === 'ready'" class="body">
      <p class="hint">Будет создан MP4 1080×1920. Длительность {{ formatDuration(durationSec) }}.</p>
      <button type="button" class="primary" @click="startRender">Начать экспорт</button>
    </section>

    <section v-else-if="phase === 'rendering'" class="body">
      <div class="progress-wrap">
        <div class="progress">
          <div class="progress-bar" :style="{ width: percent + '%' }"></div>
        </div>
        <div class="progress-text">
          <span class="percent">{{ percent }}%</span>
          <span class="muted">{{ fps.toFixed(1) }} fps · кадр {{ frames }}</span>
        </div>
      </div>
      <dl class="stats">
        <div><dt>Прошло</dt><dd>{{ elapsedLabel }}</dd></div>
        <div><dt>Осталось</dt><dd>{{ etaLabel }}</dd></div>
        <div><dt>Позиция</dt><dd>{{ currentSec.toFixed(2) }} / {{ durationSec.toFixed(2) }} с</dd></div>
      </dl>
      <button type="button" class="secondary" @click="cancelRender">Отменить</button>
    </section>

    <section v-else-if="phase === 'done'" class="body">
      <video class="preview-video" :src="resultUrl" controls playsinline />
      <div class="actions">
        <a class="primary" :href="resultUrl" :download="fileName">Сохранить</a>
        <button v-if="canShare" type="button" class="secondary" @click="shareResult">Поделиться</button>
      </div>
      <p class="muted">Размер: {{ Math.round((resultBlob?.size ?? 0) / 1024) }} КБ</p>
    </section>

    <section v-else-if="phase === 'canceled'" class="body">
      <p>Экспорт отменён.</p>
      <button type="button" class="primary" @click="startRender">Повторить</button>
    </section>

    <section v-else class="body">
      <p class="error">{{ errorMessage || 'Ошибка' }}</p>
      <button type="button" class="primary" @click="goBack">К редактору</button>
    </section>
  </main>
</template>

<style scoped>
.export {
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
.title {
  flex: 1;
  font-size: 16px;
  font-weight: 600;
  text-align: center;
}
.spacer {
  width: 36px;
}
.body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px 16px;
  align-items: stretch;
  min-height: 0;
}
.stub {
  padding: 40px;
  text-align: center;
  color: var(--text-muted);
}
.hint {
  color: var(--text-muted);
  margin: 0;
}
.muted {
  color: var(--text-muted);
  font-size: 13px;
}
.primary,
.secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 12px 18px;
  font-weight: 600;
  font-size: 15px;
  text-decoration: none;
}
.primary {
  background: var(--accent);
  color: #fff;
}
.primary[disabled] {
  opacity: 0.5;
  pointer-events: none;
}
.secondary {
  background: var(--bg-elev);
  color: var(--text);
}
.progress-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.progress {
  height: 10px;
  border-radius: 999px;
  background: var(--bg-elev);
  overflow: hidden;
}
.progress-bar {
  height: 100%;
  background: var(--accent);
  transition: width 0.2s linear;
}
.progress-text {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-variant-numeric: tabular-nums;
}
.percent {
  font-size: 18px;
  font-weight: 600;
}
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 8px 16px;
  margin: 0;
  padding: 12px;
  background: var(--bg-elev);
  border-radius: var(--radius-md);
}
.stats div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.stats dt {
  font-size: 12px;
  color: var(--text-muted);
}
.stats dd {
  margin: 0;
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}
.preview-video {
  width: 100%;
  max-height: 50vh;
  border-radius: var(--radius-md);
  background: #000;
}
.actions {
  display: flex;
  gap: 12px;
}
.actions .primary,
.actions .secondary {
  flex: 1;
}
.error {
  color: #ff6b6b;
  margin: 0;
}
</style>
