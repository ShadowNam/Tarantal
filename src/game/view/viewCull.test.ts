import { describe, expect, it } from 'vitest';
import { inViewX } from './viewCull';

describe('inViewX (off-screen culling)', () => {
  it('keeps anything that reaches into the screen or its margin', () => {
    expect(inViewX(500, 10, 1920, 0)).toBe(true);
    // Its centre off the left edge, its reach still on screen.
    expect(inViewX(-50, 60, 1920, 0)).toBe(true);
    expect(inViewX(1970, 60, 1920, 0)).toBe(true);
    // Only the margin reaches it.
    expect(inViewX(-150, 60, 1920, 96)).toBe(true);
    expect(inViewX(2070, 60, 1920, 96)).toBe(true);
  });

  it('culls what lies wholly beyond the margin', () => {
    expect(inViewX(-200, 60, 1920, 96)).toBe(false);
    expect(inViewX(2120, 60, 1920, 96)).toBe(false);
  });
});
