import { onBeforeUnmount, ref, shallowRef, watch, type Ref } from 'vue';
import { Scene } from '@/video/scene';
import type { useEditorStore } from '@/stores/editor';
import { OUTPUT_HEIGHT, OUTPUT_WIDTH } from '@/constants';

type EditorStore = ReturnType<typeof useEditorStore>;

export function useScene(
  canvasRef: Ref<HTMLCanvasElement | null>,
  frameBitmap: Ref<ImageBitmap | null>,
  store: EditorStore,
) {
  const scene = shallowRef<Scene | null>(null);
  const ready = ref(false);

  async function init() {
    const canvas = canvasRef.value;
    if (!canvas) return;
    const instance = new Scene();
    await instance.init({
      canvas,
      width: OUTPUT_WIDTH,
      height: OUTPUT_HEIGHT,
    });
    scene.value = instance;
    ready.value = true;
    applyAll();
  }

  async function ensureFont(family: string, size: number): Promise<void> {
    if (typeof document === 'undefined' || !document.fonts) return;
    try {
      await document.fonts.load(`600 ${Math.round(size)}px "${family}"`);
    } catch {
      /* noop */
    }
  }

  function applyAll() {
    const s = scene.value;
    if (!s) return;
    s.setFrame(frameBitmap.value);
    s.setBackground(store.settings.background);
    s.setMainVideo(store.settings.mainVideo);
    s.setText(store.settings.text);
    void ensureFont(store.settings.text.fontFamily, store.settings.text.fontSize).then(() => {
      s.setText(store.settings.text);
      s.render();
    });
    void s.setLogo(store.logoBlob, store.settings.logo).then(() => s.render());
    s.render();
  }

  watch(canvasRef, async (canvas) => {
    if (canvas && !scene.value) await init();
  });

  watch(frameBitmap, (bmp) => {
    const s = scene.value;
    if (!s) return;
    s.setFrame(bmp);
    s.setMainVideo(store.settings.mainVideo);
    s.render();
  });

  watch(
    () => ({ ...store.settings.background }),
    (bg) => {
      const s = scene.value;
      if (!s) return;
      s.setBackground(bg);
      s.render();
    },
    { deep: true },
  );

  watch(
    () => ({ ...store.settings.mainVideo }),
    (mv) => {
      const s = scene.value;
      if (!s) return;
      s.setMainVideo(mv);
      s.render();
    },
    { deep: true },
  );

  watch(
    () => ({ ...store.settings.text }),
    async (t) => {
      const s = scene.value;
      if (!s) return;
      await ensureFont(t.fontFamily, t.fontSize);
      if (!scene.value) return;
      s.setText(t);
      s.render();
    },
    { deep: true },
  );

  watch(
    () => ({ ...store.settings.logo }),
    (lg) => {
      const s = scene.value;
      if (!s) return;
      s.updateLogoSettings(lg);
      s.render();
    },
    { deep: true },
  );

  watch(
    () => store.logoBlob,
    async (blob) => {
      const s = scene.value;
      if (!s) return;
      await s.setLogo(blob, store.settings.logo);
      s.render();
    },
  );

  onBeforeUnmount(() => {
    scene.value?.destroy();
    scene.value = null;
    ready.value = false;
  });

  return { scene, ready };
}
