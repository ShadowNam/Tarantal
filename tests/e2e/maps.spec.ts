// v1.2 day-of-week maps and Verder (D-033): a hunt's replay and a challenge link reproduce the
// same map on desktop and phones, an old link keeps its plain map, and (on demand) the Karoo
// weekday and Verder previews:
//   ART_PREVIEW=1 npx playwright test tests/e2e/maps.spec.ts \
//     --project=desktop-chromium --project=pixel7-landscape
// → docs/art-preview/compare/v1.2-karoo-<day|verder>-<project>.png (before = the plain biome).
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { contrast } from '../../src/game/view/skyContrast';
import { BIRD } from '../../tools/sky-contrast';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { composePair } from '../../tools/art/compare';
import { loadContent, loadContentHash } from '../../tools/testContent';
import { challengeFor, encodeChallenge } from '../../src/meta/challenge';
import { decodeInputLogText } from '../../src/sim/replay/inputLog';
import { runReplay } from '../../src/sim/replay/verify';
import { WEEKDAY_IDS } from '../../src/content/schemas';
import {
  boot,
  collectErrors,
  hook,
  isLandscape,
  isTouchProject,
  startHunt,
  tapRect,
} from './helpers';
// v1.8b (D-062): Node-side hunts register the lazy sim systems (the game loads their chunk).
import '../../src/sim/lazySystemsRegister';

const RAW = join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'screens');

test.use({ serviceWorkers: 'block' });

/** Landscape profiles only (portrait shows the rotate card); not during preview runs. */
function gate(info: TestInfo): void {
  test.skip(!isLandscape(info), 'portrait shows the rotate card');
  test.skip(process.env['ART_PREVIEW'] === '1', 'previews run on their own');
}

async function waitScene(page: Page, scene: string): Promise<void> {
  await page.waitForFunction((s) => window.__TM__?.scene === s, scene, { timeout: 120_000 });
}

test.describe('maps (v1.2)', () => {
  test('a Verder hunt on Friday replays to the same map and events (Node = this browser)', async ({
    page,
  }, info) => {
    gate(info);
    test.setTimeout(300_000);
    const errors = collectErrors(page);
    await boot(
      page,
      'seed=7&huntSeconds=4&layout=fri&bonus=verder&reenbui=content&brakkie=content',
    );
    await startHunt(page, isTouchProject(info));
    let h = await hook(page);
    expect(h.map).toMatchObject({
      layout: 'fri',
      bonus: 'verder',
      lights: ['dusty_wind', 'verder_haze'],
    });
    // Friday's windpomp stands east (data), and the HUD names the bonus map (English, D-041).
    expect(h.map?.props['windpomp']).toBe(0.7);
    expect(h.hudTag).toBe('Further · bonus map');
    await waitScene(page, 'tally');
    h = await hook(page);
    expect(h.result).toMatchObject({ layout: 'fri', bonus: 'verder' });
    const text = h.replay ?? '';
    const log = decodeInputLogText(text);
    expect(log.mode).toMatchObject({ id: 'classic', layout: 'fri', bonus: 'verder' });
    const node = runReplay(log, loadContent());
    const here = await page.evaluate((l) => window.__TM_TOOLS__?.replay(l), text);
    expect(here?.eventHash).toBe(node.eventHash);
    expect(here?.score).toBe(h.result?.score);
    expect(errors).toEqual([]);
  });

  test('a challenge link plays its map; a link from before v1.2 keeps the plain map', async ({
    page,
  }, info) => {
    gate(info);
    test.setTimeout(300_000);
    const touch = isTouchProject(info);
    const errors = collectErrors(page);
    const base = {
      seed: 4243,
      mode: 'classic' as const,
      biome: 'karoo-autumn',
      weapon: 'dubbelloop',
      score: 1234,
      dailyNumber: null,
    };
    const hash = loadContentHash();
    const withMap = challengeFor({ ...base, layout: 'thu', bonus: 'verder' }, hash);
    await boot(page, `huntSeconds=3&c=${encodeChallenge(withMap)}&reenbui=content&brakkie=content`);
    await waitScene(page, 'challenge');
    await tapRect(page, touch, 'accept');
    await waitScene(page, 'hunt');
    let h = await hook(page);
    expect(h.huntSeed).toBe(4243);
    expect(h.map).toMatchObject({ layout: 'thu', bonus: 'verder' });
    // Thursday's weather is on in Classic (wind).
    expect(h.omen).toBe(true);
    await waitScene(page, 'tally');
    h = await hook(page);
    expect(decodeInputLogText(h.replay ?? '').mode).toMatchObject({
      layout: 'thu',
      bonus: 'verder',
    });

    const old = challengeFor(base, hash);
    expect('l' in old).toBe(false);
    await boot(page, `huntSeconds=3&c=${encodeChallenge(old)}&reenbui=content&brakkie=content`);
    await waitScene(page, 'challenge');
    await tapRect(page, touch, 'accept');
    await waitScene(page, 'hunt');
    h = await hook(page);
    expect(h.map).toMatchObject({ layout: null, bonus: null });
    expect(errors).toEqual([]);
  });

  test('a Classic hunt over the quota unlocks Verder; the title then offers it', async ({
    page,
  }, info) => {
    gate(info);
    test.setTimeout(300_000);
    const touch = isTouchProject(info);
    // quotaMul=0: every quota is 0, so any score unlocks (a 2 s hunt).
    await boot(page, 'today=2026-10-23&huntSeconds=2&quotaMul=0');
    await page.waitForFunction(() => window.__TM__?.rects['start'] !== undefined);
    expect((await hook(page)).verder).toBe(false);
    await startHunt(page, touch);
    await waitScene(page, 'tally');
    let h = await hook(page);
    expect(h.verderUnlocked).toBe('verder');
    expect(h.tally?.news ?? '').toContain('Further unlocked for today!');
    await tapRect(page, touch, 'menu');
    await waitScene(page, 'start');
    await page.waitForFunction(() => window.__TM__?.rects['verder'] !== undefined);
    h = await hook(page);
    expect(h.verder).toBe(true);
    // Verder sits above the bottom row (Daily, Season Run), never on it.
    const v = h.rects['verder'];
    const d = h.rects['daily'];
    expect(v !== undefined && d !== undefined && v.y + v.h < d.y).toBe(true);
  });

  test('beating today’s quota offers Verder on the title until UTC midnight', async ({
    page,
  }, info) => {
    gate(info);
    test.setTimeout(300_000);
    // A save with Verder unlocked yesterday shows it locked today; one unlocked today shows it.
    const today = '2026-10-23';
    const day = 20749;
    for (const [unlockDay, open] of [
      [day - 1, false],
      [day, true],
    ] as const) {
      await page.addInitScript((d) => {
        localStorage.setItem(
          'tm.e2e.save.v1',
          JSON.stringify({
            v: 1,
            ftue: { done: true, skipped: false, step: '' },
            bonusMaps: { day: d, unlocked: ['karoo-autumn/verder'], bests: {} },
          }),
        );
      }, unlockDay);
      await boot(page, `today=${today}`);
      await page.waitForFunction(() => window.__TM__?.rects['start'] !== undefined);
      const h = await hook(page);
      expect(h.verder, `unlocked on day ${unlockDay}`).toBe(open);
      expect(h.rects['verder'] !== undefined).toBe(open);
      if (open) {
        mkdirSync(join('test-results', 'maps'), { recursive: true });
        await page.screenshot({
          path: join('test-results', 'maps', `title-verder-${info.project.name}.png`),
        });
        await tapRect(page, isTouchProject(info), 'verder');
        await waitScene(page, 'hunt');
        expect((await hook(page)).map).toMatchObject({ layout: 'fri', bonus: 'verder' });
      }
    }
  });
});

// --- previews (on demand) --------------------------------------------------------------------

const PROFILES = ['desktop-chromium', 'pixel7-landscape'];

test.describe('map previews', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(process.env['ART_PREVIEW'] !== '1', 'on demand: ART_PREVIEW=1');
    test.skip(!PROFILES.includes(info.project.name), 'previews: desktop + Pixel 7 landscape');
    await page.addInitScript(() => {
      localStorage.setItem(
        'tm.e2e.save.v1',
        JSON.stringify({
          v: 1,
          settings: { quality: 'medium' },
          ftue: { done: true, skipped: false, step: '' },
        }),
      );
    });
  });

  async function shot(page: Page, info: TestInfo, query: string, file: string): Promise<void> {
    await boot(page, `seed=42&huntSeconds=20&holdAt=240&${query}`);
    await startHunt(page, isTouchProject(info));
    await page.waitForFunction(() => (window.__TM__?.tick ?? 0) >= 240, null, { timeout: 300_000 });
    await page.waitForFunction(() => window.__TM__?.fontsReady === true, null, { timeout: 30_000 });
    const box = await page.locator('#game canvas').boundingBox();
    if (box !== null) await page.mouse.move(box.x + box.width - 2, box.y + box.height - 2);
    await page.waitForTimeout(800);
    mkdirSync(RAW, { recursive: true });
    writeFileSync(join(RAW, file), await page.screenshot());
  }

  /** Median plumage:sky contrast in the fly-over band of a screenshot (centre half, y 17–38 %). */
  function skyContrastOf(file: string): number {
    const png = PNG.sync.read(readFileSync(join(RAW, file)));
    const cs: number[] = [];
    for (let yf = 0.17; yf <= 0.38; yf += 0.01)
      for (let xf = 0.25; xf <= 0.75; xf += 0.01) {
        const i = (Math.floor(png.height * yf) * png.width + Math.floor(png.width * xf)) * 4;
        const rgb =
          ((png.data[i] ?? 0) << 16) | ((png.data[i + 1] ?? 0) << 8) | (png.data[i + 2] ?? 0);
        cs.push(contrast(rgb, BIRD));
      }
    cs.sort((a, b) => a - b);
    return cs[cs.length >> 1] ?? 0;
  }

  // MAPS=mon,tue (optional) shoots only those maps (short runs); the plain "before" is shot when
  // missing or when MAPS includes plain. The contrast JSON is merged across runs.
  test('Karoo: plain, each weekday and Verder', async ({ page }, info) => {
    test.setTimeout(900_000);
    const p = info.project.name;
    const only = (process.env['MAPS'] ?? '').split(',').filter((m) => m !== '');
    const want = (m: string): boolean => only.length === 0 || only.includes(m);
    const before = `v1.2-karoo-plain-${p}.png`;
    if (want('plain') || !existsSync(join(RAW, before)))
      await shot(page, info, 'layout=none', before);
    const maps: [string, string][] = [
      ...WEEKDAY_IDS.map((d) => [d, `layout=${d}`] as [string, string]),
      ['verder', 'layout=fri&bonus=verder'],
    ];
    const out = join(RAW, '..', 'compare', `v1.2-sky-contrast-${p}.json`);
    const sky = (existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : {}) as Record<
      string,
      number
    >;
    sky['plain'] = skyContrastOf(before);
    for (const [name, query] of maps) {
      if (!want(name)) continue;
      const after = `v1.2-karoo-${name}-after-${p}.png`;
      await shot(page, info, query, after);
      copyFileSync(join(RAW, before), join(RAW, `v1.2-karoo-${name}-before-${p}.png`));
      expect(composePair(`v1.2-karoo-${name}`, p)).toBe(true);
      sky[name] = skyContrastOf(after);
    }
    writeFileSync(out, `${JSON.stringify(sky, null, 2)}\n`);
    // Fly-overs stay readable: ≥ 80 % of the plain sky's contrast (≈ 2.6 on the Karoo).
    for (const [name, c] of Object.entries(sky))
      expect(c, `${name} sky contrast`).toBeGreaterThanOrEqual(0.8 * (sky['plain'] ?? 0));
  });
});
