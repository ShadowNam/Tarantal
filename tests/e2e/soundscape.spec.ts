// v1.9 (D-066) the veld soundscape in the game (Tech §7.1, art bible §10.2): in a hunt on Okavango
// at dusk and on the Kalahari at midday, the test hook's calls come from that area's set only, at
// plausible rates (sim ticks, generous bounds); no call that sounds like a penalty creature plays
// in its quiet window; nothing plays once the tab is hidden; START is never blocked by the
// soundscape (its files are requested only after the hunt has started, and title → hunt takes
// about as long as with ?soundscape=0). Every wait is bounded by sim ticks or a fixed timeout.
// The rates are boosted (?soundscapeBoost, test builds only) so a 20 s hunt shows them.
import { expect, test, type Page } from '@playwright/test';
import sc from '../../content/client/soundscape.json' with { type: 'json' };
import { boot, collectErrors, hook, isTouchProject, startHunt, tapAt } from './helpers';

// The service worker would fetch the files itself (page.route and resource timing see less).
test.use({ serviceWorkers: 'block' });

const BOOST = 6;
const TPS = 60;
type Area = keyof typeof sc.areas;
type Light = keyof typeof sc.profiles.doveDay;

const soundsOf = (area: Area): Set<string> =>
  new Set(sc.areas[area].map((e) => sc.calls[e.call as keyof typeof sc.calls].sound));

/** Calls a minute the area offers under this light (boosted). */
function perMinute(area: Area, light: Light): number {
  let n = 0;
  for (const e of sc.areas[area])
    n += e.perMinute * sc.profiles[e.profile as keyof typeof sc.profiles][light] * BOOST;
  return n;
}

/** The sound keys of calls that sound like this creature. */
const warnSounds = (creature: string): Set<string> =>
  new Set(
    Object.values(sc.calls)
      .filter((c) => 'warns' in c && c.warns === creature)
      .map((c) => c.sound),
  );

async function huntOn(page: Page, touch: boolean, biome: Area, layout: string): Promise<void> {
  await boot(
    page,
    `seed=7&biome=${biome}&layout=${layout}&huntSeconds=20&graphics=standard&soundscapeBoost=${BOOST}`,
  );
  await startHunt(page, touch);
  // The soundscape's chunk arrives after the first gesture (START): bounded by a timeout.
  await page.waitForFunction(
    (area) => window.__TM__?.soundscape?.area === area && !window.__TM__.soundscape.title,
    biome,
    { timeout: 60_000 },
  );
}

/** Waits until the hunt reached `tick` (or ended). */
async function untilTick(page: Page, tick: number): Promise<void> {
  await page.waitForFunction(
    (t) => (window.__TM__?.tick ?? 0) >= t || window.__TM__?.over === true,
    tick,
    { timeout: 300_000 },
  );
}

for (const [biome, layout, light, signature] of [
  ['okavango-spring', 'sat', 'dusk', 'sfx/amb_reed_frog'],
  ['kalahari-summer', 'tue', 'midday', 'sfx/amb_cicada'],
] as const)
  test(`${biome} at ${light}: the area's own calls, at plausible rates, quiet around its penalty creatures`, async ({
    page,
    browserName,
  }, info) => {
    test.setTimeout(420_000);
    const errors = collectErrors(page);
    const touch = isTouchProject(info);
    await huntOn(page, touch, biome, layout);
    const startTick = (await hook(page)).tick;
    // 15 s of hunt (sim ticks, not wall time: software GL runs slower than real time).
    await untilTick(page, startTick + 15 * TPS);
    const h = await hook(page);
    const s = h.soundscape;
    expect(s).not.toBeNull();
    if (s === null) return;
    expect(s.light).toBe(light);
    const own = soundsOf(biome);
    for (const c of s.calls) expect(own.has(c.key), c.key).toBe(true);
    // Rates: every offered call is counted (the timeline doesn't depend on what played).
    const offered = Object.values(s.counts).reduce((a, b) => a + b, 0);
    const minutes = (h.tick - startTick) / (60 * TPS);
    const want = perMinute(biome, light) * minutes;
    expect(offered).toBeGreaterThan(want * 0.3);
    expect(offered).toBeLessThan(want * 2.5 + 4);
    expect(s.calls.some((c) => c.key === signature)).toBe(true);
    // Pans stay within ±0.7.
    for (const c of s.calls) expect(Math.abs(c.pan)).toBeLessThanOrEqual(0.7);
    // Penalty creatures: none of their calls played from quietBeforeEventMs before their event
    // to quietAfterEventMs after it (their flight may last longer; the unit tests cover that).
    const before = (sc.quietBeforeEventMs * TPS) / 1000;
    const after = (sc.quietAfterEventMs * TPS) / 1000;
    for (const w of s.warnings) {
      const keys = warnSounds(w.creature);
      for (const c of s.calls)
        if (keys.has(c.key) && c.outcome === 'played')
          expect(
            c.at < w.tick - before || c.at > w.tick + after,
            `${c.key} played at ${c.at}, ${w.creature} at ${w.tick}`,
          ).toBe(true);
    }
    // At most 2 soundscape voices at once.
    expect(s.voices).toBeLessThanOrEqual(sc.maxVoices);
    // Chromium plays them (its codecs and Web Audio run headless; Linux WebKit may lack them).
    if (browserName === 'chromium') {
      expect(s.files).toBeGreaterThan(0);
      expect(s.counts.played).toBeGreaterThan(0);
    }
    expect(errors).toEqual([]);
  });

test('nothing plays once the tab is hidden', async ({ page, browserName }, info) => {
  test.skip(browserName !== 'chromium', 'Chromium: Web Audio plays headless');
  test.setTimeout(300_000);
  const touch = isTouchProject(info);
  await huntOn(page, touch, 'okavango-spring', 'sat');
  await page.waitForFunction(() => (window.__TM__?.soundscape?.counts.played ?? 0) > 0, null, {
    timeout: 240_000,
  });
  // Hide the tab and read the tick and the played count in the same call (lesson 30).
  const at = await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    const s = window.__TM__?.soundscape;
    return { tick: window.__TM__?.tick ?? 0, played: s?.counts.played ?? 0 };
  });
  await page.waitForTimeout(4_000);
  const s = (await hook(page)).soundscape;
  expect(s?.counts.played).toBe(at.played);
  for (const c of s?.calls ?? [])
    if (c.outcome === 'played') expect(c.at).toBeLessThanOrEqual(at.tick);
});

/** Ms from the START tap to the hunt start (hook.boot.huntStart), and the soundscape requests. */
async function startTiming(
  page: Page,
  touch: boolean,
  query: string,
): Promise<{ startMs: number; firstScapeRequest: number | null; huntStart: number }> {
  await boot(page, `seed=7&graphics=standard&${query}`);
  await page.waitForFunction(() => window.__TM__?.rects['start'] !== undefined, null, {
    timeout: 60_000,
  });
  const r = (await hook(page)).rects['start'];
  if (r === undefined) throw new Error('no START');
  const tapped = await page.evaluate(() => performance.now());
  await tapAt(page, touch, r.x + r.w / 2, r.y + r.h / 2);
  await page.waitForFunction(() => window.__TM__?.boot['huntStart'] !== undefined, null, {
    timeout: 120_000,
  });
  // Give the background loads a moment (bounded), then read the resource timings.
  await page.waitForTimeout(3_000);
  return page.evaluate((t0) => {
    const huntStart = window.__TM__?.boot['huntStart'] ?? 0;
    const scape = performance
      .getEntriesByType('resource')
      .filter((e) => e.name.includes('/assets/soundscape/'))
      .map((e) => e.startTime);
    return {
      startMs: huntStart - t0,
      firstScapeRequest: scape.length === 0 ? null : Math.min(...scape),
      huntStart,
    };
  }, tapped);
}

test('START is never blocked: soundscape files load only after the hunt has started', async ({
  page,
}, info) => {
  test.setTimeout(420_000);
  const touch = isTouchProject(info);
  // With the soundscape off nothing of it loads; then the same page, reloaded, with it on.
  const off = await startTiming(page, touch, 'soundscape=0');
  expect(off.firstScapeRequest).toBeNull();
  expect((await hook(page)).soundscape).toBeNull();
  const on = await startTiming(page, touch, '');
  if (on.firstScapeRequest !== null)
    expect(on.firstScapeRequest).toBeGreaterThanOrEqual(on.huntStart);
  expect(on.startMs).toBeLessThanOrEqual(off.startMs * 1.5 + 3_000);
});

test('the title plays its area too, calmer, after the first gesture', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Chromium: Web Audio plays headless');
  test.setTimeout(300_000);
  await boot(page, `seed=7&graphics=standard&soundscapeBoost=${BOOST}`);
  // Nothing before a gesture.
  expect((await hook(page)).soundscape).toBeNull();
  // A key press is a gesture (it unlocks audio) and presses nothing on the title.
  await page.keyboard.press('Shift');
  await page.waitForFunction(() => window.__TM__?.soundscape?.title === true, null, {
    timeout: 60_000,
  });
  // The title loads the files after titleLoadDelayMs (8 s), then calls play.
  await page.waitForFunction(() => (window.__TM__?.soundscape?.counts.played ?? 0) > 0, null, {
    timeout: 120_000,
  });
  const s = (await hook(page)).soundscape;
  expect(s?.area).toBe('karoo-autumn');
  for (const c of s?.calls ?? []) expect(soundsOf('karoo-autumn').has(c.key)).toBe(true);
});
