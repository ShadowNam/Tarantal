// The only door to localStorage (CLAUDE.md: it can throw in private modes, when blocked, or
// when full). Falls back to memory so the game keeps working; values are JSON or plain text.
const memory = new Map<string, string>();
const BASE_PREFIX = 'tm.';
let PREFIX = BASE_PREFIX;

/**
 * Keys go under `tm.<namespace>` from now on (M9: `?e2e` test runs use `tm.e2e.`, so test
 * hooks can never touch a player's real save). Call once at boot, before anything is read.
 */
export function setStorageNamespace(namespace: string): void {
  PREFIX = BASE_PREFIX + namespace;
}

/** The key prefix in use (`tm.` or `tm.<namespace>`). */
export function storagePrefix(): string {
  return PREFIX;
}

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
  // After a failed write the memory copy is newer than what localStorage holds.
  if (text === undefined || (failed && memory.has(PREFIX + key)))
    return memory.get(PREFIX + key) ?? null;
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

/** Removes every key under the current prefix (privacy screen → clear my data). */
export function removeAllKeys(): void {
  for (const k of [...memory.keys()]) if (k.startsWith(PREFIX)) memory.delete(k);
  try {
    const b = backend();
    if (b === null) return;
    const keys: string[] = [];
    for (let i = 0; i < b.length; i++) {
      const k = b.key(i);
      // A namespace's keys never count as the plain prefix's (tm.e2e.* is not the player's).
      if (
        k !== null &&
        k.startsWith(PREFIX) &&
        !(PREFIX === BASE_PREFIX && k.startsWith('tm.e2e.'))
      )
        keys.push(k);
    }
    for (const k of keys) b.removeItem(k);
  } catch {
    failed = true;
  }
}

export const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean';

/** Tests only: forget the in-memory copy and the failure flag. */
export function resetStorageForTests(): void {
  memory.clear();
  failed = false;
  PREFIX = BASE_PREFIX;
}
