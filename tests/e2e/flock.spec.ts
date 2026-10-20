// M3: the flock reacts to real input on every landscape profile — two quick shots at a foraging
// flock alert it and send it running (a third flushes it), and the Vuvuzela (Q / horn button)
// spends a charge and flushes the visible flock. Screenshots show the KEK bubbles and the button.
import { expect, test } from '@playwright/test';
import {
  SCREENSHOTS,
  boot,
  collectErrors,
  hook,
  isLandscape,
  isTouchProject,
  burstAtFlock,
  startHunt,
  toClient,
  waitTicks,
} from './helpers';

test('spook → run → flush by shooting, then the Vuvuzela', async ({ page }, info) => {
  test.skip(!isLandscape(info), 'landscape profiles only');
  test.setTimeout(240_000);
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  await boot(page, 'seed=42&huntSeconds=60');
  await startHunt(page, touch);

  // Three shots into the flock that forages in view at the start, 15 ticks apart (the
  // escalation window is 90 ticks, the fire cooldown 9), fired in-page so harness lag can't
  // stretch them past the window.
  const start = await hook(page);
  const flock = start.flockSpots.find((f) => f.alive > 0 && f.y > 500);
  if (!flock) throw new Error('no flock in view at the start');
  const shotTicks = await burstAtFlock(page, touch, flock.id, 3, 15);
  await waitTicks(page, 6);
  await page.screenshot({ path: `${SCREENSHOTS}/flock-escalation-${info.project.name}.png` });
  const log = (await hook(page)).flockLog;
  const why = `flock log ${log.join(', ')} · shots at ticks ${shotTicks.join(', ')}`;
  expect(
    log.some((x) => x.endsWith('forage>alert:threat')),
    why,
  ).toBe(true);
  expect(
    log.some((x) => x.endsWith('alert>run:threat')),
    why,
  ).toBe(true);
  expect(
    log.some((x) => x.endsWith('run>flush:threat')),
    why,
  ).toBe(true);

  // Vuvuzela: Q on desktop, the horn button on touch.
  const h = await hook(page);
  expect(h.gadgetCharges).toBe(2);
  const g = h.rects['gadget'];
  if (!g) throw new Error('gadget button not laid out');
  expect(Math.min(g.w, g.h)).toBeGreaterThanOrEqual(64);
  if (touch) {
    const p = await toClient(page, g.x + g.w / 2, g.y + g.h / 2);
    await page.touchscreen.tap(p.x, p.y);
  } else {
    await page.keyboard.press('KeyQ');
  }
  await page.waitForFunction(() => window.__TM__?.gadgetUses === 1, null, { timeout: 120_000 });
  await waitTicks(page, 4);
  expect((await hook(page)).gadgetCharges).toBe(1);
  await page.screenshot({ path: `${SCREENSHOTS}/flock-vuvuzela-${info.project.name}.png` });
  expect(errors).toEqual([]);
});
