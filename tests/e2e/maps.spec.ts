// v1.2 day-of-week maps and Verder (D-033): a hunt's replay and a challenge link reproduce the
// same map on desktop and phones, an old link keeps its plain map, and (on demand) the Karoo
// weekday and Verder previews:
//   ART_PREVIEW=1 npx playwright test tests/e2e/maps.spec.ts \
//     --project=desktop-chromium --project=pixel7-landscape
// → docs/art-preview/compare/v1.2-karoo-<day|verder>-<project>.png (before = the plain biome).
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
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
    await boot(page, 'seed=7&huntSeconds=4&layout=fri&bonus=verder');
    await startHunt(page, isTouchProject(info));
    let h = await hook(page);
    expect(h.map).toMatchObject({
      layout: 'fri',
      bonus: 'verder',
      lights: ['late_afternoon', 'verder_haze'],
    });
    // Friday's windpomp stands east (data), and the HUD says Verder.
    expect(h.map?.props['windpomp']).toBe(0.7);
    expect(h.hudTag).toBe('Verder · further');
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
    await boot(page, `huntSeconds=3&c=${encodeChallenge(withMap)}`);
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
    await boot(page, `huntSeconds=3&c=${encodeChallenge(old)}`);
    await waitScene(page, 'challenge');
    await tapRect(page, touch, 'accept');
    await waitScene(page, 'hunt');
    h = await hook(page);
    expect(h.map).toMatchObject({ layout: null, bonus: null });
    expect(errors).toEqual([]);
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

  test('Karoo: plain, each weekday and Verder', async ({ page }, info) => {
    test.setTimeout(900_000);
    const p = info.project.name;
    const before = `v1.2-karoo-plain-${p}.png`;
    await shot(page, info, 'layout=none', before);
    const maps: [string, string][] = [
      ...WEEKDAY_IDS.map((d) => [d, `layout=${d}`] as [string, string]),
      ['verder', 'layout=fri&bonus=verder'],
    ];
    for (const [name, query] of maps) {
      await shot(page, info, query, `v1.2-karoo-${name}-after-${p}.png`);
      copyFileSync(join(RAW, before), join(RAW, `v1.2-karoo-${name}-before-${p}.png`));
      expect(composePair(`v1.2-karoo-${name}`, p)).toBe(true);
    }
  });
});
