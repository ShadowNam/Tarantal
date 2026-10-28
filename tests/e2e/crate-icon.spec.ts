// 1.9.2 (D-055): a crate's power-up picture follows its crate exactly and shows once. The
// product owner saw the picture "in two positions" while a crate fell: the tags lived in the
// screen layer at a hand-made x (no scope zoom, a frame out of step) and the canopy and box-front
// tags both showed in the air. Now one tag sits in the crate's own overlay layer.
// Checked every frame while the crate falls during a pan, with the Langloop's scope raised, and
// during the shot's screen shake: the tag's centre (its world transform) stays on the canopy
// (through the crate image's transform) and the crate shows one tag.
import { expect, test, type Page } from '@playwright/test';
import { boot, collectErrors, isLandscape, isTouchProject, startHunt, waitTicks } from './helpers';

test.use({ serviceWorkers: 'block' });

/** 2026-10-19, a Monday: the save's bonus unlocks are for this UTC day. */
const DAY = 20745;

/** A save with the Langloop equipped (the scoped gun with the strongest zoom). */
async function langloopSave(page: Page): Promise<void> {
  await page.addInitScript((d) => {
    localStorage.setItem(
      'tm.e2e.save.v1',
      JSON.stringify({
        v: 1,
        settings: { quality: 'medium' },
        ftue: { done: true, skipped: false, step: '' },
        loadout: { weapon: 'langloop', sights: { langloop: 'scope_var' } },
        unlocks: { weapons: ['twee_twee', 'langloop'], sights: [] },
        bestRank: 'bosveldjagter',
        bonusMaps: { day: d, unlocked: [], bests: {} },
      }),
    );
  }, DAY);
}

interface Sampled {
  /** Frames the crate was drawn on, and every animation frame sampled. */
  frames: number;
  total: number;
  tagged: number;
  maxOff: number;
  maxTags: number;
  zoomed: number;
}

/**
 * Samples the first crate every animation frame, inside the page: until it was drawn on `n`
 * frames, or after n × 4 frames in all (it may have left the screen, landed and gone, or been
 * shot), or the hunt ended.
 */
async function sample(page: Page, n: number): Promise<Sampled> {
  return page.evaluate(
    (count) =>
      new Promise<Sampled>((resolve) => {
        const out: Sampled = {
          frames: 0,
          total: 0,
          tagged: 0,
          maxOff: 0,
          maxTags: 0,
          zoomed: 0,
        };
        const step = (): void => {
          const h = window.__TM__;
          out.total++;
          const spot = h?.crateSpots[0];
          const d = spot?.drawn ?? null;
          if (h && d) {
            out.frames++;
            if (h.zoom.z > 1.01) out.zoomed++;
            if (d.tag !== null) {
              out.tagged++;
              out.maxOff = Math.max(out.maxOff, Math.hypot(d.tag.x - d.spot.x, d.tag.y - d.spot.y));
            }
            out.maxTags = Math.max(out.maxTags, d.tags);
          }
          if (out.frames >= count || out.total >= count * 4 || h?.over === true) resolve(out);
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    n,
  );
}

/** Presses (held) or releases the sight at design px, from inside the page. */
async function pointer(page: Page, touch: boolean, kind: 'down' | 'up', x: number, y: number) {
  await page.evaluate(
    ([isTouch, k, px, py]) => {
      const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
      const h = window.__TM__;
      if (!canvas || !h) throw new Error('game not booted');
      const r = canvas.getBoundingClientRect();
      canvas.dispatchEvent(
        new PointerEvent(k === 'down' ? 'pointerdown' : 'pointerup', {
          clientX: r.left + (px / h.designWidth) * r.width,
          clientY: r.top + (py / h.designHeight) * r.height,
          pointerId: 4242,
          pointerType: isTouch ? 'touch' : 'mouse',
          isPrimary: true,
          button: 0,
          buttons: k === 'down' ? 1 : 0,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    [touch, kind, x, y] as const,
  );
}

test('a tagged crate shows one picture that stays on its canopy (pan, scope, shake)', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'portrait shows the rotate card');
  test.setTimeout(300_000);
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  await langloopSave(page);
  await boot(page, 'seed=7&huntSeconds=90&graphics=standard&crate=blitslaai');
  await startHunt(page, touch);
  await page.waitForFunction(() => (window.__TM__?.crateSpots.length ?? 0) > 0, null, {
    timeout: 120_000,
  });
  await waitTicks(page, 10);

  // 1. Panning (the arrow keys pan on every profile; the camera eases, so the layer moves). A
  // short pan each way, so the crate stays on screen.
  await page.keyboard.down('ArrowRight');
  const pan = await sample(page, 15);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.down('ArrowLeft');
  const back = await sample(page, 15);
  await page.keyboard.up('ArrowLeft');

  // 2. Scoped in: the Langloop's scope raised beside the crate (still in the air, or its box on
  // the ground), then fired well clear of it (gun kick + shake; the shot never opens it).
  const h = await page.evaluate(() => window.__TM__);
  const spot = h?.crateSpots[0];
  expect(spot, 'the crate is still there for the scope phase').toBeDefined();
  const w = h?.designWidth ?? 1920;
  const aimX = spot === undefined ? w / 2 : spot.x + (spot.x < w / 2 ? 260 : -260);
  const aimY = spot === undefined ? 300 : Math.max(120, spot.y - 60);
  await pointer(page, touch, 'down', aimX, aimY);
  const scoped = await sample(page, 50);
  await pointer(page, touch, 'up', aimX, aimY);
  const shake = await sample(page, 30);

  for (const s of [pan, back, scoped, shake]) {
    expect(s.maxTags).toBeLessThanOrEqual(1);
    expect(s.maxOff).toBeLessThan(1.5);
  }
  expect(pan.tagged + back.tagged).toBeGreaterThan(10);
  expect(scoped.frames).toBeGreaterThan(5);
  expect(scoped.zoomed).toBeGreaterThan(5);
  expect(errors).toEqual([]);
});
