// The only door to localStorage (CLAUDE.md: it can throw in private modes, when blocked, or
// when full). Falls back to memory so the game keeps working; values are JSON or plain text.
const memory = new Map<string, string>();
const PREFIX = 'tm.';

/** 'local' while localStorage works; 'memory' after it threw or is missing (private mode). */
export type StorageStatus = 'local' | 'memory';
let failed = false;

function backend(): Storage | null {
  try {
    const s = globalThis.localStorage as Storage | undefined;
    return s ?? null;
  } catch {
    return null;
  }
}

export function storageStatus(): StorageStatus {
  return failed || backend() === null ? 'memory' : 'local';
}

/** Raw text under `tm.<key>`, or null. The memory copy wins only when localStorage can't answer. */
export function readText(key: string): string | null {
  let text: string | null | undefined;
  try {
    text = backend()?.getItem(PREFIX + key);
  } catch {
    failed = true;
    text = undefined;
  }
  if (text === undefined) return memory.get(PREFIX + key) ?? null;
  return text ?? memory.get(PREFIX + key) ?? null;
}

export function writeText(key: string, text: string): void {
  memory.set(PREFIX + key, text);
  try {
    const b = backend();
    if (b === null) failed = true;
    b?.setItem(PREFIX + key, text);
  } catch {
    // Blocked or full: the in-memory copy keeps this session consistent.
    failed = true;
  }
}

export function removeKey(key: string): void {
  memory.delete(PREFIX + key);
  try {
    backend()?.removeItem(PREFIX + key);
  } catch {
    failed = true;
  }
}

export function readValue<T>(key: string, fallback: T, guard: (v: unknown) => v is T): T {
  const text = readText(key);
  if (text === null) return fallback;
  try {
    const v: unknown = JSON.parse(text);
    return guard(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

export function writeValue(key: string, value: unknown): void {
  writeText(key, JSON.stringify(value));
}

export const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean';

/** Tests only: forget the in-memory copy and the failure flag. */
export function resetStorageForTests(): void {
  memory.clear();
  failed = false;
}
