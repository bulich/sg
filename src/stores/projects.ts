import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Project } from '@/types/editor';
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  renameProject,
  setProjectVideo,
} from '@/storage/repositories';
import { extractThumbnail, readInputMeta } from '@/video/pipeline';
import { validateInputMeta } from '@/video/validation';

export const useProjectsStore = defineStore('projects', () => {
  const projects = ref<Project[]>([]);
  const loading = ref(false);

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
    projects.value = projects.value.filter((p) => p.id !== id);
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
    await setProjectVideo(projectId, blob, meta, thumbnail);
    const updated = await getProject(projectId);
    if (updated) replace(updated);
  }

  async function toStorableBlob(source: Blob): Promise<Blob> {
    const buffer = await source.arrayBuffer();
    return new Blob([buffer], { type: source.type || 'video/mp4' });
  }

  return { projects, loading, loadAll, create, remove, rename, replace, importVideo };
});
