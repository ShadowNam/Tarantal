// v1.20 (D-085) Brakkie fetches sooner + the Jag, Brakkie! card: screenshots, on demand (not part
// of the regular suite; playwright.config.ts ignores art-preview specs unless ART_PREVIEW=1):
//   ART_PREVIEW=1 npx playwright test tests/e2e/art-preview-brakkie-jag.spec.ts --project=desktop-chromium
// One profile at a time (desktop, Pixel 7, iPhone 14 landscape). Writes
// docs/art-preview/compare/v120-jag-<shot>-<device>.png (palette PNG ≤ 1600 px wide):
//   boot 1 — fetch-soon: he runs out ~1.5 s after a bag while the test keeps shooting
//     (?brakkiePreview=bag: a bird queued beside him 3 s in), held the moment the fetch begins;
//   boot 2 — crate: the falling crate showing the card's icon (?crate=brakkie_jag), held;
//     chip: the HUD chip just after it is picked up ("10 s · 0/3"), held;
//     pounce (+ pounce-2x): mid-leap on a foraging guineafowl (?brakkiePreview=jagView: only birds
//     on screen), held at the top of the leap;
//     carry (+ carry-2x): carrying the caught bird home on the near plane, held;
//   boot 3 — guide: the Gun Shed's Power-ups tab scrolled to the Jag card.
// Three boots per device, several shots each (lesson 13); every grab holds the sim
// (__TM_HOLD_AT__) on a fresh frame; the far herds are still (?faunaIdle=0); pans use short A/D
// presses that tolerate an overshoot (lesson 15); every wait is bounded and a missing shot fails
// the test (lesson 11).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { blank, crop, decodePng, encodePng8, resize, type Rgba } from '../../tools/assets/image';
import { hook, isTouchProject, startHunt, tapRect } from './helpers';
import { JAG_BASE, pickUpCrate, type JagDog } from './jagHelpers';

const OUT = join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'compare');
const PROFILES = ['desktop-chromium', 'pixel7-landscape', 'iphone14-landscape'];
const device = (name: string): string => name.replace(/-chromium-fallback$/, '');
const SAVE = 'tm.e2e.save.v1';

type Hooked = {
  __TM__?: { tick: number; brakkie?: JagDog | null };
  __TM_HOLD_AT__?: (tick: number) => void;
  __TM_SHED_SCROLL__?: (v: number) => void;
};

test.use({ serviceWorkers: 'block' });
test.describe.configure({ mode: 'default' });
test.beforeEach(async ({ page }, info) => {
  test.skip(process.env['ART_PREVIEW'] !== '1', 'on demand: ART_PREVIEW=1');
  test.skip(!PROFILES.includes(device(info.project.name)), 'previews: desktop, Pixel 7, iPhone 14');
  test.setTimeout(900_000);
  await page.addInitScript((key) => {
    if (localStorage.getItem(key) !== null) return;
    localStorage.setItem(
      key,
      JSON.stringify({
        v: 1,
        settings: { quality: 'high' },
        ftue: { done: true, skipped: false, step: '' },
        barks: { lastHuntDay: Math.floor(Date.now() / 86_400_000) },
      }),
    );
  }, SAVE);
});

function save(name: string, info: TestInfo, img: Rgba): void {
  mkdirSync(OUT, { recursive: true });
  let out = img;
  if (out.width > 1600) out = resize(out, 1600, Math.round((out.height * 1600) / out.width));
  writeFileSync(join(OUT, `v120-jag-${name}-${device(info.project.name)}.png`), encodePng8(out));
}

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

async function park(page: Page, touch: boolean): Promise<void> {
  if (touch) return;
  const box = await page.locator('#game canvas').boundingBox();
  if (box !== null) await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.97);
}

/** Waits for a few fresh frames of the held tick (lesson 28). */
async function fresh(page: Page, touch: boolean): Promise<void> {
  await park(page, touch);
  const f0 = await page.evaluate(() => window.__TM__?.sceneryFrames ?? 0);
  await page.waitForFunction((f) => (window.__TM__?.sceneryFrames ?? 0) > f + 3, f0, {
    timeout: 120_000,
  });
  await page.waitForTimeout(800);
}

async function release(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as Hooked).__TM_HOLD_AT__?.(1e12);
  });
}

interface Grab {
  img: Rgba;
  k: number;
}

async function grab(page: Page): Promise<Grab> {
  const img = decodePng(await page.locator('#game canvas').screenshot());
  const h = await hook(page);
  return { img, k: img.height / h.designHeight };
}

/** A box round him on screen (his feet at the bottom middle), cut from the grab. */
function aroundDog(g: Grab, d: JagDog, w = 520, h = 340): Rgba {
  const x0 = Math.max(0, Math.round((d.x - w / 2) * g.k));
  const y0 = Math.max(0, Math.round((d.y - h + 40) * g.k));
  const x1 = Math.min(g.img.width, Math.round((d.x + w / 2) * g.k));
  const y1 = Math.min(g.img.height, Math.round((d.y + 40) * g.k));
  return crop(g.img, x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
}

/** Boots a hunt (Standard) with these test flags and waits until his sheet is in. */
async function huntWith(page: Page, info: TestInfo, query: string): Promise<boolean> {
  const touch = isTouchProject(info);
  await page.goto(`/?e2e=1&feesdag=none&ftue=0&${query}&graphics=standard`);
  await page.waitForFunction(() => window.__TM__?.ready === true, null, { timeout: 300_000 });
  await startHunt(page, touch);
  await page.waitForFunction(
    () => {
      const tm = window.__TM__;
      return (
        tm?.scene === 'hunt' &&
        tm.graphics.loading !== 'loading' &&
        (tm.brakkie?.sheet ?? null) !== null
      );
    },
    null,
    { timeout: 300_000 },
  );
  await park(page, touch);
  return touch;
}

/** Holds the sim the frame he first shows `moment`; returns him then. */
async function holdWhen(
  page: Page,
  touch: boolean,
  moment: 'fetch' | 'pounce' | 'carry',
  timeout = 300_000,
): Promise<JagDog> {
  const d = (await (
    await page.waitForFunction(
      (want) => {
        const w = window as unknown as Hooked;
        const dog = w.__TM__?.brakkie;
        if (dog == null || !dog.visible) return false;
        const ok =
          want === 'fetch'
            ? dog.phase === 'fetch'
            : want === 'pounce'
              ? dog.phase === 'pounce' && dog.lift > 10
              : dog.phase === 'carry' && dog.bird && dog.plane === 'near';
        if (!ok) return false;
        w.__TM_HOLD_AT__?.((w.__TM__?.tick ?? 0) + 1);
        return dog;
      },
      moment,
      { timeout, polling: 'raf' },
    )
  ).jsonValue()) as JagDog;
  await fresh(page, touch);
  return d;
}

test('boot 1: he runs out soon after a bag while the shooting goes on', async ({ page }, info) => {
  const touch = await huntWith(
    page,
    info,
    'biome=karoo-autumn&layout=none&seed=42&huntSeconds=120&baboons=0&reenbui=0&omen=0&faunaIdle=0&birds=0&brakkie=1&brakkiePreview=bag',
  );
  // Shots at the empty sky after the bird is queued (in-page, a fresh pointerId each), until he
  // is running out for it; then hold.
  await page.evaluate(
    (isTouch) =>
      new Promise<void>((resolve, reject) => {
        const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
        const h = window.__TM__;
        if (!canvas || !h) {
          reject(new Error('game not booted'));
          return;
        }
        let frames = 0;
        let last = -999;
        let n = 0;
        const loop = (): void => {
          frames++;
          const d = h.brakkie;
          if (frames > 60 * 120) {
            reject(new Error('no fetch'));
            return;
          }
          if (d?.fetchTick != null && d.queuedTick != null && d.fetchTick >= d.queuedTick) {
            resolve();
            return;
          }
          if (d?.queuedTick != null && h.tick - last >= 30 && n < 2) {
            last = h.tick;
            const r = canvas.getBoundingClientRect();
            const init: PointerEventInit = {
              clientX: r.left + ((h.designWidth / 2 + (n ? 140 : -140)) / h.designWidth) * r.width,
              clientY: r.top + (180 / h.designHeight) * r.height,
              pointerId: 3100 + n,
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
          }
          requestAnimationFrame(loop);
        };
        loop();
      }),
    touch,
  );
  // A few ticks into the run: he is clearly off towards the bird.
  const d = await holdWhen(page, touch, 'fetch', 60_000);
  save('fetch-soon', info, (await grab(page)).img);
  save('fetch-soon-2x', info, scaled(aroundDog(await grab(page), d), 2));
});

test('boot 2: the card in a crate, its chip, the pounce and the carry home', async ({
  page,
}, info) => {
  const touch = await huntWith(page, info, `${JAG_BASE}&huntSeconds=180&brakkiePreview=jagView`);
  // The crate on screen, falling with the card's icon on its canopy: hold, grab, go on.
  await page.waitForFunction(
    () => {
      const h = window.__TM__;
      const c = h?.crateSpots[0];
      if (h === undefined || c === undefined) return false;
      if (c.x < 200 || c.x > h.designWidth - 200 || c.y < 200) return false;
      (window as unknown as Hooked).__TM_HOLD_AT__?.(h.tick + 1);
      return true;
    },
    null,
    { timeout: 120_000, polling: 'raf' },
  );
  await fresh(page, touch);
  save('crate', info, (await grab(page)).img);
  await release(page);
  await pickUpCrate(page, touch, 'brakkie_jag');
  await page.waitForFunction(
    () => {
      const h = window.__TM__;
      if (h?.chips?.find((c) => c.id === 'brakkie_jag') === undefined) return false;
      (window as unknown as Hooked).__TM_HOLD_AT__?.(h.tick + 1);
      return true;
    },
    null,
    { timeout: 60_000, polling: 'raf' },
  );
  await fresh(page, touch);
  save('chip', info, (await grab(page)).img);
  await release(page);
  // Bring a foraging mid flock to the view's centre (A/D presses, overshoot-tolerant, bounded)
  // so he finds a bird on screen, then hold mid-leap.
  for (let k = 0; k < 80; k++) {
    const h = await hook(page);
    const dog = h.brakkie;
    if (dog?.phase === 'hunt' || dog?.phase === 'pounce' || (dog?.catches ?? 0) > 0) break;
    const f = h.flockSpots.find((x) => x.plane === 'mid' && x.alive > 0 && x.state === 'forage');
    const o = f === undefined ? 600 : f.x - h.designWidth / 2;
    if (Math.abs(o) < 200) {
      await page.waitForTimeout(500);
      continue;
    }
    const key = o > 0 ? 'KeyD' : 'KeyA';
    await page.keyboard.down(key);
    await page.waitForTimeout(Math.abs(o) > 500 ? 300 : 100);
    await page.keyboard.up(key);
    await park(page, touch);
  }
  const p = await holdWhen(page, touch, 'pounce');
  expect(p.pose).toBe('pounce');
  save('pounce', info, (await grab(page)).img);
  save('pounce-2x', info, scaled(aroundDog(await grab(page), p), 2));
  await release(page);
  const c = await holdWhen(page, touch, 'carry', 120_000);
  expect(Math.abs(c.y - c.groundY)).toBeLessThanOrEqual(2);
  save('carry', info, (await grab(page)).img);
  save('carry-2x', info, scaled(aroundDog(await grab(page), c), 2));
});

test('boot 3: the Power-ups guide card', async ({ page }, info) => {
  const touch = isTouchProject(info);
  await page.goto('/?e2e=1&feesdag=none&ftue=0&seed=42&graphics=standard');
  await page.waitForFunction(() => window.__TM__?.rects['shed'] !== undefined, null, {
    timeout: 300_000,
  });
  await tapRect(page, touch, 'shed');
  await page.waitForFunction(() => window.__TM__?.rects['shed.powerups'] !== undefined, null, {
    timeout: 60_000,
  });
  await tapRect(page, touch, 'shed.powerups');
  await page.waitForFunction(
    () => {
      const h = window.__TM__;
      const card = h?.shedPowerups?.cards.find((x) => x.id === 'brakkie_jag');
      return card?.effect !== '' && card?.icon === true && card.iconAt !== undefined;
    },
    null,
    { timeout: 180_000 },
  );
  const h0 = await hook(page);
  const at = h0.shedPowerups?.cards.find((x) => x.id === 'brakkie_jag')?.iconAt;
  if (at === undefined) throw new Error('no Jag card icon');
  await page.evaluate(
    (y) => {
      (window as unknown as Hooked).__TM_SHED_SCROLL__?.(y);
    },
    at.y - (h0.shedPowerups?.viewY ?? 0) - 60,
  );
  await page.waitForTimeout(1500);
  await park(page, touch);
  save('guide', info, (await grab(page)).img);
});
