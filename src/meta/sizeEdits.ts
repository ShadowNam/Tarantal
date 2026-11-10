// v1.22.1 (D-086): the owner's animal sizes from the size editor (admin page → Sizes → Open in game,
// `?admin=1&sizes=<area>`). Kept on this device only (storage.ts, key `sizeEdits.v1` in the
// device-wide namespace, shared by the admin page and the game like the text edits, D-076), never in
// the save file and never sent anywhere: the owner exports them as a file and `npm run sizes:apply`
// writes them into content/ (or reports the code constant). With "Use my sizes in the game" on, boot
// applies them as content overrides on this device — the sim's hit shapes grow with the drawing (a
// content hit box set named by the edit is scaled with it; the others are × the size in the sim) —
// and the game is unranked. Each edit names its own value (src/content/sizePaths.ts), so this boot
// reader needs no list of animals: it stays small (first download).
import type { ContentBundle, Feel } from '../content/schemas';
import { getAt, parseSizePath, sameSize, scaleNumbers, updateAt } from '../content/sizePaths';
import { onDevice, readValue, writeValue } from './storage';

export const SIZE_EDITS_KEY = 'sizeEdits.v1';

export interface SizeEdit {
  /** The size knob (src/game/sizes/sizeKnobs.ts), e.g. `cameo_ostrich`. A knob with several values
   *  (the colony's wingspan per plane) has one edit per value, all with its id. */
  readonly id: string;
  /** The area it was set in (`karoo`, … `oes`). */
  readonly area: string;
  /** `content/<file>.json#<keys>` or `code:<file>#<CONSTANT>.<key>`. */
  readonly path: string;
  /** The value when the edit was made (the apply tool and boot skip an edit whose `from` changed). */
  readonly from: number;
  readonly to: number;
  /** The real size the animal stands for (m), for the record. */
  readonly realM?: number;
  /** Hit box sets in the same file drawn in px (× to / from with the size). */
  readonly hitboxes?: readonly string[];
}

export interface SizeEditStore {
  readonly version: 1;
  /** "Use my sizes in the game" (off by default). */
  readonly apply: boolean;
  readonly edits: readonly SizeEdit[];
}

export const EMPTY_SIZE_EDITS: SizeEditStore = { version: 1, apply: false, edits: [] };

/** A size may go from a fifth to five times what it was. */
export const SIZE_EDIT_RANGE: readonly [number, number] = [0.2, 5];

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const str = (v: unknown, max = 200): v is string =>
  typeof v === 'string' && v !== '' && v.length <= max;

export function isSizeEdit(v: unknown): v is SizeEdit {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  const hb = e['hitboxes'];
  const from = e['from'];
  const to = e['to'];
  return (
    str(e['id'], 64) &&
    str(e['area'], 32) &&
    str(e['path']) &&
    parseSizePath(e['path']) !== null &&
    num(from) &&
    num(to) &&
    to / from >= SIZE_EDIT_RANGE[0] &&
    to / from <= SIZE_EDIT_RANGE[1] &&
    (e['realM'] === undefined || num(e['realM'])) &&
    (hb === undefined ||
      (Array.isArray(hb) && hb.every((h) => str(h) && parseSizePath(h)?.kind === 'content')))
  );
}

/** The store's shell (each edit is checked on its own: one bad edit never loses the others). */
function isShell(v: unknown): v is { version: 1; apply: boolean; edits: unknown[] } {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  return s['version'] === 1 && typeof s['apply'] === 'boolean' && Array.isArray(s['edits']);
}

export function loadSizeEdits(): SizeEditStore {
  const s = onDevice(() => readValue(SIZE_EDITS_KEY, null, isShell));
  return s === null
    ? EMPTY_SIZE_EDITS
    : { version: 1, apply: s.apply, edits: s.edits.filter(isSizeEdit) };
}

export function storeSizeEdits(s: SizeEditStore): void {
  onDevice(() => {
    writeValue(SIZE_EDITS_KEY, s);
  });
}

/** The content files a size edit may change, and where each is in the game. */
const FILES = {
  'content/cameos.json': 'cameos',
  'content/birds.json': 'birds',
  'content/brakkie.json': 'brakkie',
  'content/modes.json': 'modes',
  'content/client/feel.json': 'feel',
} as const;

type Root = (typeof FILES)[keyof typeof FILES];

export interface SizeTargets {
  readonly bundle: ContentBundle;
  readonly feel: Feel;
}

export interface AppliedSizes extends SizeTargets {
  /** The edits now in force (content set, or a code factor). */
  readonly applied: readonly SizeEdit[];
  /** The view factors of the code constants' edits (to / from), by knob id. */
  readonly factors: Readonly<Record<string, number>>;
  /** Knobs in force (the build line's count). */
  readonly knobs: number;
}

/**
 * The content with the edits in it: each edit's value set to `to` where it is still `from` (one
 * already at `to` — applied to the repo since — or changed otherwise is left), with its hit box
 * sets × to / from. A code constant's edit (`code:`) becomes a view factor, when `code` (the
 * constants as built) still has its `from`.
 */
export function applySizeEdits(
  t: SizeTargets,
  edits: readonly SizeEdit[],
  code: Readonly<Record<string, number>> = {},
): AppliedSizes {
  const roots: { [K in Root]: unknown } = {
    cameos: t.bundle.cameos,
    birds: t.bundle.birds,
    brakkie: t.bundle.brakkie,
    modes: t.bundle.modes,
    feel: t.feel,
  };
  const applied: SizeEdit[] = [];
  const factors: Record<string, number> = {};
  for (const e of edits) {
    const p = parseSizePath(e.path);
    if (p === null) continue;
    if (p.kind === 'code') {
      const now = code[e.path];
      if (now === undefined || !sameSize(now, e.from)) continue;
      factors[e.id] = (factors[e.id] ?? 1) * (e.to / e.from);
      applied.push(e);
      continue;
    }
    const root = (FILES as Readonly<Record<string, Root>>)[p.file];
    if (root === undefined) continue;
    const now = getAt(roots[root], p.keys);
    if (typeof now !== 'number' || !sameSize(now, e.from)) continue;
    let next = updateAt(roots[root], p.keys, () => e.to);
    for (const h of e.hitboxes ?? []) {
      const hp = parseSizePath(h);
      if (hp?.kind !== 'content' || hp.file !== p.file) continue;
      next = updateAt(next, hp.keys, (v) => scaleNumbers(v, e.to / e.from));
    }
    roots[root] = next;
    applied.push(e);
  }
  if (applied.length === 0) return { ...t, applied, factors, knobs: 0 };
  return {
    bundle: {
      ...t.bundle,
      cameos: roots.cameos as ContentBundle['cameos'],
      birds: roots.birds as ContentBundle['birds'],
      brakkie: roots.brakkie as ContentBundle['brakkie'],
      modes: roots.modes as ContentBundle['modes'],
    },
    feel: roots.feel as Feel,
    applied,
    factors,
    knobs: new Set(applied.map((e) => e.id)).size,
  };
}
