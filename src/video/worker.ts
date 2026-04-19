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
      backgroundTimeSec: number;
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
  | { type: 'error'; id: string; message: string }
  | { type: 'log'; level: 'log' | 'warn' | 'error'; message: string };

const abortControllers = new Map<string, AbortController>();

const ctx = self as unknown as DedicatedWorkerGlobalScope;

function formatLogArg(v: unknown): string {
  if (v instanceof Error) return `${v.name}: ${v.message}${v.stack ? '\n' + v.stack : ''}`;
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}
for (const level of ['log', 'warn', 'error'] as const) {
  const orig = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    try {
      ctx.postMessage({
        type: 'log',
        level,
        message: '[worker] ' + args.map(formatLogArg).join(' '),
      } satisfies WorkerResponse);
    } catch { /* noop */ }
    orig(...args);
  };
}

ctx.addEventListener('error', (ev) => {
  ctx.postMessage({
    type: 'error',
    id: 'global',
    message: `[worker:global] ${ev.message} @ ${ev.filename}:${ev.lineno}`,
  } satisfies WorkerResponse);
});
ctx.addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => {
  const r = ev.reason;
  const msg = r instanceof Error ? `${r.name}: ${r.message}\n${r.stack ?? ''}` : String(r);
  ctx.postMessage({
    type: 'error',
    id: 'global',
    message: `[worker:unhandledrejection] ${msg}`,
  } satisfies WorkerResponse);
});

ctx.addEventListener('message', (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  if (msg.type === 'abort') {
    abortControllers.get(msg.id)?.abort();
    return;
  }
  if (msg.type === 'render') {
    console.log('[worker:render] received', msg.id, {
      inputSize: msg.input.size,
      inputType: msg.input.type,
      hasLogo: !!msg.logoBlob,
    });
    const ctrl = new AbortController();
    abortControllers.set(msg.id, ctrl);
    renderVideo({
      input: msg.input,
      settings: msg.settings,
      logoBlob: msg.logoBlob,
      backgroundTimeSec: msg.backgroundTimeSec,
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
        const detail =
          err instanceof Error
            ? `${err.name}: ${err.message}${err.stack ? '\n' + err.stack : ''}`
            : typeof err === 'string'
              ? err
              : JSON.stringify(err);
        ctx.postMessage({ type: 'error', id: msg.id, message: detail } satisfies WorkerResponse);
      })
      .finally(() => {
        abortControllers.delete(msg.id);
      });
  }
});
