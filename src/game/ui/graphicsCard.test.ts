import { describe, expect, it } from 'vitest';
import { cardScale } from './graphicsCard';

describe('cardScale (D-053: the Graphics card grows with the screen like the canvas)', () => {
  it('keeps phones and small windows as laid out', () => {
    expect(cardScale(844, 390)).toBe(1); // iPhone 14 landscape
    expect(cardScale(915, 412)).toBe(1); // Pixel 7 landscape
    expect(cardScale(1280, 720)).toBe(1);
  });

  it('scales a large desktop by its fit against 1280×720', () => {
    expect(cardScale(2560, 1440)).toBe(2);
    expect(cardScale(1920, 1080)).toBe(1.5);
    // A wide window is limited by its height, a tall one by its width.
    expect(cardScale(3440, 1440)).toBe(2);
    expect(cardScale(1600, 1600)).toBe(1.25);
  });
});
