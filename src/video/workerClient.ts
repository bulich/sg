import type { EditorSettings } from '@/types/editor';
import type { WorkerRequest, WorkerResponse } from './worker';

let worker: Worker | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('error', (ev) => {
      console.error('[worker:error]', ev.message, ev.filename + ':' + ev.lineno, ev.error);
    });
    worker.addEventListener('messageerror', (ev) => {
      console.error('[worker:messageerror]', ev);
    });
    worker.addEventListener('message', (ev: MessageEvent<WorkerResponse>) => {
      const d = ev.data;
      if (!d) return;
      if (d.type === 'error' && d.id === 'global') {
        console.error(d.message);
      } else if (d.type === 'log') {
        if (d.level === 'error') console.error(d.message);
        else if (d.level === 'warn') console.warn(d.message);
        else console.log(d.message);
      }
    });
  }
  return worker;
}

export interface RenderCallParams {
  input: Blob;
  settings: EditorSettings;
  logoBlob: Blob | null;
  backgroundTimeSec: number;
  signal?: AbortSignal;
  onProgress?: (p: { currentSec: number; durationSec: number; frame: number; fps: number }) => void;
}

let counter = 0;

function readSvgIntrinsicSize(svg: string): { width: number; height: number } {
  const widthMatch = svg.match(/\swidth="(\d+(?:\.\d+)?)(?:px)?"/i);
  const heightMatch = svg.match(/\sheight="(\d+(?:\.\d+)?)(?:px)?"/i);
  const viewBox = svg.match(/viewBox="([\d.\s-]+)"/i);
  let w = widthMatch?.[1] ? Number(widthMatch[1]) : 0;
  let h = heightMatch?.[1] ? Number(heightMatch[1]) : 0;
  if ((!w || !h) && viewBox?.[1]) {
    const parts = viewBox[1].trim().split(/\s+/).map(Number);
    if (parts.length === 4) {
      const vw = parts[2] ?? 0;
      const vh = parts[3] ?? 0;
      if (!w) w = vw;
      if (!h) h = vh;
    }
  }
  return { width: w || 512, height: h || 512 };
}

async function rasterizeSvgToPng(svgBlob: Blob): Promise<Blob> {
  const text = await svgBlob.text();
  const { width, height } = readSvgIntrinsicSize(text);
  const scale = 2;
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
  try {
    const img = new Image(width, height);
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Не удалось загрузить SVG для экспорта'));
      img.src = url;
    });
    if (typeof img.decode === 'function') {
      try { await img.decode(); } catch { /* noop */ }
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D контекст недоступен');
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Не удалось сериализовать логотип'))),
        'image/png',
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function prepareLogoForWorker(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/svg+xml') {
    console.log('[workerClient:logo] rasterizing SVG on main thread');
    return await rasterizeSvgToPng(blob);
  }
  return blob;
}

async function detachBlob(blob: Blob, label: string): Promise<Blob> {
  console.log('[workerClient:detach] start', label, { size: blob.size, type: blob.type });
  try {
    const buffer = await blob.arrayBuffer();
    const fresh = new Blob([buffer], { type: blob.type });
    console.log('[workerClient:detach] ok', label, { size: fresh.size });
    return fresh;
  } catch (err) {
    console.error('[workerClient:detach] fail', label, err);
    throw err;
  }
}

export async function renderVideoInWorker(params: RenderCallParams): Promise<Blob> {
  console.log('[workerClient:render] begin', {
    inputSize: params.input.size,
    inputType: params.input.type,
    hasLogo: !!params.logoBlob,
    logoSize: params.logoBlob?.size,
  });
  const w = getWorker();
  const id = `r_${Date.now()}_${++counter}`;
  const input = await detachBlob(params.input, 'input');
  const preparedLogo = params.logoBlob ? await prepareLogoForWorker(params.logoBlob) : null;
  const logoBlob = preparedLogo ? await detachBlob(preparedLogo, 'logo') : null;
  console.log('[workerClient:render] posting', id);

  return new Promise<Blob>((resolve, reject) => {
    function cleanup() {
      w.removeEventListener('message', onMessage);
      params.signal?.removeEventListener('abort', onAbort);
    }
    function onMessage(ev: MessageEvent<WorkerResponse>) {
      const m = ev.data;
      if (m.type === 'log') return;
      if (m.id !== id) return;
      if (m.type === 'progress') {
        params.onProgress?.({
          currentSec: m.currentSec,
          durationSec: m.durationSec,
          frame: m.frame,
          fps: m.fps,
        });
      } else if (m.type === 'done') {
        cleanup();
        disposeRenderWorker();
        resolve(m.blob);
      } else if (m.type === 'error') {
        cleanup();
        disposeRenderWorker();
        reject(new Error(m.message));
      }
    }
    function onAbort() {
      const msg: WorkerRequest = { type: 'abort', id };
      w.postMessage(msg);
    }

    w.addEventListener('message', onMessage);
    if (params.signal) {
      if (params.signal.aborted) {
        cleanup();
        reject(new DOMException('aborted', 'AbortError'));
        return;
      }
      params.signal.addEventListener('abort', onAbort);
    }

    const req: WorkerRequest = {
      type: 'render',
      id,
      input,
      settings: JSON.parse(JSON.stringify(params.settings)),
      logoBlob,
      backgroundTimeSec: params.backgroundTimeSec,
    };
    w.postMessage(req);
  });
}

export function disposeRenderWorker() {
  worker?.terminate();
  worker = null;
}
