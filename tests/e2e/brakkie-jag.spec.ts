// v1.20 (D-085): Brakkie fetches sooner, and the "Jag, Brakkie!" card, on every landscape profile
// (desktop, Pixel 7, iPhone 14).
// 1. Fetch sooner: ?brakkiePreview=bag queues a bird beside him 3 s in (a bag without a shot,
//    through the real delay and clear rules, with ?birds=0 so no flock stands over his strip:
//    bagging one by shooting a flock was bound to the
//    runner's timing, brakkie.spec.ts); the test keeps shooting at the empty sky and he runs out
//    fetch.delaySeconds after the bag all the same — checked on the sim's ticks, never the wall
//    clock (lesson 3).
// 2. The card: ?crate=brakkie_jag puts it in the first crate; shot, its chip shows the seconds and
//    "0/3"; Oupa says "Jag, Brakkie, jag!"; he catches at least one foraging guineafowl, and the
//    score rises by exactly what his catches and his Bring bonuses paid (no shots after the
//    crate). ?brakkiePreview=jag lets the card reach every foraging guineafowl on the panorama.
// Shots are in-page pointer events with a fresh pointerId each (lesson: weavers/meerkats specs).
import { expect, test } from '@playwright/test';
import brakkie from '../../content/brakkie.json' with { type: 'json' };
import { boot, collectErrors, hook, isLandscape, isTouchProject, startHunt } from './helpers';
import { JAG_BASE, pickUpCrate } from './jagHelpers';

test.use({ serviceWorkers: 'block' });
test.beforeEach(({ browserName }, info) => {
  expect(browserName).toBeDefined();
  test.skip(!isLandscape(info), 'landscape profiles only');
});

test('fetch sooner: he runs out ~1.5 s after a bag while the shooting goes on', async ({
  page,
}, info) => {
  test.setTimeout(420_000);
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  await boot(
    page,
    'biome=karoo-autumn&layout=none&seed=42&huntSeconds=120&graphics=standard&baboons=0&reenbui=0&omen=0&faunaIdle=0&birds=0&brakkie=1&brakkiePreview=bag',
  );
  await startHunt(page, touch);
  // All in one page loop (bounded by frames and by its goal): once the bird is queued, a shot at
  // the empty sky every ~25 ticks (two shells, then the gun is empty — enough), until he runs out.
  const r = await page.evaluate(
    (isTouch) =>
      new Promise<{ queued: number; fetch: number; shotsAfter: number }>((resolve, reject) => {
        const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
        const h = window.__TM__;
        if (!canvas || !h) {
          reject(new Error('game not booted'));
          return;
        }
        let frames = 0;
        let lastShotTick = -999;
        let n = 0;
        let shots0: number | null = null;
        const fire = (): void => {
          const rect = canvas.getBoundingClientRect();
          const init: PointerEventInit = {
            clientX:
              rect.left +
              ((h.designWidth / 2 + 120 * (n % 2 ? 1 : -1)) / h.designWidth) * rect.width,
            clientY: rect.top + (200 / h.designHeight) * rect.height,
            pointerId: 2400 + n,
            pointerType: isTouch ? 'touch' : 'mouse',
            isPrimary: true,
            button: 0,
            buttons: 1,
            bubbles: true,
            cancelable: true,
          };
          n++;
          canvas.dispatchEvent(new PointerEvent('pointerdown', init));
          canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
        };
        const loop = (): void => {
          frames++;
          const d = h.brakkie;
          if (frames > 60 * 120) {
            reject(new Error(`no fetch: ${JSON.stringify(d)}`));
            return;
          }
          if (d?.queuedTick != null) {
            shots0 ??= h.shots;
            if (d.fetchTick != null && d.fetchTick >= d.queuedTick) {
              resolve({ queued: d.queuedTick, fetch: d.fetchTick, shotsAfter: h.shots - shots0 });
              return;
            }
            if (h.tick - lastShotTick >= 25) {
              lastShotTick = h.tick;
              fire();
            }
          }
          requestAnimationFrame(loop);
        };
        loop();
      }),
    touch,
  );
  const delay = Math.round(brakkie.fetch.delaySeconds * 60);
  const wait = r.fetch - r.queued;
  // Not before the bird's delay; and the shooting (a shot, a missed shot's head tilt) never holds
  // him back the way v1.17's 6-s lull did: at most a reaction and a clear check later.
  expect(wait).toBeGreaterThanOrEqual(delay);
  expect(wait).toBeLessThanOrEqual(delay + Math.round((brakkie.react.seconds + 0.5) * 60));
  expect(r.shotsAfter, 'shots fired while he waited').toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('the Jag card: from a crate, he catches a foraging guineafowl; the score rises by his catch + Bring', async ({
  page,
}, info) => {
  test.setTimeout(480_000);
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  await boot(page, `${JAG_BASE}&huntSeconds=180&brakkiePreview=jag`);
  await startHunt(page, touch);
  await pickUpCrate(page, touch, 'brakkie_jag');
  // The chip (its seconds and "0/3"), Oupa's line and the score, read where they are seen.
  const start = (await (
    await page.waitForFunction(
      () => {
        const h = window.__TM__;
        const chip = h?.chips?.find((c) => c.id === 'brakkie_jag');
        const d = h?.brakkie;
        if (h === undefined || chip === undefined || d == null) return false;
        return {
          time: chip.time,
          icon: chip.icon,
          said: h.namibLog.includes('bark:guide.brakkie.jag_start'),
          score: h.score,
          points: d.points,
          catchPoints: d.catchPoints,
          shots: h.shots,
        };
      },
      null,
      { timeout: 60_000, polling: 'raf' },
    )
  ).jsonValue()) as {
    time: string;
    icon: string | null;
    said: boolean;
    score: number;
    points: number;
    catchPoints: number;
    shots: number;
  };
  expect(start.time).toContain('0/3');
  expect(start.said, 'Oupa: "Jag, Brakkie, jag!"').toBe(true);
  // A catch, delivered (Bring!), with Oupa's proud line; bounded by sim ticks (the clock holds
  // while he carries: the card lasts longer than 10 s of real time).
  const done = (await (
    await page.waitForFunction(
      () => {
        const h = window.__TM__;
        const d = h?.brakkie;
        if (h === undefined || d == null) return false;
        if (h.over) return { over: true, catches: d.catches };
        if (d.catches < 1 || d.carrying || d.phase !== 'away') return false;
        return {
          over: false,
          catches: d.catches,
          score: h.score,
          points: d.points,
          catchPoints: d.catchPoints,
          proud: h.namibLog.includes('bark:guide.brakkie.caught'),
          shots: h.shots,
        };
      },
      null,
      { timeout: 360_000, polling: 'raf' },
    )
  ).jsonValue()) as {
    over: boolean;
    catches: number;
    score: number;
    points: number;
    catchPoints: number;
    proud: boolean;
    shots: number;
  };
  expect(done.over, 'a catch before the hunt ended').toBe(false);
  expect(done.catches).toBeGreaterThanOrEqual(1);
  expect(done.catches).toBeLessThanOrEqual(3);
  expect(done.proud).toBe(true);
  expect(done.shots, 'no shots after the crate').toBe(start.shots);
  const caught = done.catchPoints - start.catchPoints;
  const bring = done.points - start.points;
  expect(caught, 'his catches scored').toBeGreaterThan(0);
  expect(bring, 'Bring! for the delivery').toBeGreaterThanOrEqual(brakkie.bring.points);
  expect(done.score - start.score).toBe(caught + bring);
  const h = await hook(page);
  expect(h.brakkie?.hits ?? 0).toBe(0);
  expect(errors).toEqual([]);
});
