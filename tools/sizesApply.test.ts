import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getAt, parseSizePath } from '../src/content/sizePaths';
import { OWNER_SET } from './sizes';
import {
  codeAdvice,
  planSizes,
  SizesFileSchema,
  writeOwnerSet,
  type FileEdit,
  type SizesFile,
} from './sizesApply';
import { loadContent, loadFeel } from './testContent';

const repo = join(import.meta.dirname, '..');
const content = loadContent();
const feel = loadFeel();
let root = '';

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sizes-apply-'));
  cpSync(join(repo, 'content'), join(root, 'content'), { recursive: true });
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const file = (edits: FileEdit[]): SizesFile =>
  SizesFileSchema.parse({
    version: 1,
    exportedAt: '2026-11-10T14:05:00Z',
    build: { version: '1.22.1', commit: 'abc1234' },
    edits,
  });
const opts = { today: '2026-11-10', content, feel, ownerSet: OWNER_SET };
const ostrich = (to: number, from = content.cameos.kinds.ostrich.sizeMul): FileEdit => ({
  id: 'cameo_ostrich',
  area: 'karoo',
  path: 'content/cameos.json#kinds.ostrich.sizeMul',
  from,
  to,
  realM: 2.5,
});
const value = (doc: unknown, path: string): unknown => {
  const p = parseSizePath(path);
  return p?.kind === 'content' ? getAt(doc, p.keys) : undefined;
};

describe('sizes:apply (D-086)', () => {
  it('sets a value; within ±15 % of real it needs no owner’s record', () => {
    const r = planSizes(root, file([ostrich(2.62)]), opts);
    expect(r.conflicts).toEqual([]);
    expect(r.written).toEqual(['content/cameos.json']);
    expect(value(r.docs['content/cameos.json'], ostrich(1).path)).toBe(2.62);
    expect(r.ownerAdded).toEqual([]);
  });

  it('outside ±15 %, records the owner’s choice in OWNER_SET (dated, "by eye")', () => {
    const r = planSizes(root, file([ostrich(2.208)]), opts);
    expect(r.ownerAdded).toEqual(
      expect.arrayContaining(['measured_cameo_ostrich', 'cameo_ostrich']),
    );
    const o = r.ownerSet['measured_cameo_ostrich'];
    expect(o?.date).toBe('2026-11-10');
    expect(o?.knob).toBe('cameo_ostrich');
    expect(o?.value).toBe(2.208);
    expect(o?.why).toMatch(/^the owner set this by eye/);
    expect(o?.why).toMatch(/: -\d+ % of a real 2\.5 m$/);
    // Back within ±15 % later, the record goes.
    const back = planSizes(root, file([ostrich(2.76, 2.76)]), { ...opts, ownerSet: r.ownerSet });
    expect(back.already).toHaveLength(1);
    const again = planSizes(root, file([ostrich(2.7)]), { ...opts, ownerSet: r.ownerSet });
    expect(again.ownerRemoved).toEqual(
      expect.arrayContaining(['measured_cameo_ostrich', 'cameo_ostrich']),
    );
    expect(again.ownerSet['measured_cameo_ostrich']).toBeUndefined();
  });

  it('grows the px hit boxes with a height', () => {
    const from = content.birds.baboons.heightPx;
    const r = planSizes(
      root,
      file([
        {
          id: 'baboon',
          area: 'karoo',
          path: 'content/birds.json#baboons.heightPx',
          from,
          to: Math.round(from * 1.1),
        },
      ]),
      opts,
    );
    const doc = r.docs['content/birds.json'];
    expect(value(doc, 'content/birds.json#baboons.heightPx')).toBe(Math.round(from * 1.1));
    const k = Math.round(from * 1.1) / from;
    expect(value(doc, 'content/birds.json#baboons.hitboxes.sit.body.rx')).toBe(
      Math.round(content.birds.baboons.hitboxes.sit.body.rx * k),
    );
    // The rest of the file as it was (key order kept).
    const before = JSON.parse(readFileSync(join(root, 'content/birds.json'), 'utf8')) as object;
    expect(Object.keys(doc as object)).toEqual(Object.keys(before));
  });

  it('refuses the whole file when an edit’s from no longer matches (--force-rest applies the rest)', () => {
    const baboon: FileEdit = {
      id: 'baboon',
      area: 'karoo',
      path: 'content/birds.json#baboons.heightPx',
      from: 999,
      to: 1000,
    };
    const r = planSizes(root, file([ostrich(2.62), baboon]), opts);
    expect(r.conflicts).toEqual([
      { edit: baboon, now: content.birds.baboons.heightPx, reason: 'changed' },
    ]);
    expect(r.applied).toEqual([]);
    expect(r.written).toEqual([]);
    const rest = planSizes(root, file([ostrich(2.62), baboon]), { ...opts, forceRest: true });
    expect(rest.written).toEqual(['content/cameos.json']);
    expect(rest.conflicts).toHaveLength(1);
  });

  it('refuses a value the content’s schema does not allow, and a path that is not there', () => {
    const r = planSizes(
      root,
      file([
        { ...ostrich(6), path: 'content/cameos.json#kinds.ostrich.sizeMul' },
        { ...ostrich(2), path: 'content/cameos.json#kinds.ostrich.nope' },
        { ...ostrich(2), path: 'content/weapons.json#weapons' },
      ]),
      opts,
    );
    expect(r.conflicts.map((x) => x.reason)).toEqual(['missing', 'missing', 'schema']);
    expect(r.written).toEqual([]);
  });

  it('reports a code constant to change by hand, and records it when outside ±15 %', () => {
    const path = 'code:src/game/view/tree/residentTrueSize.ts#RESIDENT_TRUE_MUL.owlFly';
    const r = planSizes(
      root,
      file([{ id: 'baobab_owl', area: 'bushveld', path, from: 2.8, to: 3.5 }]),
      opts,
    );
    expect(r.code).toHaveLength(1);
    expect(r.written).toEqual([]);
    expect(codeAdvice(r.code[0] as FileEdit)).toMatch(/RESIDENT_TRUE_MUL\.owlFly 2\.8 → 3\.5/);
    expect(r.ownerAdded).toEqual(['measured_baobab_owl_flying']);
    const stale = planSizes(
      root,
      file([{ id: 'baobab_owl', area: 'bushveld', path, from: 2.5, to: 3.5 }]),
      opts,
    );
    expect(stale.conflicts[0]?.reason).toBe('changed');
  });

  it('writes OWNER_SET between its markers in tools/sizes.ts', () => {
    const text = readFileSync(join(repo, 'tools', 'sizes.ts'), 'utf8');
    const entry = {
      date: '2026-11-10',
      knob: 'cameo_ostrich',
      value: 2.208,
      why: "the owner set this by eye (it's big)",
    };
    const out = writeOwnerSet(text, { measured_cameo_ostrich: entry });
    expect(out).toContain("  measured_cameo_ostrich: {\n    date: '2026-11-10',");
    expect(out).toContain("why: 'the owner set this by eye (it\\'s big)',");
    expect(writeOwnerSet(out, {})).toBe(writeOwnerSet(text, {}));
    expect(() => writeOwnerSet('const x = 1;', {})).toThrow(/markers/);
  });
});
