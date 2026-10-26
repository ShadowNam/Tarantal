// v1.7b power-ups explained (D-046) previews, on demand (not part of the regular suite):
//   ART_PREVIEW=1 npx playwright test tests/e2e/art-preview-v17b.spec.ts --project=desktop-chromium
// One profile at a time (desktop, Pixel 7, iPhone 14 landscape). Writes
// docs/art-preview/compare/v17b-<shot>-<device>.png (the whole view; a few also a 2× close-up),
// palette PNG ≤ 1600 px wide:
//   shed-powerups (top of the list) and shed-powerups-end (scrolled to the last card);
//   crate (a falling crate showing its item, + close-up);
//   pickup-card (the first-pickup card, + close-up);
//   chip-<id> for each power-up and crate gun (its chip and its look while it runs);
//   settings (Sound & game with Oupa's comments).
// Hunts use `?crate=<id>` (every crate holds it; the first drops in the first seconds). An
// in-page rAF watcher taps the crate, does what shows the look (shots for Chilli Biltong, a belt
// tap for Blitslaai's reload), then holds the sim (__TM_HOLD_AT__) a set number of ticks later.
// Everything that moves on a held frame runs on sim time (the card, the chip blink, the edge
// tint) or on the hunt's tweens (held with it). On desktop the real mouse rests at the bottom
// centre, outside both edge-pan bands.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { blank, crop, decodePng, encodePng8, resize, type Rgba } from '../../tools/assets/image';
import { boot, isTouchProject, startHunt, tapRect } from './helpers';

const OUT = join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'compare');
const PROFILES = ['desktop-chromium', 'pixel7-landscape', 'iphone14-landscape'];
/** The device name of a project (a local Chromium stand-in for WebKit keeps the device's). */
const device = (name: string): string => name.replace(/-chromium-fallback$/, '');
const ITEMS = [
  'chilli_biltong',
  'boeretroos',
  'bush_buckshot',
  'meerkat_spotter',
  'blitslaai',
  'oupa_laai',
  'voorlaaier',
  'mielie_masjien',
] as const;
type Item = (typeof ITEMS)[number];

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }, info) => {
  test.skip(process.env['ART_PREVIEW'] !== '1', 'on demand: ART_PREVIEW=1');
  test.skip(!PROFILES.includes(device(info.project.name)), 'previews: desktop, Pixel 7, iPhone 14');
  // Software GL is slow: each test is small, but gets 10 minutes.
  test.setTimeout(600_000);
  await page.addInitScript(() => {
    const key = 'tm.e2e.save.v1';
    if (localStorage.getItem(key) === null)
      localStorage.setItem(
        key,
        JSON.stringify({
          v: 1,
          settings: { quality: 'high' },
          ftue: { done: true, skipped: false, step: '' },
          // Today's greeting already said: the bubble in these frames is Oupa's pickup line.
          barks: { lastHuntDay: Math.floor(Date.now() / 86_400_000) },
        }),
      );
  });
});

function save(name: string, info: TestInfo, img: Rgba): void {
  mkdirSync(OUT, { recursive: true });
  let out = img;
  if (out.width > 1600) out = resize(out, 1600, Math.round((out.height * 1600) / out.width));
  writeFileSync(join(OUT, `v17b-${name}-${device(info.project.name)}.png`), encodePng8(out));
}

/** Nearest-neighbour n× (close-ups stay crisp). */
function scaled(src: Rgba, n: number): Rgba {
  const out = blank(src.width * n, src.height * n);
  for (let y = 0; y < out.height; y++)
    for (let x = 0; x < out.width; x++) {
      const si = (Math.floor(y / n) * src.width + Math.floor(x / n)) * 4;
      const di = (y * out.width + x) * 4;
      for (let k = 0; k < 4; k++) out.data[di + k] = src.data[si + k] ?? 0;
    }
  return out;
}

/** Desktop: the real mouse rests at the bottom centre, outside both edge-pan bands. */
async function park(page: Page, touch: boolean): Promise<void> {
  if (touch) return;
  const box = await page.locator('#game canvas').boundingBox();
  if (box !== null) await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.97);
}

/** The whole canvas, and optionally a 2× close-up of a design-px rect. */
async function shoot(
  page: Page,
  info: TestInfo,
  name: string,
  close?: { x: number; y: number; w: number; h: number },
): Promise<void> {
  const shot = decodePng(await page.locator('#game canvas').screenshot());
  save(name, info, shot);
  if (close === undefined) return;
  const w = await page.evaluate(() => window.__TM__?.designWidth ?? 1920);
  const k = shot.width / w;
  const x0 = Math.max(0, Math.round(close.x * k));
  const y0 = Math.max(0, Math.round(close.y * k));
  const x1 = Math.min(shot.width, Math.round((close.x + close.w) * k));
  const y1 = Math.min(shot.height, Math.round((close.y + close.h) * k));
  const n = Math.max(2, Math.min(4, Math.floor(1600 / Math.max(1, x1 - x0))));
  save(`${name}-closeup`, info, scaled(crop(shot, x0, y0, x1 - x0, y1 - y0), n));
}

/** The tick the watcher held the sim at, once it has set it. */
async function watchedHold(page: Page): Promise<number> {
  const h = await page.waitForFunction(
    () => (window as unknown as { __V17B_HOLD__?: number }).__V17B_HOLD__ ?? null,
    null,
    { timeout: 480_000 },
  );
  return (await h.jsonValue()) as number;
}

/** Waits for the hold tick and the fonts; parks the mouse (unless the frame aimed the
 *  crosshair with a synthetic move: the real mouse then stays parked where it was); lets a few
 *  frames draw. */
async function held(page: Page, touch: boolean, tick: number, parkMouse = true): Promise<void> {
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t, tick, { timeout: 420_000 });
  await page.waitForFunction(() => window.__TM__?.fontsReady === true, null, { timeout: 30_000 });
  if (parkMouse) await park(page, touch);
  await page.waitForTimeout(1500);
}

/**
 * In-page watcher. `mode`:
 *  - 'falling': no taps; holds `holdAfter` ticks after the first crate appears on screen;
 *  - 'pickup': taps the crate until `item` is running (a power-up) or in hand (a crate gun), then
 *    (`shots`) fires that many shots into the upper sky 10 ticks apart, (`reload`) taps the belt,
 *    and holds `holdAfter` ticks after the last of those.
 */
async function watch(
  page: Page,
  touch: boolean,
  o: {
    mode: 'falling' | 'pickup';
    item: string;
    holdAfter: number;
    shots?: number;
    reload?: boolean;
    /** Desktop only: the last pointer position (the crosshair rests there), design px. */
    aim?: { x: number; y: number };
  },
): Promise<void> {
  await page.evaluate(
    ({ mode, item, holdAfter, shots, reload, aim, isTouch }) => {
      const w = window as unknown as {
        __TM_HOLD_AT__?: (t: number) => void;
        __V17B_HOLD__?: number;
      };
      const hold = (t: number): void => {
        w.__V17B_HOLD__ = t;
        w.__TM_HOLD_AT__?.(t);
      };
      let id = 760;
      let last = -99;
      let fired = 0;
      let step: 'crate' | 'shots' | 'reload' | 'aim' | 'done' = 'crate';
      const tap = (
        canvas: HTMLCanvasElement,
        g: NonNullable<typeof window.__TM__>,
        x: number,
        y: number,
        down = true,
      ): void => {
        const r = canvas.getBoundingClientRect();
        const init: PointerEventInit = {
          clientX: r.left + (x / g.designWidth) * r.width,
          clientY: r.top + (y / g.designHeight) * r.height,
          pointerId: id++,
          pointerType: isTouch ? 'touch' : 'mouse',
          isPrimary: true,
          button: 0,
          buttons: down ? 1 : 0,
          bubbles: true,
          cancelable: true,
        };
        if (!down) {
          canvas.dispatchEvent(new PointerEvent('pointermove', init));
          return;
        }
        canvas.dispatchEvent(new PointerEvent('pointerdown', init));
        canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
      };
      const loop = (): void => {
        const g = window.__TM__;
        const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
        if (g === undefined || canvas === null) {
          requestAnimationFrame(loop);
          return;
        }
        const spot = g.crateSpots[0];
        if (mode === 'falling') {
          if (
            spot !== undefined &&
            spot.icon !== null &&
            spot.x > 200 &&
            spot.x < g.designWidth - 200
          ) {
            hold(g.tick + holdAfter);
            return;
          }
          requestAnimationFrame(loop);
          return;
        }
        if (step === 'crate') {
          const got = g.powerups.includes(item) || g.weapon === item;
          if (got) {
            step = shots > 0 ? 'shots' : reload ? 'reload' : 'aim';
            last = g.tick;
          } else if (
            spot !== undefined &&
            g.tick - last >= 6 &&
            spot.x > 0 &&
            spot.x < g.designWidth
          ) {
            last = g.tick;
            tap(canvas, g, spot.x, spot.y);
          }
        } else if (step === 'shots') {
          if (fired >= shots) {
            step = reload ? 'reload' : 'aim';
            last = g.tick;
          } else if (g.tick - last >= 10) {
            last = g.tick;
            tap(canvas, g, g.designWidth * (0.42 + 0.04 * fired), g.designHeight * 0.14);
            fired++;
          }
        } else if (step === 'reload') {
          const belt = g.rects['belt'];
          if (g.reloading || belt === undefined) {
            step = 'aim';
            last = g.tick;
          } else if (g.tick - last >= 12) {
            last = g.tick;
            tap(canvas, g, belt.x + belt.w / 2, belt.y + belt.h / 2);
          }
        } else if (step === 'aim') {
          // The crosshair comes to rest where the frame wants it (desktop: a move, no click).
          if (!isTouch && aim !== null) tap(canvas, g, aim.x, aim.y, false);
          hold(g.tick + holdAfter);
          step = 'done';
          return;
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    },
    {
      mode: o.mode,
      item: o.item,
      holdAfter: o.holdAfter,
      shots: o.shots ?? 0,
      reload: o.reload ?? false,
      aim: o.aim ?? null,
      isTouch: touch,
    },
  );
}

// --- the Gun Shed --------------------------------------------------------------------------------

test('the Gun Shed: Power-ups tab, top and scrolled to the end', async ({ page }, info) => {
  const touch = isTouchProject(info);
  await boot(page, 'seed=42');
  await page.waitForFunction(() => window.__TM__?.rects['shed'] !== undefined, null, {
    timeout: 60_000,
  });
  await tapRect(page, touch, 'shed');
  await page.waitForFunction(() => window.__TM__?.rects['shed.powerups'] !== undefined, null, {
    timeout: 60_000,
  });
  await tapRect(page, touch, 'shed.powerups');
  await page.waitForFunction(() => (window.__TM__?.shedPowerups?.cards.length ?? 0) === 8, null, {
    timeout: 60_000,
  });
  await page.waitForFunction(() => window.__TM__?.fontsReady === true, null, { timeout: 30_000 });
  await park(page, touch);
  await page.waitForTimeout(1200);
  await shoot(page, info, 'shed-powerups');
  // Scrolled to the last card (the wheel over the list scrolls it on every profile).
  await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
    const h = window.__TM__;
    const card = h?.rects['shed.powerup.chilli_biltong'];
    if (!canvas || !h || !card) throw new Error('no list');
    const r = canvas.getBoundingClientRect();
    canvas.dispatchEvent(
      new WheelEvent('wheel', {
        clientX: r.left + ((card.x + card.w / 2) / h.designWidth) * r.width,
        clientY: r.top + ((card.y + card.h / 2) / h.designHeight) * r.height,
        deltaY: 10_000,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await page.waitForFunction(
    () => {
      const s = window.__TM__?.shedPowerups;
      return s !== undefined && s.scroll === s.maxScroll;
    },
    null,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(800);
  await shoot(page, info, 'shed-powerups-end');
});

// --- in the hunt ---------------------------------------------------------------------------------

test('a falling crate shows what it holds', async ({ page }, info) => {
  const touch = isTouchProject(info);
  await boot(page, 'seed=7&huntSeconds=60&crate=boeretroos');
  await startHunt(page, touch);
  await park(page, touch);
  await watch(page, touch, { mode: 'falling', item: 'boeretroos', holdAfter: 40 });
  await held(page, touch, await watchedHold(page));
  const spot = await page.evaluate(() => window.__TM__?.crateSpots[0] ?? null);
  expect(spot?.icon).toBe('ui/pu_boeretroos');
  await shoot(
    page,
    info,
    'crate',
    spot === null ? undefined : { x: spot.x - 160, y: spot.y - 300, w: 320, h: 380 },
  );
});

test('the pickup card (first pickup: the full sentence and Oupa’s word)', async ({
  page,
}, info) => {
  const touch = isTouchProject(info);
  await boot(page, 'seed=7&huntSeconds=60&crate=boeretroos');
  await startHunt(page, touch);
  await park(page, touch);
  await watch(page, touch, {
    mode: 'pickup',
    item: 'boeretroos',
    holdAfter: 40,
    aim: { x: 1100, y: 620 },
  });
  await held(page, touch, await watchedHold(page), false);
  const card = await page.evaluate(() => window.__TM__?.pickupCard ?? null);
  expect(card?.first).toBe(true);
  await shoot(
    page,
    info,
    'pickup-card',
    card === null
      ? undefined
      : { x: card.rect.x - 20, y: card.rect.y - 20, w: card.rect.w + 40, h: card.rect.h + 40 },
  );
});

/** What each power-up's frame does after the pickup, and how long after it is held. */
const LOOKS: Record<
  Item,
  { holdAfter: number; shots?: number; reload?: boolean; aim?: { x: number; y: number } }
> = {
  // A few shots: the ∞ on the belt and sparks still flying off the muzzle.
  chilli_biltong: { holdAfter: 4, shots: 4 },
  // Past the card: the warm edges in full.
  boeretroos: { holdAfter: 260 },
  // The crosshair (desktop) in the open sky with its wide warm ring.
  bush_buckshot: { holdAfter: 230, aim: { x: 1000, y: 380 } },
  // The meerkat on watch and its reveal rings.
  meerkat_spotter: { holdAfter: 240 },
  // Two shots, then a belt tap: glints on the belt mid-reload.
  blitslaai: { holdAfter: 6, shots: 2, reload: true },
  // Oupa's hand by the belt.
  oupa_laai: { holdAfter: 230 },
  voorlaaier: { holdAfter: 230, aim: { x: 1000, y: 420 } },
  mielie_masjien: { holdAfter: 230, aim: { x: 1000, y: 420 } },
};

for (const item of ITEMS) {
  test(`${item}: its chip and its look while it runs`, async ({ page }, info) => {
    const touch = isTouchProject(info);
    await boot(page, `seed=7&huntSeconds=60&crate=${item}`);
    await startHunt(page, touch);
    await park(page, touch);
    await watch(page, touch, { mode: 'pickup', item, ...LOOKS[item] });
    await held(page, touch, await watchedHold(page), LOOKS[item].aim === undefined);
    const chips = await page.evaluate(() => window.__TM__?.chips ?? []);
    expect(chips.some((c) => c.id === item)).toBe(true);
    await shoot(page, info, `chip-${item}`);
  });
}

// --- Settings ------------------------------------------------------------------------------------

test("Settings: Sound & game with Oupa's comments", async ({ page }, info) => {
  const touch = isTouchProject(info);
  await boot(page, 'seed=42');
  await page.waitForFunction(() => window.__TM__?.rects['settings'] !== undefined, null, {
    timeout: 60_000,
  });
  await tapRect(page, touch, 'settings');
  await page.waitForFunction(() => window.__TM__?.rects['settings.oupa'] !== undefined, null, {
    timeout: 60_000,
  });
  // Text only, so the row shows a choice other than the default.
  await tapRect(page, touch, 'settings.oupa');
  await page.waitForFunction(() => window.__TM__?.voice.oupa === false, null, { timeout: 30_000 });
  await page.waitForFunction(() => window.__TM__?.fontsReady === true, null, { timeout: 30_000 });
  await park(page, touch);
  await page.waitForTimeout(1000);
  await shoot(page, info, 'settings');
});
