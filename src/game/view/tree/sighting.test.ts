import { expect, it } from 'vitest';
import { sightingVisible } from './sighting';
it('does not award a discovery for a faded-out or offscreen resident', () => {
  expect(sightingVisible(100, 300, 1, 1920, 1080)).toBe(true);
  expect(sightingVisible(-1, 300, 1, 1920, 1080)).toBe(false);
  expect(sightingVisible(2000, 300, 1, 1920, 1080)).toBe(false);
  expect(sightingVisible(100, -1, 1, 1920, 1080)).toBe(false);
  expect(sightingVisible(100, 1081, 1, 1920, 1080)).toBe(false);
  expect(sightingVisible(100, 300, 0, 1920, 1080)).toBe(false);
});
