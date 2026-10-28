// 1.9.4 (D-057): life in the trees — the baobab's residents and the weaver colonies. Rendering
// only (no sim state, no score): the counts come from the test hook (`treeLife`). Shots are
// dispatched in-page on the canvas with a fresh pointerId each (page.touchscreen taps after a
// held arrow key did not register on WebKit's iPhone profile in CI). Every rAF/poll is bounded.
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

let pointerId = 2400;

/** Fires one shot at design point (x, y), in-page. */
async function shootAt(page: Page, touch: boolean, x: number, y: number): Promise<void> {
  pointerId++;
  await page.evaluate(
    ({ x, y, id, isTouch }) => {
      const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
      const g = window.__TM__;
      if (!canvas || !g) throw new Error('game not booted');
      const r = canvas.getBoundingClientRect();
      const init: PointerEventInit = {
        clientX: r.left + (x / g.designWidth) * r.width,
        clientY: r.top + (y / g.designHeight) * r.height,
        pointerId: id,
        pointerType: isTouch ? 'touch' : 'mouse',
        isPrimary: true,
        button: 0,
        buttons: 1,
        bubbles: true,
        cancelable: true,
      };
      canvas.dispatchEvent(new PointerEvent('pointerdown', init));
      canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
    },
    { x, y, id: pointerId, isTouch: touch },
  );
}

/** Pans left until the secret part `partId` sits well inside the screen (or the left edge). */
async function partInView(page: Page, partId: string): Promise<void> {
  // The biome's art loads lazily: wait for the hunt to be running before panning.
  await page.waitForFunction(() => (window.__TM__?.tick ?? 0) > 30, null, { timeout: 120_000 });
  await page.keyboard.down('ArrowLeft');
  await page.waitForFunction(
    (id) => {
      const g = window.__TM__;
      return (
        g?.secretSpots.some((s) => s.partId === id && s.x > 260 && s.x < g.designWidth - 260) ===
          true ||
        (g !== undefined && g.cameraX > 0 && g.cameraX <= 961)
      );
    },
    partId,
    { timeout: 300_000 },
  );
  await page.keyboard.up('ArrowLeft');
}

test('bushveld: a resident of the baobab shows itself within the hunt', async ({ page }, info) => {
  test.skip(!isLandscape(info), 'portrait shows the rotate card');
  test.setTimeout(480_000);
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  await boot(page, 'biome=bushveld-winter&seed=42&huntSeconds=120&graphics=standard');
  await startHunt(page, touch);
  await partInView(page, 'pod');
  const h = await hook(page);
  expect(h.missingTextures).toEqual([]);
  // Within ~100 s of sim time (the hunt's length bounds the wait), one is out on screen.
  await page.waitForFunction(
    () => {
      const g = window.__TM__;
      if (g === undefined) return false;
      const out = g.treeLife?.residents.some((r) => r.x > 0 && r.x < g.designWidth) === true;
      return out || g.ticksLeft < 60;
    },
    null,
    { timeout: 420_000, polling: 250 },
  );
  const seen = await hook(page);
  expect(
    seen.treeLife?.residents.length ?? 0,
    'a resident showed before the hunt ended',
  ).toBeGreaterThan(0);
  await page.screenshot({ path: `${SCREENSHOTS}/tree-life-resident-${info.project.name}.png` });
  expect(errors).toEqual([]);
});

test('bushveld: a shot near the owl makes it fly off; the score is unchanged', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'portrait shows the rotate card');
  test.setTimeout(420_000);
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  // ?treeLife=owl keeps the owl out; ?birds=0: no bird can take a pellet and change the score.
  await boot(
    page,
    'biome=bushveld-winter&seed=42&huntSeconds=300&birds=0&graphics=standard&treeLife=owl',
  );
  await startHunt(page, touch);
  await partInView(page, 'pod');
  await page.waitForFunction(
    () => {
      const g = window.__TM__;
      return (
        g?.treeLife?.residents.some(
          (r) => r.id === 'owl' && r.frame.startsWith('owl_') && !r.frame.startsWith('owl_fly'),
        ) === true
      );
    },
    null,
    { timeout: 120_000, polling: 100 },
  );
  const before = await hook(page);
  // Several shots a few px off the owl (seeded pellet patterns): stop once it has been startled.
  for (let k = 0; k < 6; k++) {
    const g = await hook(page);
    if ((g.treeLife?.ducks ?? 0) >= 1) break;
    const owl = g.treeLife?.residents.find((r) => r.id === 'owl');
    if (owl === undefined) {
      // Between visits (a forced visit leaves a second's gap): wait for it to come back.
      await page.waitForFunction(
        () => window.__TM__?.treeLife?.residents.some((r) => r.id === 'owl') === true,
        null,
        { timeout: 60_000, polling: 100 },
      );
      continue;
    }
    await shootAt(page, touch, owl.x + 8, owl.y + 6);
    // A shot resolves within ~20 ticks; never a long wait that burns the hunt clock.
    const t0 = g.tick;
    await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t + 30, t0, {
      timeout: 60_000,
    });
  }
  const after = await hook(page);
  expect(after.treeLife?.ducks ?? 0, 'the owl was startled').toBeGreaterThanOrEqual(1);
  expect(after.score, 'residents never score').toBe(before.score);
  await page.screenshot({ path: `${SCREENSHOTS}/tree-life-owl-off-${info.project.name}.png` });
  expect(errors).toEqual([]);
});

// The Kalahari colony is on the mid plane, Namibië's on the near plane (with its lovebirds).
for (const biome of ['kalahari-summer', 'namibie'] as const) {
  test(`${biome}: weavers live round the nest; the nest shot still costs −10 and they scatter`, async ({
    page,
  }, info) => {
    test.skip(!isLandscape(info), 'portrait shows the rotate card');
    test.setTimeout(420_000);
    const touch = isTouchProject(info);
    const errors = collectErrors(page);
    await boot(page, `biome=${biome}&seed=42&huntSeconds=120&graphics=standard`);
    await startHunt(page, touch);
    await partInView(page, 'nest');
    await page.waitForFunction(() => (window.__TM__?.treeLife?.colony?.weavers ?? 0) > 0, null, {
      timeout: 120_000,
      polling: 100,
    });
    const before = await hook(page);
    expect(before.missingTextures).toEqual([]);
    if (biome === 'namibie') expect(before.treeLife?.colony?.lovebirds ?? 0).toBeGreaterThan(0);
    await page.screenshot({
      path: `${SCREENSHOTS}/tree-life-colony-${biome}-${info.project.name}.png`,
    });
    // Shoot the nest itself (its secret spot): −10, the angry burst, the colony scatters.
    const spot = before.secretSpots.find((s) => s.partId === 'nest' && s.ready);
    expect(spot, 'the nest is on screen').toBeDefined();
    if (spot === undefined) return;
    await shootAt(page, touch, spot.x, spot.y);
    await page.waitForFunction(() => (window.__TM__?.weaverBursts ?? 0) >= 1, null, {
      timeout: 60_000,
    });
    const hit = await hook(page);
    expect(hit.score).toBe(before.score - 10);
    expect(hit.treeLife?.colony?.scatters ?? 0).toBeGreaterThanOrEqual(1);
    // Two seconds of sim time later the colony's own birds are gone (scattered).
    await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t + 120, hit.tick, {
      timeout: 120_000,
    });
    const away = await hook(page);
    expect(away.treeLife?.colony?.weavers ?? -1).toBeLessThan(
      before.treeLife?.colony?.weavers ?? 0,
    );
    expect(errors).toEqual([]);
  });
}
