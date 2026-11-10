// v1.19 (D-084): the Gun Shed's cards show each gun's painted side view (a lazy chunk and a file
// in the `shed` group no hunt loads), unlocked ones in colour, locked ones in grey. Checked on the
// canvas pixels under each picture, not only the hook.
import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { boot, hook, isLandscape, isTouchProject, tapRect, toClient } from './helpers';

async function shedSave(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      'tm.e2e.save.v1',
      JSON.stringify({
        v: 1,
        ftue: { done: true, skipped: false, step: '' },
        loadout: { weapon: 'dubbelloop', sights: {} },
        unlocks: { weapons: ['windbuks', 'twee_twee'], sights: [] },
      }),
    );
  });
}

interface Stats {
  /** Share of strongly coloured pixels (wood, brass, green paint). */
  colour: number;
  /** Luminance spread: a painted gun, not a flat card. */
  spread: number;
  /** Share of pixels away from the region's most common colour (the card under the gun). */
  covered: number;
}

function statsIn(png: PNG, x0: number, y0: number, x1: number, y1: number): Stats {
  let n = 0;
  let coloured = 0;
  const px: [number, number, number][] = [];
  const hist = new Map<number, number>();
  let lo = 255;
  let hi = 0;
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(png.height, Math.ceil(y1)); y++)
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(png.width, Math.ceil(x1)); x++) {
      const i = (y * png.width + x) * 4;
      const r = png.data[i] ?? 0;
      const g = png.data[i + 1] ?? 0;
      const b = png.data[i + 2] ?? 0;
      n++;
      px.push([r, g, b]);
      const q = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      hist.set(q, (hist.get(q) ?? 0) + 1);
      if (Math.max(r, g, b) - Math.min(r, g, b) > 45) coloured++;
      const l = 0.3 * r + 0.59 * g + 0.11 * b;
      lo = Math.min(lo, l);
      hi = Math.max(hi, l);
    }
  let mode = 0;
  let best = -1;
  for (const [q, c] of hist)
    if (c > best) {
      best = c;
      mode = q;
    }
  const m = [((mode >> 8) & 15) * 16 + 8, ((mode >> 4) & 15) * 16 + 8, (mode & 15) * 16 + 8];
  const away = px.filter(
    ([r, g, b]) =>
      Math.abs(r - (m[0] ?? 0)) + Math.abs(g - (m[1] ?? 0)) + Math.abs(b - (m[2] ?? 0)) > 60,
  ).length;
  return { colour: n === 0 ? 0 : coloured / n, spread: hi - lo, covered: n === 0 ? 0 : away / n };
}

test('the Gun Shed shows every gun as a painted side view, locked ones in grey', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'portrait shows the rotate card');
  test.setTimeout(240_000);
  const touch = isTouchProject(info);
  await shedSave(page);
  await boot(page, 'seed=42&graphics=standard');
  await page.waitForFunction(() => window.__TM__?.rects['shed'] !== undefined, null, {
    timeout: 90_000,
  });
  await tapRect(page, touch, 'shed');
  // Every primary gun's card, all of them side views (the sheet arrives on demand).
  await page.waitForFunction(
    () => {
      const p = window.__TM__?.shedPictures ?? [];
      return p.length >= 6 && p.every((x) => x.source === 'side');
    },
    null,
    { timeout: 120_000 },
  );
  await page.waitForTimeout(400);
  const pics = (await hook(page)).shedPictures ?? [];
  expect(pics.map((p) => p.id).sort()).toEqual(
    ['dubbelloop', 'kettie', 'langloop', 'pomp', 'twee_twee', 'windbuks'].sort(),
  );
  const png = PNG.sync.read(await page.screenshot());
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  for (const p of pics) {
    const a = await toClient(page, p.x, p.y);
    const b = await toClient(page, p.x + p.w, p.y + p.h);
    const s = statsIn(png, a.x * dpr, a.y * dpr, b.x * dpr, b.y * dpr);
    expect(s.spread, `${p.id}: a painted picture`).toBeGreaterThan(60);
    expect(s.covered, `${p.id}: the gun covers its picture`).toBeGreaterThan(0.05);
    if (p.locked) expect(s.colour, `${p.id}: locked is grey`).toBeLessThan(0.02);
    else expect(s.colour, `${p.id}: unlocked in colour`).toBeGreaterThan(0.04);
    expect(p.w / p.h, `${p.id}: a side view is wide`).toBeGreaterThan(2);
  }
  expect(pics.filter((p) => p.locked).length).toBeGreaterThan(0);
  expect(pics.filter((p) => !p.locked).length).toBeGreaterThan(0);
});
