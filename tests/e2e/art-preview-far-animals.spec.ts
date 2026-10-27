// D-054 far animals previews, on demand (not part of the regular suite):
//   ART_PREVIEW=1 npx playwright test tests/e2e/art-preview-far-animals.spec.ts --project=desktop-chromium
// One profile at a time (desktop at 2560 × 1440, Pixel 7, iPhone 14 landscape). Writes
// docs/art-preview/compare/fauna-<shot>-<device>.png:
//   <herd>-before-after: each herd before (v1.9.0's art: ?fauna=before, the images in
//     tests/fixtures/fauna-before, served by vite.config.ts) | after, Standard, side by side;
//   <herd>-std-hd: Standard | HD (?graphics=standard / ?graphics=hd), same pan;
//   wide-<biome>-{before,after}: the whole view at normal zoom, Standard, at the hunt's start.
// Every pair comes from the same pan position (the panorama's start and its two ends, the ends
// at the sim's camera limits; the grab is picked from the "after"/Standard run and used for
// both, camera x checked equal), held with capture mode's freeze (?capture=1: no HUD; F freezes
// sim time, so the animals' idle motion holds too). On desktop the real mouse rests at the
// bottom centre, outside both edge-pan bands. Each hunt waits until it runs in the wanted area
// (a lazy area's first frames show the title's Karoo behind the veil) and until every herd of
// the area is drawn (the Karoo's sheets come with the late group).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { blank, decodePng, encodePng8, resize, type Rgba } from '../../tools/assets/image';
import { FAUNA_HERDS } from '../../src/game/view/faunaHerds';
import { CAMERA_MAX_X, CAMERA_MIN_X } from '../../src/sim/world';
import { hook, isTouchProject, startHunt } from './helpers';

const OUT = join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'compare');
const PROFILES = ['desktop-chromium', 'pixel7-landscape', 'iphone14-landscape'];
/** The device name of a project (a local Chromium stand-in for WebKit keeps the device's). */
const device = (name: string): string => name.replace(/-chromium-fallback$/, '');
const SAVE = 'tm.e2e.save.v1';
const BIOMES = Object.keys(FAUNA_HERDS);

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }, info) => {
  test.skip(process.env['ART_PREVIEW'] !== '1', 'on demand: ART_PREVIEW=1');
  test.skip(!PROFILES.includes(device(info.project.name)), 'previews: desktop, Pixel 7, iPhone 14');
  // Software GL is slow, and HD packs have to land: up to 20 minutes each.
  test.setTimeout(1_200_000);
  // The large desktop screen HD is made for.
  if (device(info.project.name) === 'desktop-chromium')
    await page.setViewportSize({ width: 2560, height: 1440 });
});

function save(name: string, info: TestInfo, img: Rgba): void {
  mkdirSync(OUT, { recursive: true });
  let out = img;
  if (out.width > 2400) out = resize(out, 2400, Math.round((out.height * 2400) / out.width));
  writeFileSync(join(OUT, `fauna-${name}-${device(info.project.name)}.png`), encodePng8(out));
}

/** A returning player's save (quality high: the render scale is 1 on every profile). */
async function seed(page: Page): Promise<void> {
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
}

/** Desktop: the real mouse rests at the bottom centre, outside both edge-pan bands. */
async function park(page: Page, touch: boolean): Promise<void> {
  if (touch) return;
  const box = await page.locator('#game canvas').boundingBox();
  if (box !== null) await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.97);
}

/** Pans to one end of the panorama: until the camera is at the sim's limit there. */
async function pan(page: Page, touch: boolean, dir: -1 | 1): Promise<void> {
  const limit = dir < 0 ? CAMERA_MIN_X : CAMERA_MAX_X;
  const atEnd = async (): Promise<boolean> => Math.abs((await hook(page)).cameraX - limit) < 0.5;
  if (!touch) {
    const key = dir < 0 ? 'KeyA' : 'KeyD';
    await page.keyboard.down(key);
    for (let k = 0; k < 240 && !(await atEnd()); k++) await page.waitForTimeout(500);
    await page.keyboard.up(key);
    await park(page, touch);
    if (!(await atEnd()))
      throw new Error(`pan: camera ${(await hook(page)).cameraX}, not ${limit}`);
    return;
  }
  // Touch: repeated in-page drags (a fresh pointerId each) until the camera is at the limit.
  for (let k = 0; k < 80; k++) {
    if (await atEnd()) return;
    await page.evaluate(
      ([d, id]) => {
        const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
        if (!canvas) throw new Error('no game');
        const r = canvas.getBoundingClientRect();
        const y = r.top + r.height * 0.5;
        const ev = (type: string, x: number): PointerEvent =>
          new PointerEvent(type, {
            clientX: x,
            clientY: y,
            pointerId: id,
            pointerType: 'touch',
            isPrimary: true,
            buttons: type === 'pointerup' ? 0 : 1,
            bubbles: true,
            cancelable: true,
          });
        const from = r.left + r.width * (d < 0 ? 0.2 : 0.8);
        const to = r.left + r.width * (d < 0 ? 0.8 : 0.2);
        canvas.dispatchEvent(ev('pointerdown', from));
        for (let i = 1; i <= 10; i++)
          canvas.dispatchEvent(ev('pointermove', from + ((to - from) * i) / 10));
        canvas.dispatchEvent(ev('pointerup', to));
      },
      [dir, 900 + k] as const,
    );
    await page.waitForTimeout(600);
  }
  if (!(await atEnd())) throw new Error(`pan: camera ${(await hook(page)).cameraX}, not ${limit}`);
}

/** Capture mode's freeze (F) on or off, waiting for it to show in the hook. */
async function freeze(page: Page, on: boolean): Promise<void> {
  await page.keyboard.press('KeyF');
  await page.waitForFunction((want) => window.__TM__?.capture?.frozen === want, on, {
    timeout: 30_000,
  });
}

interface Grab {
  img: Rgba;
  cameraX: number;
  /** Device px per design px, and the canvas's top-left in device px. */
  k: number;
  ox: number;
  oy: number;
  bounds: { key: string; x: number; y: number; w: number; h: number; hd: boolean }[];
}

async function grab(page: Page): Promise<Grab> {
  await page.waitForTimeout(800);
  const h = await hook(page);
  const box = await page.locator('#game canvas').boundingBox();
  if (box === null) throw new Error('no canvas');
  const img = decodePng(await page.screenshot());
  const css = page.viewportSize()?.width ?? img.width;
  const dpr = img.width / css;
  return {
    img,
    cameraX: h.cameraX,
    k: (box.height / h.designHeight) * dpr,
    ox: box.x * dpr,
    oy: box.y * dpr,
    bounds: h.graphics.bounds,
  };
}

type Box = { x: number; y: number; w: number; h: number };

/** The device-px crop of a design rect (padded), clamped to the image. */
function cut(g: Grab, r: Box, pad = 24): Rgba {
  const x0 = Math.max(0, Math.floor(g.ox + (r.x - pad) * g.k));
  const y0 = Math.max(0, Math.floor(g.oy + (r.y - pad) * g.k));
  const x1 = Math.min(g.img.width, Math.ceil(g.ox + (r.x + r.w + pad) * g.k));
  const y1 = Math.min(g.img.height, Math.ceil(g.oy + (r.y + r.h + pad) * g.k));
  const out = blank(Math.max(1, x1 - x0), Math.max(1, y1 - y0));
  for (let y = 0; y < out.height; y++)
    for (let x = 0; x < out.width; x++) {
      const si = ((y0 + y) * g.img.width + (x0 + x)) * 4;
      const di = (y * out.width + x) * 4;
      for (let c = 0; c < 4; c++) out.data[di + c] = g.img.data[si + c] ?? 0;
    }
  return out;
}

/** Two crops side by side (n× nearest-neighbour), a 12 px white gap. */
function sideBySide(a: Rgba, b: Rgba, n: number): Rgba {
  const w = Math.max(a.width, b.width);
  const h = Math.max(a.height, b.height);
  const out = blank((w * 2 + 12) * n, h * n);
  out.data.fill(255);
  const put = (src: Rgba, left: number): void => {
    for (let y = 0; y < src.height * n; y++)
      for (let x = 0; x < src.width * n; x++) {
        const si = (Math.floor(y / n) * src.width + Math.floor(x / n)) * 4;
        const di = (y * out.width + left * n + x) * 4;
        for (let c = 0; c < 4; c++) out.data[di + c] = src.data[si + c] ?? 0;
      }
  };
  put(a, 0);
  put(b, w + 12);
  return out;
}

/** Boots a capture-mode hunt in `biome` (`extra`: graphics and the before flag). */
async function huntIn(page: Page, info: TestInfo, biome: string, extra: string): Promise<void> {
  // Namibië's waterhole stands on the Ver strip, which its weekday maps open.
  const layout = biome === 'namibie' ? 'mon' : 'none';
  await page.goto(
    `/?e2e=1&capture=1&biome=${biome}&layout=${layout}&feesdag=none&seed=3&huntSeconds=600&ftue=0${extra}`,
  );
  await page.waitForFunction(() => window.__TM__?.ready === true, null, { timeout: 300_000 });
  await startHunt(page, isTouchProject(info));
  if (extra.includes('graphics=hd'))
    await page.waitForFunction(() => (window.__TM__?.graphics.hdTextures ?? 0) > 0, null, {
      timeout: 300_000,
    });
  const herds = (FAUNA_HERDS[biome] ?? []).map((h) => h.key);
  const prefix = `layer:${biome.split('-')[0] ?? biome}/`;
  await page.waitForFunction(
    ([want, pre, keys]) => {
      const tm = window.__TM__;
      const b = tm?.graphics.bounds ?? [];
      const layers = b.filter((x) => x.key.startsWith('layer:'));
      return (
        tm?.scene === 'hunt' &&
        tm.biome === want &&
        tm.menu !== 'hdLoading' &&
        tm.graphics.loading !== 'loading' &&
        layers.length > 0 &&
        layers.every((x) => x.key.startsWith(pre)) &&
        // Every herd drawn (late and Ver sheets land after the hunt starts).
        keys.every((k) => b.some((x) => x.key === k && x.w > 0))
      );
    },
    [biome, prefix, herds] as const,
    { timeout: 300_000 },
  );
  await park(page, isTouchProject(info));
}

/** Grabs at the panorama's start, left end and right end (sim time frozen for each). */
async function panorama(page: Page, info: TestInfo): Promise<Grab[]> {
  const touch = isTouchProject(info);
  const out: Grab[] = [];
  for (const dir of [0, -1, 1] as const) {
    if (dir !== 0) await pan(page, touch, dir);
    await freeze(page, true);
    out.push(await grab(page));
    await freeze(page, false);
  }
  return out;
}

/** The grab that shows most of `key`'s box (on screen, design px), or -1. */
function bestGrab(grabs: readonly Grab[], key: string): number {
  let best = -1;
  let area = 0;
  grabs.forEach((g, i) => {
    const b = g.bounds.find((x) => x.key === key);
    if (b === undefined) return;
    const sw = (g.img.width - 2 * g.ox) / g.k;
    const w = Math.min(sw, b.x + b.w) - Math.max(0, b.x);
    if (w > 0 && w * b.h > area) {
      area = w * b.h;
      best = i;
    }
  });
  return best;
}

/** The union of two boxes (before and after art differ in size). */
function union(a: Box | undefined, b: Box | undefined): Box | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/** Same pan in both runs: camera x per grab. */
function samePan(a: readonly Grab[], b: readonly Grab[]): void {
  a.forEach((g, i) => {
    expect(b[i]?.cameraX ?? NaN, `grab ${i}: camera x`).toBeCloseTo(g.cameraX, 3);
  });
}

/** Saves each herd's pair from two runs (`first` | `second`); returns how many were saved. */
function pairs(
  biome: string,
  info: TestInfo,
  first: readonly Grab[],
  second: readonly Grab[],
  tag: string,
): number {
  let saved = 0;
  for (const h of FAUNA_HERDS[biome] ?? []) {
    // Picked from the second run (the new art) and used for both: one pan, one background.
    const i = bestGrab(second, h.key);
    const a = first[i];
    const b = second[i];
    if (i < 0 || a === undefined || b === undefined) continue;
    const box = union(
      a.bounds.find((x) => x.key === h.key),
      b.bounds.find((x) => x.key === h.key),
    );
    if (box === undefined) continue;
    const ca = cut(a, box);
    const cb = cut(b, box);
    // Small herds at 2× so the pixels show.
    const n = ca.width < 400 ? 2 : 1;
    save(`${h.key.replace('fauna/', '')}-${tag}`, info, sideBySide(ca, cb, n));
    saved++;
  }
  return saved;
}

for (const biome of BIOMES)
  test(`before | after and wide shots: ${biome}`, async ({ page }, info) => {
    await seed(page);
    await huntIn(page, info, biome, '&graphics=standard&fauna=before');
    const before = await panorama(page, info);
    await huntIn(page, info, biome, '&graphics=standard');
    const after = await panorama(page, info);
    samePan(after, before);
    const w0 = before[0];
    const w1 = after[0];
    if (w0 !== undefined) save(`wide-${biome}-before`, info, w0.img);
    if (w1 !== undefined) save(`wide-${biome}-after`, info, w1.img);
    expect(pairs(biome, info, before, after, 'before-after')).toBeGreaterThan(0);
  });

for (const biome of BIOMES)
  test(`Standard | HD: ${biome}`, async ({ page }, info) => {
    await seed(page);
    await huntIn(page, info, biome, '&graphics=standard');
    const std = await panorama(page, info);
    await huntIn(page, info, biome, '&graphics=hd');
    const hd = await panorama(page, info);
    samePan(std, hd);
    // Every far animal draws its HD twin in HD, and Standard art in Standard.
    const herds = (FAUNA_HERDS[biome] ?? []).map((h) => h.key);
    const shows = (g: Grab | undefined, k: string): boolean | undefined =>
      g?.bounds.find((x) => x.key === k)?.hd;
    for (const k of herds) {
      expect(shows(std[0], k), `${k} Standard`).toBe(false);
      expect(shows(hd[0], k), `${k} HD`).toBe(true);
    }
    expect(pairs(biome, info, std, hd, 'std-hd')).toBeGreaterThan(0);
  });
