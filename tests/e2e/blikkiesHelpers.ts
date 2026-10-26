// v1.8 (D-050): shared steps for the Blikkies specs (blikkies.spec.ts, art-preview-v18.spec.ts).
// Everything is read from the test hook (`cans`, `canLog`, `range`). Shots are pointer events
// dispatched on the canvas inside the page, a fresh pointerId each (as weavers.spec.ts and
// meerkats.spec.ts do): page.touchscreen taps after a held arrow key did not register on WebKit's
// iPhone profile in CI.
import type { Page } from '@playwright/test';
import { hook } from './helpers';

/** Wednesday's Karoo map has its fence on the near plane (content/biomes/karoo-autumn.json). */
export const NEAR_FENCE = 'biome=karoo-autumn&layout=wed&seed=42&huntSeconds=90';
/** Tuesday's: the mid plane. Friday's: the far plane. */
export const MID_FENCE = 'biome=karoo-autumn&layout=tue&seed=42&huntSeconds=90';
export const FAR_FENCE = 'biome=karoo-autumn&layout=fri&seed=42&huntSeconds=90';

/** Pans (arrow keys) until the fence's middle stands within 160 px of the screen centre, then
 *  waits for the camera to stop. */
export async function fenceInView(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (window.__TM__?.tick ?? 0) > 30 && (window.__TM__?.cans?.spots.length ?? 0) > 0,
    null,
    { timeout: 120_000 },
  );
  const mid = (): Promise<number> =>
    page.evaluate(() => {
      const s = window.__TM__?.cans?.spots ?? [];
      return s.reduce((t, c) => t + c.x, 0) / Math.max(1, s.length);
    });
  const h = await hook(page);
  const x = await mid();
  const centre = h.designWidth / 2;
  if (Math.abs(x - centre) >= 160) {
    const key = x > centre ? 'ArrowRight' : 'ArrowLeft';
    await page.keyboard.down(key);
    await page.waitForFunction(
      () => {
        const g = window.__TM__;
        const s = g?.cans?.spots ?? [];
        if (g === undefined || s.length === 0) return false;
        const m = s.reduce((t, c) => t + c.x, 0) / s.length;
        return Math.abs(m - g.designWidth / 2) < 160;
      },
      null,
      { timeout: 300_000 },
    );
    await page.keyboard.up(key);
  }
  await page.waitForFunction(
    () => {
      const g = window.__TM__;
      const w = window as unknown as { __camStill?: { x: number; t: number } };
      if (g === undefined) return false;
      if (w.__camStill?.x !== g.cameraX) {
        w.__camStill = { x: g.cameraX, t: g.tick };
        return false;
      }
      return g.tick - w.__camStill.t >= 10;
    },
    null,
    { timeout: 60_000 },
  );
}

export interface JuggleRun {
  /** The hunt's can events so far ("knock:5", "juggle:2:13", "landed", "weg:39"). */
  readonly log: string[];
  /** The longest chain this hunt (the sim's). */
  readonly bestChain: number;
  /** Stopped because the belt is empty (the caller reloads and goes on). */
  readonly empty: boolean;
}

/**
 * Shoots tin cans from inside the page until the hunt's longest chain reaches `wantChain` (0:
 * one knock-off is enough), the belt is empty, or `budgetMs` runs out. Each frame: a can in the
 * air is shot when it turns at the top of its arc (it hardly moves there); otherwise the resting
 * can nearest the screen centre is shot. Shots keep the gun's cooldown (`cooldownTicks`) and
 * wait for the sim to count each one. No flock stands at the fence's posts on these maps; a
 * pellet that a bird takes first is just another try.
 */
export async function juggle(
  page: Page,
  touch: boolean,
  wantChain: number,
  cooldownTicks: number,
  budgetMs = 120_000,
): Promise<JuggleRun> {
  return page.evaluate(
    ([want, isTouch, cd, budget]) =>
      new Promise<JuggleRun>((resolve) => {
        const w = window as unknown as {
          __canPointer?: number;
          __canLastY?: Map<number, number>;
        };
        w.__canLastY = new Map();
        const deadline = performance.now() + budget;
        let lastFireTick = -1e9;
        let waitShots = -1;
        const done = (empty: boolean): void => {
          const g = window.__TM__;
          resolve({ log: [...(g?.canLog ?? [])], bestChain: g?.cans?.bestChain ?? 0, empty });
        };
        const fire = (x: number, y: number): void => {
          const g = window.__TM__;
          const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
          if (g === undefined || canvas === null) return;
          w.__canPointer = (w.__canPointer ?? 5200) + 1;
          const r = canvas.getBoundingClientRect();
          const init: PointerEventInit = {
            clientX: r.left + (x / g.designWidth) * r.width,
            clientY: r.top + (y / g.designHeight) * r.height,
            pointerId: w.__canPointer,
            pointerType: isTouch ? 'touch' : 'mouse',
            isPrimary: true,
            button: 0,
            buttons: 1,
            bubbles: true,
            cancelable: true,
          };
          waitShots = g.shots;
          lastFireTick = g.tick;
          canvas.dispatchEvent(new PointerEvent('pointerdown', init));
          canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
        };
        const frame = (): void => {
          const g = window.__TM__;
          if (g === undefined || performance.now() > deadline || g.over) {
            done(false);
            return;
          }
          const best = g.cans?.bestChain ?? 0;
          if (
            (want === 0 && g.canLog.some((e) => e.startsWith('knock'))) ||
            (want > 0 && best >= want)
          ) {
            done(false);
            return;
          }
          if (g.shells === 0 && !g.reloading) {
            done(true);
            return;
          }
          const spots = g.cans?.spots ?? [];
          const lastY = w.__canLastY ?? new Map<number, number>();
          // The shot before still counting, the gun cooling or reloading: wait.
          const busy =
            (waitShots >= 0 && g.shots <= waitShots) || g.reloading || g.tick - lastFireTick < cd;
          const inView = (x: number): boolean => x > 80 && x < g.designWidth - 80;
          const flying = spots.filter((c) => c.state === 'air' && inView(c.x) && c.y > 40);
          let target: { x: number; y: number } | null = null;
          for (const c of flying) {
            const before = lastY.get(c.id);
            // Turning at the top: it was rising and now hardly moves or falls.
            if (before !== undefined && c.y >= before - 0.5) target = { x: c.x, y: c.y };
          }
          for (const c of spots) lastY.set(c.id, c.y);
          if (target === null && flying.length === 0) {
            const centre = g.designWidth / 2;
            const resting = spots
              .filter((c) => c.state === 'rest' && inView(c.x))
              .sort((a, b) => Math.abs(a.x - centre) - Math.abs(b.x - centre));
            const c = resting[0];
            if (c !== undefined) target = { x: c.x, y: c.y };
          }
          if (!busy && target !== null) fire(target.x, target.y);
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
    [wantChain, touch, cooldownTicks, budgetMs] as const,
  );
}
