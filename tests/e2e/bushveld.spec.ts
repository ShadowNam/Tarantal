// M8 (PR B): Winter · Bushveld renders and plays — its own scenery (no missing textures), the
// low-sun glare in an omen hunt, and the dassie secret (a shot beside it, not at it) giving the
// spotter reveal. `?biome=` (dev/e2e builds only) plays Classic in the biome. The rules are
// proven headless in src/sim/bushveld.test.ts.
import { expect, test } from '@playwright/test';
import {
  SCREENSHOTS,
  boot,
  collectErrors,
  hook,
  isLandscape,
  isTouchProject,
  startHunt,
} from './helpers';

test('Bushveld: scenery, glare, and the dassie near-miss', async ({ page }, info) => {
  test.skip(!isLandscape(info), 'portrait shows the rotate card');
  test.setTimeout(180_000);
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  await boot(page, 'biome=bushveld-winter&omen=1&huntSeconds=20');
  await startHunt(page, touch);
  let h = await hook(page);
  expect(h.biome).toBe('bushveld-winter');
  expect(h.missingTextures).toEqual([]);
  expect(h.omen).toBe(true);
  await page.waitForFunction(() => window.__TM__?.glare !== null);
  await page.screenshot({ path: `${SCREENSHOTS}/bushveld-${info.project.name}.png` });

  // Tap beside the dassie (in-page, one round trip): its alarm gives the spotter reveal.
  const tapped = await page.evaluate((isTouch) => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
    const g = window.__TM__;
    if (!canvas || !g) throw new Error('game not booted');
    const spot = g.secretSpots.find((s) => s.partId === 'dassie' && s.ready);
    if (spot === undefined) return false;
    const r = canvas.getBoundingClientRect();
    const init: PointerEventInit = {
      clientX: r.left + ((spot.x + 70) / g.designWidth) * r.width,
      clientY: r.top + (spot.y / g.designHeight) * r.height,
      pointerId: 900,
      pointerType: isTouch ? 'touch' : 'mouse',
      isPrimary: true,
      button: 0,
      buttons: 1,
      bubbles: true,
      cancelable: true,
    };
    canvas.dispatchEvent(new PointerEvent('pointerdown', init));
    canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
    return true;
  }, touch);
  expect(tapped, 'the dassie is on screen at the start').toBe(true);
  await page.waitForFunction(() => window.__TM__?.powerups.includes('meerkat_spotter') === true);
  h = await hook(page);
  expect(h.secretSpots.some((s) => s.partId === 'dassie' && s.ready)).toBe(false);
  await page.screenshot({ path: `${SCREENSHOTS}/bushveld-dassie-${info.project.name}.png` });
  expect(errors).toEqual([]);
});
