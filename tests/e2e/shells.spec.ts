// v1.19 (D-084): the special shotgun shells in a real hunt on every landscape profile. `?crate=<id>`
// fills every crate with the shell and drops the first one in the first seconds. Its HUD chip
// shows the shell icon and the shells left; each shot fires the shell (Dragon's Breath: the flame
// cone, ≤ 3 big ones a second, small ones with "reduce flashes"; the Slug: its boom) and the chip
// counts down until the shell is gone. Shots go off from inside the page (one round trip, every
// loop bounded by frames as well as by its goal); transient values are read where they are seen.
import { expect, test, type Page } from '@playwright/test';
import powerups from '../../content/powerups.json' with { type: 'json' };
import {
  SCREENSHOTS,
  boot,
  collectErrors,
  isLandscape,
  isTouchProject,
  startHunt,
  waitTicks,
} from './helpers';

const shellsOf = (id: string): number =>
  powerups.powerups.find((p) => p.id === id)?.durationShells ?? 0;

/** Taps the first crate from inside the page until the shell is loaded (bounded tries). */
async function pickUp(page: Page, touch: boolean, id: string): Promise<void> {
  await page.waitForFunction(() => (window.__TM__?.crateSpots.length ?? 0) > 0, null, {
    timeout: 120_000,
  });
  for (let i = 0; i < 16; i++) {
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
    await waitTicks(page, 20);
  }
  await page.waitForFunction((want) => window.__TM__?.powerups.includes(want) === true, id, {
    timeout: 30_000,
  });
}

interface Fired {
  shots: number;
  /** The chip's countdown texts seen, in order ("×4", "×3", …). */
  counts: string[];
  /** The chip's icon while it showed. */
  icon: string | null;
  cones: number;
  big: number;
  small: number;
  /** Most big cones in any one second (performance.now() of each). */
  bigPerSecond: number;
  slugs: number;
  /** The shell power-up was gone after the last shot. */
  ended: boolean;
}

/**
 * All inside the page: fires `n` shots at the low sky (a few ticks apart, reloading with a belt
 * tap when the gun is empty), watching the shell's chip and the effects' counters every frame.
 * Bounded by the goal and by frames.
 */
async function fireShells(
  page: Page,
  touch: boolean,
  id: string,
  n: number,
  /** Before this shot (0-based), spend the flash budget (__TM_SPEND_FLASHES__): it must be small. */
  spendBefore = -1,
): Promise<Fired> {
  return page.evaluate(
    ([isTouch, want, count, spendAt]) =>
      new Promise<Fired>((resolve, reject) => {
        const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
        const h = window.__TM__;
        const belt = h?.rects['belt'];
        if (!canvas || !h || !belt) {
          reject(new Error('game or belt not ready'));
          return;
        }
        const r = canvas.getBoundingClientRect();
        let pid = 1200;
        const tap = (x: number, y: number): void => {
          const init: PointerEventInit = {
            clientX: r.left + (x / h.designWidth) * r.width,
            clientY: r.top + (y / h.designHeight) * r.height,
            pointerId: pid++,
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
        const start = h.shots;
        const out: Fired = {
          shots: 0,
          counts: [],
          icon: null,
          cones: 0,
          big: 0,
          small: 0,
          bigPerSecond: 0,
          slugs: 0,
          ended: false,
        };
        let lastTick = -99;
        let frames = 0;
        const loop = (): void => {
          frames++;
          const chip = h.chips?.find((c) => c.id === want);
          if (chip !== undefined) {
            out.icon = chip.icon;
            if (out.counts.at(-1) !== chip.time) out.counts.push(chip.time);
          }
          out.shots = h.shots - start;
          const fx = h.shellFx;
          if (fx !== undefined) {
            out.cones = fx.cones;
            out.big = fx.big;
            out.small = fx.small;
            out.slugs = fx.slugs;
            for (const t of fx.bigAt)
              out.bigPerSecond = Math.max(
                out.bigPerSecond,
                fx.bigAt.filter((u) => u >= t && u < t + 1000).length,
              );
          }
          if ((out.shots >= count && h.tick - lastTick >= 20) || h.over || frames > 6000) {
            out.ended = !h.powerups.includes(want);
            resolve(out);
            return;
          }
          // The effects' chunk loads with the pickup: shoot once it is in.
          if (out.shots < count && h.shellFx !== undefined && h.tick - lastTick >= 8) {
            lastTick = h.tick;
            if (h.shells === 0 && !h.reloading) tap(belt.x + belt.w / 2, belt.y + belt.h / 2);
            else if (!h.reloading) {
              if (out.shots === spendAt)
                (window as { __TM_SPEND_FLASHES__?: () => void }).__TM_SPEND_FLASHES__?.();
              tap(h.designWidth * (0.38 + 0.06 * (out.shots % 4)), h.designHeight * 0.3);
            }
          }
          requestAnimationFrame(loop);
        };
        loop();
      }),
    [touch, id, n, spendBefore] as const,
  );
}

test("Dragon's Breath: its chip counts the shells, each shot throws the flame cone", async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'landscape profiles only');
  test.setTimeout(300_000);
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  await boot(page, 'seed=7&huntSeconds=120&graphics=standard&crate=dragon_breath&baboons=0');
  await startHunt(page, touch);
  await pickUp(page, touch, 'dragon_breath');
  const n = shellsOf('dragon_breath');
  // The last shell follows three large flashes in the same second (spent by the test hook): the
  // limiter must draw it small, however fast or slow the machine is.
  const r = await fireShells(page, touch, 'dragon_breath', n, n - 1);
  expect(r.shots).toBe(n);
  expect(r.small, 'the cone after three large flashes in a second is small').toBeGreaterThanOrEqual(
    1,
  );
  expect(r.icon).toBe('ui/pu_dragon_breath');
  expect(r.counts[0]).toBe(`×${n}`);
  expect(r.counts.length).toBeGreaterThan(1);
  expect(r.cones).toBe(n);
  // The flash rule: never more than 3 big cones in a second; the rest are small.
  expect(r.bigPerSecond).toBeLessThanOrEqual(3);
  expect(r.big + r.small).toBe(n);
  expect(r.big).toBeGreaterThan(0);
  expect(r.ended).toBe(true);
  await page.screenshot({ path: `${SCREENSHOTS}/shells-dragon-${info.project.name}.png` });
  expect(errors).toEqual([]);
});

test('Dragon\'s Breath with "reduce flashes": only small cones', async ({ page }, info) => {
  test.skip(!isLandscape(info), 'landscape profiles only');
  test.setTimeout(300_000);
  const touch = isTouchProject(info);
  await page.addInitScript(() => {
    localStorage.setItem(
      'tm.e2e.save.v1',
      JSON.stringify({
        v: 1,
        ftue: { done: true, skipped: false, step: '' },
        settings: { reduceFlashes: true },
      }),
    );
  });
  await boot(page, 'seed=7&huntSeconds=120&graphics=standard&crate=dragon_breath&baboons=0');
  await startHunt(page, touch);
  await pickUp(page, touch, 'dragon_breath');
  const r = await fireShells(page, touch, 'dragon_breath', 2);
  expect(r.cones).toBe(2);
  expect(r.big).toBe(0);
  expect(r.small).toBe(2);
});

test('the Slug: its chip counts the shells, each shot booms, then it is gone', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'landscape profiles only');
  test.setTimeout(300_000);
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  await boot(page, 'seed=7&huntSeconds=120&graphics=standard&crate=slug&baboons=0');
  await startHunt(page, touch);
  await pickUp(page, touch, 'slug');
  const n = shellsOf('slug');
  const r = await fireShells(page, touch, 'slug', n);
  expect(r.shots).toBe(n);
  expect(r.icon).toBe('ui/pu_slug');
  expect(r.counts[0]).toBe(`×${n}`);
  expect(r.slugs).toBe(n);
  expect(r.cones).toBe(0);
  expect(r.ended).toBe(true);
  expect(errors).toEqual([]);
});
