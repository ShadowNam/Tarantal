import { describe, expect, it } from 'vitest';
import { CLOUD_DECKS, driftX, gloomTint, layoutDeck } from './clouds';

describe('cloud decks (v1.6, D-042)', () => {
  it('lays out the same sky every time, inside the span, cumulus under the flyer band', () => {
    for (const [id, deck] of Object.entries(CLOUD_DECKS)) {
      const a = layoutDeck(deck, -300, 2680, 5);
      expect(layoutDeck(deck, -300, 2680, 5), id).toEqual(a);
      for (const c of a) {
        expect(c.x).toBeGreaterThanOrEqual(-300);
        expect(c.x).toBeLessThanOrEqual(2380);
        if (c.kind !== 'cirrus') expect(c.y, `${id} ${c.kind}`).toBeGreaterThan(378);
      }
    }
  });

  it('drifts on sim time only and wraps round the sky', () => {
    expect(driftX(100, 5, 0, -300, 2680)).toBe(100);
    expect(driftX(100, 5, 10, -300, 2680)).toBe(150);
    expect(driftX(2370, 5, 10, -300, 2680)).toBe(-260);
  });

  it('greys over with the weather', () => {
    expect(gloomTint('#FFFFFF', 0)).toBe(0xffffff);
    expect(gloomTint('#FFFFFF', 1)).toBe(0x8e96a2);
  });
});
