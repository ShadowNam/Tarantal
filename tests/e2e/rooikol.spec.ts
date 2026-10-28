// 1.9.2 (D-055) Rooikol, the red dot sight, in a seeded hunt on every landscape profile, with the
// scoped .22 and the Langloop. `?crate=rooikol` fills the first crate with it (a rifle is in
// hand, so the crate may hold it). Picked up through the sight; then two quick shots: both go
// off with the shortened time between them, the zoom stays at 1 while the sight is up, and the
// picture is the red dot. Everything that moves is read inside the page (one round trip).
import { expect, test, type Page } from '@playwright/test';
import powerups from '../../content/powerups.json' with { type: 'json' };
import weapons from '../../content/weapons.json' with { type: 'json' };
import { boot, collectErrors, isLandscape, isTouchProject, startHunt } from './helpers';

test.use({ serviceWorkers: 'block' });

const rooikol = powerups.powerups.find((p) => p.id === 'rooikol');
const MUL = rooikol?.effect.fireCooldownMul ?? 1;
/** 2026-10-19, a Monday: the save's bonus unlocks are for this UTC day. */
const DAY = 20745;

const GUNS = [
  { gun: 'twee_twee', sight: 'scope_small' },
  { gun: 'langloop', sight: 'scope_var' },
] as const;

function cooldownTicks(id: string): number {
  const w = weapons.weapons.find((x) => x.id === id);
  const ms = w !== undefined && 'fireCooldownMs' in w ? w.fireCooldownMs : 0;
  return Math.round((ms * 60) / 1000);
}

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
 * Picks up the first crate through the sight: presses on it, follows it each frame (the sight
 * comes up while it falls), releases once the sight is up; again until the power-up runs.
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
        let held = false;
        let since = 0;
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
        const loop = (): void => {
          if (h.powerups.includes(want)) {
            resolve();
            return;
          }
          if (h.over) {
            reject(new Error('the hunt ended first'));
            return;
          }
          const spot = h.crateSpots[0];
          if (spot === undefined || spot.x < 0 || spot.x > h.designWidth) {
            requestAnimationFrame(loop);
            return;
          }
          if (!held) {
            if (h.zoom.raise === 0) {
              ev('pointerdown', spot.x, spot.y);
              held = true;
              since = h.tick;
            }
          } else if (h.zoom.raise >= 1 && h.tick - since >= 2) {
            // The sight is up: the reticle shows where the crate is in the zoomed view.
            ev('pointerup', h.zoom.reticleX, h.zoom.reticleY);
            held = false;
            n++;
          } else {
            // While it comes up the crate keeps falling: the zoomed point under the reticle
            // follows it (the hook's crate spot is in zoomed screen px).
            ev('pointermove', spot.x, spot.y);
          }
          requestAnimationFrame(loop);
        };
        loop();
      }),
    [touch, id] as const,
  );
}

interface Burst {
  shotTicks: number[];
  maxZoom: number;
  pictures: string[];
}

/** Two quick taps in the open sky (fresh pointer ids), until two shots went off. */
async function twoQuickShots(page: Page, touch: boolean): Promise<Burst> {
  return page.evaluate(
    (isTouch) =>
      new Promise<Burst>((resolve, reject) => {
        const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
        const h = window.__TM__;
        if (!canvas || !h) {
          reject(new Error('game not booted'));
          return;
        }
        const out: Burst = { shotTicks: [], maxZoom: 1, pictures: [] };
        const start = h.shots;
        let n = 0;
        let down = false;
        const x = h.designWidth * 0.5;
        const y = h.designHeight * 0.22;
        const ev = (type: string): void => {
          const r = canvas.getBoundingClientRect();
          canvas.dispatchEvent(
            new PointerEvent(type, {
              clientX: r.left + (x / h.designWidth) * r.width,
              clientY: r.top + (y / h.designHeight) * r.height,
              pointerId: 950 + n,
              pointerType: isTouch ? 'touch' : 'mouse',
              isPrimary: true,
              button: 0,
              buttons: type === 'pointerup' ? 0 : 1,
              bubbles: true,
              cancelable: true,
            }),
          );
        };
        let seen = start;
        const loop = (): void => {
          if (h.shots > seen) {
            for (let k = seen; k < h.shots; k++) out.shotTicks.push(h.tick);
            seen = h.shots;
          }
          out.maxZoom = Math.max(out.maxZoom, h.zoom.z);
          const pic = h.zoom.picture;
          if (pic !== null && !out.pictures.includes(pic)) out.pictures.push(pic);
          if (out.shotTicks.length >= 2 || h.over) {
            resolve(out);
            return;
          }
          // Press on one frame, release on the next (the red dot is up at once).
          if (!down) ev('pointerdown');
          else {
            ev('pointerup');
            n++;
          }
          down = !down;
          requestAnimationFrame(loop);
        };
        loop();
      }),
    touch,
  );
}

for (const g of GUNS)
  test(`Rooikol with ${g.gun}: instant red dot at 1×, two quick shots`, async ({ page }, info) => {
    test.skip(!isLandscape(info), 'portrait shows the rotate card');
    test.setTimeout(420_000);
    const touch = isTouchProject(info);
    const errors = collectErrors(page);
    await rifleSave(page, g.gun, g.sight);
    await boot(page, 'seed=7&huntSeconds=90&graphics=standard&crate=rooikol');
    await startHunt(page, touch);
    await pickUpScoped(page, touch, 'rooikol');
    // Wait out the pickup shot's (normal) time between shots.
    await page.waitForFunction(() => (window.__TM__?.cooldownTicks ?? 1) === 0, null, {
      timeout: 30_000,
    });
    const b = await twoQuickShots(page, touch);
    expect(b.shotTicks).toHaveLength(2);
    const [a, c] = b.shotTicks;
    const fast = Math.max(1, Math.round(cooldownTicks(g.gun) * MUL));
    // The second shot went off after the shortened time (a frame or two of slack), well before
    // the gun's normal time between shots.
    expect((c ?? 0) - (a ?? 0)).toBeLessThanOrEqual(fast + 6);
    expect((c ?? 0) - (a ?? 0)).toBeLessThan(cooldownTicks(g.gun));
    expect(b.maxZoom).toBe(1);
    expect(b.pictures).toEqual(['red_dot']);
    expect(errors).toEqual([]);
  });
