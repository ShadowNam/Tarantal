// v1.12 (D-069): Brakkie, the farm dog. On the Karoo's Monday with the baboons off and the test flag
// ?brakkie=1 (he comes out half a second in, fetches every bag in view, back from the bakkie in
// 2 s): a fetch (?brakkiePreview=fetch: a bird placed beside him) — he carries it home, really
// drawn on the canvas (pixels with him vs the same held tick without him; their centroid on his
// feet, lessons 14 and 22); a shot aimed at him costs 25 and gets Oupa's scold, and he yelps,
// bolts and comes back (never removed); with no delivery he isn't drawn and the hunt never waits;
// on the title he sits clear of every title rect and wags when tapped. Every other spec boots
// with brakkie=0 (helpers.ts boot(), lesson 17). Shots are in-page pointer events with a fresh
// pointerId each; a miss is decided after ~25 ticks.
import { expect, test, type Page } from '@playwright/test';
import brakkie from '../../content/brakkie.json' with { type: 'json' };
import afT from '../../src/i18n/guide/af.json' with { type: 'json' };
import deT from '../../src/i18n/guide/de.json' with { type: 'json' };
import enT from '../../src/i18n/guide/en.json' with { type: 'json' };
import nlT from '../../src/i18n/guide/nl.json' with { type: 'json' };
import { decodePng } from '../../tools/assets/image';
import { fireAt, reloadIfEmpty } from './feesdaeHelpers';
import { boot, hook, isLandscape, isTouchProject, startHunt, tapAt, waitTicks } from './helpers';

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

test('a fetch drawn on the canvas: he carries a bird home on the near plane', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'landscape only: portrait shows the rotate card');
  test.setTimeout(900_000);
  const touch = isTouchProject(info);
  // ?brakkie=1&brakkiePreview=fetch (boot() adds brakkie=0 without a brakkie= flag): 3 s in he
  // fetches a bird placed beside him. Bagging one by shooting flocks in a real hunt was bound to
  // the runner's timing (CI on 33c434d5: no fetch in 80 tries on Pixel 7, green on f7adbce7);
  // the decision itself — a real bag sends him to fetch it — is proven on a whole Classic hunt
  // in src/sim/brakkie/sim.test.ts.
  // The art preview's fetch settings (art-preview-brakkie.spec.ts, green on all three profiles):
  // no weekday layout, so no pop-up or tin can sends him off before the demo fetch.
  await boot(
    page,
    'biome=karoo-autumn&layout=none&seed=42&huntSeconds=120&graphics=standard&baboons=0&reenbui=0&omen=0&faunaIdle=0&brakkie=1&brakkiePreview=fetch',
  );
  await startHunt(page, touch);
  await dogOnScreen(page);
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

// v1.16 (D-078): the owner — "he needs to run a bit more around". With no birds on the map (no
// fetches, nothing aimed at near him) he still keeps moving: over 40 s of hunt ticks he sets off
// to new spots several times, running on some. Watched in-page on sim ticks (lesson 2), the
// frame loop bounded by frames as well as by its goal (lesson 1).
test('livelier: he trots and runs about between short rests', async ({ page }, info) => {
  test.skip(!isLandscape(info), 'landscape only: portrait shows the rotate card');
  test.setTimeout(600_000);
  const touch = isTouchProject(info);
  await boot(page, `${BASE.replace('layout=mon', 'layout=none')}&birds=0&brakkie=1`);
  await startHunt(page, touch);
  await dogOnScreen(page);
  const seen = await page.evaluate(
    (span) =>
      new Promise<{ moves: number; runs: number; ticks: number }>((done) => {
        const tm = (): Hooked['__TM__'] => (window as unknown as Hooked).__TM__;
        const t0 = tm()?.tick ?? 0;
        let last = '';
        let moves = 0;
        let runs = 0;
        let frames = 0;
        const step = (): void => {
          frames++;
          const d = tm()?.brakkie;
          const now = d === null || d === undefined ? '' : `${d.phase}:${d.pose}`;
          if (now !== last && d?.phase === 'trot') {
            moves++;
            if (d.pose === 'run') runs++;
          }
          last = now;
          const ticks = (tm()?.tick ?? 0) - t0;
          if (ticks >= span || frames > 60 * 60 * 6) done({ moves, runs, ticks });
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    40 * 60,
  );
  expect(seen.ticks, 'the hunt ran 40 s of ticks').toBeGreaterThanOrEqual(40 * 60);
  expect(seen.moves, 'new spots in 40 s').toBeGreaterThanOrEqual(4);
  expect(seen.runs, 'some of them at a run').toBeGreaterThanOrEqual(1);
  expect(brakkie.roam.runChance).toBeGreaterThan(0);
});

// --- v1.17 (D-079): Brakkie the companion -------------------------------------------------------

/** Every language's words (the spec doesn't pin the page's language). */
const WORDS = (key: 'bring' | 'streak' | 'good_point' | 'spring' | 'heel' | 'seek'): string[] =>
  [enT, afT, deT, nlT].map((t) => (t as Record<string, string>)[`guide.brakkie.${key}`] ?? '?');

const COMPANION =
  'biome=karoo-autumn&layout=none&seed=42&huntSeconds=120&graphics=standard&baboons=0&reenbui=0&omen=0&faunaIdle=0&brakkie=1';

test('Staan!: he points, the marker shows where the flock sits, and it bursts up', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'landscape only: portrait shows the rotate card');
  test.setTimeout(600_000);
  const touch = isTouchProject(info);
  // ?brakkiePreview=point: a point 4 s in, held 8 s (lesson 10).
  await boot(page, `${COMPANION}&brakkiePreview=point`);
  await startHunt(page, touch);
  await dogOnScreen(page);
  const seen = (await (
    await page.waitForFunction(
      () => {
        const d = window.__TM__?.brakkie;
        return d?.phase === 'point' && d.visible && d.marker !== null ? d : false;
      },
      null,
      { timeout: 300_000, polling: 'raf' },
    )
  ).jsonValue()) as NonNullable<Awaited<ReturnType<typeof dogOf>>> & {
    marker: { x: number; y: number };
    frame: string;
  };
  expect(['point_a', 'point_b']).toContain(seen.frame);
  const h = await hook(page);
  // The marker is on screen, above his feet (on the mid ground, in front of his nose).
  expect(seen.marker.x).toBeGreaterThan(0);
  expect(seen.marker.x).toBeLessThan(h.designWidth);
  expect(seen.marker.y).toBeLessThan(seen.y);
  // After the point the flock bursts up (a flush with the flock he pointed).
  await page.waitForFunction(
    () => {
      const d = window.__TM__?.brakkie;
      return d !== null && d !== undefined && d.flushes > 0 && d.marker === null;
    },
    null,
    { timeout: 300_000 },
  );
});

test('Fluit!: on desktop F springs the point and the middle button calls him to heel', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info) || isTouchProject(info), 'desktop (mouse and keyboard) only');
  test.setTimeout(600_000);
  await boot(page, `${COMPANION}&brakkiePreview=point`);
  await startHunt(page, false);
  await dogOnScreen(page);
  await page.waitForFunction(() => window.__TM__?.brakkie?.whistle === 'spring', null, {
    timeout: 300_000,
  });
  await page.keyboard.press('KeyF');
  const sprung = (await (
    await page.waitForFunction(
      () => {
        const d = window.__TM__?.brakkie;
        return d !== null && d !== undefined && d.whistles > 0 ? d : false;
      },
      null,
      { timeout: 60_000 },
    )
  ).jsonValue()) as { flushes: number; word: string | null };
  expect(sprung.flushes).toBeGreaterThan(0);
  // Roaming again, the middle button calls him to heel (after the whistle's cooldown).
  await page.waitForFunction(() => window.__TM__?.brakkie?.whistle === 'heel', null, {
    timeout: 300_000,
  });
  const c = await page.locator('#game canvas').boundingBox();
  if (c === null) throw new Error('no canvas');
  await page.mouse.click(c.x + c.width / 2, c.y + c.height * 0.3, { button: 'middle' });
  const heel = (await (
    await page.waitForFunction(
      () => {
        const d = window.__TM__?.brakkie;
        return d?.phase === 'heel' || d?.phase === 'toHeel' ? d : false;
      },
      null,
      { timeout: 60_000 },
    )
  ).jsonValue()) as { word: string | null; whistles: number };
  expect(heel.whistles).toBe(2);
});

test('Fluit!: on phones the round whistle button calls him to heel', async ({ page }, info) => {
  test.skip(!isLandscape(info) || !isTouchProject(info), 'phones (touch) only');
  test.setTimeout(600_000);
  await boot(page, COMPANION);
  await startHunt(page, true);
  await dogOnScreen(page);
  const btn = (await (
    await page.waitForFunction(
      () => {
        const b = window.__TM__?.whistleButton;
        return b !== null && b !== undefined && b.on && window.__TM__?.brakkie?.whistle === 'heel'
          ? b
          : false;
      },
      null,
      { timeout: 300_000 },
    )
  ).jsonValue()) as { x: number; y: number; w: number; h: number };
  // A 72-px round button in the bottom corner opposite the shells.
  expect(btn.w).toBe(72);
  const h = await hook(page);
  const belt = h.rects['belt'];
  if (belt === undefined) throw new Error('no belt');
  expect(btn.x + btn.w / 2 < h.designWidth / 2).toBe(belt.x + belt.w / 2 > h.designWidth / 2);
  expect(btn.y + btn.h).toBeGreaterThan(h.designHeight * 0.6);
  await tapAt(page, true, btn.x + btn.w / 2, btn.y + btn.h / 2);
  await page.waitForFunction(
    () => {
      const d = window.__TM__?.brakkie;
      return d !== null && d !== undefined && d.whistles > 0;
    },
    null,
    { timeout: 60_000 },
  );
  // The tap fired no shot.
  expect((await hook(page)).shots).toBe(0);
});

test('Bring!: his delivery pops "Bring! +15" at the screen edge', async ({ page }, info) => {
  test.skip(!isLandscape(info), 'landscape only: portrait shows the rotate card');
  test.setTimeout(600_000);
  const touch = isTouchProject(info);
  // ?brakkiePreview=fetch: 3 s in he fetches a bird placed beside him and carries it home.
  await boot(page, `${COMPANION}&brakkiePreview=fetch`);
  await startHunt(page, touch);
  await dogOnScreen(page);
  const pops = (await (
    await page.waitForFunction(
      () => {
        const p = window.__TM__?.brakkiePops ?? [];
        return p.length > 0 ? [...p] : false;
      },
      null,
      { timeout: 300_000 },
    )
  ).jsonValue()) as string[];
  const first = pops[0] ?? '';
  expect(WORDS('bring').some((w) => first.startsWith(w))).toBe(true);
  expect(first).toContain(String(brakkie.bring.points));
});
