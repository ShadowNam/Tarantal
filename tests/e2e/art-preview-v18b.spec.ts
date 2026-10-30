// v1.8b (D-062) baboon previews, on demand (not part of the regular suite; playwright.config.ts
// ignores art-preview specs unless ART_PREVIEW=1):
//   ART_PREVIEW=1 npx playwright test tests/e2e/art-preview-v18b.spec.ts --project=desktop-chromium
// One profile at a time (desktop, Pixel 7, iPhone 14 landscape). Writes
// docs/art-preview/compare/v18b-baboons-<shot>-<device>.png (palette PNG ≤ 1600 px wide):
//   troop-<area>: the view panned to the area's troop on its far ridge (wide), and
//   troop-<area>-3x: a 3× close-up of the troop (the lookout, the mothers with their babies);
//   raid-<area>-<action>: a raid in progress (the view panned to the raider at its mischief), and
//   raider-<area>-<action>-2x: a 2× close-up of the raider (≥ 120 px tall at 1080);
//   tumble-karoo: the raider bagged (two hits), its tumble;
//   troop-std-hd, raider-std-hd: the Karoo troop and the hat raider close up, Standard | HD (the
//     HD boot's own shots carry -hd; the Standard crops are kept as *-std-crop).
// Six boots per device: the five areas in Standard (each with its own raid), then one HD boot.
// No birds (birds=0: nothing in front), the test-only ?baboonRaid=<action> (the first raid after
// 2 s, a long act, a slow run when hit), the far herds still (?faunaIdle=0). Every grab holds the
// sim (__TM_HOLD_AT__); anything that moves runs on sim time. On desktop the real mouse rests at
// the bottom centre, outside both edge-pan bands. Each boot waits until the hunt runs in its area
// with its own layers. A shot that is missing fails the test (bounded attempts).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page, type TestInfo } from '@playwright/test';
import birds from '../../content/birds.json' with { type: 'json' };
import bushveld from '../../content/biomes/bushveld-winter.json' with { type: 'json' };
import kalahari from '../../content/biomes/kalahari-summer.json' with { type: 'json' };
import karoo from '../../content/biomes/karoo-autumn.json' with { type: 'json' };
import namibie from '../../content/biomes/namibie.json' with { type: 'json' };
import okavango from '../../content/biomes/okavango-spring.json' with { type: 'json' };
import scoring from '../../content/scoring.json' with { type: 'json' };
import { blank, crop, decodePng, encodePng8, resize, type Rgba } from '../../tools/assets/image';
import { fireAt, reloadIfEmpty } from './feesdaeHelpers';
import { hook, isTouchProject, startHunt } from './helpers';

const OUT = join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'compare');
const PROFILES = ['desktop-chromium', 'pixel7-landscape', 'iphone14-landscape'];
/** The device name of a project (a local Chromium stand-in for WebKit keeps the device's). */
const device = (name: string): string => name.replace(/-chromium-fallback$/, '');
const SAVE = 'tm.e2e.save.v1';

interface Area {
  readonly biome: string;
  readonly short: string;
  readonly action: string;
  readonly u: number;
}
const troopU = (b: { baboons?: { troops: readonly { u: number }[] } }): number =>
  b.baboons?.troops[0]?.u ?? 0.5;
const AREAS: readonly Area[] = [
  { biome: 'karoo-autumn', short: 'karoo', action: 'hat', u: troopU(karoo) },
  { biome: 'bushveld-winter', short: 'bushveld', action: 'moon', u: troopU(bushveld) },
  { biome: 'okavango-spring', short: 'okavango', action: 'fruit', u: troopU(okavango) },
  { biome: 'namibie', short: 'namibie', action: 'throw', u: troopU(namibie) },
  { biome: 'kalahari-summer', short: 'kalahari', action: 'chase', u: troopU(kalahari) },
];

test.use({ serviceWorkers: 'block' });
// In order, in one worker (a failure doesn't skip the rest): the HD test pairs its crops with the
// Karoo Standard test's.
test.describe.configure({ mode: 'default' });
test.beforeEach(async ({ page }, info) => {
  test.skip(process.env['ART_PREVIEW'] !== '1', 'on demand: ART_PREVIEW=1');
  test.skip(!PROFILES.includes(device(info.project.name)), 'previews: desktop, Pixel 7, iPhone 14');
  // Software GL is slow, and the HD pack has to land: up to 25 minutes each.
  test.setTimeout(1_500_000);
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

const fileOf = (name: string, info: TestInfo): string =>
  join(OUT, `v18b-baboons-${name}-${device(info.project.name)}.png`);

function save(name: string, info: TestInfo, img: Rgba): void {
  mkdirSync(OUT, { recursive: true });
  let out = img;
  if (out.width > 1600) out = resize(out, 1600, Math.round((out.height * 1600) / out.width));
  writeFileSync(fileOf(name, info), encodePng8(out));
}

/** Nearest-neighbour scale by a whole number n. */
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

async function park(page: Page, touch: boolean): Promise<void> {
  if (touch) return;
  const box = await page.locator('#game canvas').boundingBox();
  if (box !== null) await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.97);
}

interface Baboon {
  readonly id: number;
  readonly role: string;
  readonly frame: string | null;
  readonly x: number;
  readonly y: number;
  readonly visible: boolean;
}
type Hooked = { __TM__?: { tick: number; baboons?: Baboon[] | null } };

async function baboonsOf(page: Page): Promise<readonly Baboon[]> {
  return page.evaluate(() => (window as unknown as Hooked).__TM__?.baboons ?? []);
}

/** Boots a hunt in `area` with its raid flag; waits until it runs there with its own layers. */
async function huntIn(
  page: Page,
  info: TestInfo,
  area: Area,
  gfx: 'standard' | 'hd',
): Promise<void> {
  const q = `biome=${area.biome}&layout=mon&seed=42&huntSeconds=900&birds=0&faunaIdle=0&baboonRaid=${area.action}`;
  await page.goto(`/?e2e=1&feesdag=none&ftue=0&${q}&graphics=${gfx}`);
  await page.waitForFunction(() => window.__TM__?.ready === true, null, { timeout: 300_000 });
  const touch = isTouchProject(info);
  await startHunt(page, touch);
  if (gfx === 'hd')
    await page.waitForFunction(() => (window.__TM__?.graphics.hdTextures ?? 0) > 0, null, {
      timeout: 300_000,
    });
  const prefix = `layer:${area.biome.split('-')[0] ?? area.biome}/`;
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
    [area.biome, prefix] as const,
    { timeout: 300_000 },
  );
  // The baboon sheet (late group) is drawn.
  await page.waitForFunction(
    () => ((window as unknown as Hooked).__TM__?.baboons ?? []).length > 0,
    null,
    { timeout: 300_000 },
  );
  await park(page, touch);
}

/**
 * Pans (A/D, short presses) until `where()` (a screen x) is within 80 px of the centre, or on
 * screen with a 160 px margin once a press overshoots it or the camera stops at the panorama's
 * end (one press can pan ~400 px on slow software GL). Bounded; throws when it never gets there.
 */
async function panToX(
  page: Page,
  touch: boolean,
  where: () => Promise<number | null>,
): Promise<void> {
  let prev: number | null = null;
  const w = (await hook(page)).designWidth;
  for (let k = 0; k < 160; k++) {
    const x = await where();
    const o = x === null ? null : x - w / 2;
    if (o !== null && Math.abs(o) <= 80) break;
    if (
      o !== null &&
      prev !== null &&
      (Math.sign(o) !== Math.sign(prev) || Math.abs(o - prev) < 2) &&
      Math.abs(o) <= w / 2 - 160
    )
      break;
    prev = o;
    const dir = o === null || o > 0 ? 'KeyD' : 'KeyA';
    await page.keyboard.down(dir);
    await page.waitForTimeout(o === null || Math.abs(o) > 500 ? 400 : 120);
    await page.keyboard.up(dir);
  }
  const x = await where();
  if (x === null || x < 160 || x > w - 160) throw new Error(`pan: off screen (${String(x)})`);
  await park(page, touch);
}

/** The troop's screen x from the camera (its ridge scrolls at 0.15). */
const troopX = async (page: Page, area: Area): Promise<number> => {
  const h = await hook(page);
  return area.u * (1920 + 3200 * 0.15) - (h.cameraX - 960) * 0.15;
};

/** The raider's screen x from the hook (its snapshot place: listed even while it is off screen
 *  and not drawn). */
const raiderX = async (page: Page): Promise<number | null> =>
  (await baboonsOf(page)).find((b) => b.role === 'raider')?.x ?? null;

/** Holds the sim `ahead` ticks from now (bounded by ticks), then lets the frame settle. */
async function holdIn(page: Page, touch: boolean, ahead: number): Promise<void> {
  const at = await page.evaluate((n) => {
    const t = (window.__TM__?.tick ?? 0) + n;
    (window as { __TM_HOLD_AT__?: (tick: number) => void }).__TM_HOLD_AT__?.(t);
    return t;
  }, ahead);
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t, at, { timeout: 600_000 });
  await park(page, touch);
  await page.waitForTimeout(1500);
}

async function release(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as { __TM_HOLD_AT__?: (tick: number) => void }).__TM_HOLD_AT__?.(1e12);
  });
}

interface Grab {
  img: Rgba;
  k: number;
  w: number;
}

async function grab(page: Page): Promise<Grab> {
  const img = decodePng(await page.locator('#game canvas').screenshot());
  const h = await hook(page);
  return { img, k: img.height / h.designHeight, w: h.designWidth };
}

/** A design-px rect cut from a grab (clamped). */
function cut(g: Grab, r: { x: number; y: number; w: number; h: number }): Rgba {
  const x0 = Math.max(0, Math.round(r.x * g.k));
  const y0 = Math.max(0, Math.round(r.y * g.k));
  const x1 = Math.min(g.img.width, Math.round((r.x + r.w) * g.k));
  const y1 = Math.min(g.img.height, Math.round((r.y + r.h) * g.k));
  return crop(g.img, x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
}

/** The box round the troop's members on screen (design px). */
async function troopBox(page: Page): Promise<{ x: number; y: number; w: number; h: number }> {
  const m = (await baboonsOf(page)).filter((b) => b.role !== 'raider' && b.visible);
  if (m.length === 0) throw new Error('no troop on screen');
  const x0 = Math.min(...m.map((b) => b.x)) - 50;
  const x1 = Math.max(...m.map((b) => b.x)) + 50;
  const y1 = Math.max(...m.map((b) => b.y)) + 12;
  return { x: x0, y: y1 - 120, w: x1 - x0, h: 120 };
}

/** The box round the raider (feet at x, y; a sitting male is 151 design px on the mid plane). */
async function raiderBox(page: Page): Promise<{ x: number; y: number; w: number; h: number }> {
  const r = (await baboonsOf(page)).find((b) => b.role === 'raider' && b.visible);
  if (r === undefined) throw new Error('no raider on screen');
  const h = birds.baboons.heightPx * scoring.planes.mid.scale;
  return { x: r.x - 150, y: r.y - h * 1.5, w: 300, h: h * 1.5 + 30 };
}

/** Waits (bounded by sim ticks) until the raider is at its mischief (an action frame). */
/** Waits (bounded by sim ticks) until a raid is on with its raider in the hook: an off-screen raider
 *  isn't drawn (its frame is null), so this reads the sim's raid state, not a frame. */
async function untilRaider(page: Page): Promise<void> {
  const start = (await hook(page)).tick;
  await page.waitForFunction(
    (until) => {
      const tm = (
        window as unknown as Hooked & { __TM__?: { baboonRaid?: { phase: string } | null } }
      ).__TM__;
      const r = (tm?.baboons ?? []).find((b) => b.role === 'raider');
      if (tm?.baboonRaid?.phase === 'on' && r !== undefined) return true;
      if ((tm?.tick ?? 0) > until) throw new Error(`no raid by tick ${until}`);
      return false;
    },
    start + 60 * 60,
    { timeout: 900_000 },
  );
}

/** With the raider on screen: waits (bounded) until it is drawn at its mischief. */
async function untilAct(page: Page, action: string): Promise<void> {
  const prefix = action === 'chase' ? 'run_' : `${action}_`;
  const start = (await hook(page)).tick;
  await page.waitForFunction(
    ([pre, until]) => {
      const tm = (window as unknown as Hooked).__TM__;
      const r = (tm?.baboons ?? []).find((b) => b.role === 'raider');
      if (r?.frame?.startsWith(pre) === true) return true;
      if ((tm?.tick ?? 0) > until) throw new Error(`no ${pre} raid by tick ${until}`);
      return false;
    },
    [prefix, start + 60 * 60] as const,
    { timeout: 900_000 },
  );
}

/** The troop and a raid in progress in one area (Standard); returns the crops for the HD pairs. */
async function troopAndRaid(
  page: Page,
  info: TestInfo,
  area: Area,
  tag = '',
): Promise<{ troop: Rgba; raider: Rgba }> {
  const touch = isTouchProject(info);
  await panToX(page, touch, () => troopX(page, area));
  await holdIn(page, touch, 30);
  const g = await grab(page);
  save(`troop-${area.short}${tag}`, info, g.img);
  const troop = cut(g, await troopBox(page));
  save(`troop-${area.short}${tag}-3x`, info, scaled(troop, 3));
  await release(page);
  await untilRaider(page);
  await panToX(page, touch, () => raiderX(page));
  await untilAct(page, area.action);
  await panToX(page, touch, () => raiderX(page));
  if (area.action === 'throw') {
    // The throw: hold in the same wait that sees the arm come over (the fruit in the air).
    await page.waitForFunction(
      () => {
        const tm = (window as unknown as Hooked).__TM__;
        const r = (tm?.baboons ?? []).find((b) => b.role === 'raider');
        if (r?.frame !== 'throw_b') return false;
        (window as { __TM_HOLD_AT__?: (tick: number) => void }).__TM_HOLD_AT__?.(
          (tm?.tick ?? 0) + 6,
        );
        return true;
      },
      null,
      { timeout: 900_000, polling: 'raf' },
    );
    await park(page, touch);
    await page.waitForTimeout(1500);
  } else await holdIn(page, touch, 20);
  const r = await grab(page);
  save(`raid-${area.short}-${area.action}${tag}`, info, r.img);
  const raider = cut(r, await raiderBox(page));
  save(`raider-${area.short}-${area.action}${tag}-2x`, info, scaled(raider, 2));
  await release(page);
  return { troop, raider };
}

test('Karoo: the troop, the hat raid, the raider close up, the tumble (Standard)', async ({
  page,
}, info) => {
  const touch = isTouchProject(info);
  const area = AREAS[0] as Area;
  await huntIn(page, info, area, 'standard');
  const got = await troopAndRaid(page, info, area);
  // The Standard crops, for the HD test's pairs (tests may run in other workers).
  save('troop-karoo-std-crop', info, got.troop);
  save('raider-karoo-std-crop', info, got.raider);
  // Two hits bag the raider: hold just after the bagging shot to catch the tumble (bounded).
  const k = scoring.planes.mid.scale;
  let tumbled = false;
  for (let shot = 0; shot < 40 && !tumbled; shot++) {
    await reloadIfEmpty(page, touch);
    const r = (await baboonsOf(page)).find((b) => b.role === 'raider' && b.visible);
    if (r === undefined) throw new Error('the raider left before it was bagged');
    const box =
      r.frame?.startsWith('hat_') === true
        ? birds.baboons.hitboxes.sit
        : birds.baboons.hitboxes.walk;
    await fireAt(page, touch, { x: r.x, y: r.y + box.body.oy * k });
    const t0 = (await hook(page)).tick;
    tumbled =
      (await (
        await page.waitForFunction(
          (until) => {
            const tm = (window as unknown as Hooked).__TM__;
            const rr = (tm?.baboons ?? []).find((b) => b.role === 'raider');
            if (rr?.frame === 'tumble') {
              (window as { __TM_HOLD_AT__?: (tick: number) => void }).__TM_HOLD_AT__?.(
                (tm?.tick ?? 0) + 4,
              );
              return true;
            }
            return (tm?.tick ?? 0) >= until ? 'miss' : false;
          },
          t0 + 25,
          { timeout: 120_000, polling: 'raf' },
        )
      ).jsonValue()) === true;
  }
  if (!tumbled) throw new Error('no tumble within 40 shots');
  await page.waitForTimeout(1500);
  const t = await grab(page);
  save('tumble-karoo', info, t.img);
  save('tumble-karoo-2x', info, scaled(cut(t, await raiderBox(page)), 2));
});

for (const area of AREAS.slice(1))
  test(`${area.short}: the troop and a ${area.action} raid (Standard)`, async ({ page }, info) => {
    await huntIn(page, info, area, 'standard');
    await troopAndRaid(page, info, area);
  });

test('Karoo in HD: the troop and the hat raider close up, Standard | HD', async ({
  page,
}, info) => {
  const area = AREAS[0] as Area;
  await huntIn(page, info, area, 'hd');
  const hd = await troopAndRaid(page, info, area, '-hd');
  // The Standard crops come from the first test (same device, same seed, the same pans).
  const troopStd = fileOf('troop-karoo-std-crop', info);
  const raiderStd = fileOf('raider-karoo-std-crop', info);
  if (!existsSync(troopStd) || !existsSync(raiderStd))
    throw new Error('run the Karoo Standard test first (its crops pair with these)');
  const troop = decodePng(readFileSync(troopStd));
  const raider = decodePng(readFileSync(raiderStd));
  save('troop-std-hd', info, scaled(sideBySide(troop, hd.troop), 3));
  save('raider-std-hd', info, scaled(sideBySide(raider, hd.raider), 2));
});
