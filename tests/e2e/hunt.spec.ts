// M2 "Done when": start → 20 taps across the screen → wait for the end → tally visible, on every
// landscape profile (desktop Chromium + WebKit, Pixel 7, iPhone 14). Also: [Again] restarts in
// one tap, load → first shot ≤ 3 s on desktop, and each live hunt replays identically in Node.
import { expect, test, type Page } from '@playwright/test';
import { decodeInputLogText } from '../../src/sim/replay/inputLog';
import { runReplay } from '../../src/sim/replay/verify';
import { loadContent } from '../../tools/testContent';
import {
  SCREENSHOTS,
  boot,
  collectErrors,
  hook,
  isLandscape,
  isTouchProject,
  quick,
  reload,
  startHunt,
  tapAt,
  toClient,
  waitTicks,
} from './helpers';

/** Fire `count` taps over a 5 × 4 grid (clear of the HUD), reloading when the belt is empty. */
async function tapAcrossScreen(page: Page, touch: boolean, count: number): Promise<void> {
  const h = await hook(page);
  for (let i = 0; i < count; i++) {
    let q = await quick(page);
    if (q.over) return;
    if (q.shells === 0) {
      await reload(page, touch);
      await page.waitForFunction(
        () => window.__TM__?.shells === 8 || window.__TM__?.over === true,
        null,
        { timeout: 120_000 },
      );
      q = await quick(page);
    }
    const col = i % 5;
    const row = Math.floor(i / 5) % 4;
    await tapAt(
      page,
      touch,
      h.designWidth * (0.14 + col * 0.15),
      h.designHeight * (0.25 + row * 0.13),
    );
    // Wait until this tap has become a shot, then clear the 140 ms fire cooldown (8.4 ticks)
    // from that point, so the next tap is a shot too (harness lag can be seconds here).
    await page.waitForFunction(
      (n) => (window.__TM__?.shots ?? 0) > n || window.__TM__?.over === true,
      q.shots,
      { timeout: 120_000 },
    );
    await waitTicks(page, 12);
  }
}

async function expectReplayMatches(page: Page): Promise<void> {
  const h = await hook(page);
  expect(h.replay, 'hunt recorded an InputLog').not.toBeNull();
  expect(h.result).not.toBeNull();
  if (h.replay === null || h.result === null) return;
  const replay = runReplay(decodeInputLogText(h.replay), loadContent());
  expect(replay.result).toEqual(h.result);
}

test.describe('Classic hunt', () => {
  test('start → 20 taps → end → tally visible → [Again] restarts in one tap', async ({
    page,
  }, info) => {
    test.skip(!isLandscape(info), 'portrait shows the rotate card (boot.spec.ts)');
    test.setTimeout(600_000);
    const touch = isTouchProject(info);
    const errors = collectErrors(page);
    // 60 s, not 15: under software-rendered WebGL (CI, sandboxes) each harness tap round trip
    // costs ~80 ticks, so a 15 s hunt (900 ticks) only fits ~10 taps.
    await boot(page, 'seed=7&huntSeconds=60');
    await startHunt(page, touch);
    const started = await hook(page);
    expect(started.inputKind).toBe(touch ? 'touch' : 'pointer');
    // Every placeholder texture (birds included) exists once the hunt runs.
    expect(started.missingTextures).toEqual([]);

    await tapAcrossScreen(page, touch, 20);
    await page.waitForFunction(() => window.__TM__?.scene === 'tally', null, { timeout: 300_000 });
    const h = await hook(page);
    expect(h.result?.shots).toBe(20);
    expect(h.result?.ticks).toBe(60 * 60);
    expect(h.rects['again']).toBeDefined();
    await page.waitForTimeout(1500); // count-up + rank stamp
    await page.screenshot({ path: `${SCREENSHOTS}/tally-${info.project.name}.png` });

    await expectReplayMatches(page);

    const again = h.rects['again'];
    if (!again) throw new Error('no Again button');
    await tapAt(page, touch, again.x + again.w / 2, again.y + again.h / 2);
    await page.waitForFunction(
      () => window.__TM__?.scene === 'hunt' && window.__TM__.hunts === 2,
      null,
      {
        timeout: 60_000,
      },
    );
    await waitTicks(page, 5);
    const next = await hook(page);
    expect(next.over).toBe(false);
    expect(next.inputKind).toBe(touch ? 'touch' : 'pointer');
    expect(errors).toEqual([]);
  });

  test('page load → first shot ≤ 3 s (desktop)', async ({ page }, info) => {
    test.skip(isTouchProject(info) || !isLandscape(info), 'desktop criterion');
    test.setTimeout(120_000);
    const errors = collectErrors(page);
    const wallStart = Date.now();
    await boot(page, 'seed=11');
    // Stamp pointer presses inside the page, so harness round trips (seconds on a loaded,
    // software-rendered sandbox) don't count as game time.
    await page.evaluate(() => {
      const w = window as unknown as { __downs: number[] };
      w.__downs = [];
      document
        .querySelector('#game canvas')
        ?.addEventListener('pointerdown', () => w.__downs.push(performance.now()), {
          capture: true,
        });
    });
    await startHunt(page, false);
    const h = await hook(page);
    const p = await toClient(page, h.designWidth / 2, h.designHeight * 0.3);
    await page.mouse.click(p.x, p.y);
    await page.waitForFunction(() => window.__TM__?.firstShotAtMs !== null, null, {
      timeout: 60_000,
    });
    const t = await page.evaluate(() => {
      const hk = window.__TM__;
      const downs = (window as unknown as { __downs: number[] }).__downs;
      return {
        ready: hk?.boot['ready'] ?? NaN,
        huntStart: hk?.boot['huntStart'] ?? NaN,
        shot: hk?.firstShotAtMs ?? NaN,
        startDown: downs[0] ?? NaN,
        fireDown: downs[1] ?? NaN,
      };
    });
    const startLatency = t.huntStart - t.startDown;
    const fireLatency = t.shot - t.fireDown;
    // Time a player needs the game for: load until the start card works, plus how long the
    // game takes to react to the start tap and to the fire tap.
    const gameMs = t.ready + startLatency + fireLatency;
    const report = {
      ...t,
      startLatency,
      fireLatency,
      gameMs,
      harnessWallMs: Date.now() - wallStart,
    };
    console.log(`[${info.project.name}] load → first shot`, JSON.stringify(report));
    info.annotations.push({ type: 'firstShot', description: JSON.stringify(report) });
    expect(gameMs).toBeLessThanOrEqual(3000);
    expect(errors).toEqual([]);
  });

  test('a full 90 s Classic hunt plays to the tally', async ({ page }, info) => {
    test.skip(
      !['desktop-chromium', 'pixel7-landscape'].includes(info.project.name),
      'one desktop and one phone profile',
    );
    test.setTimeout(1_800_000);
    const touch = isTouchProject(info);
    const errors = collectErrors(page);
    await boot(page, 'seed=2026');
    await startHunt(page, touch);
    // Shoot steadily for the whole hunt, reloading when the belt is empty.
    while (!(await quick(page)).over) {
      await tapAcrossScreen(page, touch, 5);
      await waitTicks(page, 60);
    }
    await page.waitForFunction(() => window.__TM__?.scene === 'tally', null, { timeout: 60_000 });
    const h = await hook(page);
    expect(h.result?.ticks).toBe(90 * 60);
    expect(h.result?.shots).toBeGreaterThan(40);
    await expectReplayMatches(page);
    console.log(`[${info.project.name}] 90 s hunt result`, JSON.stringify(h.result));
    expect(errors).toEqual([]);
  });
});
