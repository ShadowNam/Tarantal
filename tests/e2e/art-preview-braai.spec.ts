// v1.11 (D-068) Die Braai previews, on demand (not part of the regular suite):
//   ART_PREVIEW=1 npx playwright test tests/e2e/art-preview-braai.spec.ts --project=desktop-chromium
// One profile at a time (desktop, Pixel 7, iPhone 14 landscape); five boots per device, each a
// short hunt (12 s of sim time, ≈ 2–3 min on software GL at ~5 ticks a second; waits by sim
// ticks), each test well under 12 min. Writes docs/art-preview/compare/v111-braai-<shot>-<device>
// .png (palette PNG ≤ 1600 px wide; close-ups 2–4× nearest-neighbour):
//   daily, daily-story — an average Daily hunt's braai (a few shots at the flocks), Oupa's story
//     bubble (the braai clock held once line 1 is out, so line 2 and its bubble stay), and share — the
//     Daily's card with the braai round its score, rendered on the page;
//   dance — a perfect hunt's vastrap (?braaiDance=1), the clock held on a knee-up step;
//   newyear — a Feesdae Daily (New Year, forced date) at the braai: the party hat on Oupa, the
//     slate's own frame;
//   fire-standard, fire-compare — Oupa and the fire close up, Standard, then Standard | HD (a serial
//     pair of tests, one boot each).
// A held braai clock (?braaiAt or window.__TM_BRAAI_AT__) freezes the picture; a grab waits for a
// fresh frame (the braai's frame counter moves) after each hold.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { blank, crop, decodePng, encodePng8, resize, type Rgba } from '../../tools/assets/image';
import feel from '../../content/client/feel.json' with { type: 'json' };
import { release } from './christmasHelpers';
import { boot, isTouchProject, tapRect } from './helpers';

const OUT = join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'compare');
const PROFILES = ['desktop-chromium', 'pixel7-landscape', 'iphone14-landscape'];
/** The device name of a project (a local Chromium stand-in for WebKit keeps the device's). */
const device = (name: string): string => name.replace(/-chromium-fallback$/, '');
const BASE = 'seed=42&omen=0&palms=0&baboons=0&layout=none&huntSeconds=12&holdAt=20';
/** The braai clock the New Year and Standard | HD shots hold at (any steady picture will do). */
const HOLD_MS = 9000;

type Rect = { x: number; y: number; w: number; h: number };

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }, info) => {
  test.skip(process.env['ART_PREVIEW'] !== '1', 'on demand: ART_PREVIEW=1');
  test.skip(!PROFILES.includes(device(info.project.name)), 'previews: desktop, Pixel 7, iPhone 14');
  test.setTimeout(720_000);
  await page.addInitScript(() => {
    const key = 'tm.e2e.save.v1';
    if (localStorage.getItem(key) === null)
      localStorage.setItem(
        key,
        JSON.stringify({
          v: 1,
          settings: { quality: 'high' },
          ftue: { done: true, skipped: false, step: '' },
        }),
      );
  });
});

const fileOf = (name: string, info: TestInfo): string =>
  join(OUT, `v111-braai-${name}-${device(info.project.name)}.png`);

function save(name: string, info: TestInfo, img: Rgba): void {
  mkdirSync(OUT, { recursive: true });
  let out = img;
  if (out.width > 1600) out = resize(out, 1600, Math.round((out.height * 1600) / out.width));
  writeFileSync(fileOf(name, info), encodePng8(out));
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

/** Desktop: the mouse rests low in the middle (outside the edge-pan bands and the braai). */
async function park(page: Page, touch: boolean): Promise<void> {
  if (touch) return;
  const box = await page.locator('#game canvas').boundingBox();
  if (box !== null) await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.6);
}

/** The canvas after a fresh braai frame (its counter moved on since the call). */
async function grab(page: Page): Promise<Rgba> {
  const from = await page.evaluate(() => window.__TM__?.braaiFrames ?? 0);
  await page.waitForFunction((f) => (window.__TM__?.braaiFrames ?? 0) > f + 1, from, {
    timeout: 120_000,
  });
  return decodePng(await page.locator('#game canvas').screenshot());
}

/** A design-px rect of a canvas grab, at the canvas's own resolution. */
async function cut(page: Page, shot: Rgba, r: Rect): Promise<Rgba> {
  const w = await page.evaluate(() => window.__TM__?.designWidth ?? 1920);
  const k = shot.width / w;
  const x0 = Math.max(0, Math.round(r.x * k));
  const y0 = Math.max(0, Math.round(r.y * k));
  const x1 = Math.min(shot.width, Math.round((r.x + r.w) * k));
  const y1 = Math.min(shot.height, Math.round((r.y + r.h) * k));
  if (x1 - x0 < 8 || y1 - y0 < 8) throw new Error(`crop ${JSON.stringify(r)} is off the canvas`);
  return crop(shot, x0, y0, x1 - x0, y1 - y0);
}

/** Oupa and the fire together, a margin round them (design px). */
async function fireCrop(page: Page): Promise<Rect> {
  const b = await page.evaluate(() => window.__TM__?.braai ?? null);
  if (b?.oupa == null || b.fire == null) throw new Error('no Oupa or fire on screen');
  const x0 = Math.min(b.oupa.x, b.fire.x) - 12;
  const y0 = Math.min(b.oupa.y, b.fire.y) - 12;
  const x1 = Math.max(b.oupa.x + b.oupa.w, b.fire.x + b.fire.w) + 12;
  const y1 = Math.max(b.oupa.y + b.oupa.h, b.fire.y + b.fire.h) + 12;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Starts the hunt by `button`, waits until the braai's files are in, a few shots at the flocks
 *  (bounded by frames and shots), then the braai tally. */
async function huntToBraai(
  page: Page,
  touch: boolean,
  button: string,
  shots: number,
): Promise<void> {
  await page.waitForFunction((id) => window.__TM__?.rects[id] !== undefined, button, {
    timeout: 180_000,
  });
  await tapRect(page, touch, button);
  await page.waitForFunction(() => window.__TM__?.scene === 'hunt', null, { timeout: 240_000 });
  await page.waitForFunction(() => window.__TM__?.braaiLoaded === true, null, {
    timeout: 240_000,
  });
  await release(page);
  if (shots > 0)
    await page.evaluate(
      ([n, isTouch]) =>
        new Promise<void>((resolve) => {
          const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
          const h = window.__TM__;
          if (!canvas || !h) {
            resolve();
            return;
          }
          let fired = 0;
          let last = -999;
          let frames = 0;
          let id = 7100;
          const loop = (): void => {
            frames++;
            if (fired >= n || frames > 4000 || h.over) {
              resolve();
              return;
            }
            const spot = h.flockSpots[0];
            if (spot !== undefined && h.tick >= last + 24) {
              const r = canvas.getBoundingClientRect();
              const init: PointerEventInit = {
                clientX: r.left + (spot.x / h.designWidth) * r.width,
                clientY: r.top + (spot.y / h.designHeight) * r.height,
                pointerId: id++,
                pointerType: isTouch ? 'touch' : 'mouse',
                isPrimary: true,
                button: 0,
                buttons: 1,
                bubbles: true,
                cancelable: true,
              };
              canvas.dispatchEvent(new PointerEvent('pointerdown', init));
              canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
              fired++;
              last = h.tick;
            }
            requestAnimationFrame(loop);
          };
          loop();
        }),
      [shots, touch] as const,
    );
  await page.waitForFunction(() => window.__TM__?.scene === 'tally', null, { timeout: 480_000 });
  await page.waitForFunction(() => window.__TM__?.braai != null, null, { timeout: 60_000 });
  await page.waitForFunction(() => window.__TM__?.tallyDone === true, null, { timeout: 240_000 });
  await park(page, touch);
}

test('an average Daily at the braai: the story, Oupa and the fire, the share card', async ({
  page,
}, info) => {
  const touch = isTouchProject(info);
  // No hold at boot: the story starts after the count-up, a tween on Phaser's capped frame time
  // (tens of seconds at ~1 fps on software GL), while the braai clock keeps real time — a clock
  // held from boot stopped before the story began. Instead, the moment line 1 is told (in-page,
  // on that frame) the clock is held at line 1's time + one line + gap + 200 ms: line 2 comes
  // out, and it and its bubble stay on screen (the bubble hides on the braai clock).
  await boot(page, `${BASE}&today=2026-11-04&graphics=standard`);
  await huntToBraai(page, touch, 'daily', 6);
  const pace = feel.braai.story;
  const ready = await page
    .waitForFunction(
      (step) => {
        const b = window.__TM__?.braai;
        if (b == null) return false;
        const w = window as { __TM_BRAAI_AT__?: number };
        const first = b.story.at[0];
        if (w.__TM_BRAAI_AT__ === undefined && first !== undefined)
          w.__TM_BRAAI_AT__ = first + step;
        return b.story.shown >= 2 && b.bubble !== null;
      },
      pace.lineMs + pace.gapMs + 200,
      { timeout: 300_000, polling: 'raf' },
    )
    .then(() => true)
    .catch(() => false);
  if (!ready) {
    const b = await page.evaluate(() => ({
      braai: window.__TM__?.braai ?? null,
      hold: (window as { __TM_BRAAI_AT__?: number }).__TM_BRAAI_AT__ ?? null,
    }));
    throw new Error(
      `the story's second line is not on screen: hold = ${String(b.hold)}, story = ${JSON.stringify(b.braai?.story ?? null)}, bubble = ${JSON.stringify(b.braai?.bubble ?? null)}`,
    );
  }
  const shot = decodePng(await page.locator('#game canvas').screenshot());
  save('daily', info, shot);
  const b = await page.evaluate(() => window.__TM__?.braai ?? null);
  expect(b?.sheet).toBe('standard');
  const bubble = b?.bubble ?? null;
  const fire = await fireCrop(page);
  // The story bubble and Oupa (the bubble sits above his head).
  const top = bubble === null ? fire.y - 180 : Math.min(bubble.y, fire.y) - 10;
  const story = await cut(page, shot, {
    x: fire.x,
    y: top,
    w: fire.w + 260,
    h: fire.y + fire.h - top,
  });
  save('daily-story', info, story);
  // The Daily's share card: the braai round the score.
  await tapRect(page, touch, 'share');
  await page.waitForFunction(() => window.__TM__?.lastShare != null, null, { timeout: 60_000 });
  const text = await page.evaluate(() => window.__TM__?.lastShare?.text ?? '');
  expect(text).toMatch(/🔥 [\d\u00a0]+ 🌌/);
  await page.evaluate((t) => {
    const card = document.createElement('div');
    card.id = 'braai-share-card';
    card.textContent = t;
    Object.assign(card.style, {
      position: 'fixed',
      left: '24px',
      top: '24px',
      maxWidth: '560px',
      padding: '18px 22px',
      background: '#FFFFFF',
      color: '#111111',
      font: '22px/1.45 system-ui, sans-serif',
      borderRadius: '18px',
      boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
      whiteSpace: 'pre-wrap',
      zIndex: '99999',
    });
    document.body.appendChild(card);
  }, text);
  writeFileSync(join(OUT, `v111-braai-share-${device(info.project.name)}.txt`), `${text}\n`);
  save('share', info, decodePng(await page.locator('#braai-share-card').screenshot()));
});

test("a perfect hunt: Oupa's vastrap (held on a knee-up step)", async ({ page }, info) => {
  const touch = isTouchProject(info);
  await boot(page, `${BASE}&graphics=standard&braaiDance=1`);
  await huntToBraai(page, touch, 'start', 0);
  const at = await page.waitForFunction(() => window.__TM__?.braai?.danceAt ?? null, null, {
    timeout: 300_000,
  });
  const danceAt = (await at.jsonValue()) as number;
  // Hold the clock 40 ms into the dance: its first step (a knee up, his hat raised).
  await page.evaluate((ms) => {
    (window as { __TM_BRAAI_AT__?: number }).__TM_BRAAI_AT__ = ms;
  }, danceAt + 40);
  await page.waitForFunction(() => window.__TM__?.braai?.pose === 'dance_a', null, {
    timeout: 60_000,
  });
  save('dance', info, await grab(page));
  const shot = await grab(page);
  const c = await cut(page, shot, await fireCrop(page));
  save('dance-closeup', info, scaled(c, Math.max(2, Math.min(4, Math.floor(800 / c.width)))));
});

test('a Feesdae Daily (New Year) at the braai', async ({ page }, info) => {
  const touch = isTouchProject(info);
  await boot(page, `feesdag=newyear&today=2026-12-31&${BASE}&graphics=standard&braaiAt=${HOLD_MS}`);
  await huntToBraai(page, touch, 'daily', 4);
  const h = await page.evaluate(() => ({
    frame: window.__TM__?.tally?.frame ?? null,
    decorations: window.__TM__?.braai?.decorations ?? [],
  }));
  expect(h.frame).toBe('newyear');
  expect(h.decorations).toContain('feesdae/newyear:hat_m');
  save('newyear', info, await grab(page));
});

// Standard | HD: two tests in serial mode (each one boot, under ~12 min on software GL, lesson
// 23): the Standard crop first, then the HD boot crops the same spot and writes the compare. The
// serial group runs them in this order and skips the HD one if the Standard one failed.
test.describe.serial('Standard | HD: Oupa and the fire', () => {
  const STD = `${BASE}&graphics=standard&braaiAt=${String(HOLD_MS)}`;
  const HD = `${BASE}&graphics=hd&braaiAt=${String(HOLD_MS)}`;

  async function fireShot(page: Page, info: TestInfo, query: string): Promise<Rgba> {
    await boot(page, query);
    await huntToBraai(page, isTouchProject(info), 'start', 0);
    const shot = await grab(page);
    const c = await cut(page, shot, await fireCrop(page));
    return scaled(c, Math.max(2, Math.min(4, Math.floor(800 / Math.max(1, c.width)))));
  }

  test('the Standard crop', async ({ page }, info) => {
    const std = await fireShot(page, info, STD);
    expect(await page.evaluate(() => window.__TM__?.braai?.sheet ?? null)).toBe('standard');
    save('fire-standard', info, std);
  });

  test('the HD crop and the compare', async ({ page }, info) => {
    const hd = await fireShot(page, info, HD);
    expect(
      await page.evaluate(() => window.__TM__?.braai?.sheet ?? null),
      'the HD sheet fits on this map',
    ).toBe('hd');
    const std = decodePng(readFileSync(fileOf('fire-standard', info)));
    const out = blank(std.width + hd.width + 12, Math.max(std.height, hd.height));
    for (const [img, ox] of [
      [std, 0],
      [hd, std.width + 12],
    ] as const)
      for (let y = 0; y < img.height; y++)
        for (let x = 0; x < img.width; x++) {
          const si = (y * img.width + x) * 4;
          const di = (y * out.width + x + ox) * 4;
          for (let k = 0; k < 4; k++) out.data[di + k] = img.data[si + k] ?? 0;
        }
    save('fire-compare', info, out);
  });
});
