// 1.9.3 (D-056) makalani previews, on demand (not part of the regular suite; playwright.config.ts
// ignores art-preview specs unless ART_PREVIEW=1):
//   ART_PREVIEW=1 npx playwright test tests/e2e/art-preview-makalani.spec.ts --project=desktop-chromium
// One profile at a time (desktop, Pixel 7, iPhone 14 landscape). Writes
// docs/art-preview/compare/makalani-<shot>-<device>.png (palette PNG ≤ 1600 px wide):
//   dusk: Saturday's Okavango (dusk light) at the east end of the pan: two palm groups by the
//     water with their reflections; dusk-before-after: the same view with ?palms=0 | with palms;
//     dusk-std-hd: the pair by the water, Standard | HD (the same pan: the sim's camera limit);
//   cluster: Monday's near palm at the west end, a 2× close-up of its crown and nut clusters;
//     cluster-std-hd: the same close-up, Standard | HD;
//   falling: a nut just cracked off (fibre bits, the spin blur);
//   juggle3: a nut at chain 3 in the air (the chain pop; ?makalaniPreview=juggle: easy air hits);
//   pop: a nut bursting into husk and ivory chips (?makalaniPreview=pop: every hit pops);
// A wanted shot that doesn't come within its bounded attempts fails the test.
//   far-can: a can from the Karoo's far fence mid-juggle (Wednesday).
// Everything that moves on a held frame runs on sim time (sway, ripple, bits, nuts, pops): each
// grab holds the sim (__TM_HOLD_AT__) or capture mode's freeze (F). On desktop the real mouse
// rests at the bottom centre, outside both edge-pan bands. Shots are in-page pointer events with a
// fresh pointerId each (makalaniHelpers.ts). Each test waits until the hunt runs in the wanted
// area before grabbing (a lazy area's first frames still show the title's Karoo).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import weaponsJson from '../../content/weapons.json' with { type: 'json' };
import birdsJson from '../../content/birds.json' with { type: 'json' };
import { blank, crop, decodePng, encodePng8, resize, type Rgba } from '../../tools/assets/image';
import { CAMERA_MAX_X, CAMERA_MIN_X } from '../../src/sim/world';
import { hook, isTouchProject, startHunt } from './helpers';
import { reloadIfEmpty } from './feesdaeHelpers';
import { shootThings, thingsInView, type ThingSource } from './makalaniHelpers';

const OUT = join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'compare');
const PROFILES = ['desktop-chromium', 'pixel7-landscape', 'iphone14-landscape'];
/** The device name of a project (a local Chromium stand-in for WebKit keeps the device's). */
const device = (name: string): string => name.replace(/-chromium-fallback$/, '');
const SAVE = 'tm.e2e.save.v1';
const COOLDOWN = (() => {
  const w = weaponsJson.weapons.find((x) => x.id === 'dubbelloop');
  const ms = w !== undefined && 'fireCooldownMs' in w ? w.fireCooldownMs : 300;
  return Math.ceil((ms * 60) / 1000) + 2;
})();
const PALMS = birdsJson.makalani.palms;

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }, info) => {
  test.skip(process.env['ART_PREVIEW'] !== '1', 'on demand: ART_PREVIEW=1');
  test.skip(!PROFILES.includes(device(info.project.name)), 'previews: desktop, Pixel 7, iPhone 14');
  // Software GL is slow, and HD packs have to land: up to 20 minutes each.
  test.setTimeout(1_200_000);
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
  writeFileSync(join(OUT, `makalani-${name}-${device(info.project.name)}.png`), encodePng8(out));
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

/** a | b side by side, a 12 px white gap. */
function sideBySide(a: Rgba, b: Rgba): Rgba {
  const w = Math.max(a.width, b.width);
  const h = Math.max(a.height, b.height);
  const out = blank(w * 2 + 12, h);
  out.data.fill(255);
  const put = (src: Rgba, left: number): void => {
    for (let y = 0; y < src.height; y++)
      for (let x = 0; x < src.width; x++) {
        const si = (y * src.width + x) * 4;
        const di = (y * out.width + left + x) * 4;
        for (let c = 0; c < 4; c++) out.data[di + c] = src.data[si + c] ?? 0;
      }
  };
  put(a, 0);
  put(b, w + 12);
  return out;
}

/** Desktop: the real mouse rests at the bottom centre, outside both edge-pan bands. */
async function park(page: Page, touch: boolean): Promise<void> {
  if (touch) return;
  const box = await page.locator('#game canvas').boundingBox();
  if (box !== null) await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.97);
}

/** Boots a hunt on `query` (Standard unless `graphics` says HD) and waits until it runs in
 *  `biome` with its own layers (HD: once HD textures are in). */
async function huntIn(page: Page, info: TestInfo, query: string, biome: string): Promise<void> {
  await page.goto(`/?e2e=1&feesdag=none&ftue=0&${query}`);
  await page.waitForFunction(() => window.__TM__?.ready === true, null, { timeout: 300_000 });
  const touch = isTouchProject(info);
  await startHunt(page, touch);
  if (query.includes('graphics=hd'))
    await page.waitForFunction(() => (window.__TM__?.graphics.hdTextures ?? 0) > 0, null, {
      timeout: 300_000,
    });
  const prefix = `layer:${biome.split('-')[0] ?? biome}/`;
  await page.waitForFunction(
    ([want, pre]) => {
      const tm = window.__TM__;
      const layers = (tm?.graphics.bounds ?? []).filter((b) => b.key.startsWith('layer:'));
      return (
        tm?.scene === 'hunt' &&
        tm.biome === want &&
        tm.menu !== 'hdLoading' &&
        tm.graphics.loading !== 'loading' &&
        layers.length > 0 &&
        layers.every((b) => b.key.startsWith(pre))
      );
    },
    [biome, prefix] as const,
    { timeout: 300_000 },
  );
  await park(page, touch);
}

/** Pans to one end of the panorama: until the camera is at the sim's limit there (the same x on
 *  every device and in every run). */
async function panToEnd(page: Page, touch: boolean, dir: -1 | 1): Promise<void> {
  const limit = dir < 0 ? CAMERA_MIN_X : CAMERA_MAX_X;
  const atEnd = async (): Promise<boolean> => Math.abs((await hook(page)).cameraX - limit) < 0.5;
  if (!touch) {
    const key = dir < 0 ? 'KeyA' : 'KeyD';
    await page.keyboard.down(key);
    for (let k = 0; k < 240 && !(await atEnd()); k++) await page.waitForTimeout(500);
    await page.keyboard.up(key);
  } else
    for (let k = 0; k < 80 && !(await atEnd()); k++) {
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
  await park(page, touch);
}

/** Holds the sim `after` ticks from now, then lets frames draw (everything moving is held). */
async function holdSoon(page: Page, touch: boolean, after: number): Promise<void> {
  const at = await page.evaluate((n) => {
    const t = (window.__TM__?.tick ?? 0) + n;
    (window as { __TM_HOLD_AT__?: (tick: number) => void }).__TM_HOLD_AT__?.(t);
    return t;
  }, after);
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t, at, { timeout: 120_000 });
  await page.waitForFunction(
    () => (window.__TM__?.nuts?.palms ?? [{ built: true }]).every((p) => p.built),
    null,
    { timeout: 60_000 },
  );
  await park(page, touch);
  await page.waitForTimeout(1500);
}

async function release(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as { __TM_HOLD_AT__?: (tick: number) => void }).__TM_HOLD_AT__?.(1e12);
  });
}

/** The canvas, its design width, and a design-px rect's crop of it. */
async function canvasShot(page: Page): Promise<{ img: Rgba; k: number }> {
  const img = decodePng(await page.locator('#game canvas').screenshot());
  const w = await page.evaluate(() => window.__TM__?.designWidth ?? 1920);
  return { img, k: img.width / w };
}

function cutRect(
  s: { img: Rgba; k: number },
  r: { x: number; y: number; w: number; h: number },
): Rgba {
  const x0 = Math.max(0, Math.round(r.x * s.k));
  const y0 = Math.max(0, Math.round(r.y * s.k));
  const x1 = Math.min(s.img.width, Math.round((r.x + r.w) * s.k));
  const y1 = Math.min(s.img.height, Math.round((r.y + r.h) * s.k));
  return crop(s.img, x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
}

/** A palm group's on-screen box (design px): from the hook's palm and its kind's shape. */
async function palmBox(
  page: Page,
  index: number,
  part: 'group' | 'crown',
): Promise<{ x: number; y: number; w: number; h: number } | null> {
  const p = await page.evaluate((i) => {
    const g = window.__TM__;
    const palm = g?.nuts?.palms[i];
    const nuts = (g?.nuts?.nuts ?? []).filter((n) => n.state === 'rest');
    return palm === undefined ? null : { ...palm, nutYs: nuts.map((n) => n.y) };
  }, index);
  if (p === null) return null;
  const kinds = Object.values(PALMS);
  const halfW = Math.max(...kinds.map((k) => k.halfW));
  const top = Math.max(...kinds.map((k) => k.top));
  const s = p.plane === 'near' ? 1 : 0.42;
  if (part === 'group')
    return { x: p.x - halfW * s, y: p.footY - top * s, w: 2 * halfW * s, h: top * s + 60 * s };
  const y0 = Math.min(...p.nutYs, p.footY - top * s) - 160 * s;
  return { x: p.x - halfW * s, y: Math.max(0, y0), w: 2 * halfW * s, h: 420 * s };
}

/** Shoots until `until`, reloading as needed; true when it got there. */
async function shootUntil(
  page: Page,
  touch: boolean,
  source: ThingSource,
  until: 'knock' | 'juggle' | 'pop' | number,
  plane?: 'near' | 'mid',
): Promise<boolean> {
  const goal = (log: readonly string[], best: number): boolean =>
    typeof until === 'number'
      ? best >= until
      : until === 'pop'
        ? log.some((e) => e.startsWith('nut-pop'))
        : log.some((e) => e.startsWith(source === 'nuts' ? `nut-${until}` : until));
  // Bounded (review M14): at most 6 rounds of ≤ 60 s / 1 500 frames each, well inside a test.
  for (let i = 0; i < 6; i++) {
    const run = await shootThings(page, touch, source, until, COOLDOWN, {
      ...(plane === undefined ? {} : { plane }),
      holdOnDone: true,
      budgetMs: 60_000,
      maxFrames: 1500,
    });
    const h = await hook(page);
    const best = source === 'nuts' ? (h.nuts?.bestChain ?? 0) : (h.farCans?.bestChain ?? 0);
    if (goal(run.log, best)) return true;
    await release(page);
    if (run.empty) await reloadIfEmpty(page, touch);
  }
  return false;
}

test('palms by the water at dusk, with reflections; before | after; Standard | HD', async ({
  page,
}, info) => {
  const touch = isTouchProject(info);
  const grabs = new Map<string, { img: Rgba; k: number }>();
  let rect: { x: number; y: number; w: number; h: number } | null = null;
  for (const [mode, extra] of [
    ['before', '&palms=0&graphics=standard'],
    ['after', '&graphics=standard'],
    ['hd', '&graphics=hd'],
  ] as const) {
    await huntIn(
      page,
      info,
      `biome=okavango-spring&layout=sat&seed=42&huntSeconds=600&birds=0${extra}`,
      'okavango-spring',
    );
    await panToEnd(page, touch, 1);
    await holdSoon(page, touch, 2);
    const s = await canvasShot(page);
    grabs.set(mode, s);
    if (mode === 'after') {
      save('dusk', info, s.img);
      rect = await palmBox(page, 0, 'group');
    }
    await release(page);
  }
  const before = grabs.get('before');
  const after = grabs.get('after');
  const hd = grabs.get('hd');
  if (before !== undefined && after !== undefined)
    save('dusk-before-after', info, sideBySide(before.img, after.img));
  if (after !== undefined && hd !== undefined && rect !== null)
    save('dusk-std-hd', info, sideBySide(cutRect(after, rect), cutRect(hd, rect)));
});

test('a nut cluster close-up (Monday near palm), Standard | HD', async ({ page }, info) => {
  const touch = isTouchProject(info);
  const cuts: Rgba[] = [];
  for (const mode of ['standard', 'hd'] as const) {
    await huntIn(
      page,
      info,
      `biome=okavango-spring&layout=mon&seed=42&huntSeconds=600&birds=0&graphics=${mode}`,
      'okavango-spring',
    );
    await panToEnd(page, touch, -1);
    await holdSoon(page, touch, 2);
    const s = await canvasShot(page);
    const near = await page.evaluate(() =>
      (window.__TM__?.nuts?.palms ?? []).findIndex((p) => p.plane === 'near'),
    );
    const box = await palmBox(page, Math.max(0, near), 'crown');
    if (box !== null) {
      const c = cutRect(s, box);
      cuts.push(c);
      if (mode === 'standard') {
        save('cluster', info, scaled(c, Math.max(2, Math.min(4, Math.floor(1600 / c.width)))));
        save('cluster-view', info, s.img);
      }
    }
    await release(page);
  }
  const [a, b] = cuts;
  if (a !== undefined && b !== undefined) save('cluster-std-hd', info, sideBySide(a, b));
});

/** A Monday Okavango hunt with the near palm in view (`preview`: ?makalaniPreview, review M14). */
async function nearPalmHunt(page: Page, info: TestInfo, preview = ''): Promise<void> {
  await huntIn(
    page,
    info,
    `biome=okavango-spring&layout=mon&seed=42&huntSeconds=600&birds=0&graphics=standard${preview}`,
    'okavango-spring',
  );
  await thingsInView(page, 'nuts', 'near');
}

test('a nut falling', async ({ page }, info) => {
  const touch = isTouchProject(info);
  await nearPalmHunt(page, info);
  // A few ticks after the crack-off (fibre bits out, the nut spinning down).
  expect(await shootUntil(page, touch, 'nuts', 'knock', 'near'), 'a crack-off').toBe(true);
  await release(page);
  await holdSoon(page, touch, 8);
  save('falling', info, (await canvasShot(page)).img);
});

test('a juggle at chain 3', async ({ page }, info) => {
  const touch = isTouchProject(info);
  // Test builds only: a nut in the air is easy to hit (× 6 its radius), so chain 3 comes in a
  // few shots; one shot an arc at its top, as before.
  await nearPalmHunt(page, info, '&makalaniPreview=juggle');
  expect(await shootUntil(page, touch, 'nuts', 3, 'near'), 'a chain of 3').toBe(true);
  await holdSoon(page, touch, 0);
  save('juggle3', info, (await canvasShot(page)).img);
});

test('a pop', async ({ page }, info) => {
  const touch = isTouchProject(info);
  // Test builds only: every gun pops a nut it hits (as a rifle does).
  await nearPalmHunt(page, info, '&makalaniPreview=pop');
  expect(await shootUntil(page, touch, 'nuts', 'pop', 'near'), 'a pop').toBe(true);
  await holdSoon(page, touch, 3);
  save('pop', info, (await canvasShot(page)).img);
});

test('a far-fence can mid-juggle (Karoo Wednesday)', async ({ page }, info) => {
  const touch = isTouchProject(info);
  await huntIn(
    page,
    info,
    'biome=karoo-autumn&layout=wed&seed=42&huntSeconds=600&birds=0&graphics=standard',
    'karoo-autumn',
  );
  await thingsInView(page, 'farCans');
  expect(await shootUntil(page, touch, 'farCans', 'knock'), 'a far can knocked off').toBe(true);
  {
    await release(page);
    await holdSoon(page, touch, 6);
    const s = await canvasShot(page);
    save('far-can', info, s.img);
    const box = await page.evaluate(() => {
      const sp = window.__TM__?.farCans?.spots ?? [];
      const xs = sp.map((c) => c.x);
      const ys = sp.map((c) => c.y);
      return xs.length === 0
        ? null
        : {
            x: Math.min(...xs) - 160,
            y: Math.min(...ys) - 160,
            w: Math.max(...xs) - Math.min(...xs) + 320,
            h: Math.max(...ys) - Math.min(...ys) + 260,
          };
    });
    if (box !== null) save('far-can-closeup', info, scaled(cutRect(s, box), 2));
  }
});
