import { afterEach, describe, expect, it } from 'vitest';
import { fontPx, outline, setTextLook } from './textLook';

afterEach(() => {
  setTextLook(1, false, 0.2);
});

describe('text size and high contrast (M9, GDD §18.3)', () => {
  it('large text scales menu and caption fonts; fixed HUD numbers opt out', () => {
    setTextLook(1.25, false, 0.2);
    expect(fontPx(40)).toBe('50px');
    expect(fontPx(64, false)).toBe('64px');
  });

  it('high contrast gives every text a black outline, never thinner than its own', () => {
    expect(outline(40)).toEqual({});
    expect(outline(40, 6)).toEqual({ stroke: '#1B1410', strokeThickness: 6 });
    setTextLook(1, true, 0.2);
    expect(outline(40)).toEqual({ stroke: '#000000', strokeThickness: 8 });
    expect(outline(40, 12)).toEqual({ stroke: '#000000', strokeThickness: 12 });
    // Dark text on a light plate (primary buttons, the score) needs none.
    expect(outline(40, 0, '#1B1410', '#1B1410')).toEqual({});
  });
});
