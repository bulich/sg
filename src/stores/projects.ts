import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Project, VideoMeta } from '@/types/editor';
import {
  createProject,
  deleteProject,
  listProjects,
  renameProject,
  setProjectLocked,
  touchProject,
} from '@/storage/repositories';
import { extractThumbnail, readInputMeta } from '@/video/pipeline';
import { validateInputMeta } from '@/video/validation';

interface SessionVideo {
  blob: Blob;
  meta: VideoMeta;
  thumbnail: Blob;
}

const videoCache = new Map<string, SessionVideo>();

export const useProjectsStore = defineStore('projects', () => {
  const projects = ref<Project[]>([]);
  const loading = ref(false);
  const cacheVersion = ref(0);

  async function loadAll() {
    loading.value = true;
    try {
      projects.value = await listProjects();
    } finally {
      loading.value = false;
    }
  }

  async function create(name: string): Promise<Project> {
    const project = await createProject(name);
    projects.value = [project, ...projects.value];
    return project;
  }

  async function remove(id: string) {
    await deleteProject(id);
    videoCache.delete(id);
    cacheVersion.value++;
    projects.value = projects.value.filter((p) => p.id !== id);
  }

  async function setLocked(id: string, locked: boolean) {
    await setProjectLocked(id, locked);
    const idx = projects.value.findIndex((p) => p.id === id);
    if (idx !== -1) {
      const existing = projects.value[idx];
      if (existing) {
        projects.value[idx] = { ...existing, locked };
      }
    }
  }

  async function rename(id: string, name: string) {
    await renameProject(id, name);
    const idx = projects.value.findIndex((p) => p.id === id);
    if (idx !== -1) {
      const existing = projects.value[idx];
      if (existing) {
        projects.value[idx] = { ...existing, name, updatedAt: Date.now() };
      }
    }
  }

  function replace(project: Project) {
    const idx = projects.value.findIndex((p) => p.id === project.id);
    if (idx === -1) projects.value = [project, ...projects.value];
    else projects.value[idx] = project;
  }

  async function importVideo(projectId: string, file: Blob) {
    const blob = await toStorableBlob(file);
    const meta = await readInputMeta(blob);
    validateInputMeta(meta);
    const thumbnail = await extractThumbnail(blob);
    videoCache.set(projectId, { blob, meta, thumbnail });
    cacheVersion.value++;
    await touchProject(projectId);
    const idx = projects.value.findIndex((p) => p.id === projectId);
    if (idx !== -1) {
      const existing = projects.value[idx];
      if (existing) {
        projects.value[idx] = { ...existing, updatedAt: Date.now() };
      }
    }
  }

  async function toStorableBlob(source: Blob): Promise<Blob> {
    const buffer = await source.arrayBuffer();
    return new Blob([buffer], { type: source.type || 'video/mp4' });
  }

  function getSessionVideo(projectId: string): SessionVideo | null {
    return videoCache.get(projectId) ?? null;
  }

  function clearSessionVideo(projectId: string) {
    if (videoCache.delete(projectId)) cacheVersion.value++;
  }

  return {
    projects,
    loading,
    cacheVersion,
    loadAll,
    create,
    remove,
    rename,
    setLocked,
    replace,
    importVideo,
    getSessionVideo,
    clearSessionVideo,
  };
});
