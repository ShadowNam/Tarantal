import { afterEach, describe, expect, it } from 'vitest';
import { loadContent, loadFeel } from '../../tools/testContent';
import { readText, resetStorageForTests, setStorageNamespace, writeText } from './storage';
import { applySizeEdits, isSizeEdit } from './sizeApply';
import {
  EMPTY_SIZE_EDITS,
  loadSizeEdits,
  SIZE_EDITS_KEY,
  storeSizeEdits,
  type SizeEdit,
  type SizeEditStore,
} from './sizeEdits';

const content = loadContent();
const feel = loadFeel();

const ostrich: SizeEdit = {
  id: 'cameo_ostrich',
  area: 'karoo',
  path: 'content/cameos.json#kinds.ostrich.sizeMul',
  from: content.cameos.kinds.ostrich.sizeMul,
  to: 2.2,
  realM: 2.5,
};
const baboon: SizeEdit = {
  id: 'baboon',
  area: 'karoo',
  path: 'content/birds.json#baboons.heightPx',
  from: content.birds.baboons.heightPx,
  to: content.birds.baboons.heightPx * 1.5,
  hitboxes: ['content/birds.json#baboons.hitboxes'],
};
const store: SizeEditStore = { version: 1, apply: true, edits: [ostrich, baboon] };

afterEach(() => {
  resetStorageForTests();
});

describe('size edits store (D-086)', () => {
  it('is shared by the admin page and the game (the device namespace), not the save', () => {
    setStorageNamespace('e2e.admin.', 'e2e.');
    storeSizeEdits(store);
    expect(readText(SIZE_EDITS_KEY)).toBeNull();
    setStorageNamespace('e2e.', 'e2e.');
    expect(readText(SIZE_EDITS_KEY)).not.toBeNull();
    expect(loadSizeEdits()).toEqual(store);
    setStorageNamespace('', '');
    expect(loadSizeEdits()).toEqual(EMPTY_SIZE_EDITS);
  });

  it('keeps the valid edits when one is malformed', () => {
    writeText(
      SIZE_EDITS_KEY,
      JSON.stringify({ ...store, edits: [ostrich, { id: 'x', to: 'big' }, baboon] }),
    );
    expect(loadSizeEdits()).toEqual(store);
  });

  it('reads a broken or foreign value as no edits (never throws)', () => {
    writeText(SIZE_EDITS_KEY, '{"version":2}');
    expect(loadSizeEdits()).toEqual(EMPTY_SIZE_EDITS);
    writeText(SIZE_EDITS_KEY, 'not json {');
    expect(loadSizeEdits()).toEqual(EMPTY_SIZE_EDITS);
    writeText(SIZE_EDITS_KEY, '[1,2]');
    expect(loadSizeEdits()).toEqual(EMPTY_SIZE_EDITS);
  });

  it('refuses edits that are not sizes', () => {
    expect(isSizeEdit(ostrich)).toBe(true);
    expect(isSizeEdit({ ...ostrich, path: 'content/cameos.json' })).toBe(false);
    expect(isSizeEdit({ ...ostrich, path: 'src/main.ts#x' })).toBe(false);
    expect(isSizeEdit({ ...ostrich, to: -1 })).toBe(false);
    expect(isSizeEdit({ ...ostrich, to: ostrich.from * 6 })).toBe(false);
    expect(isSizeEdit({ ...ostrich, to: Number.NaN })).toBe(false);
    expect(isSizeEdit({ ...ostrich, id: '' })).toBe(false);
    expect(isSizeEdit({ ...ostrich, hitboxes: ['code:src/a.ts#A.b'] })).toBe(false);
  });
});

describe('the sizes as content overrides (D-086)', () => {
  it('sets each value and grows its px hit boxes with it, leaving the original untouched', () => {
    const r = applySizeEdits({ bundle: content, feel }, store.edits);
    expect(r.knobs).toBe(2);
    expect(r.bundle.cameos.kinds.ostrich.sizeMul).toBe(2.2);
    expect(r.bundle.birds.baboons.heightPx).toBe(baboon.to);
    const before = content.birds.baboons.hitboxes.sit.body;
    const after = r.bundle.birds.baboons.hitboxes.sit.body;
    expect(after.rx).toBe(Math.round(before.rx * 1.5));
    expect(after.oy).toBe(Math.round(before.oy * 1.5));
    expect(r.bundle.birds.baboons.hitboxes.peek.head.ry).toBe(
      Math.round(content.birds.baboons.hitboxes.peek.head.ry * 1.5),
    );
    // The cameo's hit shapes are × sizeMul in the sim: no px boxes to scale.
    expect(r.bundle.cameos.kinds.ostrich.hitboxes).toEqual(content.cameos.kinds.ostrich.hitboxes);
    // Nothing else changes; the shipped content is untouched.
    expect(r.bundle.birds.ostriches).toBe(content.birds.ostriches);
    expect(content.cameos.kinds.ostrich.sizeMul).toBe(ostrich.from);
    expect(r.bundle.biomes).toBe(content.biomes);
  });

  it('changes feel.json values and array items by id', () => {
    const r = applySizeEdits({ bundle: content, feel }, [
      {
        id: 'far_ostrich',
        area: 'karoo',
        path: 'content/client/feel.json#fauna.sizeMul.ostrich',
        from: feel.fauna.sizeMul.ostrich,
        to: 0.8,
      },
      {
        id: 'tell_rock_agama',
        area: 'bushveld',
        path: 'content/birds.json#tells.species[id=rock_agama].scale',
        from: content.birds.tells.species.find((s) => s.id === 'rock_agama')?.scale ?? 1,
        to: 1.5,
      },
    ]);
    expect(r.feel.fauna.sizeMul.ostrich).toBe(0.8);
    expect(r.bundle.birds.tells.species.find((s) => s.id === 'rock_agama')?.scale).toBe(1.5);
    expect(r.bundle.birds.tells.species.find((s) => s.id === 'pied_crow')?.scale).toBe(
      content.birds.tells.species.find((s) => s.id === 'pied_crow')?.scale,
    );
  });

  it('leaves an edit whose value changed since (or is already in), or that names no value', () => {
    const r = applySizeEdits({ bundle: content, feel }, [
      { ...ostrich, from: 9, to: 4 },
      { ...ostrich, path: 'content/cameos.json#kinds.ostrich.nope' },
      { ...ostrich, path: 'content/weapons.json#x.y' },
    ]);
    expect(r.knobs).toBe(0);
    expect(r.bundle).toBe(content);
    expect(r.feel).toBe(feel);
  });

  it("makes a code constant's edit a view factor while the constant still has its from", () => {
    const path = 'code:src/game/view/tree/residentTrueSize.ts#RESIDENT_TRUE_MUL.owlFly';
    const edit: SizeEdit = { id: 'baobab_owl', area: 'bushveld', path, from: 2.8, to: 2.52 };
    const r = applySizeEdits({ bundle: content, feel }, [edit], { [path]: 2.8 });
    expect(r.factors['baobab_owl']).toBeCloseTo(0.9, 9);
    expect(r.knobs).toBe(1);
    expect(applySizeEdits({ bundle: content, feel }, [edit], { [path]: 2.52 }).knobs).toBe(0);
  });
});
