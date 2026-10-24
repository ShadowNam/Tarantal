// v1.4 B (D-039 review): a long-range area must not hide its own targets. At every map's opening
// camera, nothing in front of the Ver plane (mid/far props, the far-veld trees) may cover the Ver
// feeding spots, and the Ver flock that feeds there stays in view (Tech §3.3 parallax).
import { describe, expect, it } from 'vitest';
import { WEEKDAY_IDS } from '../src/content/schemas';
import { verBirdsHidden, verOcclusion } from './verOcclusion';

describe('Namibië: the waterhole flock is in view at the opening camera', () => {
  it('no nearer art covers a Ver feeding spot on any map that opens the Ver plane', () => {
    const rows = verOcclusion('namibie');
    expect(rows.length).toBeGreaterThanOrEqual(WEEKDAY_IDS.length * 4);
    for (const r of rows) expect(r.hidden, r.map).toBeLessThanOrEqual(0.01);
  });

  it('almost no Ver bird stands behind nearer art (weekday maps and Die Verste)', () => {
    for (const l of WEEKDAY_IDS)
      for (const bonus of [undefined, 'dieVerste'])
        expect(verBirdsHidden('namibie', l, bonus, 3), `${l}${bonus ?? ''}`).toBeLessThanOrEqual(
          0.03,
        );
  }, 240_000);
});
