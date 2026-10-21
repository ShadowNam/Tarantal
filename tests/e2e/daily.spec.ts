// M7 "Done when": the same daily seed + replay gives the Node event hash in this browser (Chromium
// and WebKit in CI), for pointer and touch logs, at 1440, 1920 and 2520 wide; the Daily from the
// title is official once and practice after; the tally shares (clipboard fallback); a challenge
// link shows the "beat this" card, plays its exact seed and compares; a bad link is rejected.
// Kept short for software GL: 3 s hunts, replays run in-page (no rendering involved).
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { GoldenReplay } from '../../tools/goldenCases';
import { loadContentHash } from '../../tools/testContent';
import { designSizeFor } from '../../src/game/layout';
import { challengeFor, encodeChallenge } from '../../src/meta/challenge';
import { dailySeed } from '../../src/meta/daily';
import {
  SCREENSHOTS,
  boot,
  collectErrors,
  hook,
  isLandscape,
  isTouchProject,
  tapRect,
} from './helpers';

const DAY = '2026-10-21';
const golden = (
  JSON.parse(readFileSync('src/sim/replay/golden/replays.json', 'utf8')) as GoldenReplay[]
).filter((g) => g.dailyDate === DAY);

async function waitScene(page: Page, scene: string): Promise<void> {
  await page.waitForFunction((s) => window.__TM__?.scene === s, scene, { timeout: 120_000 });
}

/** No share sheet; the clipboard records what it was given (the desktop fallback path). */
async function stubClipboard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const copied: string[] = [];
    (window as unknown as { __copied: string[] }).__copied = copied;
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (t: string) => {
          copied.push(t);
          return Promise.resolve();
        },
      },
    });
  });
}

test.describe('Daily Hunt', () => {
  test('daily replays give the Node event hash here, at 1440, 1920 and 2520 wide', async ({
    page,
  }, info) => {
    test.setTimeout(300_000);
    expect(golden.map((g) => g.inputKind).sort()).toEqual(['pointer', 'touch']);
    const hash = loadContentHash();
    const seed = dailySeed(DAY, hash);
    // Desktop: three widths, each a fresh page load. Phones: their own viewport (WebKit on iPhone).
    const widths = info.project.use.isMobile === true ? [null] : [1440, 1920, 2520];
    for (const w of widths) {
      if (w !== null) await page.setViewportSize({ width: w, height: 1080 });
      await boot(page, `today=${DAY}`);
      const h = await hook(page);
      if (w !== null) expect(h.designWidth).toBe(designSizeFor(w, 1080).width);
      const got = await page.evaluate(
        ([day, logs]) => {
          const tools = window.__TM_TOOLS__;
          if (!tools) throw new Error('test tools missing');
          return {
            contentHash: tools.contentHash,
            seed: tools.dailySeed(day),
            outcomes: logs.map((l) => tools.replay(l)),
          };
        },
        [DAY, golden.map((g) => g.log)] as const,
      );
      expect(got.contentHash).toBe(hash);
      expect(got.seed).toBe(seed);
      golden.forEach((g, i) => {
        expect(g.seed).toBe(seed);
        expect(got.outcomes[i], `${g.name} at width ${String(w)}`).toEqual(g.expected);
      });
    }
  });

  test('from the title: official first, practice after; the tally shares', async ({
    page,
  }, info) => {
    test.skip(!isLandscape(info), 'portrait shows the rotate card');
    test.setTimeout(300_000);
    const touch = isTouchProject(info);
    const errors = collectErrors(page);
    await stubClipboard(page);
    await boot(page, `huntSeconds=3&today=${DAY}`);
    await page.waitForFunction(() => window.__TM__?.rects['daily'] !== undefined);
    await page.screenshot({ path: `${SCREENSHOTS}/daily-title-${info.project.name}.png` });
    await tapRect(page, touch, 'daily');
    await waitScene(page, 'hunt');
    let h = await hook(page);
    expect(h.daily).toMatchObject({ key: DAY, number: 1, official: true });
    expect(h.huntSeed).toBe(dailySeed(DAY, loadContentHash()));
    expect(h.hudTag).toBe('DAILY #1');
    expect(h.wind, 'Daily has the omen on').not.toBeNull();
    await page.screenshot({ path: `${SCREENSHOTS}/daily-hud-${info.project.name}.png` });

    await waitScene(page, 'tally');
    h = await hook(page);
    expect(h.tally).toMatchObject({ tag: 'Daily #1', share: true });
    expect(h.tally?.news).toMatch(/Streak: 1/);
    await page.screenshot({ path: `${SCREENSHOTS}/daily-tally-${info.project.name}.png` });
    await tapRect(page, touch, 'share');
    await page.waitForFunction(() => window.__TM__?.lastShare != null);
    h = await hook(page);
    expect(h.lastShare?.outcome).toBe('copied');
    const copied = await page.evaluate(
      () => (window as unknown as { __copied: string[] }).__copied,
    );
    expect(copied).toHaveLength(1);
    expect(copied[0]).toMatch(/^🐦 Tarantal Madness · Daily #1 · /);
    expect(copied[0]).toMatch(/\?c=[A-Za-z0-9_-]+$/);
    const events = h.analytics.map((r) => r.event);
    expect(events).toContain('daily_play');
    expect(h.analytics.find((r) => r.event === 'share_click')?.data).toMatchObject({
      mode: 'daily',
      official: true,
      method: 'copied',
    });

    // [Again]: the same hunt, now practice — no share.
    await tapRect(page, touch, 'again');
    await waitScene(page, 'hunt');
    h = await hook(page);
    expect(h.daily).toMatchObject({ official: false });
    expect(h.hudTag).toBe('PRACTICE · DAILY #1');
    await waitScene(page, 'tally');
    h = await hook(page);
    expect(h.tally).toMatchObject({ tag: 'Practice · Daily #1', share: false });
    expect(h.rects['share']).toBeUndefined();
    expect(errors).toEqual([]);
  });

  test('a challenge link: "beat this" card → the exact hunt → compared on the tally', async ({
    page,
  }, info) => {
    test.skip(!isLandscape(info), 'portrait shows the rotate card');
    test.setTimeout(300_000);
    const touch = isTouchProject(info);
    const errors = collectErrors(page);
    const c = challengeFor(
      {
        seed: 4242,
        mode: 'classic',
        biome: 'karoo-autumn',
        weapon: 'dubbelloop',
        score: 1234,
        dailyNumber: null,
      },
      loadContentHash(),
      'Oom Koos',
    );
    await boot(page, `huntSeconds=3&c=${encodeChallenge(c)}`);
    await waitScene(page, 'challenge');
    expect(page.url()).not.toContain('c=');
    let h = await hook(page);
    expect(h.challenge).toMatchObject({ seed: 4242, score: 1234, contentChanged: false });
    expect(h.analytics.find((r) => r.event === 'challenge_open')?.data).toMatchObject({
      ok: true,
      mode: 'classic',
    });
    await page.screenshot({ path: `${SCREENSHOTS}/challenge-card-${info.project.name}.png` });
    await tapRect(page, touch, 'accept');
    await waitScene(page, 'hunt');
    h = await hook(page);
    expect(h.huntSeed).toBe(4242);
    expect(h.mode).toBe('classic');
    expect(h.hudTag).toBe('BEAT 1\u00a0234');
    await waitScene(page, 'tally');
    h = await hook(page);
    expect(h.tally?.tag).toBe('Challenge');
    expect(h.tally?.compare).toMatch(/Oom Koos 1\u00a0234/);
    await page.screenshot({ path: `${SCREENSHOTS}/challenge-tally-${info.project.name}.png` });
    expect(errors).toEqual([]);
  });

  test('a bad challenge link is rejected safely: the title with a notice', async ({
    page,
  }, info) => {
    test.skip(!isLandscape(info), 'portrait shows the rotate card');
    const errors = collectErrors(page);
    await boot(page, 'c=bm90IGpzb24');
    await waitScene(page, 'start');
    const h = await hook(page);
    expect(h.notice).toBe("That challenge link doesn't work.");
    expect(h.analytics.find((r) => r.event === 'challenge_open')?.data).toEqual({
      ok: false,
      reason: 'notJson',
    });
    expect(page.url()).not.toContain('c=');
    await page.screenshot({ path: `${SCREENSHOTS}/challenge-bad-${info.project.name}.png` });
    expect(errors).toEqual([]);
  });
});
