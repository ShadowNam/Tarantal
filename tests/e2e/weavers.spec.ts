// v1.4 B (D-039): shooting a sociable-weaver family nest costs −10 (the existing secretPenalty)
// and lets the angry weavers out; they swirl, then settle back into the holes after ~3–4 s of sim
// time. Rendering only: the counts come from the test hook (`weavers`, `weaverBursts`).
import { expect, test, type Page } from '@playwright/test';
import {
  SCREENSHOTS,
  boot,
  collectErrors,
  hook,
  isLandscape,
  isTouchProject,
  startHunt,
} from './helpers';

/** Taps the nest part in-page (one round trip); false when it isn't on screen. */
async function tapNest(page: Page, touch: boolean): Promise<boolean> {
  return page.evaluate((isTouch) => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
    const g = window.__TM__;
    if (!canvas || !g) throw new Error('game not booted');
    const spot = g.secretSpots.find(
      (s) => s.partId === 'nest' && s.ready && s.x > 40 && s.x < g.designWidth - 40,
    );
    if (spot === undefined) return false;
    const r = canvas.getBoundingClientRect();
    const init: PointerEventInit = {
      clientX: r.left + (spot.x / g.designWidth) * r.width,
      clientY: r.top + (spot.y / g.designHeight) * r.height,
      pointerId: 901,
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
}

/** Pans left until the nest is on screen. */
async function nestInView(page: Page): Promise<void> {
  // The biome's art loads lazily: wait for the hunt to be running before panning.
  await page.waitForFunction(() => (window.__TM__?.tick ?? 0) > 30, null, { timeout: 120_000 });
  await page.keyboard.down('ArrowLeft');
  await page.waitForFunction(
    () => {
      const g = window.__TM__;
      return (
        g?.secretSpots.some(
          (s) => s.partId === 'nest' && s.x > 200 && s.x < g.designWidth - 200,
        ) === true ||
        (g !== undefined && g.cameraX > 0 && g.cameraX <= 961)
      );
    },
    null,
    { timeout: 300_000 },
  );
  await page.keyboard.up('ArrowLeft');
}

// The Kalahari nest is on the mid plane (a smaller burst), Namibië's on the near plane (8–15).
for (const [biome, atLeast] of [
  ['kalahari-summer', 4],
  ['namibie', 7],
] as const) {
  test(`${biome}: the family nest gives −10 and its weavers come out and settle back`, async ({
    page,
  }, info) => {
    test.skip(!isLandscape(info), 'portrait shows the rotate card');
    test.setTimeout(400_000);
    const touch = isTouchProject(info);
    const errors = collectErrors(page);
    await boot(page, `biome=${biome}&seed=42&huntSeconds=60`);
    await startHunt(page, touch);
    await nestInView(page);
    const before = await hook(page);
    expect(before.missingTextures).toEqual([]);
    expect(await tapNest(page, touch), 'the nest is on screen').toBe(true);
    await page.waitForFunction(() => (window.__TM__?.weaverBursts ?? 0) >= 1, null, {
      timeout: 60_000,
    });
    const hitTick = (await hook(page)).tick;
    await page.waitForFunction((n) => (window.__TM__?.weavers ?? 0) >= n, atLeast, {
      timeout: 60_000,
    });
    const out = await hook(page);
    expect(out.score).toBe(before.score - 10);
    await page.screenshot({ path: `${SCREENSHOTS}/weavers-out-${biome}-${info.project.name}.png` });
    // ~3–4 s later (sim time) they are all back in their holes.
    await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t + 60 * 4.5, hitTick, {
      timeout: 300_000,
    });
    await page.waitForFunction(() => window.__TM__?.weavers === 0, null, { timeout: 30_000 });
    expect(errors).toEqual([]);
  });
}
