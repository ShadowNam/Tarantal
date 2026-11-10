import { describe, expect, it } from 'vitest';
import { loadContent, loadFeel } from '../../../tools/testContent';
import { EMPTY_SIZE_EDITS } from '../../meta/sizeEdits';
import { knobById } from './sizeKnobs';
import {
  editsFor,
  exportSizes,
  factorsOf,
  percentOf,
  shownM,
  sizesFileName,
  stepped,
  valueWith,
  withKnob,
} from './sizeWork';

const c = { bundle: loadContent(), feel: loadFeel() };
const knob = (id: string) => {
  const k = knobById(id);
  if (k === undefined) throw new Error(id);
  return k;
};

describe('working with the owner’s sizes (D-086)', () => {
  it('steps a factor and names its change', () => {
    expect(stepped(1, 0.1)).toBe(1.1);
    expect(stepped(1.1, -0.1)).toBe(0.99);
    expect(stepped(0.21, -0.1)).toBe(0.2);
    expect(stepped(4.9, 0.1)).toBe(5);
    expect(percentOf(1.1)).toBe('+10 %');
    expect(percentOf(0.98)).toBe('−2 %');
    expect(percentOf(1)).toBe('0 %');
  });

  it('a knob at a factor is one edit per value, rounded its way, with its hit boxes', () => {
    const ostrich = editsFor(knob('cameo_ostrich'), 0.9, 'karoo', c);
    expect(ostrich).toEqual([
      {
        id: 'cameo_ostrich',
        area: 'karoo',
        path: 'content/cameos.json#kinds.ostrich.sizeMul',
        from: 2.76,
        to: 2.484,
        realM: 2.5,
      },
    ]);
    const baboon = editsFor(knob('baboon'), 1.1, 'kalahari', c);
    expect(baboon[0]?.to).toBe(Math.round(c.bundle.birds.baboons.heightPx * 1.1));
    expect(baboon[0]?.hitboxes).toEqual(['content/birds.json#baboons.hitboxes']);
    const colony = editsFor(knob('colony_weaver'), 1.1, 'kalahari', c);
    expect(colony.map((e) => e.path.split('.').at(-1))).toEqual(['near', 'mid', 'far', 'ver']);
    expect(colony.every((e) => Number.isInteger(e.to))).toBe(true);
    expect(editsFor(knob('baboon'), 1, 'karoo', c)).toEqual([]);
  });

  it('the store keeps one knob’s edits at a time and reads its factor back', () => {
    let s = withKnob(EMPTY_SIZE_EDITS, knob('cameo_ostrich'), 0.9, 'karoo', c);
    s = withKnob(s, knob('baboon'), 1.1, 'karoo', c);
    s = withKnob(s, knob('cameo_ostrich'), 0.8, 'karoo', c);
    expect(s.edits.filter((e) => e.id === 'cameo_ostrich')).toHaveLength(1);
    const f = factorsOf(s, c);
    expect(f['cameo_ostrich']).toBeCloseTo(0.8, 3);
    expect(f['baboon']).toBeCloseTo(1.1, 2);
    expect(factorsOf(withKnob(s, knob('baboon'), 1, 'karoo', c), c)['baboon']).toBeUndefined();
    // An edit whose value changed since is left out (stale).
    const stale = { ...s, edits: s.edits.map((e) => ({ ...e, from: e.from + 1 })) };
    expect(factorsOf(stale, c)).toEqual({});
  });

  it('the metres an animal shows as follow its factor and those it is drawn with', () => {
    const hen = knob('ostrich_hen');
    const m = shownM(hen, c, {}) ?? 0;
    expect(m).toBeGreaterThan(1.7);
    expect(m).toBeLessThan(2.1);
    expect(shownM(hen, c, { mid_ostrich: 1.1 })).toBeCloseTo(m * 1.1, 6);
    expect(shownM(hen, c, { ostrich_hen: 0.9, mid_ostrich: 1.1 })).toBeCloseTo(m * 0.99, 6);
    expect(shownM(knob('cameo_dungBeetle'), c, {})).toBeNull();
    expect(valueWith(knob('baboon'), c, 1.1)).toBe(462);
  });

  it('exports the file the apply tool reads', () => {
    const s = withKnob(EMPTY_SIZE_EDITS, knob('cameo_ostrich'), 0.9, 'karoo', c);
    const out = exportSizes(s, { version: '1.22.1', commit: 'abc1234' }, '2026-11-10T14:05:00Z');
    expect(out.version).toBe(1);
    expect(out.build.commit).toBe('abc1234');
    expect(out.edits[0]?.path).toBe('content/cameos.json#kinds.ostrich.sizeMul');
    expect(sizesFileName('2026-11-10T14:05:00.000Z')).toBe(
      'tarantal-size-edits-2026-11-10-1405.json',
    );
  });
});
