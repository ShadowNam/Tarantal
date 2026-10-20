// Save migrations (Tech §11): migrations[from] turns a version-`from` save into version from+1.
// Each step is pure and has a test. Version 0 = the loose M2 keys from before SaveData existed.
import { readValue, isBoolean } from './storage';

export type RawSave = Record<string, unknown> & { v: number };
export type Migration = (old: RawSave) => RawSave;

/** Version 0 as read from the M2 keys (only settings existed then). */
export interface LegacyV0 {
  readonly v: 0;
  readonly screenShake?: boolean;
}

export const migrations: Readonly<Record<number, Migration>> = {
  // M2 → M5: the tally's screen-shake toggle becomes settings.screenShake. Everything else is
  // new in v1 and gets its default when save.ts parses the sections.
  0: (old) => {
    const shake = old['screenShake'];
    return {
      v: 1,
      ...(typeof shake === 'boolean' ? { settings: { screenShake: shake } } : {}),
    };
  },
};

/** Runs every migration from `raw.v` up to `target`. Throws if a step is missing. */
export function migrate(raw: RawSave, target: number): RawSave {
  let cur = raw;
  while (cur.v < target) {
    const step = migrations[cur.v];
    if (step === undefined) throw new Error(`no save migration from v${cur.v}`);
    const next = step(cur);
    if (next.v !== cur.v + 1) throw new Error(`migration from v${cur.v} produced v${next.v}`);
    cur = next;
  }
  return cur;
}

/** The pre-M5 keys, or null when the player never stored anything. */
export function readLegacyV0(): LegacyV0 | null {
  const missing = Symbol('missing');
  const shake = readValue<boolean | typeof missing>(
    'settings.screenShake',
    missing,
    (v): v is boolean => isBoolean(v),
  );
  if (shake === missing) return null;
  return { v: 0, screenShake: shake };
}
