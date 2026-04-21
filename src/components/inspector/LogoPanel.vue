<script setup lang="ts">
import { computed, ref } from 'vue';
import { useEditorStore } from '@/stores/editor';
import NumberSlider from '@/components/common/NumberSlider.vue';
import { toast } from '@/composables/useToast';
import { OUTPUT_WIDTH } from '@/constants';

const store = useEditorStore();
const fileInput = ref<HTMLInputElement | null>(null);

const preview = computed(() => {
  const blob = store.logoBlob;
  return blob ? URL.createObjectURL(blob) : null;
});

function openPicker() {
  fileInput.value?.click();
}

function centerX() {
  const width = store.settings.logo.width;
  store.updateLogo({ x: Math.round((OUTPUT_WIDTH - width) / 2) });
}

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const supported = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
  if (!supported.includes(file.type)) {
    toast().show('Поддерживаются PNG, JPEG, WebP, SVG', { kind: 'error' });
    return;
  }
  try {
    await store.setLogoFromBlob(file);
  } catch (err) {
    toast().show(err instanceof Error ? err.message : 'Ошибка загрузки', { kind: 'error' });
  }
}
</script>

<template>
  <div class="panel">
    <div class="upload">
      <div class="thumb">
        <img v-if="preview" :src="preview" alt="Логотип" />
        <span v-else class="placeholder">Нет лого</span>
      </div>
      <div class="actions">
        <button type="button" class="primary" @click="openPicker">
          {{ store.settings.logo.assetId ? 'Заменить' : 'Загрузить' }}
        </button>
        <button
          v-if="store.settings.logo.assetId"
          type="button"
          class="secondary"
          @click="store.removeLogo()"
        >Удалить</button>
      </div>
      <input
        ref="fileInput"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        hidden
        @change="onFile"
      />
    </div>

    <button
      v-if="store.settings.logo.assetId"
      type="button"
      class="center-btn"
      @click="centerX"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M12 3v18" />
        <path d="M6 8h12" />
        <path d="M4 16h16" />
      </svg>
      <span>Центрировать по горизонтали</span>
    </button>

    <NumberSlider
      v-if="store.settings.logo.assetId"
      label="Ширина"
      :model-value="store.settings.logo.width"
      :min="50"
      :max="1080"
      :step="1"
      unit="px"
      @update:model-value="(v: number) => store.updateLogo({ width: v })"
    />
    <NumberSlider
      v-if="store.settings.logo.assetId"
      label="Высота"
      :model-value="store.settings.logo.height"
      :min="50"
      :max="1920"
      :step="1"
      unit="px"
      @update:model-value="(v: number) => store.updateLogo({ height: v })"
    />
    <NumberSlider
      v-if="store.settings.logo.assetId"
      label="X"
      :model-value="store.settings.logo.x"
      :min="-200"
      :max="1280"
      :step="1"
      unit="px"
      @update:model-value="(v: number) => store.updateLogo({ x: v })"
    />
    <NumberSlider
      v-if="store.settings.logo.assetId"
      label="Y"
      :model-value="store.settings.logo.y"
      :min="-200"
      :max="2100"
      :step="1"
      unit="px"
      @update:model-value="(v: number) => store.updateLogo({ y: v })"
    />
    <NumberSlider
      v-if="store.settings.logo.assetId"
      label="Прозрачность"
      :model-value="store.settings.logo.opacity"
      :min="0"
      :max="1"
      :step="0.05"
      @update:model-value="(v: number) => store.updateLogo({ opacity: v })"
    />
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  padding: 4px 16px 16px;
}
.upload {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0 12px;
}
.thumb {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-md);
  background: var(--bg-elev-2);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}
.thumb img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.placeholder {
  color: var(--text-dim);
  font-size: 12px;
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}
.primary,
.secondary {
  padding: 8px 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
  text-align: center;
}
.primary {
  background: var(--accent);
  color: #fff;
}
.secondary {
  background: var(--bg-elev-2);
  color: var(--danger);
}
.center-btn {
  align-self: flex-start;
  padding: 8px 12px;
  border-radius: 999px;
  background: var(--bg-elev-2);
  color: var(--text);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  margin: 0 0 8px;
}
.center-btn:hover {
  background: var(--bg-elev);
}
</style>
