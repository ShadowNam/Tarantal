// v1.22.1 (D-086): where an owner-set animal size lives. A size edit names its value by a path:
// `content/<file>.json#<key path>` for a content value (`kinds.ostrich.sizeMul`, an array item by
// its id: `tells.species[id=rock_agama].scale`), or `code:<src file>#<CONSTANT>.<key>` for a code
// constant (the apply tool reports it; the game scales the view). Pure: the boot-time override
// reader (src/meta/sizeEdits.ts) and the apply tool (tools/sizesApply.ts) share it.

/** One step into a JSON value: an object key, or the item of an array whose `id` is this. */
export type SizeKey = string | { readonly id: string };

export type SizePath =
  | { readonly kind: 'content'; readonly file: string; readonly keys: readonly SizeKey[] }
  | {
      readonly kind: 'code';
      readonly file: string;
      readonly constant: string;
      readonly key: string;
    };

const CONTENT = /^(content\/[a-z][a-z/]*\.json)#(.+)$/;
const CODE = /^code:(src\/[\w/]+\.ts)#([A-Z][A-Z0-9_]*)\.(\w+)$/;
const STEP = /^(\w+)(?:\[id=([\w-]+)\])?$/;

/** The path's parts, or null when it is not one. */
export function parseSizePath(path: string): SizePath | null {
  const code = CODE.exec(path);
  if (code !== null)
    return { kind: 'code', file: code[1] ?? '', constant: code[2] ?? '', key: code[3] ?? '' };
  const m = CONTENT.exec(path);
  if (m === null) return null;
  const keys: SizeKey[] = [];
  for (const part of (m[2] ?? '').split('.')) {
    const s = STEP.exec(part);
    if (s === null) return null;
    keys.push(s[1] ?? '');
    if (s[2] !== undefined) keys.push({ id: s[2] });
  }
  return { kind: 'content', file: m[1] ?? '', keys };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** The value at `keys` in `root` (undefined when the path is not there). */
export function getAt(root: unknown, keys: readonly SizeKey[]): unknown {
  let v: unknown = root;
  for (const k of keys) {
    if (typeof k === 'string') {
      if (!isRecord(v)) return undefined;
      v = v[k];
    } else {
      if (!Array.isArray(v)) return undefined;
      v = (v as unknown[]).find((x) => isRecord(x) && x['id'] === k.id);
    }
  }
  return v;
}

/** `root` with the value at `keys` replaced by fn(it) (copies along the path only; the original
 *  is untouched). Returns `root` itself when nothing changed (the path is not there). */
export function updateAt<T>(root: T, keys: readonly SizeKey[], fn: (v: unknown) => unknown): T {
  const go = (v: unknown, i: number): unknown => {
    if (i === keys.length) return fn(v);
    const k = keys[i];
    if (k === undefined) return v;
    if (typeof k === 'string') {
      if (!isRecord(v) || !(k in v)) return v;
      const n = go(v[k], i + 1);
      return n === v[k] ? v : { ...v, [k]: n };
    }
    if (!Array.isArray(v)) return v;
    const list = v as unknown[];
    const out = list.map((x) => (isRecord(x) && x['id'] === k.id ? go(x, i + 1) : x));
    return out.some((x, j) => x !== list[j]) ? out : v;
  };
  return go(root, 0) as T;
}

/** Every number in a value (a hit box set: rx, ry, ox, oy …) × k, rounded to whole design px. */
export function scaleNumbers(v: unknown, k: number): unknown {
  if (typeof v === 'number') return Math.round(v * k);
  if (Array.isArray(v)) return v.map((x) => scaleNumbers(x, k));
  if (isRecord(v)) {
    const out: Record<string, unknown> = {};
    for (const [key, x] of Object.entries(v)) out[key] = key === '$comment' ? x : scaleNumbers(x, k);
    return out;
  }
  return v;
}

/** Two size values are the same (the stored `from` against the file's value now). */
export const sameSize = (a: number, b: number): boolean =>
  Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
