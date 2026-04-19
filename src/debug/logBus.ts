import { reactive } from 'vue';

export type LogLevel = 'log' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id: number;
  time: number;
  level: LogLevel;
  text: string;
}

const MAX = 500;
let counter = 0;

export const logs = reactive<LogEntry[]>([]);

function push(level: LogLevel, args: unknown[]) {
  const text = args.map(formatArg).join(' ');
  logs.push({ id: ++counter, time: Date.now(), level, text });
  if (logs.length > MAX) logs.splice(0, logs.length - MAX);
}

function formatArg(v: unknown): string {
  if (v instanceof Error) {
    return `${v.name}: ${v.message}${v.stack ? '\n' + v.stack : ''}`;
  }
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

export function clearLogs() {
  logs.splice(0, logs.length);
}

export function installLogBus() {
  const methods: LogLevel[] = ['log', 'info', 'warn', 'error'];
  for (const m of methods) {
    const orig = console[m].bind(console);
    console[m] = (...args: unknown[]) => {
      push(m, args);
      orig(...args);
    };
  }
  window.addEventListener('error', (ev) => {
    push('error', [ev.message, ev.filename + ':' + ev.lineno + ':' + ev.colno, ev.error]);
  });
  window.addEventListener('unhandledrejection', (ev) => {
    push('error', ['UnhandledRejection:', ev.reason]);
  });
}
