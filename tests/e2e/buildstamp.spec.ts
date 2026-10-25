// v1.6 (D-042): the build stamp ("v1.6.0 · 1219b9d · 25 Oct 08:40 · Karoo Farm · Tue · art ok") on
// the title and in a hunt: readable (≥ 20 design px), inside the safe area, never over the HUD's
// essentials. Desktop, Pixel 7 and iPhone 14 landscape (and their stand-ins).
import { expect, test } from '@playwright/test';
import { boot, hook, isLandscape, isTouchProject, startHunt } from './helpers';

const STAMP = /^v\d+\.\d+\.\d+ · [0-9a-z]+( · \d{1,2} [A-Z][a-z]{2} \d\d:\d\d)? · .+ · \S+ · .+$/;

type R = { x: number; y: number; w: number; h: number };
const overlaps = (a: R, b: R): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test.use({ serviceWorkers: 'block' });

test('the build stamp on the title and in a hunt', async ({ page }, info) => {
  test.skip(!isLandscape(info), 'the game is played in landscape');
  test.skip((process.env['E2E_PLATFORM'] || 'web') !== 'web', 'portals show it in Settings only');
  test.setTimeout(240_000);
  await boot(page, 'seed=42&huntSeconds=20');
  await page.waitForFunction(() => window.__TM__?.stamp !== undefined, null, { timeout: 60_000 });
  let h = await hook(page);
  expect(h.stamp?.text).toMatch(STAMP);
  expect(h.stamp?.text).toContain('art ok');
  expect(h.stamp?.visible).toBe(true);
  expect(h.stamp?.px ?? 0).toBeGreaterThanOrEqual(20);
  const inside = (r: R): void => {
    const safe = h.safe ?? { x: 0, y: 0, w: h.designWidth, h: h.designHeight };
    expect(r.x).toBeGreaterThanOrEqual(safe.x);
    expect(r.y + r.h).toBeLessThanOrEqual(safe.y + safe.h + 1);
  };
  if (h.stamp) inside(h.stamp.rect);

  await startHunt(page, isTouchProject(info));
  await page.waitForFunction(() => window.__TM__?.rects['gadget'] !== undefined, null, {
    timeout: 60_000,
  });
  await page.waitForTimeout(500);
  h = await hook(page);
  const stamp = h.stamp;
  expect(stamp?.text).toMatch(STAMP);
  if (stamp === undefined) return;
  inside(stamp.rect);
  for (const id of ['timer', 'score', 'belt', 'gadget', 'pause', 'reloadPrompt', 'quota']) {
    const r = h.rects[id];
    if (r !== undefined) expect(overlaps(stamp.rect, r), `stamp over ${id}`).toBe(false);
  }
  await page.screenshot({ path: `docs/art-preview/compare/v16-stamp-${info.project.name}.png` });
});
