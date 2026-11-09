// v1.13 (D-075): the veld cameos. Each area's cameo is brought out in view on a fixed seed with the
// preview flag (?cameoPreview=<kind>: out 0.5 s in, walking slowly towards the centre; lesson 41: no
// shooting luck) on the plain map (layout=none) and held: it is really drawn on the canvas (pixels with it vs the same held tick
// without it, lesson 14), its feet are on the ground line (lessons 8, 18) and its drawn pixels'
// centre sits on its hit shape facing either way (lesson 22); the field guide records it. A shot
// aimed at one (no birds: nothing to give it the benefit of the doubt) costs 10 with Oupa's scold;
// the Okavango's elephants trumpet; with no delivery nothing is drawn and the hunt never waits.
// Every other spec boots with cameos=0 (helpers.ts boot(), lesson 17). Shots are in-page pointer
// events with a fresh pointerId each; a miss is decided after ~25 ticks.
import { expect, test, type Page } from '@playwright/test';
import cameos from '../../content/cameos.json' with { type: 'json' };
import { decodePng } from '../../tools/assets/image';
import { fireAt, reloadIfEmpty } from './feesdaeHelpers';
import { boot, hook, isLandscape, isTouchProject, startHunt, waitTicks } from './helpers';

interface Member {
  frame: string | null;
  visible: boolean;
  x: number;
  y: number;
  groundY: number;
  facing: number;
  alpha: number;
}

interface Cameos {
  area: string;
  sheet: string | null;
  visits: {
    id: number;
    kind: string;
    plane: string;
    phase: string;
    reaction: string | null;
    members: Member[];
  }[];
  seen: string[];
  hits: number;
  aimedHits: number;
  trumpets: number;
}

type Hooked = {
  __TM__?: {
    tick: number;
    score: number;
    designWidth: number;
    designHeight: number;
    cameos?: Cameos | null;
    namibLog?: string[];
    journalSightings?: string[];
    rects: Record<string, { x: number; y: number; w: number; h: number }>;
  };
  __TM_HOLD_AT__?: (tick: number | null) => void;
  __TM_CAMEOS_HIDE__?: (on: boolean) => void;
};

// `cameos=1` names the cameos for boot() (helpers.ts adds `cameos=0` unless the query names
// `cameos=`, and `cameos=0` wins over the preview); with a preview it plays the same content.
const base = (biome: string, kind: string): string =>
  `biome=${biome}&layout=none&seed=42&huntSeconds=300&graphics=standard&baboons=0&faunaIdle=0&omen=0&cameos=1&cameoPreview=${kind}`;

/** Waits (bounded) until the area's sheet is in and a member of a visit of `kind` is drawn; holds
 *  the sim right there and returns that member (its feet in design px). */
async function holdDrawn(page: Page, kind: string): Promise<Member> {
  const m = await page.waitForFunction(
    (k) => {
      const w = window as unknown as Hooked;
      const c = w.__TM__?.cameos;
      if (c?.sheet === null || c?.sheet === undefined) return false;
      const v = c.visits.find((x) => x.kind === k);
      const got = v?.members.find((x) => x.visible && x.alpha >= 1);
      if (got === undefined) return false;
      w.__TM_HOLD_AT__?.((w.__TM__?.tick ?? 0) + 1);
      return got;
    },
    kind,
    { timeout: 300_000, polling: 'raf' },
  );
  return (await m.jsonValue()) as Member;
}

/** Waits (bounded) until a few frames have been drawn since now (the held tick redrawn), instead
 *  of a fixed wait that a slow device could outrun. */
async function freshFrames(page: Page): Promise<void> {
  const f0 = await page.evaluate(() => window.__TM__?.sceneryFrames ?? 0);
  await page.waitForFunction((f) => (window.__TM__?.sceneryFrames ?? 0) > f + 3, f0, {
    timeout: 120_000,
  });
}

test.use({ serviceWorkers: 'block' });

// The boxes are the v1.13 drawings' (sizeMul 1); v1.17b (D-080) grows each kind by its sizeMul.
for (const [biome, kind, box1] of [
  ['bushveld-winter', 'warthogs', { w: 132, h: 90 }],
  ['karoo-autumn', 'tortoise', { w: 110, h: 70 }],
  ['kalahari-summer', 'springbok', { w: 130, h: 116 }],
  ['namibie', 'gemsbok', { w: 186, h: 184 }],
] as const)
  test(`${biome}: the ${kind} cameo is drawn on the canvas, feet on the ground, seen in the field guide`, async ({
    page,
  }, info) => {
    test.skip(!isLandscape(info), 'landscape only: portrait shows the rotate card');
    test.setTimeout(600_000);
    const S = cameos.kinds[kind].sizeMul;
    const box = { w: box1.w * S, h: box1.h * S };
    await boot(page, `${base(biome, kind)}&birds=0&brakkie=0`);
    await startHunt(page, isTouchProject(info));
    const first = await holdDrawn(page, kind);
    await page.mouse.move(0, 0);
    await freshFrames(page);
    const c = (await page.evaluate(() => (window as unknown as Hooked).__TM__?.cameos)) ?? null;
    const drawn = c?.visits.find((v) => v.kind === kind)?.members.filter((x) => x.visible) ?? [];
    const m = drawn[0] ?? first;
    // A herd of one role (springbok, gemsbok) stands closer than a body's width: the sampled box
    // takes in the whole herd, measured against the mean of their bodies (a lone member's box
    // would hold most of the next one and pull the centre back, review round 2).
    const herd =
      new Set(cameos.kinds[kind].group.map((g) => g.role)).size === 1 && drawn.length > 1
        ? drawn
        : [m];
    // Nothing floating: its feet on its ground line (lessons 8, 18).
    expect(Math.abs(m.y - m.groundY)).toBeLessThanOrEqual(2);
    const shot = async (): Promise<ReturnType<typeof decodePng>> =>
      decodePng(await page.locator('#game canvas').screenshot());
    const hide = async (on: boolean): Promise<void> => {
      await page.evaluate((v) => {
        (window as unknown as Hooked).__TM_CAMEOS_HIDE__?.(v);
      }, on);
      await freshFrames(page);
    };
    const all = await shot();
    await hide(true);
    const none = await shot();
    await hide(false);
    const h = await hook(page);
    const k = all.width / h.designWidth;
    let n = 0;
    let sx = 0;
    const xs = herd.map((x) => x.x);
    for (let y = m.y - box.h; y <= m.y + 4; y += 2)
      for (let x = Math.min(...xs) - box.w; x <= Math.max(...xs) + box.w; x += 2) {
        const i = (Math.round(y * k) * all.width + Math.round(x * k)) * 4;
        const d =
          Math.abs((all.data[i] ?? 0) - (none.data[i] ?? 0)) +
          Math.abs((all.data[i + 1] ?? 0) - (none.data[i + 1] ?? 0)) +
          Math.abs((all.data[i + 2] ?? 0) - (none.data[i + 2] ?? 0));
        if (d > 60) {
          n++;
          sx += x;
        }
      }
    expect(n, `${kind}'s pixels on the canvas`).toBeGreaterThan(60);
    // Lesson 22: facing either way, its drawn pixels' centre (across) sits on its body's hit shape.
    const body = cameos.kinds[kind].hitboxes.adult[0];
    if (body === undefined) throw new Error('no hitbox');
    const cx = herd.reduce((a, x) => a + x.x + body.ox * S * x.facing, 0) / herd.length;
    expect(
      Math.abs(sx / n - cx),
      `centre ${String(sx / n)} vs body ${String(cx)}`,
    ).toBeLessThanOrEqual(body.rx * S);
    // The near ones keep clear of the HUD (≤ 25 % of the box under any HUD rect, as Brakkie).
    if (kind === 'tortoise') {
      const r = { x: m.x - box.w / 2, y: m.y - box.h, w: box.w, h: box.h };
      for (const [id, o] of Object.entries(h.rects)) {
        const ox = Math.max(0, Math.min(r.x + r.w, o.x + o.w) - Math.max(r.x, o.x));
        const oy = Math.max(0, Math.min(r.y + r.h, o.y + o.h) - Math.max(r.y, o.y));
        expect((ox * oy) / (r.w * r.h), `under ${id}`).toBeLessThanOrEqual(0.25);
      }
    }
    // The field guide (the shed's Journal) records it: drawn on screen, not through a scope.
    const species = {
      warthogs: 'warthog',
      tortoise: 'tortoise',
      springbok: 'springbok',
      gemsbok: 'gemsbok',
    }[kind];
    const seen = await page.evaluate(
      () => (window as unknown as Hooked).__TM__?.journalSightings ?? [],
    );
    expect(seen).toContain(species);
  });

test('a shot aimed at a cameo costs 10 with Oupa’s scold; it reacts and stays', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'landscape only: portrait shows the rotate card');
  test.setTimeout(600_000);
  const touch = isTouchProject(info);
  // No birds: nothing near the aim point (the benefit of the doubt) and nothing else scores.
  await boot(page, `${base('karoo-autumn', 'tortoise')}&birds=0&brakkie=0`);
  await startHunt(page, touch);
  await holdDrawn(page, 'tortoise');
  await page.evaluate(() => {
    (window as unknown as Hooked).__TM_HOLD_AT__?.(null);
  });
  const body = cameos.kinds.tortoise.hitboxes.adult[0];
  if (body === undefined) throw new Error('no hitbox');
  let hit = false;
  let before = -1;
  for (let shot = 0; shot < 20 && !hit; shot++) {
    await reloadIfEmpty(page, touch);
    // Read where it is and fire in the same in-page moment (it walks, slowly).
    const c = await page.evaluate(() => (window as unknown as Hooked).__TM__?.cameos ?? null);
    const m = c?.visits.find((v) => v.kind === 'tortoise')?.members[0];
    if (m === undefined || !m.visible) {
      await waitTicks(page, 15);
      continue;
    }
    before = (await hook(page)).score;
    const k = cameos.kinds.tortoise.sizeMul;
    const fired = await fireAt(page, touch, {
      x: m.x + body.ox * k * m.facing,
      y: m.y + body.oy * k,
    });
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
  expect(hit, 'a shot aimed at the tortoise within 20 tries').toBe(true);
  expect((await hook(page)).score).toBe(before - cameos.hit.penalty);
  const log = await page.evaluate(() => (window as unknown as Hooked).__TM__?.namibLog ?? []);
  expect(log).toContain('bark:guide.cameo.scold');
  // It pulls in its head (the reaction) and is still there: never removed.
  const c = await page.evaluate(() => (window as unknown as Hooked).__TM__?.cameos ?? null);
  const v = c?.visits.find((x) => x.kind === 'tortoise');
  expect(v?.members).toHaveLength(1);
  expect(c?.aimedHits).toBeGreaterThanOrEqual(1);
});

test('the Okavango elephants trumpet when the preview brings it on', async ({ page }, info) => {
  test.skip(!isLandscape(info), 'landscape only: portrait shows the rotate card');
  test.setTimeout(300_000);
  await boot(page, `${base('okavango-spring', 'elephants')}&birds=0&brakkie=0`);
  await startHunt(page, isTouchProject(info));
  await page.waitForFunction(
    () => ((window as unknown as Hooked).__TM__?.cameos?.trumpets ?? 0) >= 1,
    null,
    { timeout: 240_000 },
  );
  const c = await page.evaluate(() => (window as unknown as Hooked).__TM__?.cameos ?? null);
  // No sheet in the Okavango (the far herd answers): nothing to draw of its own.
  expect(c?.area).toBe('okavango');
  expect(c?.visits).toHaveLength(0);
});

test('with no delivery no cameo is drawn and the hunt never waits for them', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'landscape only: portrait shows the rotate card');
  test.setTimeout(300_000);
  await page.route('**/assets/asset-index.json', (r) => r.fulfill({ status: 404, body: '' }));
  await boot(page, `${base('kalahari-summer', 'springbok')}&brakkie=0`);
  await startHunt(page, isTouchProject(info));
  await waitTicks(page, 240);
  const c = await page.evaluate(() => (window as unknown as Hooked).__TM__?.cameos ?? null);
  // The chunk may be in (it is code), but no sheet: never drawn.
  expect(c === null || (c.sheet === null && c.visits.length === 0)).toBe(true);
  expect((await hook(page)).tick).toBeGreaterThan(240);
});
