/// <reference lib="webworker" />
import { DOMAdapter, WebWorkerAdapter } from 'pixi.js';
DOMAdapter.set(WebWorkerAdapter);

import { renderVideo } from './pipeline';
import type { EditorSettings } from '@/types/editor';

export type WorkerRequest =
  | {
      type: 'render';
      id: string;
      input: Blob;
      settings: EditorSettings;
      logoBlob: Blob | null;
    }
  | { type: 'abort'; id: string };

export type WorkerResponse =
  | {
      type: 'progress';
      id: string;
      currentSec: number;
      durationSec: number;
      frame: number;
      fps: number;
    }
  | { type: 'done'; id: string; blob: Blob }
  | { type: 'error'; id: string; message: string };

const abortControllers = new Map<string, AbortController>();

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.addEventListener('message', (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  if (msg.type === 'abort') {
    abortControllers.get(msg.id)?.abort();
    return;
  }
  if (msg.type === 'render') {
    const ctrl = new AbortController();
    abortControllers.set(msg.id, ctrl);
    renderVideo({
      input: msg.input,
      settings: msg.settings,
      logoBlob: msg.logoBlob,
      signal: ctrl.signal,
      onProgress: (p) => {
        ctx.postMessage({
          type: 'progress',
          id: msg.id,
          currentSec: p.currentSec,
          durationSec: p.durationSec,
          frame: p.frame,
          fps: p.fps,
        } satisfies WorkerResponse);
      },
    })
      .then((blob) => {
        ctx.postMessage({ type: 'done', id: msg.id, blob } satisfies WorkerResponse);
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : typeof err === 'string' ? err : 'Ошибка рендера';
        ctx.postMessage({ type: 'error', id: msg.id, message } satisfies WorkerResponse);
      })
      .finally(() => {
        abortControllers.delete(msg.id);
      });
  }
});
