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

/** URLs with a scheme, protocol-relative ones (`//host/…`) and bare hosts with a path. */
const URL_RE =
  /(?:\b(?:https?|file|blob|chrome-extension|moz-extension|safari-extension|webpack|app):\/\/|(?<![\w:])\/\/|\b(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?=\/))[^\s)'"]*/gi;

/**
 * Every URL → its file name plus a trailing `:line:col` (`https://x/a/index-1.js?q=a:b:3:9` →
 * `index-1.js:3:9`). The line/column suffix is cut off first, so a ':' in the query or hash can't
 * leak anything; a URL without a file name becomes `<url>`.
 */
export function stripUrls(text: string): string {
  return text.replace(URL_RE, (url) => {
    const pos = /(?::\d+){1,2}$/.exec(url);
    const suffix = pos?.[0] ?? '';
    const base = suffix === '' ? url : url.slice(0, -suffix.length);
    const path = base.split(/[?#]/)[0] ?? '';
    const parts = path
      .replace(/^[a-z-]+:\/\//i, '')
      .replace(/^\/\//, '')
      .split('/');
    // The first segment is the host: a bare host (no path) is no file name.
    const file = parts.length > 1 ? (parts[parts.length - 1] ?? '') : '';
    return (file === '' ? '<url>' : file) + suffix;
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

/**
 * The message: an Error's name and message (URLs stripped). Anything else that is thrown or
 * rejected (a string, an object, a portal SDK's payload) may carry arbitrary data, so only its
 * type is reported; a window error event without an Error keeps the browser's own message.
 */
function messageOf(source: ErrorReport['source'], value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (source === 'error' && typeof value === 'string') return value;
  if (value === null) return 'non-Error value (null)';
  const type =
    typeof value === 'object'
      ? ((value as { constructor?: { name?: unknown } }).constructor?.name ?? 'object')
      : typeof value;
  return `non-Error value (${typeof type === 'string' ? type : 'object'})`;
}

export function toErrorReport(
  source: ErrorReport['source'],
  value: unknown,
  limits: ErrorLimits,
): ErrorReport {
  return {
    source,
    message: stripUrls(messageOf(source, value)).slice(0, limits.messageChars),
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
