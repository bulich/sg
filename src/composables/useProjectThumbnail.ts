import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { Project } from '@/types/editor';

export function useProjectThumbnail(projectRef: () => Project | null | undefined) {
  const url = ref<string | null>(null);
  let current: string | null = null;

  function revoke() {
    if (current) {
      URL.revokeObjectURL(current);
      current = null;
    }
  }

  watch(
    computed(() => projectRef()?.thumbnailBlob ?? null),
    (blob) => {
      revoke();
      if (blob) {
        current = URL.createObjectURL(blob);
        url.value = current;
      } else {
        url.value = null;
      }
    },
    { immediate: true },
  );

  onBeforeUnmount(revoke);

  return url;
}
