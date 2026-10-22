// v1.0.1 (D-028 §4): score pops are pooled BitmapTexts. Shooting flocks shows many pops (world pop
// + HUD stack per bag) while the pools make only a handful of objects, reused for the rest.
// The screenshot freezes the first pop with capture mode's F key (pressed in-page the frame the
// pop appears: under software WebGL a frame takes ~300 ms, longer than a Playwright round trip
// allows), so it shows the BitmapText pop (outline + tinted fill) over the flock.
import { expect, test } from '@playwright/test';
import {
  SCREENSHOTS,
  boot,
  burstAtFlock,
  collectErrors,
  hook,
  isLandscape,
  isTouchProject,
  reload,
  startHunt,
  waitTicks,
} from './helpers';

test('score pops are pooled: many shown, few made', async ({ page }, info) => {
  test.skip(!isLandscape(info), 'landscape profiles only');
  test.setTimeout(300_000);
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  await boot(page, 'seed=42&huntSeconds=60&capture=1');
  await startHunt(page, touch);
  await page.evaluate(() => {
    const watch = (): void => {
      if ((window.__TM__?.pops.shown ?? 0) > 0) {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', key: 'f' }));
        return;
      }
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  });
  let frozenShot = false;
  for (let i = 0; i < 40 && (await hook(page)).pops.shown < 16; i++) {
    const h = await hook(page);
    if (h.over) break;
    if (!frozenShot && h.capture?.frozen === true) {
      await page.screenshot({ path: `${SCREENSHOTS}/pops-${info.project.name}.png` });
      frozenShot = true;
      await page.keyboard.press('KeyF');
      await page.waitForFunction(() => window.__TM__?.capture?.frozen === false);
      continue;
    }
    const flock = h.flockSpots.find((f) => f.alive > 0);
    if (h.shells === 0 || flock === undefined) {
      if (h.shells === 0) await reload(page, touch);
      await waitTicks(page, 30);
      continue;
    }
    // One shot per burst: the helper waits on sim ticks between shots, and the freeze on the
    // first pop stops them (a two-shot burst hung there on WebKit, where the pop came first).
    await burstAtFlock(page, touch, flock.id, 1, 10);
    // 8 more ticks, or the freeze on the first pop (the sim then stops ticking).
    const t0 = (await hook(page)).tick;
    await page.waitForFunction(
      (t) => (window.__TM__?.tick ?? 0) >= t + 8 || window.__TM__?.capture?.frozen === true,
      t0,
      { timeout: 60_000 },
    );
  }
  const end = await hook(page);
  console.log(`[pops] ${JSON.stringify({ project: info.project.name, ...end.pops })}`);
  expect(frozenShot, 'froze on the first pop for the screenshot').toBe(true);
  expect(end.pops.shown, 'enough bags to see reuse').toBeGreaterThanOrEqual(8);
  expect(end.pops.created, 'pooled: fewer objects than pops shown').toBeLessThan(end.pops.shown);
  expect(errors).toEqual([]);
});
