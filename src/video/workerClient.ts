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
  signal?: AbortSignal;
  onProgress?: (p: { currentSec: number; durationSec: number; frame: number; fps: number }) => void;
}

let counter = 0;

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
  const logoBlob = params.logoBlob ? await detachBlob(params.logoBlob, 'logo') : null;
  console.log('[workerClient:render] posting', id);

  return new Promise<Blob>((resolve, reject) => {
    function cleanup() {
      w.removeEventListener('message', onMessage);
      params.signal?.removeEventListener('abort', onAbort);
    }
    function onMessage(ev: MessageEvent<WorkerResponse>) {
      const m = ev.data;
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
    };
    w.postMessage(req);
  });
}

export function disposeRenderWorker() {
  worker?.terminate();
  worker = null;
}
