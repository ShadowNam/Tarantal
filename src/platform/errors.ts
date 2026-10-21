// Crash/error reporting hook (M9, Tech §14 `error`, §17 no PII). Uncaught errors and promise
// rejections become an ErrorReport: the message trimmed, every URL reduced to its file name (no
// origin, path, query or hash, so a challenge link or a portal's session id never leaves in a
// report), and the top stack frames. Capped per page load. Pure apart from installErrorHook.
import type { ErrorReport } from './PlatformAdapter';

export interface ErrorLimits {
  readonly maxReports: number;
  readonly stackFrames: number;
  readonly messageChars: number;
}

const URL_RE = /\b(?:https?|file|blob|chrome-extension|moz-extension|webpack|app):\/\/[^\s)'"]*/g;

/** Every URL → its last path segment (`https://x/a/index-1.js?q=1:3:9` → `index-1.js:3:9`). */
export function stripUrls(text: string): string {
  return text.replace(URL_RE, (url) => {
    const noQuery = url.replace(/[?#][^:]*(?=(?::\d+)*$)/, '');
    const parts = noQuery.split('/');
    return parts[parts.length - 1] || '<url>';
  });
}

/** The first `n` stack frames, URLs stripped, one `fn@file:line:col` or `file:line:col` each. */
export function stackFrames(stack: string | undefined, n: number): string[] {
  if (stack === undefined || n <= 0) return [];
  return stack
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /:\d+(?::\d+)?\)?$/.test(l))
    .slice(0, n)
    .map((l) => stripUrls(l.replace(/^at\s+/, '')).slice(0, 160));
}

function messageOf(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  try {
    // undefined for functions and undefined itself, whatever the lib types say.
    const json = JSON.stringify(value) as string | undefined;
    return json ?? String(value);
  } catch {
    return String(value);
  }
}

export function toErrorReport(
  source: ErrorReport['source'],
  value: unknown,
  limits: ErrorLimits,
): ErrorReport {
  return {
    source,
    message: stripUrls(messageOf(value)).slice(0, limits.messageChars),
    frames: stackFrames(value instanceof Error ? value.stack : undefined, limits.stackFrames),
  };
}

/** Counts reports per page load and drops repeats of the same message. */
export class ErrorThrottle {
  private sent = 0;
  private readonly seen = new Set<string>();
  dropped = 0;

  constructor(private readonly max: number) {}

  admit(r: ErrorReport): boolean {
    if (this.sent >= this.max || this.seen.has(r.message)) {
      this.dropped++;
      return false;
    }
    this.seen.add(r.message);
    this.sent++;
    return true;
  }
}

export interface ErrorTarget {
  addEventListener(type: 'error', fn: (e: ErrorEvent) => void): void;
  addEventListener(type: 'unhandledrejection', fn: (e: PromiseRejectionEvent) => void): void;
}

/** window → reports (through `report`, normally PlatformAdapter.reportError). */
export function installErrorHook(
  target: ErrorTarget,
  limits: ErrorLimits,
  report: (r: ErrorReport) => void,
): ErrorThrottle {
  const throttle = new ErrorThrottle(limits.maxReports);
  const send = (r: ErrorReport): void => {
    if (!throttle.admit(r)) return;
    try {
      report(r);
    } catch {
      // A failing reporter must never cause another error report.
    }
  };
  target.addEventListener('error', (e) => {
    // Resource load errors (img/script) have no `error`; the message is still useful.
    send(toErrorReport('error', e.error ?? e.message, limits));
  });
  target.addEventListener('unhandledrejection', (e) => {
    send(toErrorReport('rejection', e.reason, limits));
  });
  return throttle;
}
