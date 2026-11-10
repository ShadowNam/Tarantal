import { describe, expect, it } from 'vitest';
import { getAt, parseSizePath, sameSize, scaleNumbers, updateAt } from './sizePaths';

describe('size paths (D-086)', () => {
  it('parses content paths, array items by id and code constants', () => {
    expect(parseSizePath('content/cameos.json#kinds.ostrich.sizeMul')).toEqual({
      kind: 'content',
      file: 'content/cameos.json',
      keys: ['kinds', 'ostrich', 'sizeMul'],
    });
    expect(parseSizePath('content/birds.json#tells.species[id=rock_agama].scale')).toEqual({
      kind: 'content',
      file: 'content/birds.json',
      keys: ['tells', 'species', { id: 'rock_agama' }, 'scale'],
    });
    expect(
      parseSizePath('code:src/game/view/tree/residentTrueSize.ts#RESIDENT_TRUE_MUL.owlFly'),
    ).toEqual({
      kind: 'code',
      file: 'src/game/view/tree/residentTrueSize.ts',
      constant: 'RESIDENT_TRUE_MUL',
      key: 'owlFly',
    });
    for (const bad of ['', 'content/x.json', 'content/x.json#a..b', 'x.json#a', 'code:a#B.c'])
      expect(parseSizePath(bad), bad).toBeNull();
  });

  it('reads and replaces a value, copying only along the path', () => {
    const doc = { a: { b: [{ id: 'x', v: 1 }, { id: 'y', v: 2 }] }, c: { d: 3 } };
    const keys = parseSizePath('content/a.json#a.b[id=y].v');
    if (keys?.kind !== 'content') throw new Error('no path');
    expect(getAt(doc, keys.keys)).toBe(2);
    const next = updateAt(doc, keys.keys, () => 5);
    expect(getAt(next, keys.keys)).toBe(5);
    expect(doc.a.b[1]?.v).toBe(2);
    expect(next.c).toBe(doc.c);
    expect(next.a.b[0]).toBe(doc.a.b[0]);
    // A path that isn't there changes nothing.
    expect(updateAt(doc, ['a', 'zz'], () => 1)).toBe(doc);
    expect(getAt(doc, ['c', 'd', 'e'])).toBeUndefined();
  });

  it('scales a hit box set to whole px, leaving comments', () => {
    expect(scaleNumbers({ $comment: 'x', sit: { rx: 10, oy: -15 } }, 1.5)).toEqual({
      $comment: 'x',
      sit: { rx: 15, oy: -22 },
    });
    expect(sameSize(2.76, 2.76 + 1e-12)).toBe(true);
    expect(sameSize(2.76, 2.761)).toBe(false);
  });
});
