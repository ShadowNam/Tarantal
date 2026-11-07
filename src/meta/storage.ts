// The only door to localStorage (CLAUDE.md: it can throw in private modes, when blocked, or
// when full). Falls back to memory so the game keeps working; values are JSON or plain text.
const memory = new Map<string, string>();
/** Logical deletions must win over old disk values when the browser refuses to remove them. */
const removed = new Set<string>();
/** A failed clear can leave even unenumerated disk keys behind: use memory for that namespace. */
const cleared = new Set<string>();
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

/** Raw text under `tm.<key>`, or null. Failed writes and deletions take precedence over disk. */
export function readText(key: string): string | null {
  if (removed.has(PREFIX + key)) return null;
  if (cleared.has(PREFIX)) return memory.get(PREFIX + key) ?? null;
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
  removed.delete(PREFIX + key);
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
  removed.add(PREFIX + key);
  try {
    const b = backend();
    if (b === null) {
      failed = true;
      return;
    }
    b.removeItem(PREFIX + key);
    removed.delete(PREFIX + key);
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

/** Clears this session's namespace; returns whether browser data was also removed. */
export function removeAllKeys(): boolean {
  // The player's namespace excludes test data in both backends, including memory-only saves.
  const owns = (k: string): boolean =>
    k.startsWith(PREFIX) && !(PREFIX === BASE_PREFIX && k.startsWith('tm.e2e.'));
  for (const k of [...memory.keys()]) if (owns(k)) memory.delete(k);
  for (const k of [...removed]) if (owns(k)) removed.delete(k);
  cleared.delete(PREFIX);
  try {
    const b = backend();
    // No browser store at all (blocked or missing): nothing ever reached disk, so wiping memory
    // is the whole clear — the privacy reset succeeds (D-071 keeps `false` for a store that
    // refuses to list or remove keys).
    if (b === null) {
      cleared.add(PREFIX);
      return true;
    }
    const keys: string[] = [];
    for (let i = 0; i < b.length; i++) {
      const k = b.key(i);
      if (k !== null && owns(k)) keys.push(k);
    }
    for (const k of keys) b.removeItem(k);
    return true;
  } catch {
    failed = true;
    cleared.add(PREFIX);
    return false;
  }
}

export const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean';

/** Tests only: forget the in-memory copy and the failure flag. */
export function resetStorageForTests(): void {
  memory.clear();
  removed.clear();
  cleared.clear();
  failed = false;
  PREFIX = BASE_PREFIX;
}
