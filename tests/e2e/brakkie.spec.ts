// v1.12 (D-069): Brakkie, the farm dog. On the Karoo's Monday with the baboons off and the test flag
// ?brakkie=1 (he comes out half a second in, fetches every bag in view, back from the bakkie in
// 2 s): a fetch happens on a fixed seed — he races to a bagged bird and carries it home, really
// drawn on the canvas (pixels with him vs the same held tick without him; their centroid on his
// feet, lessons 14 and 22); a shot aimed at him costs 25 and gets Oupa's scold, and he yelps,
// bolts and comes back (never removed); with no delivery he isn't drawn and the hunt never waits;
// on the title he sits clear of every title rect and wags when tapped. Every other spec boots
// with brakkie=0 (helpers.ts boot(), lesson 17). Shots are in-page pointer events with a fresh
// pointerId each; a miss is decided after ~25 ticks.
import { expect, test, type Page } from '@playwright/test';
import brakkie from '../../content/brakkie.json' with { type: 'json' };
import { decodePng } from '../../tools/assets/image';
import { fireAt, reloadIfEmpty } from './feesdaeHelpers';
import {
  boot,
  burstAtFlock,
  hook,
  isLandscape,
  isTouchProject,
  startHunt,
  tapAt,
  waitTicks,
} from './helpers';

const BASE =
  'biome=karoo-autumn&layout=mon&seed=42&huntSeconds=300&graphics=standard&baboons=0&faunaIdle=0';

interface Dog {
  present: boolean;
  phase: string;
  pose: string;
  plane: string;
  frame: string | null;
  visible: boolean;
  x: number;
  y: number;
  groundY: number;
  facing: number;
  carrying: boolean;
  bird: boolean;
  sheet: string | null;
  fetches: number;
  hits: number;
}

type Hooked = {
  __TM__?: {
    tick: number;
    score: number;
    designWidth: number;
    designHeight: number;
    brakkie?: Dog | null;
    namibLog?: string[];
    flockSpots: { id: number; alive: number; x: number; y: number; plane: string }[];
  };
  __TM_HOLD_AT__?: (tick: number | null) => void;
  __TM_BRAKKIE_HIDE__?: (on: boolean | 'bird') => void;
};

const dogOf = (page: Page): Promise<Dog | null> =>
  page.evaluate(() => (window as unknown as Hooked).__TM__?.brakkie ?? null);

/** Waits (bounded) until his chunk and sheet are in and he is out on screen. */
async function dogOnScreen(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const d = (window as unknown as Hooked).__TM__?.brakkie;
      return d?.sheet !== null && d?.sheet !== undefined && d.visible;
    },
    null,
    { timeout: 300_000 },
  );
}

test.use({ serviceWorkers: 'block' });

test('a fetch on a fixed seed: he races to a bagged bird and carries it home, drawn on the canvas', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'landscape only: portrait shows the rotate card');
  test.setTimeout(900_000);
  const touch = isTouchProject(info);
  await boot(page, `${BASE}&brakkie=1`);
  await startHunt(page, touch);
  await dogOnScreen(page);
  // Shoot one mid flock in his fetch band until he goes: a mid-plane fetch waits (4 s) until no
  // live bird is near the fallen one (lesson 21), so the flock must be shot out or flushed away
  // from its spot — the rest of it foraging round the bird kept him back (CI on 1e6ae5a9). The
  // same flock while it lives; bounded by tries and by the hunt's ticks.
  let fetching = false;
  let target: number | null = null;
  const going = (): Promise<boolean> =>
    page.evaluate(() => {
      const p = (window as unknown as Hooked).__TM__?.brakkie?.phase;
      return p === 'fetch' || p === 'cross' || p === 'pickup' || p === 'carry';
    });
  for (let attempt = 0; attempt < 80 && !fetching; attempt++) {
    await reloadIfEmpty(page, touch);
    const h = await hook(page);
    const w = h.designWidth / 2;
    // Inside his fetch band (brakkie.json fetch.maxDxPx: ±520 from the screen's centre on every
    // device; ±30 % of a 20:9 screen reached 720 and he never went).
    const inBand = h.flockSpots.filter(
      (f) => f.plane === 'mid' && f.alive > 0 && Math.abs(f.x - w) < brakkie.fetch.maxDxPx - 120,
    );
    const flock = inBand.find((f) => f.id === target) ?? inBand[0];
    if (flock === undefined) {
      // None in his band: pan a little toward the nearest mid flock (A/D on every profile), or
      // wait for one to come.
      const near = h.flockSpots
        .filter((f) => f.plane === 'mid' && f.alive > 0)
        .sort((p, q) => Math.abs(p.x - w) - Math.abs(q.x - w))[0];
      if (near === undefined) await waitTicks(page, 120);
      else {
        const key = near.x > w ? 'KeyD' : 'KeyA';
        await page.keyboard.down(key);
        await page.waitForTimeout(150);
        await page.keyboard.up(key);
        await waitTicks(page, 20);
      }
      fetching = await going();
      continue;
    }
    target = flock.id;
    await burstAtFlock(page, touch, flock.id, 2, 20);
    await waitTicks(page, 60);
    fetching = await going();
  }
  // A last bag may have queued him: give him his wait (4 s) to go.
  if (!fetching)
    fetching = await page
      .waitForFunction(
        () => {
          const p = (window as unknown as Hooked).__TM__?.brakkie?.phase;
          return p === 'fetch' || p === 'cross' || p === 'pickup' || p === 'carry';
        },
        null,
        { timeout: 120_000 },
      )
      .then(() => true)
      .catch(() => false);
  expect(fetching, 'he went for a bagged bird within 80 tries').toBe(true);
  // Carrying it home on the near plane: hold the sim the moment he is drawn with the bird.
  const held = (await (
    await page.waitForFunction(
      () => {
        const w = window as unknown as Hooked;
        const d = w.__TM__?.brakkie;
        if (d?.phase !== 'carry' || !d.visible || !d.bird) return false;
        w.__TM_HOLD_AT__?.((w.__TM__?.tick ?? 0) + 1);
        return d;
      },
      null,
      { timeout: 300_000, polling: 'raf' },
    )
  ).jsonValue()) as Dog;
  expect(held.carrying).toBe(true);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(1500);
  const d = await dogOf(page);
  if (d === null) throw new Error('no dog');
  // Nothing floating: his feet on the near plane's ground line (lesson 18).
  expect(Math.abs(d.y - d.groundY)).toBeLessThanOrEqual(2);
  const shot = async (): Promise<ReturnType<typeof decodePng>> =>
    decodePng(await page.locator('#game canvas').screenshot());
  const hide = async (on: boolean | 'bird'): Promise<void> => {
    await page.evaluate((v) => {
      (window as unknown as Hooked).__TM_BRAKKIE_HIDE__?.(v);
    }, on);
    await page.waitForTimeout(1000);
  };
  // Three grabs of the same held tick: everything, his bird hidden, him hidden. The dog's own
  // pixels are (bird hidden) vs (him hidden): the bird he carries hangs ahead of his mouth and
  // would pull any measure of his body forward (CI on 404d9aa: centroid 78.8 px ahead with it).
  const all = await shot();
  await hide('bird');
  const noBird = await shot();
  await hide(true);
  const none = await shot();
  await hide(false);
  const h = await hook(page);
  const k = all.width / h.designWidth;
  const changed = (
    a: ReturnType<typeof decodePng>,
    b: ReturnType<typeof decodePng>,
    x: number,
    y: number,
  ): boolean => {
    const i = (Math.round(y * k) * a.width + Math.round(x * k)) * 4;
    return (
      Math.abs((a.data[i] ?? 0) - (b.data[i] ?? 0)) +
        Math.abs((a.data[i + 1] ?? 0) - (b.data[i + 1] ?? 0)) +
        Math.abs((a.data[i + 2] ?? 0) - (b.data[i + 2] ?? 0)) >
      60
    );
  };
  let n = 0;
  let sx = 0;
  let sy = 0;
  for (let y = d.y - 190; y <= d.y + 6; y += 2)
    for (let x = d.x - 220; x <= d.x + 260; x += 2) {
      if (changed(noBird, none, x, y)) {
        n++;
        sx += x;
        sy += y;
      }
    }
  expect(n, 'his pixels on the canvas').toBeGreaterThan(400);
  // The bird he carries is shown (held.bird above); its pixels aren't counted: it hangs from his
  // mouth at y ≈ 910–965, inside the foreground layer's band, where a tuft in front can hide it
  // (Pixel 7 on 1e6ae5a9: 2 px).
  // Lesson 22: facing either way, his drawn pixels' centroid sits on his hit shape — inside his
  // standing body ellipse (brakkie.json hitboxes.stand.body, mirrored when he faces left). His own
  // pixels only (the carried bird hidden: it hangs 116 px ahead and pulled the centroid to 78.8 px
  // on 404d9aa). Not the extent's ends: the foreground grass hides some of him (c1ca190's Pixel 7).
  const body = brakkie.hitboxes.stand.body;
  const cx = d.x + body.ox * d.facing;
  const cy = d.y + body.oy;
  const nx = (sx / n - cx) / body.rx;
  const ny = (sy / n - cy) / body.ry;
  expect(
    nx * nx + ny * ny,
    `centroid ${String(sx / n)}, ${String(sy / n)} vs body ${String(cx)}, ${String(cy)}`,
  ).toBeLessThanOrEqual(1);
});

test('a shot aimed at him costs 25 with Oupa’s scold; he yelps, bolts and comes back', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'landscape only: portrait shows the rotate card');
  test.setTimeout(900_000);
  const touch = isTouchProject(info);
  // No birds: nothing stands in front of him and nothing else scores.
  await boot(page, `${BASE}&birds=0&brakkie=1`);
  await startHunt(page, touch);
  await dogOnScreen(page);
  const body = brakkie.hitboxes.stand.body;
  let hit = false;
  let before = -1;
  for (let shot = 0; shot < 30 && !hit; shot++) {
    await reloadIfEmpty(page, touch);
    const d = await dogOf(page);
    if (d === null || !d.visible || d.phase !== 'rest' || d.pose === 'lie') {
      await waitTicks(page, 15);
      continue;
    }
    before = (await hook(page)).score;
    const fired = await fireAt(page, touch, { x: d.x + body.ox * d.facing, y: d.y + body.oy });
    if (fired === null) {
      await waitTicks(page, 30);
      continue;
    }
    const t0 = (await hook(page)).tick;
    hit =
      (await (
        await page.waitForFunction(
          ([until, s0]) => {
            const tm = (window as unknown as Hooked).__TM__;
            if ((tm?.score ?? 0) < s0) return true;
            return (tm?.tick ?? 0) >= until ? 'miss' : false;
          },
          [t0 + 25, before] as const,
          { timeout: 120_000 },
        )
      ).jsonValue()) === true;
  }
  expect(hit, 'a shot aimed at him within 30 tries').toBe(true);
  expect((await hook(page)).score).toBe(before - brakkie.hit.penalty);
  const log = await page.evaluate(() => (window as unknown as Hooked).__TM__?.namibLog ?? []);
  expect(log).toContain('bark:guide.brakkie.scold');
  const d = await dogOf(page);
  expect(['yelp', 'bolt']).toContain(d?.phase);
  // Never removed: away at the bakkie, then out again.
  await page.waitForFunction(
    () => (window as unknown as Hooked).__TM__?.brakkie?.phase === 'away',
    null,
    { timeout: 300_000 },
  );
  await page.waitForFunction(
    () => (window as unknown as Hooked).__TM__?.brakkie?.present === true,
    null,
    { timeout: 300_000 },
  );
  expect((await dogOf(page))?.hits).toBe(1);
});

test('with no delivery he is not drawn and the hunt never waits for him', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'landscape only: portrait shows the rotate card');
  test.setTimeout(300_000);
  await page.route('**/assets/asset-index.json', (r) => r.fulfill({ status: 404, body: '' }));
  await boot(page, `${BASE}&brakkie=1`);
  await startHunt(page, isTouchProject(info));
  await waitTicks(page, 240);
  const d = await dogOf(page);
  // His chunk may be in (it is code), but no sheet: never drawn.
  expect(d === null || (d.sheet === null && !d.visible)).toBe(true);
  expect((await hook(page)).tick).toBeGreaterThan(240);
});

test('on the title he sits clear of every title rect and wags when tapped', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'landscape only: portrait shows the rotate card');
  test.setTimeout(300_000);
  await boot(page, 'brakkie=1');
  const seen = await page.waitForFunction(
    () => {
      const t = (
        window as unknown as {
          __TM__?: {
            titleBrakkie?: { rect: { x: number; y: number; w: number; h: number } | null } | null;
          };
        }
      ).__TM__?.titleBrakkie;
      return t?.rect ?? false;
    },
    null,
    { timeout: 180_000 },
  );
  const r = (await seen.jsonValue()) as { x: number; y: number; w: number; h: number };
  const h = await hook(page);
  expect(r.x).toBeGreaterThanOrEqual(0);
  expect(r.y).toBeGreaterThanOrEqual(0);
  expect(r.x + r.w).toBeLessThanOrEqual(h.designWidth);
  expect(r.y + r.h).toBeLessThanOrEqual(h.designHeight);
  // Lesson 25: clear of every rect the title published (buttons, the pill, the lines).
  for (const [id, o] of Object.entries(h.rects)) {
    const apart = r.x >= o.x + o.w || o.x >= r.x + r.w || r.y >= o.y + o.h || o.y >= r.y + r.h;
    expect(apart, `Brakkie overlaps ${id}`).toBe(true);
  }
  await tapAt(page, isTouchProject(info), r.x + r.w / 2, r.y + r.h * 0.6);
  await page.waitForFunction(
    () => {
      const t = (window as unknown as { __TM__?: { titleBrakkie?: { taps: number } | null } })
        .__TM__?.titleBrakkie;
      return (t?.taps ?? 0) >= 1;
    },
    null,
    { timeout: 60_000 },
  );
  // The tap was his, not a button's: still on the title.
  expect((await hook(page)).scene).toBe('start');
});

// Review of the screenshots (C1): with his feet at y 1040 he walked behind the shells HUD on 16:9.
// His feet are at y 985 now: at most his paws reach the bottom HUD band. Over a stretch of play,
// sampled every 30 ticks while he is drawn on the near plane, his standing box (about 230 × 142
// design px round his feet: brakkie.json hitboxes.stand and the art) is at most 25 % covered by
// the hook's HUD rects, on every landscape profile (16:9 desktop, 20:9 Pixel 7, 19.5:9 iPhone).
test('he is clearly visible in play: at most a quarter of him under the HUD', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'landscape only: portrait shows the rotate card');
  test.setTimeout(600_000);
  const touch = isTouchProject(info);
  await boot(page, `${BASE}&birds=0&brakkie=1`);
  await startHunt(page, touch);
  await dogOnScreen(page);
  interface Sample {
    share: number;
    phase: string;
    pose: string;
    x: number;
    rect: string | null;
  }
  const samples: Sample[] = [];
  for (let i = 0; i < 40; i++) {
    const r = await page.evaluate(() => {
      const tm = window.__TM__;
      const d = (window as unknown as Hooked).__TM__?.brakkie;
      if (tm === undefined || d == null || !d.visible || d.plane !== 'near') return null;
      const box = { x: d.x - (d.facing > 0 ? 100 : 130), y: d.y - 142, w: 230, h: 142 };
      const rects = Object.entries(tm.rects);
      let inside = 0;
      let all = 0;
      const by = new Map<string, number>();
      for (let y = box.y; y < box.y + box.h; y += 4)
        for (let x = box.x; x < box.x + box.w; x += 4) {
          all++;
          const hit = rects.find(([, o]) => x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h);
          if (hit !== undefined) {
            inside++;
            by.set(hit[0], (by.get(hit[0]) ?? 0) + 1);
          }
        }
      const top = [...by.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      return { share: inside / all, phase: d.phase, pose: d.pose, x: d.x, rect: top };
    });
    if (r !== null) samples.push(r);
    await waitTicks(page, 30);
  }
  expect(samples.length, 'he was drawn while sampled').toBeGreaterThan(10);
  const worst = samples.reduce((w, s) => (s.share > w.share ? s : w));
  console.log(`[brakkie] worst HUD cover ${JSON.stringify(worst)} of ${samples.length} samples`);
  // Where he stays (resting, barking, digging, picking a bird up) he is never more than a quarter
  // under the HUD: those spots keep to a band round the screen's centre, clear of the corners
  // where the belt and the gadget sit. Running in from or off to the bakkie he may pass behind
  // the belt for a moment (he must reach the panorama's end), so over the hunt the mean share
  // under the HUD is what counts there.
  const staying = samples.filter((s) => ['rest', 'bark', 'dig', 'pickup'].includes(s.phase));
  for (const s of staying)
    expect(s.share, `under the HUD while ${s.phase} (${s.pose}) by ${s.rect}`).toBeLessThanOrEqual(
      0.25,
    );
  const mean = samples.reduce((t, s) => t + s.share, 0) / samples.length;
  expect(mean, 'mean share of him under the HUD').toBeLessThanOrEqual(0.25);
});
