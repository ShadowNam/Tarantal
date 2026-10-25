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

interface ReloadWatch {
  /** Ticks from the reload starting to the belt full again. */
  readonly ticks: number;
  /** Most glints seen on the belt while it reloaded. */
  readonly bolts: number;
  /** Blitslaai was still running when the reload started. */
  readonly fastAtStart: boolean;
  readonly shells: number;
}

/**
 * All inside the page (no round trips while the 12 s power-up runs): fires two shots into the sky,
 * waits out the cooldown, taps the belt (a reload for mouse and touch alike), then watches the
 * reload frame by frame until the belt is full.
 */
async function shootAndReload(page: Page, touch: boolean): Promise<ReloadWatch> {
  return page.evaluate(
    (isTouch) =>
      new Promise<ReloadWatch>((resolve, reject) => {
        const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
        const h = window.__TM__;
        const belt = h?.rects['belt'];
        if (!canvas || !h || !belt) {
          reject(new Error('game or belt not ready'));
          return;
        }
        const r = canvas.getBoundingClientRect();
        let id = 980;
        const tap = (x: number, y: number): void => {
          const init: PointerEventInit = {
            clientX: r.left + (x / h.designWidth) * r.width,
            clientY: r.top + (y / h.designHeight) * r.height,
            pointerId: id++,
            pointerType: isTouch ? 'touch' : 'mouse',
            isPrimary: true,
            button: 0,
            buttons: 1,
            bubbles: true,
            cancelable: true,
          };
          canvas.dispatchEvent(new PointerEvent('pointerdown', init));
          canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
        };
        const startShots = h.shots;
        let phase: 'shoot' | 'settle' | 'reload' | 'watch' = 'shoot';
        let lastTick = -99;
        let start: number | null = null;
        let bolts = 0;
        let fastAtStart = false;
        const loop = (): void => {
          if (h.over) {
            reject(new Error('the hunt ended first'));
            return;
          }
          if (phase === 'shoot') {
            if (h.shots - startShots >= 2) {
              phase = 'settle';
              lastTick = h.tick;
            } else if (h.tick - lastTick >= 12) {
              lastTick = h.tick;
              tap(h.designWidth * (0.4 + 0.05 * (h.shots - startShots)), h.designHeight * 0.12);
            }
          } else if (phase === 'settle') {
            if (!h.reloading && h.tick - lastTick >= 12) {
              phase = 'reload';
              lastTick = h.tick;
              tap(belt.x + belt.w / 2, belt.y + belt.h / 2);
            }
          } else {
            if (h.reloading && start === null) {
              start = h.tick;
              fastAtStart = h.powerups.includes('blitslaai');
              phase = 'watch';
            }
            if (h.reloading) bolts = Math.max(bolts, h.reloadFx.bolts);
            if (phase === 'watch' && !h.reloading) {
              resolve({ ticks: h.tick - (start ?? h.tick), bolts, fastAtStart, shells: h.shells });
              return;
            }
            // The tap didn't take (a frame lost it): tap again.
            if (phase === 'reload' && h.tick - lastTick >= 30) {
              lastTick = h.tick;
              tap(belt.x + belt.w / 2, belt.y + belt.h / 2);
            }
          }
          requestAnimationFrame(loop);
        };
        loop();
      }),
    touch,
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
  const r = await shootAndReload(page, touch);
  const h = await hook(page);
  expect(h.weapon).toBe('dubbelloop');
  expect(r.fastAtStart).toBe(true);
  expect(r.shells).toBe(MAG);
  // The sim counts exactly; a frame can see the start or end a few ticks late on software GL.
  expect(r.ticks).toBeLessThanOrEqual(FAST + 8);
  expect(r.ticks).toBeLessThan(NORMAL - 10);
  expect(r.bolts).toBeGreaterThan(0);
  if (h.powerups.includes('blitslaai')) expect(h.reloadFx.chipIcons).toContain('ui/pu_blitslaai');
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
  // Empty the belt at once (no reload gesture anywhere in this test); the chip, the hand and the
  // auto reload are read in the same frame-by-frame watch, while the 12 s still run.
  // (The tap that opened the crate was a shot too: fire what is left.)
  const left = (await hook(page)).shells;
  expect(await fireShots(page, touch, left)).toBe(left);
  const seen = await page.waitForFunction(
    (mag) => {
      const h = window.__TM__;
      if (!h) return null;
      const w = window as unknown as { __op?: { chip: boolean; hand: boolean } };
      const s = (w.__op ??= { chip: false, hand: false });
      if (h.reloadFx.chipIcons.includes('ui/pu_oupa_laai')) s.chip = true;
      if (h.reloadFx.oupaHand) s.hand = true;
      return h.reloadFx.autoReloads > 0 && h.shells === mag && !h.reloading ? { ...s } : null;
    },
    MAG,
    { timeout: 90_000, polling: 'raf' },
  );
  const s = (await seen.jsonValue()) as { chip: boolean; hand: boolean };
  expect(s.chip).toBe(true);
  expect(s.hand).toBe(true);
  await page.screenshot({ path: `${SCREENSHOTS}/reload-oupa-laai-${info.project.name}.png` });
  // Oupa's line: said once the bark gap allows (a few seconds at most).
  await page.waitForFunction(() => window.__TM__?.barks.includes('bark.oupa_laai') === true, null, {
    timeout: 90_000,
  });
  expect(errors).toEqual([]);
});
