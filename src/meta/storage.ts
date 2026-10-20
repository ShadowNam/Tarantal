// The only door to localStorage (CLAUDE.md: it can throw in private modes, when blocked, or
// when full). Falls back to memory so the game keeps working; values are JSON.
const memory = new Map<string, string>();
const PREFIX = 'tm.';

function backend(): Storage | null {
  try {
    const s = globalThis.localStorage as Storage | undefined;
    return s ?? null;
  } catch {
    return null;
  }
}

export function readValue<T>(key: string, fallback: T, guard: (v: unknown) => v is T): T {
  let text: string | null | undefined;
  try {
    text = backend()?.getItem(PREFIX + key);
  } catch {
    text = undefined;
  }
  text ??= memory.get(PREFIX + key) ?? null;
  if (text === null) return fallback;
  try {
    const v: unknown = JSON.parse(text);
    return guard(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

export function writeValue(key: string, value: unknown): void {
  const text = JSON.stringify(value);
  memory.set(PREFIX + key, text);
  try {
    backend()?.setItem(PREFIX + key, text);
  } catch {
    // Blocked or full: the in-memory copy keeps this session consistent.
  }
}

export const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean';
