import type { EditorSettings } from '@/types/editor';
import type { WorkerRequest, WorkerResponse } from './worker';

let worker: Worker | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
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

export function renderVideoInWorker(params: RenderCallParams): Promise<Blob> {
  const w = getWorker();
  const id = `r_${Date.now()}_${++counter}`;

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
        resolve(m.blob);
      } else if (m.type === 'error') {
        cleanup();
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
      input: params.input,
      settings: JSON.parse(JSON.stringify(params.settings)),
      logoBlob: params.logoBlob,
    };
    w.postMessage(req);
  });
}

export function disposeRenderWorker() {
  worker?.terminate();
  worker = null;
}
