// 1.9.2 (D-055) Rooikol, the red dot sight, in a seeded hunt on every landscape profile, with the
// scoped .22 and the Langloop. `?crate=rooikol` fills the first crate with it (a rifle is in
// hand, so the crate may hold it). Picked up through the sight; then two quick shots: both go
// off with the shortened time between them, the zoom stays at 1 while the sight is up, and the
// picture is the red dot. Everything that moves is read inside the page (one round trip).
import { expect, test, type Page } from '@playwright/test';
import powerups from '../../content/powerups.json' with { type: 'json' };
import weapons from '../../content/weapons.json' with { type: 'json' };
import { boot, collectErrors, isLandscape, isTouchProject, startHunt } from './helpers';
import { pickUpScoped, rifleSave } from './rooikolHelpers';

test.use({ serviceWorkers: 'block' });

const rooikol = powerups.powerups.find((p) => p.id === 'rooikol');
const MUL = rooikol?.effect.fireCooldownMul ?? 1;

const GUNS = [
  { gun: 'twee_twee', sight: 'scope_small' },
  { gun: 'langloop', sight: 'scope_var' },
] as const;

function cooldownTicks(id: string): number {
  const w = weapons.weapons.find((x) => x.id === id);
  const ms = w !== undefined && 'fireCooldownMs' in w ? w.fireCooldownMs : 0;
  return Math.round((ms * 60) / 1000);
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
        let pressed = false;
        const loop = (): void => {
          if (h.shots > seen) {
            for (let k = seen; k < h.shots; k++) out.shotTicks.push(h.tick);
            seen = h.shots;
          }
          // From the first press on (this frame's press has gone in by the next frame).
          if (pressed) {
            out.maxZoom = Math.max(out.maxZoom, h.zoom.z);
            const pic = h.zoom.picture;
            if (pic !== null && !out.pictures.includes(pic)) out.pictures.push(pic);
          }
          if (out.shotTicks.length >= 2 || h.over) {
            resolve(out);
            return;
          }
          // Press on one frame, release on the next (the red dot is up at once).
          if (!down) {
            ev('pointerdown');
            pressed = true;
          } else {
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
    // Wait out the pickup shot's (normal) time between shots and its scope coming down.
    await page.waitForFunction(
      () => {
        const h = window.__TM__;
        return (
          h !== undefined &&
          h.cooldownTicks === 0 &&
          h.zoom.raise === 0 &&
          (h.zoom.picture === null || h.zoom.picture === 'red_dot')
        );
      },
      null,
      { timeout: 30_000 },
    );
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
