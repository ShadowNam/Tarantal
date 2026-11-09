// v1.17b (D-080) "every animal at true size" previews, on demand (not part of the regular suite:
// playwright.config.ts ignores art-preview specs unless ART_PREVIEW=1):
//   ART_PREVIEW=1 npx playwright test tests/e2e/art-preview-sizes.spec.ts --project=desktop-chromium
// One profile at a time (desktop, Pixel 7, iPhone 14 landscape). Three boots per device (1 and 3 Standard, 2 HD):
//   1. areas    the Karoo, then the Bushveld, the Kalahari and the Okavango from the title's area
//               picker, then Namibië (one boot): each area's far herd; in the Karoo also Brakkie, a cameo (the
//               ostrich or the tortoise), a baboon raider and the bakkie;
//   2. namibie  in HD: the far herd (with boot 1's Standard crop: a Standard | HD pair; the herds
//               are Standard in HD), the ostrich pair (mid plane) and the gemsbok cameo;
//   3. harvest  the warthogs (and piglets), the workers at the true-size fence, in Die Oes.
// Every subject gets a yardstick: a standing guineafowl drawn on its plane at that plane's size
// (the test-build hook __TM_RULERS__, view only), its feet beside the subject's. Crops are cut
// round each subject's SCREEN position (from the hooks) and its yardstick. Each grab holds the sim
// (__TM_HOLD_AT__) on a fresh frame; the far herds are still (?faunaIdle=0); pans are bounded and
// overshoot-tolerant (lesson 15). Every wait is bounded and a missing shot fails the test.
// Writes docs/art-preview/compare/v117b-sizes-<shot>-<device>.png (2× crops) and -full frames.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page, type TestInfo } from '@playwright/test';
import { blank, crop, decodePng, encodePng8, resize, type Rgba } from '../../tools/assets/image';
import { hook, isTouchProject, tapRect } from './helpers';

const OUT = join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'compare');
const PROFILES = ['desktop-chromium', 'pixel7-landscape', 'iphone14-landscape'];
const device = (name: string): string => name.replace(/-chromium-fallback$/, '');
const SAVE = 'tm.e2e.save.v1';
const AREAS = ['karoo-autumn', 'bushveld-winter', 'kalahari-summer', 'okavango-spring'] as const;
const FLAGS =
  'e2e=1&feesdag=none&ftue=0&seed=42&omen=0&reenbui=0&faunaIdle=0&graphics=standard' +
  '&brakkie=1&cameos=1&cameoPreview=all&baboonRaid=any';

type Plane = 'near' | 'mid' | 'far';
type Rect = { x: number; y: number; w: number; h: number };
interface Ruler {
  readonly plane: Plane;
  readonly sx: number;
  readonly sy: number;
}
interface Spot {
  readonly x: number;
  readonly y: number;
  readonly visible: boolean;
}
type Hooked = {
  __TM__?: {
    tick: number;
    scene: string;
    biome: string;
    designWidth: number;
    designHeight: number;
    sceneryFrames: number;
    fauna: { herd: string; part: string; box: Rect }[];
    brakkie?: (Spot & { phase: string; carrying: boolean }) | null;
    baboons?: (Spot & { role: string; groundY: number | null })[] | null;
    cameos?: {
      visits: { kind: string; plane: string; members: (Spot & { groundY: number })[] }[];
    } | null;
    namibLife?: { ostriches: { x: number; y: number; h: number }[] } | null;
    harvestActors?: (Spot & { role: string; groundY: number })[] | null;
    graphics: { bounds: { key: string; x: number; y: number; w: number; h: number }[] };
  };
  __TM_HOLD_AT__?: (tick: number) => void;
  __TM_RULERS__?: (r: readonly Ruler[]) => void;
};

/** The guineafowl's standing height at plane scale 1 (tools/sizes.ts GUINEAFOWL_STANDING_PX) and
 *  the planes' scales (content/scoring.json): the crop's room for the yardstick. */
const BIRD_PX = 263;
const PLANE_SCALE: Readonly<Record<Plane, number>> = { near: 1, mid: 0.42, far: 0.15 };
/** The mid layer's scroll factor (content/scoring.json planes.mid.scrollFactor). */
const MID_SCROLL = 0.6;

test.use({ serviceWorkers: 'block' });
test.describe.configure({ mode: 'serial' });
test.beforeEach(async ({ page }, info) => {
  test.skip(process.env['ART_PREVIEW'] !== '1', 'on demand: ART_PREVIEW=1');
  test.skip(!PROFILES.includes(device(info.project.name)), 'previews: desktop, Pixel 7, iPhone 14');
  test.setTimeout(2_400_000);
  await page.addInitScript(
    ([key, all]) => {
      if (localStorage.getItem(key) !== null) return;
      localStorage.setItem(
        key,
        JSON.stringify({
          v: 1,
          settings: { quality: 'high' },
          ftue: { done: true, skipped: false, step: '' },
          areas: { unlocked: all, classic: all[0] },
          barks: { lastHuntDay: Math.floor(Date.now() / 86_400_000) },
        }),
      );
    },
    [SAVE, [...AREAS, 'namibie']] as const,
  );
});

function save(name: string, info: TestInfo, img: Rgba): void {
  mkdirSync(OUT, { recursive: true });
  let out = img;
  if (out.width > 1600) out = resize(out, 1600, Math.round((out.height * 1600) / out.width));
  writeFileSync(join(OUT, `v117b-sizes-${name}-${device(info.project.name)}.png`), encodePng8(out));
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

const tm = (page: Page): Promise<NonNullable<Hooked['__TM__']>> =>
  page.evaluate(() => {
    const h = (window as unknown as Hooked).__TM__;
    if (h === undefined) throw new Error('no hook');
    return h;
  });

async function park(page: Page, touch: boolean): Promise<void> {
  if (touch) return;
  const box = await page.locator('#game canvas').boundingBox();
  if (box !== null) await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.97);
}

/** A fresh frame after a hold or a ruler change (the scenery's frame counter moves on). */
async function fresh(page: Page, touch: boolean): Promise<void> {
  await park(page, touch);
  const f0 = await page.evaluate(() => window.__TM__?.sceneryFrames ?? 0);
  await page.waitForFunction((f) => (window.__TM__?.sceneryFrames ?? 0) > f + 3, f0, {
    timeout: 120_000,
  });
  await page.waitForTimeout(800);
}

async function hold(page: Page, touch: boolean): Promise<void> {
  const at = (await hook(page)).tick + 2;
  await page.evaluate((t) => {
    (window as unknown as Hooked).__TM_HOLD_AT__?.(t);
  }, at);
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t, at, { timeout: 600_000 });
  await fresh(page, touch);
}

async function release(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as Hooked;
    w.__TM_RULERS__?.([]);
    w.__TM_HOLD_AT__?.(1e12);
  });
}

type Pick = 'raider' | 'cameo' | 'dog' | 'gemsbok' | 'warthog' | 'piglet' | 'worker';

/**
 * Holds the first tick (within `ticks`) on which the subject `what` is in view, clear of the
 * screen's edges (and Brakkie of the gun's column); returns it. Past `ticks` it throws, unless
 * `optional` (then null).
 */
async function holdWhen<T>(
  page: Page,
  touch: boolean,
  what: Pick,
  ticks: number,
  optional = false,
): Promise<T | null> {
  const from = (await hook(page)).tick;
  const handle = await page.waitForFunction(
    ([kind, until, opt]) => {
      const w = window as unknown as Hooked;
      const t = w.__TM__;
      const tick = t?.tick ?? 0;
      if (tick > until) {
        if (opt) return { none: true };
        throw new Error(`no ${kind} in view by tick ${until}`);
      }
      if (t === undefined) return null;
      const W = t.designWidth;
      const inView = (x: number, m: number): boolean => x > m && x < W - m;
      let found: unknown = null;
      if (kind === 'raider')
        found =
          (t.baboons ?? []).find((b) => b.role === 'raider' && b.visible && inView(b.x, 200)) ??
          null;
      else if (kind === 'cameo') {
        for (const v of t.cameos?.visits ?? []) {
          const m = v.members.find((x) => x.visible && inView(x.x, 200));
          if (m !== undefined && found === null) found = { kind: v.kind, plane: v.plane, m };
        }
      } else if (kind === 'gemsbok') {
        const v = (t.cameos?.visits ?? []).find((x) => x.kind === 'gemsbok');
        found = v?.members.find((x) => x.visible && inView(x.x, 300)) ?? null;
      } else if (kind === 'dog') {
        const d = t.brakkie;
        found =
          d !== null &&
          d !== undefined &&
          d.visible &&
          inView(d.x, 260) &&
          !(d.x > 760 && d.x < 1400)
            ? d
            : null;
      } else
        found =
          (t.harvestActors ?? []).find(
            (a) => a.role === kind && a.visible && inView(a.x, kind === 'piglet' ? 300 : 360),
          ) ?? null;
      if (found === null) return null;
      w.__TM_HOLD_AT__?.(tick + 1);
      return { none: false, found };
    },
    [what, from + ticks, optional] as const,
    { timeout: 900_000, polling: 'raf' },
  );
  const out = (await handle.jsonValue()) as { none: boolean; found?: T };
  if (out.none || out.found === undefined) return null;
  await fresh(page, touch);
  return out.found;
}

/** holdWhen for a subject the shot must have. */
async function mustHold<T>(page: Page, touch: boolean, what: Pick, ticks: number): Promise<T> {
  const r = await holdWhen<T>(page, touch, what, ticks);
  if (r === null) throw new Error(`no ${what}`);
  return r;
}

/** Puts up the yardsticks, waits a fresh frame, grabs, saves the full frame and the crop. */
async function shot(
  page: Page,
  info: TestInfo,
  touch: boolean,
  name: string,
  rulers: readonly Ruler[],
  subject: Rect,
): Promise<Rgba> {
  await page.evaluate((r) => {
    (window as unknown as Hooked).__TM_RULERS__?.(r);
  }, rulers);
  await fresh(page, touch);
  const img = decodePng(await page.locator('#game canvas').screenshot());
  const h = await tm(page);
  const k = img.height / h.designHeight;
  save(`${name}-full`, info, img);
  // The subject and every yardstick (feet at sy, standing BIRD_PX × the plane's scale tall).
  let x0 = subject.x;
  let y0 = subject.y;
  let x1 = subject.x + subject.w;
  let y1 = subject.y + subject.h;
  for (const r of rulers) {
    const bh = BIRD_PX * PLANE_SCALE[r.plane];
    x0 = Math.min(x0, r.sx - bh * 0.6);
    x1 = Math.max(x1, r.sx + bh * 0.6);
    y0 = Math.min(y0, r.sy - bh);
    y1 = Math.max(y1, r.sy + 4);
  }
  const pad = 30;
  const cx0 = Math.max(0, Math.round((x0 - pad) * k));
  const cy0 = Math.max(0, Math.round((y0 - pad) * k));
  const cx1 = Math.min(img.width, Math.round((x1 + pad) * k));
  const cy1 = Math.min(img.height, Math.round((y1 + pad) * k));
  if (cx1 - cx0 < 16 || cy1 - cy0 < 16) throw new Error(`shot ${name}: its crop is off the canvas`);
  const c = crop(img, cx0, cy0, cx1 - cx0, cy1 - cy0);
  save(name, info, c.width < 700 ? scaled(c, 2) : c);
  await page.evaluate(() => {
    (window as unknown as Hooked).__TM_RULERS__?.([]);
  });
  return c;
}

const fileOf = (name: string, info: TestInfo): string =>
  join(OUT, `v117b-sizes-${name}-${device(info.project.name)}.png`);

/** Two crops side by side (Standard | HD), white between. */
function sideBySide(a: Rgba, b: Rgba): Rgba {
  const out = blank(a.width + b.width + 12, Math.max(a.height, b.height));
  out.data.fill(255);
  for (const [src, left] of [
    [a, 0],
    [b, a.width + 12],
  ] as const)
    for (let y = 0; y < src.height; y++)
      for (let x = 0; x < src.width; x++) {
        const si = (y * src.width + x) * 4;
        const di = (y * out.width + left + x) * 4;
        for (let c = 0; c < 4; c++) out.data[di + c] = src.data[si + c] ?? 0;
      }
  return out;
}

/** Pans (A/D, short presses; bounded, overshoot-tolerant) until `where()` is near the middle. */
async function panToX(
  page: Page,
  touch: boolean,
  where: () => Promise<number | null>,
): Promise<void> {
  let prev: number | null = null;
  const w = (await tm(page)).designWidth;
  for (let k = 0; k < 160; k++) {
    const x = await where();
    const o = x === null ? null : x - w / 2;
    if (o !== null && Math.abs(o) <= 120) break;
    if (
      o !== null &&
      prev !== null &&
      (Math.sign(o) !== Math.sign(prev) || Math.abs(o - prev) < 2) &&
      Math.abs(o) <= w / 2 - 200
    )
      break;
    prev = o;
    const dir = o === null || o > 0 ? 'KeyD' : 'KeyA';
    await page.keyboard.down(dir);
    await page.waitForTimeout(o === null || Math.abs(o) > 500 ? 400 : 120);
    await page.keyboard.up(dir);
  }
  const x = await where();
  if (x === null || x < 100 || x > w - 100) throw new Error(`pan: off screen (${String(x)})`);
  await park(page, touch);
}

/** The on-screen far herd nearest the middle (the union of its parts), or null. */
const herdBox = (page: Page): Promise<Rect | null> =>
  page.evaluate(() => {
    const t = (window as unknown as Hooked).__TM__;
    const c = (t?.designWidth ?? 1920) / 2;
    const by = new Map<string, Rect>();
    for (const f of t?.fauna ?? []) {
      const b = by.get(f.herd);
      const r = f.box;
      by.set(
        f.herd,
        b === undefined
          ? { ...r }
          : {
              x: Math.min(b.x, r.x),
              y: Math.min(b.y, r.y),
              w: Math.max(b.x + b.w, r.x + r.w) - Math.min(b.x, r.x),
              h: Math.max(b.y + b.h, r.y + r.h) - Math.min(b.y, r.y),
            },
      );
    }
    const all = [...by.values()].sort(
      (a, b) => Math.abs(a.x + a.w / 2 - c) - Math.abs(b.x + b.w / 2 - c),
    );
    return all[0] ?? null;
  });

/** The far herd nearest the view's middle, with a far guineafowl beside it. */
async function herdShot(page: Page, info: TestInfo, touch: boolean, name: string): Promise<Rgba> {
  for (let k = 0; k < 16 && (await herdBox(page)) === null; k++) {
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(400);
    await page.keyboard.up('KeyD');
  }
  await panToX(page, touch, async () => {
    const b = await herdBox(page);
    return b === null ? null : b.x + b.w / 2;
  });
  await hold(page, touch);
  const b = await herdBox(page);
  if (b === null) throw new Error(`${name}: no far herd on screen`);
  // Two far guineafowl at the herd's feet line, one each side.
  const feet = b.y + b.h;
  const c = await shot(
    page,
    info,
    touch,
    name,
    [
      { plane: 'far', sx: b.x - 24, sy: feet },
      { plane: 'far', sx: b.x + b.w + 24, sy: feet },
    ],
    b,
  );
  await release(page);
  return c;
}

/** Into the hunt (from the title) and its views up. */
async function intoHunt(page: Page, touch: boolean, biome: string): Promise<void> {
  await page.waitForFunction(() => window.__TM__?.rects['start'] !== undefined, null, {
    timeout: 600_000,
  });
  await tapRect(page, touch, 'start');
  await page.waitForFunction(
    (b) => {
      const t = window.__TM__;
      return (
        t?.scene === 'hunt' &&
        t.biome === b &&
        t.menu !== 'hdLoading' &&
        t.graphics.loading !== 'loading' &&
        t.graphics.bounds.some((x) => x.key.startsWith('layer:'))
      );
    },
    biome,
    { timeout: 900_000 },
  );
  await park(page, touch);
}

/** Lets the hunt run out, then back to the title. */
async function toTitle(page: Page, touch: boolean): Promise<void> {
  await release(page);
  await page.waitForFunction(() => window.__TM__?.scene === 'tally', null, { timeout: 900_000 });
  await page.waitForFunction(() => window.__TM__?.rects['menu'] !== undefined, null, {
    timeout: 300_000,
  });
  await tapRect(page, touch, 'menu');
  await page.waitForFunction(() => window.__TM__?.scene === 'start', null, { timeout: 300_000 });
}

async function pickArea(page: Page, touch: boolean, id: string): Promise<void> {
  await page.waitForFunction(() => window.__TM__?.rects['area'] !== undefined, null, {
    timeout: 120_000,
  });
  await tapRect(page, touch, 'area');
  await page.waitForFunction(() => window.__TM__?.menu === 'area', null, { timeout: 60_000 });
  // The picker's cards publish their rects a frame or more later on software GL.
  await page.waitForFunction(
    (a) => {
      const r = window.__TM__?.rects ?? {};
      return r[`area_${a}`] !== undefined || r[`area_${a}_locked`] !== undefined;
    },
    id,
    { timeout: 120_000 },
  );
  if ((await hook(page)).rects[`area_${id}_locked`] !== undefined)
    throw new Error(`area ${id} is locked: the seeded save did not take`);
  await tapRect(page, touch, `area_${id}`);
  await page.waitForFunction((a) => window.__TM__?.classicArea === a, id, { timeout: 60_000 });
}

const memberBox = (m: Spot, w: number, h: number): Rect => ({ x: m.x - w / 2, y: m.y - h, w, h });

test('1. the Karoo (far herd, Brakkie, a cameo, a raider, the bakkie), then the Bushveld, Kalahari and Okavango herds', async ({
  page,
}, info) => {
  const touch = isTouchProject(info);
  // 120 s: the Karoo's five shots (raider, herd, cameo, Brakkie, bakkie) take ~50-80 game seconds on
  // software GL; each later area's hunt runs out before the next pick (toTitle waits for the tally).
  await page.goto(`/?${FLAGS}&huntSeconds=120`);
  await page.waitForFunction(() => window.__TM__?.ready === true, null, { timeout: 600_000 });
  await intoHunt(page, touch, 'karoo-autumn');

  // A baboon raider on the mid plane (?baboonRaid=any: one within seconds), a mid guineafowl.
  const raider = await mustHold<Spot & { groundY: number | null }>(page, touch, 'raider', 60 * 30);
  const rg = raider.groundY ?? raider.y;
  await shot(
    page,
    info,
    touch,
    'raider',
    [{ plane: 'mid', sx: raider.x - 150, sy: rg }],
    memberBox(raider, 240, 240),
  );
  await release(page);

  // A Karoo cameo (?cameoPreview=all: the ostrich on the mid plane or the tortoise in front).
  const cameo = await mustHold<{ kind: string; plane: Plane; m: Spot & { groundY: number } }>(
    page,
    touch,
    'cameo',
    60 * 30,
  );
  const ch = cameo.kind === 'ostrich' ? 560 : 150;
  await shot(
    page,
    info,
    touch,
    `cameo-${cameo.kind}`,
    [
      {
        plane: cameo.plane,
        sx: cameo.m.x - (cameo.kind === 'ostrich' ? 260 : 160),
        sy: cameo.m.groundY,
      },
    ],
    memberBox(cameo.m, ch * 1.1, ch),
  );
  await release(page);

  // Brakkie on the near plane, clear of the gun's column, with a near guineafowl.
  const dog = await mustHold<Spot>(page, touch, 'dog', 60 * 40);
  await shot(
    page,
    info,
    touch,
    'brakkie',
    [{ plane: 'near', sx: dog.x - 260, sy: dog.y }],
    memberBox(dog, 320, 240),
  );
  await release(page);

  // The bakkie (a stage-set prop, left off-scale for the owner) with a mid guineafowl.
  const bakkie = (): Promise<Rect | null> =>
    page.evaluate(
      () =>
        (window as unknown as Hooked).__TM__?.graphics.bounds.find(
          (b) => b.key === 'karoo/bakkie',
        ) ?? null,
    );
  // The bakkie stands at the Karoo's right end: hold D until the camera reaches its right limit
  // (as art-preview-gfx3 does; short A/D presses never got it on screen on software GL).
  await page.keyboard.down('KeyD');
  await page.waitForFunction(() => (window.__TM__?.cameraX ?? 0) >= 4100, null, {
    timeout: 300_000,
  });
  await page.keyboard.up('KeyD');
  await hold(page, touch);
  const bp = await bakkie();
  if (bp === null) throw new Error('no bakkie');
  // The props' bounds are in their plane's x (the mid layer scrolls at 0.6): to screen x
  // (Tech §3.3: planeX = (cx − 960) × scrollFactor + 960 + dx).
  const dw = (await tm(page)).designWidth;
  const cx = await page.evaluate(() => window.__TM__?.cameraX ?? 0);
  const bk = { ...bp, x: dw / 2 + bp.x - 960 - (cx - 960) * MID_SCROLL };
  if (bk.x + bk.w < 0 || bk.x > dw) throw new Error(`bakkie off screen (${bk.x})`);
  await shot(page, info, touch, 'bakkie', [{ plane: 'mid', sx: bk.x - 60, sy: bk.y + bk.h }], bk);
  await release(page);

  await herdShot(page, info, touch, 'herd-karoo');
  await toTitle(page, touch);
  for (const area of AREAS.slice(1)) {
    await pickArea(page, touch, area);
    await intoHunt(page, touch, area);
    await herdShot(page, info, touch, `herd-${area.split('-')[0] ?? area}`);
    await toTitle(page, touch);
  }
  // Namibië's herd in Standard: the left half of its Standard | HD pair (boot 2 is HD).
  await pickArea(page, touch, 'namibie');
  await intoHunt(page, touch, 'namibie');
  save('herd-namibie-std-crop', info, await herdShot(page, info, touch, 'herd-namibie-std'));
});

test('2. Namibië in HD: the far herd (Standard | HD), the ostrich pair and the gemsbok cameo', async ({
  page,
}, info) => {
  const touch = isTouchProject(info);
  // HD: the far herds are Standard in HD (D-080); the pair shows how they read at true size.
  await page.goto(
    `/?${FLAGS.replace('graphics=standard', 'graphics=hd')}&biome=namibie&layout=tue&huntSeconds=600`,
  );
  await page.waitForFunction(() => window.__TM__?.ready === true, null, { timeout: 600_000 });
  await intoHunt(page, touch, 'namibie');
  await page.waitForFunction(() => (window.__TM__?.graphics.hdTextures ?? 0) > 0, null, {
    timeout: 600_000,
  });

  // The gemsbok cameo (in view within seconds), a mid guineafowl beside the leader.
  const gb = await mustHold<Spot & { groundY: number }>(page, touch, 'gemsbok', 60 * 30);
  await shot(
    page,
    info,
    touch,
    'cameo-gemsbok',
    [{ plane: 'mid', sx: gb.x - 230, sy: gb.groundY }],
    memberBox(gb, 420, 300),
  );
  await release(page);

  // The ostrich pair on the mid plane.
  const ostrich = async (): Promise<{ x: number; y: number; h: number } | null> =>
    page.evaluate(() => {
      const t = (window as unknown as Hooked).__TM__;
      return t?.namibLife?.ostriches[0] ?? null;
    });
  for (let k = 0; k < 20 && (await ostrich()) === null; k++) {
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(400);
    await page.keyboard.up('KeyD');
  }
  await panToX(page, touch, async () => (await ostrich())?.x ?? null);
  await hold(page, touch);
  const pair = await page.evaluate(
    () => (window as unknown as Hooked).__TM__?.namibLife?.ostriches ?? [],
  );
  if (pair.length === 0) throw new Error('no ostrich on screen');
  const x0 = Math.min(...pair.map((o) => o.x)) - 160;
  const x1 = Math.max(...pair.map((o) => o.x)) + 160;
  const top = Math.min(...pair.map((o) => o.y - o.h));
  const feet = Math.max(...pair.map((o) => o.y));
  await shot(page, info, touch, 'mid-ostriches', [{ plane: 'mid', sx: x0 - 40, sy: feet }], {
    x: x0,
    y: top,
    w: x1 - x0,
    h: feet - top,
  });
  await release(page);

  const hd = await herdShot(page, info, touch, 'herd-namibie-hd');
  const stdFile = fileOf('herd-namibie-std-crop', info);
  if (!existsSync(stdFile)) throw new Error('the Standard herd crop is missing (run test 1 first)');
  save('herd-namibie-std-hd', info, scaled(sideBySide(decodePng(readFileSync(stdFile)), hd), 2));
});

test('3. Die Oes: the warthogs and piglets beside mid and near guineafowl', async ({
  page,
}, info) => {
  const touch = isTouchProject(info);
  await page.goto(`/?${FLAGS}&huntSeconds=600&baboons=0&harvestRush=1`);
  await page.waitForFunction(() => window.__TM__?.rects['harvest'] !== undefined, null, {
    timeout: 600_000,
  });
  await tapRect(page, touch, 'harvest');
  await page.waitForFunction(
    () => {
      const t = window.__TM__;
      return t?.scene === 'hunt' && t.biome === 'oes' && t.graphics.loading !== 'loading';
    },
    null,
    { timeout: 900_000 },
  );
  await park(page, touch);
  // A warthog in view (the rush's peak from the start), clear of the screen's edges.
  const hog = await mustHold<Spot & { groundY: number }>(page, touch, 'warthog', 60 * 40);
  const near = hog.groundY > 900;
  const plane: Plane = near ? 'near' : 'mid';
  const hh = near ? 400 : 170;
  await shot(
    page,
    info,
    touch,
    `harvest-warthog-${plane}`,
    [{ plane, sx: hog.x - hh * 1.3, sy: hog.groundY }],
    memberBox(hog, hh * 2.2, hh),
  );
  await release(page);
  // The workers at the true-size fence (a mid guineafowl left of them), with the gap.
  const wk = await mustHold<Spot & { groundY: number }>(page, touch, 'worker', 60 * 40);
  const crew = await page.evaluate(() =>
    ((window as unknown as Hooked).__TM__?.harvestActors ?? []).filter(
      (a) => (a.role === 'worker' || a.role === 'gap') && a.visible,
    ),
  );
  const xs = crew.map((a) => a.x);
  const left = Math.min(...xs, wk.x) - 220;
  const right = Math.max(...xs, wk.x) + 220;
  await shot(
    page,
    info,
    touch,
    'harvest-workers-fence',
    [{ plane: 'mid', sx: left - 40, sy: wk.groundY }],
    { x: left, y: wk.groundY - 400, w: right - left, h: 410 },
  );
  await release(page);
  // Piglets with their sow, if any are in view within a few seconds (the warthog shot is the
  // one this boot must have).
  const pig = await holdWhen<Spot & { groundY: number }>(page, touch, 'piglet', 60 * 20, true);
  if (pig !== null) {
    const pn = pig.groundY > 900;
    await shot(
      page,
      info,
      touch,
      'harvest-piglets',
      [{ plane: pn ? 'near' : 'mid', sx: pig.x - (pn ? 260 : 110), sy: pig.groundY }],
      memberBox(pig, pn ? 700 : 300, pn ? 400 : 170),
    );
  }
  await release(page);
});
