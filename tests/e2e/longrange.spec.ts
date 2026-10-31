// v1.3 long range (D-036, docs/04 §v1.3 "Done when") on desktop, Pixel 7 and iPhone 14 landscape:
//   - a zoomed hunt's replay is identical everywhere: a rifle golden replay recorded in Node gives
//     the same events in every browser, and a scoped hunt played here replays the same in Node;
//   - the sight comes up on a press, the world zooms around the aim, the gun drops out of view;
//   - on demand (ART_PREVIEW=1): each sight picture on a Ver flock, written to
//     docs/art-preview/screens/v1.3-sight-<sight>-<project>.png, and the scoped frame cost.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { PNG } from 'pngjs';
import { loadContent } from '../../tools/testContent';
import type { GoldenReplay } from '../../tools/goldenCases';
import { decodeInputLogText } from '../../src/sim/replay/inputLog';
import { runReplay } from '../../src/sim/replay/verify';
import {
  boot,
  collectErrors,
  hook,
  isLandscape,
  isTouchProject,
  startHunt,
  stats,
  tapRect,
} from './helpers';
import { composePair } from '../../tools/art/compare';
// v1.8b (D-062): Node-side hunts register the lazy sim systems (the game loads their chunk).
import '../../src/sim/lazySystemsRegister';

const ROOT = join(import.meta.dirname, '..', '..');
const SCREENS = join(ROOT, 'docs', 'art-preview', 'screens');
const PREVIEW = process.env['ART_PREVIEW'] === '1';
/** 2026-10-23 (a Friday): the UTC day the save's unlocks are for. */
const TODAY = '2026-10-23';
const DAY = 20749;
/** Previews: 2026-10-19, a Monday (the Ver flock forages in the open, not behind the windpomp). */
const PREVIEW_DAY = { key: '2026-10-19', n: 20745 } as const;

test.use({ serviceWorkers: 'block' });

function gate(info: TestInfo): void {
  test.skip(!isLandscape(info), 'portrait shows the rotate card');
}

/** A save with the .22 equipped, `sight` fitted (unlocked) and Nog Verder open today. */
async function rifleSave(page: Page, sight: string, quality = 'medium', day = DAY): Promise<void> {
  await page.addInitScript(
    ([s, q, d]) => {
      localStorage.setItem(
        'tm.e2e.save.v1',
        JSON.stringify({
          v: 1,
          settings: { quality: q },
          ftue: { done: true, skipped: false, step: '' },
          loadout: { weapon: 'twee_twee', sights: { twee_twee: s } },
          unlocks: { weapons: ['twee_twee'], sights: ['peep'] },
          bestRank: 'bosveldjagter',
          bonusMaps: {
            day: d,
            unlocked: ['karoo-autumn/verder', 'karoo-autumn/nogVerder', 'karoo-autumn/dieVerste'],
            bests: {},
          },
        }),
      );
    },
    [sight, quality, day] as const,
  );
}

/** Press (or put a finger down) at a design point and keep it there: the sight comes up. */
async function press(page: Page, touch: boolean, x: number, y: number): Promise<void> {
  await page.evaluate(
    ([dx, dy, t]) => {
      const canvas = document.querySelector('#game canvas');
      const h = window.__TM__;
      if (!(canvas instanceof HTMLCanvasElement) || !h) throw new Error('no game');
      const r = canvas.getBoundingClientRect();
      const clientX = r.left + (dx / h.designWidth) * r.width;
      const clientY = r.top + (dy / h.designHeight) * r.height;
      const init = {
        pointerId: t ? 21 : 1,
        pointerType: t ? 'touch' : 'mouse',
        button: 0,
        buttons: 1,
        clientX,
        clientY,
        bubbles: true,
        cancelable: true,
      };
      canvas.dispatchEvent(new PointerEvent('pointerdown', init));
      (window as { __TM_PRESS__?: PointerEventInit }).__TM_PRESS__ = init;
    },
    [x, y, touch] as const,
  );
}

/** Lifts the press: the shot goes off (through the sight once it is up). */
async function release(page: Page): Promise<void> {
  await page.evaluate(() => {
    const canvas = document.querySelector('#game canvas');
    const init = (window as { __TM_PRESS__?: PointerEventInit }).__TM_PRESS__;
    if (!canvas || init === undefined) return;
    canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
  });
}

/** Keeps a held sight on a Ver bird: pointer = press + (bird − press) × zoom (fine aim). */
async function trackBird(page: Page, id: number, px: number, py: number): Promise<void> {
  await page.evaluate(
    ([bid, ax, ay]) => {
      const canvas = document.querySelector('#game canvas');
      const h = window.__TM__;
      const init = (window as { __TM_PRESS__?: PointerEventInit }).__TM_PRESS__;
      const b = h?.verBirds.find((v) => v.id === bid);
      if (!(canvas instanceof HTMLCanvasElement) || !h || init === undefined || b === undefined)
        return;
      const z = h.zoom.z;
      const r = canvas.getBoundingClientRect();
      const x = ax + (b.x - ax) * z;
      const y = ay + (b.y - ay) * z;
      canvas.dispatchEvent(
        new PointerEvent('pointermove', {
          ...init,
          clientX: r.left + (x / h.designWidth) * r.width,
          clientY: r.top + (y / h.designHeight) * r.height,
        }),
      );
    },
    [id, px, py] as const,
  );
}

async function verFlock(page: Page): Promise<{ x: number; y: number }> {
  await page.waitForFunction(
    () => (window.__TM__?.flockSpots ?? []).some((f) => f.plane === 'ver'),
    null,
    { timeout: 120_000 },
  );
  const h = await hook(page);
  const f = h.flockSpots.find((s) => s.plane === 'ver');
  if (f === undefined) throw new Error('no Ver flock');
  // Inside the screen (the flock may forage near an edge): the sight comes up there.
  return {
    x: Math.min(h.designWidth - 200, Math.max(200, f.x)),
    y: f.y - 2,
  };
}

test.describe('long range (v1.3)', () => {
  test('a rifle golden replay gives the same events in this browser as in Node', async ({
    page,
  }, info) => {
    gate(info);
    test.skip(PREVIEW, 'previews run on their own');
    test.setTimeout(300_000);
    const goldens = JSON.parse(
      readFileSync(join(ROOT, 'src', 'sim', 'replay', 'golden', 'replays.json'), 'utf8'),
    ) as GoldenReplay[];
    await boot(page, `today=${TODAY}&reenbui=content`);
    for (const name of [
      'classic-71-karoo-nogverder-tweetwee-iron-competent-pointer',
      'classic-72-karoo-dieverste-tweetwee-scope-aim-touch',
    ]) {
      const g = goldens.find((x) => x.name === name);
      if (g === undefined) throw new Error(name);
      const here = await page.evaluate((l) => window.__TM_TOOLS__?.replay(l), g.log);
      expect(here, name).toEqual({
        eventHash: g.expected.eventHash,
        eventCount: g.expected.eventCount,
        score: g.expected.score,
      });
    }
  });

  test('Die Verste needs a scope: locked with iron sights, open with the scope', async ({
    page,
  }, info) => {
    gate(info);
    test.setTimeout(120_000);
    const touch = isTouchProject(info);
    const errors = collectErrors(page);
    await rifleSave(page, 'iron');
    await boot(page, `today=${TODAY}`);
    await page.waitForFunction(() => window.__TM__?.rects['dieVerste_locked'] !== undefined, null, {
      timeout: 60_000,
    });
    let h = await hook(page);
    expect(h.bonusOpen).toEqual(['verder', 'nogVerder']);
    expect(h.bonusNeedsScope).toEqual(['dieVerste']);
    if (PREVIEW) {
      const dir = join(ROOT, 'docs', 'art-preview', 'compare');
      mkdirSync(dir, { recursive: true });
      await page.screenshot({
        path: join(dir, `v1.3-die-verste-locked-${info.project.name}.png`),
      });
    }
    // A tap on the locked button starts nothing.
    await tapRect(page, touch, 'dieVerste_locked');
    await page.waitForTimeout(1500);
    h = await hook(page);
    expect(h.scene).not.toBe('hunt');
    expect(errors).toEqual([]);
  });

  test('Die Verste opens with a scope fitted', async ({ page }, info) => {
    gate(info);
    test.skip(PREVIEW, 'previews run on their own');
    test.setTimeout(120_000);
    await rifleSave(page, 'scope_small');
    await boot(page, `today=${TODAY}`);
    await page.waitForFunction(() => window.__TM__?.rects['dieVerste'] !== undefined, null, {
      timeout: 60_000,
    });
    const h = await hook(page);
    expect(h.bonusOpen).toEqual(['verder', 'nogVerder', 'dieVerste']);
    expect(h.bonusNeedsScope).toEqual([]);
  });

  test('a scoped hunt: the sight zooms on a press, and its replay matches Node', async ({
    page,
  }, info) => {
    gate(info);
    test.skip(PREVIEW, 'previews run on their own');
    test.setTimeout(400_000);
    const touch = isTouchProject(info);
    const errors = collectErrors(page);
    await rifleSave(page, 'scope_small');
    await boot(page, `seed=42&today=${TODAY}&bonus=nogVerder&huntSeconds=14&reenbui=content`);
    await startHunt(page, touch);
    let h = await hook(page);
    expect(h.zoom.sight).toBe('scope_small');
    for (let shot = 0; shot < 3; shot++) {
      const at = await verFlock(page);
      await press(page, touch, at.x, at.y);
      await page.waitForFunction(() => (window.__TM__?.zoom.raise ?? 0) >= 1, null, {
        timeout: 60_000,
      });
      h = await hook(page);
      expect(h.zoom.z).toBe(4);
      expect(h.crosshair.visible).toBe(false);
      const shots = h.shots;
      await release(page);
      await page.waitForFunction((n) => (window.__TM__?.shots ?? 0) > n, shots, {
        timeout: 60_000,
      });
      await page.waitForFunction(() => (window.__TM__?.zoom.raise ?? 1) === 0, null, {
        timeout: 60_000,
      });
    }
    await page.waitForFunction(() => window.__TM__?.scene === 'tally', null, {
      timeout: 300_000,
    });
    h = await hook(page);
    const log = decodeInputLogText(h.replay ?? '');
    // The sight rides in the log from v5 on (v6 added the special day, D-048).
    expect(log.v).toBeGreaterThanOrEqual(5);
    expect(log.mode).toMatchObject({
      weapon: 'twee_twee',
      sight: 'scope_small',
      bonus: 'nogVerder',
    });
    expect(log.commands.filter(([, c]) => c.t === 'aimRelease').length).toBe(3);
    const node = runReplay(log, loadContent());
    const here = await page.evaluate((l) => window.__TM_TOOLS__?.replay(l), h.replay ?? '');
    expect(here?.eventHash).toBe(node.eventHash);
    expect(node.result.score).toBe(h.result?.score);
    expect(errors).toEqual([]);
  });

  // v1.4 (#56, D-038): while zoomed, ParallaxView skips what can't show (outside the view or the
  // scope's square, rows behind nearer opaque bands). The picture must not change: a frozen
  // scoped frame (?holdAt) is shot with the culling off and on; they may differ only by as much
  // as two shots of the same setting do. The world fill (screens' worth of layer pixels) drops.
  for (const sight of ['scope_small', 'iron'] as const) {
    test(`scoped culling (#56) draws the same picture: ${sight}`, async ({ page }, info) => {
      gate(info);
      test.setTimeout(300_000);
      const touch = isTouchProject(info);
      const HOLD = 600;
      await rifleSave(page, sight, 'medium', PREVIEW_DAY.n);
      await boot(
        page,
        `seed=42&today=${PREVIEW_DAY.key}&bonus=nogVerder&huntSeconds=60&holdAt=${HOLD}`,
      );
      await startHunt(page, touch);
      const at = await verFlock(page);
      expect((await hook(page)).tick, 'time to raise before the hold').toBeLessThan(HOLD - 40);
      await press(page, touch, at.x, at.y);
      await page.waitForFunction(
        (t) => (window.__TM__?.tick ?? 0) >= t && (window.__TM__?.zoom.raise ?? 0) >= 1,
        HOLD,
        { timeout: 120_000 },
      );
      const frames = (n: number): Promise<void> =>
        page.evaluate(
          (k) =>
            new Promise<void>((done) => {
              const step = (i: number): void => {
                if (i <= 0) done();
                else
                  requestAnimationFrame(() => {
                    step(i - 1);
                  });
              };
              step(k);
            }),
          n,
        );
      const shot = async (cull: boolean): Promise<{ png: PNG; fill: number }> => {
        await page.evaluate((on) => window.__TM_TOOLS__?.scopeCull(on), cull);
        await frames(4);
        const fill = (await hook(page)).zoom.fill;
        return { png: PNG.sync.read(await page.screenshot()), fill };
      };
      const on1 = await shot(true);
      const off = await shot(false);
      const on2 = await shot(true);
      const off2 = await shot(false);
      await page.evaluate(() => window.__TM_TOOLS__?.scopeCull(true));
      const w = on1.png.width;
      const n = on1.png.data.length / 4;
      const px = (a: PNG, b: PNG, i: number): boolean =>
        Math.abs((a.data[i] ?? 0) - (b.data[i] ?? 0)) +
          Math.abs((a.data[i + 1] ?? 0) - (b.data[i + 1] ?? 0)) +
          Math.abs((a.data[i + 2] ?? 0) - (b.data[i + 2] ?? 0)) >
        24;
      // Screen and world effects keep animating under holdAt (rain streaks, the dust devil, the
      // windsock), so two shots of the same setting differ a little. Anything that moved between
      // two shots of one setting, grown by a few px, is animation; a pixel counts against the
      // culling only outside it, where both culled shots differ from both unculled ones.
      const moving = new Uint8Array(n);
      let noisy = 0;
      for (let k = 0; k < n; k++)
        if (px(on1.png, on2.png, k * 4) || px(off.png, off2.png, k * 4)) {
          noisy++;
          const x = k % w;
          const y = (k - x) / w;
          for (let dy = -6; dy <= 6; dy++)
            for (let dx = -6; dx <= 6; dx++) {
              const xx = x + dx;
              const yy = y + dy;
              if (xx >= 0 && xx < w && yy >= 0 && yy * w + xx < n) moving[yy * w + xx] = 1;
            }
        }
      let changed = 0;
      for (let k = 0; k < n; k++) {
        if (moving[k] === 1) continue;
        const i = k * 4;
        if (px(off.png, on1.png, i) && px(off2.png, on2.png, i)) changed++;
      }
      const noise = noisy / n;
      const culled = changed / n;
      console.log(
        `[scope-cull] ${info.project.name} ${sight}: fill ${off.fill} → ${on2.fill} screens; ` +
          `pixels changed by culling ${(culled * 100).toFixed(3)} % (animating ${(noise * 100).toFixed(3)} %)`,
      );
      expect(culled, 'culling changes the scoped picture').toBeLessThanOrEqual(0.002);
      expect(on2.fill).toBeLessThan(off.fill);
      await release(page);
    });
  }

  for (const sight of ['iron', 'peep', 'scope_small'] as const) {
    test(`preview: the ${sight} sight picture on a Ver flock`, async ({ page }, info) => {
      gate(info);
      test.skip(!PREVIEW, 'on demand: ART_PREVIEW=1');
      test.setTimeout(400_000);
      const touch = isTouchProject(info);
      await rifleSave(page, sight, 'medium', PREVIEW_DAY.n);
      await boot(page, `seed=42&today=${PREVIEW_DAY.key}&bonus=nogVerder&huntSeconds=60`);
      await startHunt(page, touch);
      await verFlock(page);
      // A Ver bird in view and clear of the windpomp (Friday's flock forages behind it): the
      // sight comes up on it.
      const bird = await page.evaluate(() => {
        const h = window.__TM__;
        if (!h) return null;
        const pomp = h.secretSpots.find((p) => p.propId === 'windpomp')?.x ?? -9999;
        return (
          [...h.verBirds]
            .filter((b) => b.x > 260 && b.x < h.designWidth - 260)
            .sort((a, b) => Math.abs(b.x - pomp) - Math.abs(a.x - pomp))[0] ?? null
        );
      });
      if (bird === null) throw new Error('no Ver bird in view');
      mkdirSync(SCREENS, { recursive: true });
      const name = `v1.3-sight-${sight}`;
      await page.screenshot({ path: join(SCREENS, `${name}-before-${info.project.name}.png`) });
      await press(page, touch, bird.x, bird.y);
      // Up, and the breath held (the sway settles): the picture you shoot through, kept on the
      // bird (it walks): the pointer moves by the bird's movement × the zoom (fine aim).
      await page.waitForFunction(() => (window.__TM__?.zoom.raise ?? 0) >= 1, null, {
        timeout: 60_000,
      });
      const t0 = (await hook(page)).tick;
      for (let k = 0; k < 6; k++) {
        await trackBird(page, bird.id, bird.x, bird.y);
        await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t, t0 + 10 * (k + 1), {
          timeout: 60_000,
        });
      }
      await trackBird(page, bird.id, bird.x, bird.y);
      await page.screenshot({ path: join(SCREENS, `${name}-after-${info.project.name}.png`) });
      await release(page);
      // docs/art-preview/compare/<name>-<project>.png: the open view | the sight picture.
      expect(composePair(name, info.project.name)).toBe(true);
    });
  }

  test('preview: the Skiet-Skuur with the Twee-Twee and its sights', async ({ page }, info) => {
    gate(info);
    test.skip(!PREVIEW, 'on demand: ART_PREVIEW=1');
    test.setTimeout(300_000);
    const touch = isTouchProject(info);
    await rifleSave(page, 'peep');
    await boot(page, `today=${TODAY}`);
    await page.waitForFunction(() => window.__TM__?.rects['shed'] !== undefined, null, {
      timeout: 60_000,
    });
    await tapRect(page, touch, 'shed');
    await page.waitForFunction(() => window.__TM__?.shedSights?.weapon === 'twee_twee', null, {
      timeout: 90_000,
    });
    await page.waitForFunction(() => (window.__TM__?.shedIcons ?? []).includes('twee_twee'), null, {
      timeout: 90_000,
    });
    await page.waitForTimeout(500);
    expect((await hook(page)).shedSights).toEqual({ weapon: 'twee_twee', fitted: 'peep' });
    mkdirSync(join(ROOT, 'docs', 'art-preview', 'compare'), { recursive: true });
    await page.screenshot({
      path: join(ROOT, 'docs', 'art-preview', 'compare', `v1.3-shed-${info.project.name}.png`),
    });
  });

  test('preview: frame cost while scoped (medium tier)', async ({ page, browserName }, info) => {
    gate(info);
    test.skip(!PREVIEW, 'on demand: ART_PREVIEW=1');
    test.skip(browserName !== 'chromium', 'frame timing from Chromium');
    test.setTimeout(600_000);
    const touch = isTouchProject(info);
    await rifleSave(page, 'scope_small', 'medium');
    await boot(page, `seed=42&today=${TODAY}&bonus=nogVerder&huntSeconds=120`);
    // Like the perf smoke (perf.spec): our frame cost at 4× CPU throttle.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await startHunt(page, touch);
    const at = await verFlock(page);
    const measure = async (): Promise<{ cpuRaw: number[]; realRaw: number[] }> => {
      const from = (await hook(page)).cpuFrameMs.length;
      const t0 = (await hook(page)).tick;
      await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t + 180, t0, {
        timeout: 200_000,
      });
      const h = await hook(page);
      return { cpuRaw: h.cpuFrameMs.slice(from), realRaw: h.frameTimes.slice(from) };
    };
    // Same-page A/B (this shared box swings ±25 % between runs): three rounds of the open view
    // then the scope raised, frames pooled per state.
    const openCpu: number[] = [];
    const scopedCpu: number[] = [];
    const openReal: number[] = [];
    const scopedReal: number[] = [];
    for (let round = 0; round < 3; round++) {
      const a = await measure();
      openCpu.push(...a.cpuRaw);
      openReal.push(...a.realRaw);
      await press(page, touch, at.x, at.y);
      await page.waitForFunction(() => (window.__TM__?.zoom.raise ?? 0) >= 1, null, {
        timeout: 60_000,
      });
      const b = await measure();
      scopedCpu.push(...b.cpuRaw);
      scopedReal.push(...b.realRaw);
      await release(page);
      await page.waitForFunction(() => (window.__TM__?.zoom.raise ?? 1) === 0, null, {
        timeout: 60_000,
      });
    }
    const open = { cpu: stats(openCpu), real: stats(openReal) };
    const scoped = { cpu: stats(scopedCpu), real: stats(scopedReal) };
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const report = {
      project: info.project.name,
      throttle: 4,
      tier: (await hook(page)).quality.tier,
      unscoped: { cpuMs: open.cpu, realMs: open.real },
      scoped: { cpuMs: scoped.cpu, realMs: scoped.real },
    };
    console.log(`[scoped] ${JSON.stringify(report)}`);
    mkdirSync(join(ROOT, 'docs', 'art-preview', 'compare'), { recursive: true });
    writeFileSync(
      join(ROOT, 'docs', 'art-preview', 'compare', `v1.3-scoped-frame-${info.project.name}.json`),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    // Raising the scope costs (almost) nothing on top of the open view; the absolute 60 fps CPU
    // budget is the perf smoke's (perf.spec, CI's perf shard).
    expect(scoped.cpu.p50).toBeLessThanOrEqual(open.cpu.p50 * 1.2 + 1);
  });
});
