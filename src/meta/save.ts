// Loads, repairs and writes SaveData (Tech §11) through storage.ts.
// - Missing save: the M2 keys are migrated (v0 → v1) or the defaults are used.
// - Text that is not JSON: kept under `save.corrupt` for bug reports, defaults are used.
// - A damaged section (or a damaged field of an object section) falls back on its own.
// - A save written by a newer game version is never overwritten; this session runs in memory.
import { z } from 'zod';
import { migrate, readLegacyV0, type RawSave } from './migrations';
import { defaultSave, SAVE_KEY, SAVE_SECTIONS, SAVE_VERSION, type SaveData } from './saveSchema';
import { readText, removeKey, writeText } from './storage';

export const CORRUPT_KEY = 'save.corrupt';

export type LoadStatus = 'new' | 'loaded' | 'migrated' | 'repaired' | 'corrupt' | 'newer';

export interface LoadResult {
  readonly data: SaveData;
  readonly status: LoadStatus;
  /** Sections (or section.field) that fell back to their defaults. */
  readonly repaired: readonly string[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Parses one section; an object section keeps every field that is still valid. */
function salvage(
  schema: z.ZodType,
  raw: unknown,
  fallback: unknown,
  path: string,
  repaired: string[],
): unknown {
  if (raw === undefined) return fallback;
  const whole = schema.safeParse(raw);
  if (whole.success) return whole.data;
  if (schema instanceof z.ZodObject && isRecord(raw) && isRecord(fallback)) {
    const out: Record<string, unknown> = {};
    const shape = schema.shape as Record<string, z.ZodType>;
    for (const [k, fieldSchema] of Object.entries(shape)) {
      const r = fieldSchema.safeParse(raw[k]);
      if (r.success) out[k] = r.data;
      else {
        out[k] = fallback[k];
        if (raw[k] !== undefined) repaired.push(`${path}.${k}`);
      }
    }
    return out;
  }
  repaired.push(path);
  return fallback;
}

/** Turns any parsed JSON value into a valid SaveData (pure; exported for tests). */
export function repairSave(raw: Record<string, unknown>): { data: SaveData; repaired: string[] } {
  const repaired: string[] = [];
  const def = defaultSave();
  const out: Record<string, unknown> = { v: SAVE_VERSION };
  for (const [name, schema] of Object.entries(SAVE_SECTIONS)) {
    out[name] = salvage(schema, raw[name], def[name as keyof SaveData], name, repaired);
  }
  return { data: out as SaveData, repaired };
}

export function loadSave(): LoadResult {
  const text = readText(SAVE_KEY);
  if (text === null) {
    const legacy = readLegacyV0();
    if (legacy === null) return { data: defaultSave(), status: 'new', repaired: [] };
    const { data, repaired } = repairSave(migrate({ ...legacy }, SAVE_VERSION));
    return { data, status: 'migrated', repaired };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
  }
  if (!isRecord(parsed) || typeof parsed['v'] !== 'number' || !Number.isInteger(parsed['v'])) {
    writeText(CORRUPT_KEY, text);
    return { data: defaultSave(), status: 'corrupt', repaired: ['(all)'] };
  }
  const v = parsed['v'];
  if (v > SAVE_VERSION) {
    // Read what this version understands, but never write over the newer save.
    const { data } = repairSave(parsed);
    return { data, status: 'newer', repaired: [] };
  }
  let migrated: RawSave;
  try {
    migrated = migrate(parsed as RawSave, SAVE_VERSION);
  } catch {
    writeText(CORRUPT_KEY, text);
    return { data: defaultSave(), status: 'corrupt', repaired: ['(all)'] };
  }
  const { data, repaired } = repairSave(migrated);
  const status: LoadStatus =
    v < SAVE_VERSION ? 'migrated' : repaired.length > 0 ? 'repaired' : 'loaded';
  return { data, status, repaired };
}

export function writeSave(data: SaveData): void {
  writeText(SAVE_KEY, JSON.stringify(data));
}

/** The save the game works with: one in-memory copy, written through on every change. */
export class SaveStore {
  private current: SaveData;
  readonly status: LoadStatus;
  readonly repaired: readonly string[];
  private readonly readOnly: boolean;
  private readonly listeners = new Set<(data: SaveData) => void>();

  constructor(result: LoadResult = loadSave()) {
    this.current = result.data;
    this.status = result.status;
    this.repaired = result.repaired;
    this.readOnly = result.status === 'newer';
    // Persist migrations and repairs straight away (the corrupt text is already backed up).
    if (
      result.status === 'migrated' ||
      result.status === 'repaired' ||
      result.status === 'corrupt'
    ) {
      this.flush();
      if (result.status === 'migrated') removeKey('settings.screenShake');
    }
  }

  get data(): Readonly<SaveData> {
    return this.current;
  }

  /** Applies a change (a new object, never mutate `data`) and writes it. */
  update(change: (d: SaveData) => SaveData): void {
    this.current = change(this.current);
    this.flush();
    for (const fn of this.listeners) fn(this.current);
  }

  onChange(fn: (data: SaveData) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  flush(): void {
    if (!this.readOnly) writeSave(this.current);
  }
}
