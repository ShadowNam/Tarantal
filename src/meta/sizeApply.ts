// v1.22.1 (D-086): the owner's sizes (src/meta/sizeEdits.ts) as content overrides: boot (main.ts)
// applies them when "Use my sizes in the game" is on and there are sizes, and the apply tool
// (tools/sizesApply.ts) works out the true-size table with them. Each edit names its own
// value (src/content/sizePaths.ts): no list of animals is needed here.
import type { ContentBundle, Feel } from '../content/schemas';
import { getAt, parseSizePath, sameSize, scaleNumbers, updateAt } from '../content/sizePaths';
import type { SizeEdit } from './sizeEdits';

/** A size may go from a fifth to five times what it was. */
export const SIZE_EDIT_RANGE: readonly [number, number] = [0.2, 5];

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const str = (v: unknown): v is string => typeof v === 'string' && v !== '';

/** A stored edit fit to apply: a size path, from and to within SIZE_EDIT_RANGE of each other. */
export function isSizeEdit(v: unknown): v is SizeEdit {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  const hb = e['hitboxes'];
  const from = e['from'];
  const to = e['to'];
  return (
    str(e['id']) &&
    str(e['area']) &&
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

/** The content files a size edit may change, and where each is in the game. */
const FILE = /^content\/(?:(cameos|birds|brakkie|modes)|client\/(feel))\.json$/;

type Root = 'cameos' | 'birds' | 'brakkie' | 'modes' | 'feel';

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
  for (const e of edits.filter(isSizeEdit)) {
    const p = parseSizePath(e.path);
    if (p === null) continue;
    if (p.kind === 'code') {
      const now = code[e.path];
      if (now === undefined || !sameSize(now, e.from)) continue;
      factors[e.id] = (factors[e.id] ?? 1) * (e.to / e.from);
      applied.push(e);
      continue;
    }
    const f = FILE.exec(p.file);
    const root = (f?.[1] ?? f?.[2]) as Root | undefined;
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
