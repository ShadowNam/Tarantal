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
 * one knock-off is enough), the belt is empty, or `budgetMs` runs out. Every shot is
 * frame-perfect whatever the frame rate: when the gun is ready the sim is held at the current
 * tick (`__TM_HOLD_AT__`), the can is read from the hook once the frame shows that tick, the
 * pointer goes down on it, and the hold is let go — the queued shot then resolves on the next
 * tick, before the can moves (the sim runs commands before the cans fly). A can in the air comes
 * first; else the resting can nearest the screen centre. Shots keep the gun's cooldown
 * (`cooldownTicks`) and wait for the sim to count each one. A pellet a bird takes first is just
 * another try.
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
          __TM_HOLD_AT__?: (tick: number) => void;
        };
        const hold = (t: number): void => {
          w.__TM_HOLD_AT__?.(t);
        };
        const deadline = performance.now() + budget;
        let lastFireTick = -1e9;
        let waitShots = -1;
        let phase: 'idle' | 'holding' | 'wait' = 'idle';
        let heldAt = -1;
        let heldFrames = 0;
        const done = (empty: boolean): void => {
          hold(1e12);
          const g = window.__TM__;
          resolve({ log: [...(g?.canLog ?? [])], bestChain: g?.cans?.bestChain ?? 0, empty });
        };
        const pick = (): { x: number; y: number } | null => {
          const g = window.__TM__;
          if (g === undefined) return null;
          const spots = g.cans?.spots ?? [];
          const inView = (x: number, y: number): boolean =>
            x > 60 && x < g.designWidth - 60 && y > 30;
          const air = spots.find(
            (c) => (c.state === 'air' || c.state === 'bounced') && inView(c.x, c.y),
          );
          if (air !== undefined) return { x: air.x, y: air.y };
          // Another can is still in the air (out of view): let it come down first.
          if (spots.some((c) => c.state === 'air' || c.state === 'bounced')) return null;
          const centre = g.designWidth / 2;
          const rest = spots
            .filter((c) => c.state === 'rest' && inView(c.x, c.y))
            .sort((a, b) => Math.abs(a.x - centre) - Math.abs(b.x - centre))[0];
          return rest === undefined ? null : { x: rest.x, y: rest.y };
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
            phase !== 'holding' &&
            ((want === 0 && g.canLog.some((e) => e.startsWith('knock'))) ||
              (want > 0 && best >= want))
          ) {
            done(false);
            return;
          }
          if (phase === 'wait') {
            if (g.shots > waitShots) phase = 'idle';
          } else if (phase === 'holding') {
            // Two frames on the held tick: the hook shows it.
            if (g.tick === heldAt && ++heldFrames >= 2) {
              const t = pick();
              if (t !== null) {
                fire(t.x, t.y);
                phase = 'wait';
              } else phase = 'idle';
              hold(1e12);
            } else if (g.tick !== heldAt) heldAt = g.tick;
          } else {
            if (g.shells === 0 && !g.reloading) {
              done(true);
              return;
            }
            const ready = !g.reloading && g.shells > 0 && g.tick - lastFireTick >= cd;
            if (ready && pick() !== null) {
              heldAt = g.tick;
              heldFrames = 0;
              hold(g.tick);
              phase = 'holding';
            }
          }
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
    [wantChain, touch, cooldownTicks, budgetMs] as const,
  );
}
