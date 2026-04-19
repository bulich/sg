import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import type {
  BackgroundSettings,
  EditorSettings,
  LogoSettings,
  MainVideoSettings,
  Project,
  TextSettings,
} from '@/types/editor';
import { DEFAULT_SETTINGS } from '@/constants';
import {
  getLogo,
  getProject,
  saveLogo,
  setProjectSettings,
} from '@/storage/repositories';

function cloneSettings(settings: EditorSettings): EditorSettings {
  return JSON.parse(JSON.stringify(settings)) as EditorSettings;
}

export const useEditorStore = defineStore('editor', () => {
  const project = ref<Project | null>(null);
  const settings = ref<EditorSettings>(cloneSettings(DEFAULT_SETTINGS));
  const logoBlob = ref<Blob | null>(null);
  const previewTimeSec = ref(0.5);
  const dirty = ref(false);
  const saving = ref(false);

  const videoBlob = computed(() => project.value?.videoBlob ?? null);
  const videoMeta = computed(() => project.value?.videoMeta ?? null);
  const duration = computed(() => project.value?.videoMeta?.durationSec ?? 0);

  let saveTimer: number | null = null;

  async function openProject(id: string): Promise<boolean> {
    const loaded = await getProject(id);
    if (!loaded) return false;
    project.value = loaded;
    settings.value = cloneSettings(loaded.settings);
    logoBlob.value = null;
    if (loaded.settings.logo.assetId) {
      const asset = await getLogo(loaded.settings.logo.assetId);
      if (asset) logoBlob.value = asset.blob;
    }
    previewTimeSec.value = Math.min(0.5, Math.max(0, (loaded.videoMeta?.durationSec ?? 1) / 2));
    dirty.value = false;
    return true;
  }

  function scheduleSave() {
    dirty.value = true;
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      void flushSave();
    }, 400);
  }

  async function flushSave(): Promise<void> {
    if (!project.value || !dirty.value) return;
    const id = project.value.id;
    saving.value = true;
    try {
      await setProjectSettings(id, cloneSettings(settings.value));
      dirty.value = false;
    } finally {
      saving.value = false;
    }
  }

  function updateBackground(patch: Partial<BackgroundSettings>) {
    settings.value.background = { ...settings.value.background, ...patch };
    scheduleSave();
  }

  function updateMainVideo(patch: Partial<MainVideoSettings>) {
    settings.value.mainVideo = { ...settings.value.mainVideo, ...patch };
    scheduleSave();
  }

  function updateLogo(patch: Partial<LogoSettings>) {
    settings.value.logo = { ...settings.value.logo, ...patch };
    scheduleSave();
  }

  function updateText(patch: Partial<TextSettings>) {
    settings.value.text = { ...settings.value.text, ...patch };
    scheduleSave();
  }

  async function setLogoFromBlob(blob: Blob): Promise<void> {
    const asset = await saveLogo(blob);
    logoBlob.value = blob;
    const aspect = asset.width && asset.height ? asset.width / asset.height : 1;
    const size = Math.min(400, asset.width || 400);
    updateLogo({
      assetId: asset.id,
      width: size,
      height: size / aspect,
    });
  }

  function removeLogo(): void {
    logoBlob.value = null;
    updateLogo({ assetId: null });
  }

  watch(
    () => project.value?.id,
    () => {
      dirty.value = false;
    },
  );

  return {
    project,
    settings,
    logoBlob,
    previewTimeSec,
    videoBlob,
    videoMeta,
    duration,
    dirty,
    saving,
    openProject,
    flushSave,
    updateBackground,
    updateMainVideo,
    updateLogo,
    updateText,
    setLogoFromBlob,
    removeLogo,
  };
});
