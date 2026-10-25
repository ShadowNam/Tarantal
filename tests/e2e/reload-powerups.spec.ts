// v1.6b (D-043): the reload power-ups in a real hunt on every landscape profile. `?crate=<id>`
// fills every crate with the power-up and drops the first one in the first seconds. Blitslaai:
// its HUD chip (with its icon), a reload that takes about a third of the time, and the lightning
// glints on the belt while it runs. Oupa Laai: its chip and Oupa's hand on the belt; emptying the
// belt reloads it with no gesture, and Oupa says his line. Taps on moving things and bursts of
// shots are fired from inside the page (one round trip), like the karoo spec, because harness
// round trips cost seconds on software GL. Transient values are read inside the waitForFunction
// that sees them.
import { expect, test, type Page } from '@playwright/test';
import powerups from '../../content/powerups.json' with { type: 'json' };
import weapons from '../../content/weapons.json' with { type: 'json' };
import {
  SCREENSHOTS,
  boot,
  collectErrors,
  hook,
  isLandscape,
  isTouchProject,
  reload,
  startHunt,
  waitTicks,
} from './helpers';

const dubbelloop = weapons.weapons.find((w) => w.id === 'dubbelloop');
const blits = powerups.powerups.find((p) => p.id === 'blitslaai');
const MAG = dubbelloop?.magazine ?? 8;
/** Ticks of a normal Dubbelloop reload (60 Hz). */
const NORMAL = Math.round(((dubbelloop?.reloadMs ?? 900) * 60) / 1000);
const FAST = Math.round(NORMAL * (blits?.effect.reloadTimeMul ?? 1));

/** Taps the first crate from inside the page until the power-up is running. */
async function pickUp(page: Page, touch: boolean, id: string): Promise<void> {
  await page.waitForFunction(() => (window.__TM__?.crateSpots.length ?? 0) > 0, null, {
    timeout: 120_000,
  });
  for (let i = 0; i < 12; i++) {
    const got = await page.evaluate(
      ([isTouch, want]) => {
        const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
        const h = window.__TM__;
        if (!canvas || !h) throw new Error('game not booted');
        if (h.powerups.includes(want)) return true;
        const spot = h.crateSpots[0];
        if (spot === undefined || spot.x < 0 || spot.x > h.designWidth) return false;
        const r = canvas.getBoundingClientRect();
        const init: PointerEventInit = {
          clientX: r.left + (spot.x / h.designWidth) * r.width,
          clientY: r.top + (spot.y / h.designHeight) * r.height,
          pointerId: 900 + h.shots,
          pointerType: isTouch ? 'touch' : 'mouse',
          isPrimary: true,
          button: 0,
          buttons: 1,
          bubbles: true,
          cancelable: true,
        };
        canvas.dispatchEvent(new PointerEvent('pointerdown', init));
        canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
        return false;
      },
      [touch, id] as const,
    );
    if (got) return;
    await waitTicks(page, 4);
  }
  await page.waitForFunction((want) => window.__TM__?.powerups.includes(want) === true, id, {
    timeout: 30_000,
  });
}

/** Fires into the sky from inside the page, one shot every few ticks, until `n` shots went off
 *  (or the hunt ends). Returns the shots fired. */
async function fireShots(page: Page, touch: boolean, n: number): Promise<number> {
  return page.evaluate(
    ([isTouch, count]) =>
      new Promise<number>((resolve, reject) => {
        const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
        const h = window.__TM__;
        if (!canvas || !h) {
          reject(new Error('game not booted'));
          return;
        }
        const r = canvas.getBoundingClientRect();
        const start = h.shots;
        let lastTick = -99;
        let k = 0;
        const loop = (): void => {
          if (h.shots - start >= count || h.over) {
            resolve(h.shots - start);
            return;
          }
          if (h.tick - lastTick >= 12) {
            lastTick = h.tick;
            const init: PointerEventInit = {
              clientX: r.left + r.width * (0.35 + 0.05 * (k++ % 4)),
              clientY: r.top + r.height * 0.12,
              pointerId: 950 + k,
              pointerType: isTouch ? 'touch' : 'mouse',
              isPrimary: true,
              button: 0,
              buttons: 1,
              bubbles: true,
              cancelable: true,
            };
            canvas.dispatchEvent(new PointerEvent('pointerdown', init));
            canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
          }
          requestAnimationFrame(loop);
        };
        loop();
      }),
    [touch, n] as const,
  );
}

test('Blitslaai: its chip, a reload in about a third of the time, glints on the belt', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'landscape profiles only');
  test.setTimeout(300_000);
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  await boot(page, 'seed=7&huntSeconds=90&crate=blitslaai');
  await startHunt(page, touch);
  await pickUp(page, touch, 'blitslaai');
  const h0 = await hook(page);
  expect(h0.weapon).toBe('dubbelloop');
  expect(h0.reloadFx.chipIcons).toContain('ui/pu_blitslaai');

  expect(await fireShots(page, touch, 2)).toBe(2);
  await page.waitForFunction(() => window.__TM__?.reloading === false, null, { timeout: 60_000 });
  await reload(page, touch);
  // Watch the reload from inside the page: the ticks it takes and the glints while it runs.
  const seen = await page.waitForFunction(
    () => {
      const h = window.__TM__;
      if (!h) return null;
      const w = window as unknown as {
        __rp?: { start: number | null; bolts: number; end: number | null };
      };
      const s = (w.__rp ??= { start: null, bolts: 0, end: null });
      if (h.reloading && s.start === null) s.start = h.tick;
      if (h.reloading) s.bolts = Math.max(s.bolts, h.reloadFx.bolts);
      if (s.start !== null && !h.reloading && s.end === null) s.end = h.tick;
      return s.end !== null
        ? { ticks: s.end - (s.start ?? 0), bolts: s.bolts, shells: h.shells }
        : null;
    },
    null,
    { timeout: 60_000, polling: 'raf' },
  );
  const r = (await seen.jsonValue()) as { ticks: number; bolts: number; shells: number };
  expect(r.shells).toBe(MAG);
  // Frames under software GL are long: allow a few ticks either side of the sim's count.
  expect(r.ticks).toBeLessThanOrEqual(FAST + 8);
  expect(r.ticks).toBeLessThan(NORMAL - 10);
  expect(r.bolts).toBeGreaterThan(0);
  await page.screenshot({ path: `${SCREENSHOTS}/reload-blitslaai-${info.project.name}.png` });
  expect(errors).toEqual([]);
});

test('Oupa Laai: its chip and hand; an empty belt reloads by itself and Oupa says so', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'landscape profiles only');
  test.setTimeout(300_000);
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  await boot(page, 'seed=7&huntSeconds=90&crate=oupa_laai');
  await startHunt(page, touch);
  await pickUp(page, touch, 'oupa_laai');
  const h0 = await hook(page);
  expect(h0.reloadFx.chipIcons).toContain('ui/pu_oupa_laai');
  expect(h0.reloadFx.oupaHand).toBe(true);
  await page.screenshot({ path: `${SCREENSHOTS}/reload-oupa-laai-${info.project.name}.png` });

  // Empty the belt (no reload gesture anywhere in this test).
  const left = (await hook(page)).shells;
  expect(await fireShots(page, touch, left)).toBe(left);
  await page.waitForFunction(
    (mag) => {
      const h = window.__TM__;
      return h !== undefined && h.reloadFx.autoReloads > 0 && h.shells === mag && !h.reloading;
    },
    MAG,
    { timeout: 90_000 },
  );
  // Oupa's line: said once the bark gap allows (a few seconds at most).
  await page.waitForFunction(() => window.__TM__?.barks.includes('bark.oupa_laai') === true, null, {
    timeout: 90_000,
  });
  expect(errors).toEqual([]);
});
