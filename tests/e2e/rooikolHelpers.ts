// 1.9.2 (D-055): shared Rooikol e2e helpers (rooikol.spec.ts, art-preview-playtest-fixes.spec.ts).
import type { Page } from '@playwright/test';

/** 2026-10-19, a Monday: the save's bonus unlocks are for this UTC day. */
const DAY = 20745;

/** A save with the gun and its scope fitted. */
export async function rifleSave(page: Page, gun: string, sight: string): Promise<void> {
  await page.addInitScript(
    ([g, s, d]) => {
      localStorage.setItem(
        'tm.e2e.save.v1',
        JSON.stringify({
          v: 1,
          settings: { quality: 'medium' },
          ftue: { done: true, skipped: false, step: '' },
          loadout: { weapon: g, sights: { [g]: s } },
          unlocks: { weapons: ['twee_twee', 'langloop'], sights: [s] },
          bestRank: 'bosveldjagter',
          bonusMaps: { day: d, unlocked: [], bests: {} },
        }),
      );
    },
    [gun, sight, DAY] as const,
  );
}

/**
 * Picks up the first crate through the sight. A held sight aims finely (a move is divided by the
 * zoom from the press point), so the helper never moves: it waits until the crate has landed,
 * presses once on the box (below it by the offset crosshair on touch: the finger sits under the
 * aim point), holds until the sight is up, and releases in place. Again until the power-up runs.
 */
export async function pickUpScoped(page: Page, touch: boolean, id: string): Promise<void> {
  await page.waitForFunction(() => (window.__TM__?.crateSpots.length ?? 0) > 0, null, {
    timeout: 120_000,
  });
  await page.evaluate(
    ([isTouch, want]) =>
      new Promise<void>((resolve, reject) => {
        const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
        const h = window.__TM__;
        if (!canvas || !h) {
          reject(new Error('game not booted'));
          return;
        }
        let n = 0;
        let held: { x: number; y: number; since: number } | null = null;
        let lastY = Number.NaN;
        let still = 0;
        let fired = 0;
        const ev = (type: string, x: number, y: number): void => {
          const r = canvas.getBoundingClientRect();
          canvas.dispatchEvent(
            new PointerEvent(type, {
              clientX: r.left + (x / h.designWidth) * r.width,
              clientY: r.top + (y / h.designHeight) * r.height,
              pointerId: 800 + n,
              pointerType: isTouch ? 'touch' : 'mouse',
              isPrimary: true,
              button: 0,
              buttons: type === 'pointerup' ? 0 : 1,
              bubbles: true,
              cancelable: true,
            }),
          );
        };
        const fail = (why: string): void => {
          const spot = h.crateSpots[0];
          reject(
            new Error(
              `${why}: raise ${h.zoom.raise}, crate ${spot === undefined ? 'none' : `${Math.round(spot.x)},${Math.round(spot.y)}`}, ` +
                `reticle ${Math.round(h.zoom.reticleX)},${Math.round(h.zoom.reticleY)}, offset ${h.aimOffsetPx}, ` +
                `presses ${n}, shots ${fired}, shells ${h.shells}, powerups [${h.powerups.join(',')}]`,
            ),
          );
        };
        const startShots = h.shots;
        const loop = (): void => {
          fired = h.shots - startShots;
          if (h.powerups.includes(want)) {
            resolve();
            return;
          }
          if (h.over) {
            fail('the hunt ended first');
            return;
          }
          const spot = h.crateSpots[0];
          if (held !== null) {
            if (h.zoom.raise >= 1 && h.tick - held.since >= 2) {
              ev('pointerup', held.x, held.y);
              held = null;
              n++;
            }
          } else if (spot === undefined) {
            fail('the crate is gone');
            return;
          } else {
            // Landed: its y holds still for a few frames.
            still = spot.y === lastY ? still + 1 : 0;
            lastY = spot.y;
            const ready =
              still >= 4 &&
              h.zoom.raise === 0 &&
              h.cooldownTicks === 0 &&
              !h.reloading &&
              h.shells > 0 &&
              spot.x > 0 &&
              spot.x < h.designWidth;
            if (ready) {
              const off = isTouch ? h.aimOffsetPx : 0;
              const y = Math.min(h.designHeight - 1, spot.y + off);
              ev('pointerdown', spot.x, y);
              held = { x: spot.x, y, since: h.tick };
            }
          }
          requestAnimationFrame(loop);
        };
        loop();
      }),
    [touch, id] as const,
  );
}
