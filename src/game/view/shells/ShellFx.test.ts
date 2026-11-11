// v1.19 (D-084): the Dragon's Breath cone obeys the flash rule: at most 3 large flashes a second
// (shared with lightning and the other large flashes), a smaller, dimmer cone when refused, and
// never a big one with "reduce flashes". Never a full-screen flash: the cone is a small share of
// the screen.
import { describe, expect, it, vi } from 'vitest';
import { FlashLimiter } from '../flashLimit';
import { coneArea, coneShape } from './cone';

vi.mock('../../assets/AssetManifest', () => ({ TEX: { puff: 'fx/puff', spark: 'fx/spark' } }));

const { ShellFx, newShellFxStats } = await import('./ShellFx');

/** Just enough of a Phaser scene for ShellFx: objects that take any call and return themselves. */
function fakeScene() {
  const obj = (): Record<string, unknown> =>
    new Proxy(
      {},
      {
        get: (_t, k) => (k === 'then' ? undefined : () => obj()),
      },
    );
  return {
    add: { graphics: () => obj(), image: () => obj() },
    tweens: { add: () => undefined },
  };
}

function fx(reduceFlashes: boolean, limiter = new FlashLimiter(3, 50)) {
  const stats = newShellFxStats();
  const sounds: string[] = [];
  const shells = new ShellFx({
    scene: fakeScene() as never,
    layer: { addAt: () => undefined } as never,
    prefs: { reduceFlashes, flashAlpha: reduceFlashes ? 0.35 : 1, particleScale: 1 } as never,
    flashes: limiter,
    playExtra: (key) => sounds.push(key),
    stats,
  });
  return { shells, stats, sounds };
}

describe("Dragon's Breath cone (D-084)", () => {
  it('reaches toward the aim and covers a small share of the screen', () => {
    const big = coneShape({ x: 1300, y: 760 }, { x: 960, y: 300 }, true);
    const small = coneShape({ x: 1300, y: 760 }, { x: 960, y: 300 }, false);
    expect(big.tipY).toBeLessThan(760);
    expect(small.len).toBeLessThan(big.len);
    expect(small.half).toBeLessThan(big.half);
    expect(coneArea(big) / (1920 * 1080)).toBeLessThan(0.12);
    // Aimed far up the screen it stays capped (never a screen-wide sheet).
    const long = coneShape({ x: 1300, y: 1000 }, { x: 0, y: 0 }, true);
    expect(long.len).toBeLessThanOrEqual(760);
  });

  it('at most 3 big cones a second; the rest are small', () => {
    const { shells, stats, sounds } = fx(false);
    const now = vi.spyOn(performance, 'now');
    for (let i = 0; i < 10; i++) {
      now.mockReturnValue(1000 + i * 100);
      shells.dragon({ x: 1300, y: 760 }, { x: 960, y: 400 }, 0);
    }
    now.mockRestore();
    expect(stats.cones).toBe(10);
    expect(stats.big).toBeGreaterThan(0);
    // In any 1000 ms window, no more than 3 big cones.
    for (const t of stats.bigAt)
      expect(stats.bigAt.filter((u) => u >= t && u < t + 1000).length).toBeLessThanOrEqual(3);
    expect(stats.small).toBe(10 - stats.big);
    expect(sounds.every((k) => k === 'sfx/shell_dragon')).toBe(true);
  });

  it('shares the budget with the other large flashes (a lightning strike takes a slot)', () => {
    const limiter = new FlashLimiter(3, 50);
    limiter.start(1000);
    limiter.start(1300);
    limiter.start(1600);
    const { shells, stats } = fx(false, limiter);
    const now = vi.spyOn(performance, 'now').mockReturnValue(1700);
    shells.dragon({ x: 1300, y: 760 }, { x: 960, y: 400 }, 0);
    now.mockRestore();
    expect(stats.big).toBe(0);
    expect(stats.small).toBe(1);
  });

  it('"reduce flashes": never a big cone', () => {
    const { shells, stats } = fx(true);
    const now = vi.spyOn(performance, 'now');
    for (let i = 0; i < 5; i++) {
      now.mockReturnValue(10_000 + i * 2000);
      shells.dragon({ x: 1300, y: 760 }, { x: 960, y: 400 }, 0);
    }
    now.mockRestore();
    expect(stats.big).toBe(0);
    expect(stats.small).toBe(5);
  });

  it('the Slug booms; a singed bird gets its puff', () => {
    const { shells, stats, sounds } = fx(false);
    shells.slug(0.2);
    shells.singe(900, 500, 0.6);
    expect(stats.slugs).toBe(1);
    expect(stats.singes).toBe(1);
    expect(sounds).toEqual(['sfx/shell_slug']);
  });
});
