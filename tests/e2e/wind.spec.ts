// v1.17 (D-079): wind that matters — the HUD's wind meter (an arrow downwind and five strength
// bars) under the sock on a wind map, phones too (desktop, Pixel 7 and iPhone 14 landscape), and
// the near grass bowing the same way. ?wind=strong: full wind with long gusts (no waiting), the
// Karoo with its omen on. The bars and the grass read the same number the drift does (the sim's
// strength with the gust); the drift rule itself is unit-tested (src/sim/omen/wind.test.ts).
import { expect, test } from '@playwright/test';
import { boot, collectErrors, hook, isLandscape, isTouchProject, startHunt } from './helpers';

test.use({ serviceWorkers: 'block' });

const overlap = (
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test('the wind meter shows a strong wind on a wind map; the grass bows downwind', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'landscape only: portrait shows the rotate card');
  test.setTimeout(300_000);
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  await boot(
    page,
    'biome=karoo-autumn&layout=none&seed=7&huntSeconds=60&graphics=standard&baboons=0&omen=1&wind=strong',
  );
  await startHunt(page, touch);
  const m = (await (
    await page.waitForFunction(
      () => {
        const w = window.__TM__?.windMeter;
        return w !== null && w !== undefined && window.__TM__?.windGrassLean != null ? w : false;
      },
      null,
      { timeout: 120_000 },
    )
  ).jsonValue()) as { dir: 1 | -1; bars: number; gust: boolean; strength: number };
  // Full wind (and a gust on top): all five bars.
  expect(m.strength).toBeGreaterThanOrEqual(0.95);
  expect(m.bars).toBe(5);
  const h = await hook(page);
  // The grass leans the way the wind blows.
  expect(Math.sign(h.windGrassLean ?? 0)).toBe(m.dir);
  // The meter sits inside the safe area, clear of every other HUD part.
  const r = h.rects['windMeter'];
  const safe = h.safe;
  if (r === undefined || safe === null) throw new Error('no wind meter rect');
  expect(r.x).toBeGreaterThanOrEqual(safe.x);
  expect(r.x + r.w).toBeLessThanOrEqual(safe.x + safe.w);
  expect(r.y).toBeGreaterThanOrEqual(safe.y);
  for (const [id, o] of Object.entries(h.rects))
    if (id !== 'windMeter' && id !== 'windsock' && !id.startsWith('item'))
      expect(overlap(r, o), `wind meter vs ${id}`).toBe(false);
  await page.screenshot({ path: info.outputPath(`wind-meter-${info.project.name}.png`) });
  expect(errors).toEqual([]);
});

test('no wind meter on a map without wind', async ({ page }, info) => {
  test.skip(!isLandscape(info), 'landscape only: portrait shows the rotate card');
  test.setTimeout(300_000);
  const touch = isTouchProject(info);
  await boot(
    page,
    'biome=okavango-spring&layout=none&seed=7&huntSeconds=60&graphics=standard&baboons=0&omen=1',
  );
  await startHunt(page, touch);
  await page.waitForFunction(() => (window.__TM__?.tick ?? 0) > 120, null, { timeout: 120_000 });
  const h = await hook(page);
  expect(h.windMeter).toBeNull();
  expect(h.windGrassLean).toBeNull();
});
