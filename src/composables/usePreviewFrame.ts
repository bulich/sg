import { ref, watch, onBeforeUnmount, type Ref } from 'vue';
import { BlobSource, CanvasSink, Input, ALL_FORMATS } from 'mediabunny';

export interface PreviewFrameHandle {
  bitmap: Ref<ImageBitmap | null>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
}

export function usePreviewFrame(
  blobRef: () => Blob | null,
  timeRef: () => number,
): PreviewFrameHandle {
  const bitmap = ref<ImageBitmap | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  let sink: CanvasSink | null = null;
  let input: Input | null = null;
  let currentBlob: Blob | null = null;
  let seq = 0;

  async function ensureSink(blob: Blob | null) {
    if (blob === currentBlob) return;
    disposeSink();
    currentBlob = blob;
    if (!blob) return;
    input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track) {
      error.value = 'Видео-дорожка не найдена';
      return;
    }
    sink = new CanvasSink(track, { poolSize: 2 });
  }

  function disposeSink() {
    sink = null;
    if (input) {
      input.dispose();
      input = null;
    }
    if (bitmap.value) {
      bitmap.value.close();
      bitmap.value = null;
    }
  }

  async function update() {
    const ticket = ++seq;
    const blob = blobRef();
    const time = timeRef();

    if (!blob) {
      disposeSink();
      return;
    }

    loading.value = true;
    error.value = null;
    try {
      await ensureSink(blob);
      if (ticket !== seq || !sink) return;
      const wrapped = await sink.getCanvas(time);
      if (ticket !== seq) return;
      if (!wrapped) {
        error.value = 'Кадр недоступен';
        return;
      }
      const previous = bitmap.value;
      bitmap.value = await createImageBitmap(wrapped.canvas);
      previous?.close();
    } catch (err) {
      if (ticket !== seq) return;
      error.value = err instanceof Error ? err.message : 'Ошибка превью';
    } finally {
      if (ticket === seq) loading.value = false;
    }
  }

  watch([blobRef, timeRef], () => void update(), { immediate: true });

  onBeforeUnmount(disposeSink);

  return { bitmap, loading, error };
}
