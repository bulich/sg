import { db } from '@/storage/db';
import { DEFAULT_SETTINGS } from '@/constants';
import type {
  EditorSettings,
  LogoAsset,
  Project,
  Template,
  VideoMeta,
} from '@/types/editor';

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function cloneSettings(settings: EditorSettings): EditorSettings {
  return structuredClone(settings);
}

export async function createProject(name: string): Promise<Project> {
  const now = Date.now();
  const project: Project = {
    id: uid(),
    name,
    createdAt: now,
    updatedAt: now,
    thumbnailBlob: null,
    videoBlob: null,
    videoMeta: null,
    settings: cloneSettings(DEFAULT_SETTINGS),
  };
  await db.projects.add(project);
  return project;
}

export async function getProject(id: string): Promise<Project | undefined> {
  console.log('[repo:getProject] start', id);
  const project = await db.projects.get(id);
  if (!project) {
    console.warn('[repo:getProject] not found', id);
    return undefined;
  }
  console.log('[repo:getProject] loaded', {
    id,
    hasVideo: !!project.videoBlob,
    videoSize: project.videoBlob?.size,
    videoType: project.videoBlob?.type,
    hasThumb: !!project.thumbnailBlob,
    thumbSize: project.thumbnailBlob?.size,
  });
  if (project.videoBlob) {
    project.videoBlob = await materializeBlob(project.videoBlob, 'videoBlob');
  }
  if (project.thumbnailBlob) {
    project.thumbnailBlob = await materializeBlob(project.thumbnailBlob, 'thumbnailBlob');
  }
  return project;
}

async function materializeBlob(blob: Blob, label = 'blob'): Promise<Blob> {
  console.log('[repo:materialize] start', label, { size: blob.size, type: blob.type });
  try {
    const buffer = await blob.arrayBuffer();
    const fresh = new Blob([buffer], { type: blob.type });
    console.log('[repo:materialize] ok', label, { size: fresh.size });
    return fresh;
  } catch (err) {
    console.error('[repo:materialize] fail', label, err);
    throw err;
  }
}

export async function listProjects(): Promise<Project[]> {
  const projects = await db.projects.orderBy('updatedAt').reverse().toArray();
  for (const p of projects) {
    if (p.thumbnailBlob) p.thumbnailBlob = await materializeBlob(p.thumbnailBlob);
  }
  return projects;
}

export async function updateProject(
  id: string,
  patch: Partial<Omit<Project, 'id' | 'createdAt'>>,
): Promise<void> {
  await db.projects.update(id, { ...patch, updatedAt: Date.now() });
}

export async function renameProject(id: string, name: string): Promise<void> {
  await updateProject(id, { name });
}

export async function setProjectVideo(
  id: string,
  videoBlob: Blob,
  meta: VideoMeta,
  thumbnailBlob: Blob,
): Promise<void> {
  await updateProject(id, { videoBlob, videoMeta: meta, thumbnailBlob });
}

export async function setProjectSettings(
  id: string,
  settings: EditorSettings,
): Promise<void> {
  await updateProject(id, { settings });
}

export async function deleteProject(id: string): Promise<void> {
  await db.projects.delete(id);
}

async function bitmapSize(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

export async function saveLogo(blob: Blob): Promise<LogoAsset> {
  const mimeType = blob.type || 'image/png';
  let width = 0;
  let height = 0;
  if (mimeType !== 'image/svg+xml') {
    const size = await bitmapSize(blob);
    width = size.width;
    height = size.height;
  }
  const asset: LogoAsset = {
    id: uid(),
    blob,
    mimeType,
    width,
    height,
  };
  await db.logos.add(asset);
  return asset;
}

export async function getLogo(id: string): Promise<LogoAsset | undefined> {
  const asset = await db.logos.get(id);
  if (!asset) return undefined;
  asset.blob = await materializeBlob(asset.blob);
  return asset;
}

export async function deleteLogo(id: string): Promise<void> {
  await db.logos.delete(id);
}

export async function createTemplate(
  name: string,
  settings: EditorSettings,
): Promise<Template> {
  const template: Template = {
    id: uid(),
    name,
    createdAt: Date.now(),
    settings: cloneSettings(settings),
  };
  await db.templates.add(template);
  return template;
}

export async function listTemplates(): Promise<Template[]> {
  return await db.templates.orderBy('createdAt').reverse().toArray();
}

export async function deleteTemplate(id: string): Promise<void> {
  await db.templates.delete(id);
}

export async function applyTemplate(
  projectId: string,
  templateId: string,
): Promise<void> {
  const template = await db.templates.get(templateId);
  if (!template) throw new Error('Шаблон не найден');
  await setProjectSettings(projectId, cloneSettings(template.settings));
}
