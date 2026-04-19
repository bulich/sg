import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { Project } from '@/types/editor';
import { useProjectsStore } from '@/stores/projects';

export function useProjectThumbnail(projectRef: () => Project | null | undefined) {
  const projectsStore = useProjectsStore();
  const url = ref<string | null>(null);
  let current: string | null = null;

  function revoke() {
    if (current) {
      URL.revokeObjectURL(current);
      current = null;
    }
  }

  watch(
    computed(() => {
      void projectsStore.cacheVersion;
      const id = projectRef()?.id;
      return id ? projectsStore.getSessionVideo(id)?.thumbnail ?? null : null;
    }),
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
