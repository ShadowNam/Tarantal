// v1.20 (D-085): shared e2e helpers for the Jag, Brakkie! card (brakkie-jag.spec.ts, perf.spec.ts,
// art-preview-brakkie-jag.spec.ts).
import type { Page } from '@playwright/test';
import { waitTicks } from './helpers';

/** The test URL: the Karoo's Monday, Brakkie out at once (?brakkie=1), the card in the first
 *  crate (?crate=brakkie_jag) and reaching every foraging guineafowl (?brakkiePreview=jag). */
export const JAG_BASE =
  'biome=karoo-autumn&layout=mon&seed=42&graphics=standard&baboons=0&reenbui=0&omen=0&faunaIdle=0&brakkie=1&crate=brakkie_jag';

/** His hook values these specs read. */
export interface JagDog {
  present: boolean;
  phase: string;
  pose: string;
  plane: string;
  frame: string | null;
  visible: boolean;
  x: number;
  y: number;
  groundY: number;
  carrying: boolean;
  bird: boolean;
  sheet: string | null;
  fetches: number;
  points: number;
  jag: { catches: number; maxCatches: number } | null;
  catches: number;
  catchPoints: number;
  lift: number;
  queuedTick: number | null;
  fetchTick: number | null;
}

export const dogOf = (page: Page): Promise<JagDog | null> =>
  page.evaluate(
    () => (window as unknown as { __TM__?: { brakkie?: JagDog | null } }).__TM__?.brakkie ?? null,
  );

/**
 * Shoots the first crate (in-page taps with a fresh pointerId each; a shotgun, no sight) until the
 * power-up `id` runs: a tap only while the crate is on screen, ~20 ticks between tries (bounded).
 */
export async function pickUpCrate(page: Page, touch: boolean, id: string): Promise<void> {
  await page.waitForFunction(() => (window.__TM__?.crateSpots.length ?? 0) > 0, null, {
    timeout: 120_000,
  });
  for (let i = 0; i < 16; i++) {
    const got = await page.evaluate(
      ([isTouch, want, n]) => {
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
          pointerId: 1900 + n,
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
      [touch, id, i] as const,
    );
    if (got) return;
    await waitTicks(page, 20);
  }
  await page.waitForFunction((want) => window.__TM__?.powerups.includes(want) === true, id, {
    timeout: 30_000,
  });
}
