// Perf smoke (Tech §15): 30 s hunt under 4× CPU throttle on desktop and the Pixel 7 (medium-tier
// phone) profile. Reports real frame time (rAF-to-rAF) and the CPU time our frame costs
// (Phaser pre-step → post-render: sim, views, HUD, render submission).
//   - CPU frame cost avg ≤ 16.7 ms is always asserted: it is what the code controls.
//   - Real frame time avg ≤ 16.7 ms (60 fps) is asserted with PERF_STRICT=1, on a machine with a
//     GPU. Headless CI and sandboxes rasterise WebGL in software (SwiftShader), where even an empty
//     WebGL page can't hold 60 fps, so there it is reported only (D-019).
import { expect, test, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import {
  boot,
  collectErrors,
  hook,
  isTouchProject,
  startHunt,
  stats,
  tapAt,
  waitTicks,
} from './helpers';

const BUDGET_MS = 1000 / 60;

/** PERF_CORES=4 reports that many cores, like a 4-core CI runner (which puts the Pixel 7
 *  profile on the low tier), so a local run picks the same auto tier as CI. */
async function emulateCores(page: Page): Promise<void> {
  const cores = Number(process.env['PERF_CORES'] ?? '0');
  if (cores > 0)
    await page.addInitScript((n) => {
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => n });
    }, cores);
}

// D-053: the same smoke with the HD pack (graphics=hd): 60 fps on the medium tier with HD; the
// report adds texture memory (hook textureBytes) and the HD textures in use.
for (const gfx of ['standard', 'hd'] as const)
  test(`perf smoke${gfx === 'hd' ? ' (HD)' : ''}: 30 s hunt at 4× CPU throttle`, async ({
    page,
    browserName,
  }, info) => {
    test.skip(
      !['desktop-chromium', 'pixel7-landscape'].includes(info.project.name) ||
        browserName !== 'chromium',
      'CDP throttling needs Chromium',
    );
    test.setTimeout(400_000);
    const touch = isTouchProject(info);
    const errors = collectErrors(page);
    await emulateCores(page);
    await boot(page, `seed=3&huntSeconds=30&graphics=${gfx}`);
    if (gfx === 'hd')
      await page.waitForFunction(() => (window.__TM__?.graphics.hdTextures ?? 0) > 0, null, {
        timeout: 120_000,
      });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await startHunt(page, touch);
    const h0 = await hook(page);
    let i = 0;
    while (!(await hook(page)).over) {
      await tapAt(
        page,
        touch,
        h0.designWidth * (0.2 + (i % 6) * 0.12),
        h0.designHeight * (0.3 + (i % 3) * 0.12),
      );
      i++;
      if ((await hook(page)).shells === 0) {
        await page.keyboard.press('Space');
        if (touch) await tapAt(page, touch, h0.designWidth * 0.5, h0.designHeight * 0.5);
      }
      await waitTicks(page, 30);
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const h = await hook(page);
    // Skip the first frames (texture uploads, shader warm-up).
    const real = stats(h.frameTimes.slice(30));
    const cpu = stats(h.cpuFrameMs.slice(30));
    const report = {
      project: info.project.name,
      graphics: gfx,
      tier: h.quality.tier,
      textureMB: Math.round((h.textureBytes / (1024 * 1024)) * 10) / 10,
      hdTextures: h.graphics.hdTextures,
      // D-053: what the texture memory is made of (the largest 15).
      textureTop: h.textureTop,
      throttle: 4,
      // v1.0.1 (D-028 §4): how much the frame cost includes score pops (undefined before v1.0.1).
      score: h.score,
      pops: h.pops,
      realFrameMs: real,
      realFps: real.avg > 0 ? 1000 / real.avg : 0,
      cpuFrameMs: cpu,
      renderer: await page.evaluate(() => {
        const gl = document.createElement('canvas').getContext('webgl2');
        const ext = gl?.getExtension('WEBGL_debug_renderer_info');
        return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
      }),
    };
    console.log(`[perf] ${JSON.stringify(report)}`);
    writeFileSync(info.outputPath(`perf-${gfx}.json`), JSON.stringify(report, null, 2));
    await info.attach(`perf-${gfx}.json`, {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    });

    expect(cpu.n).toBeGreaterThan(30);
    expect(cpu.avg, 'CPU cost per frame (ms) at 4× throttle').toBeLessThanOrEqual(BUDGET_MS);
    // D-053: one area's HD hunt within the medium tier's texture budget (Tech §9: 256 MB), and
    // the HD pack really in (not a Standard run reported as HD).
    if (gfx === 'hd') {
      expect(report.hdTextures, 'HD textures on the GPU').toBeGreaterThan(0);
      expect(report.textureMB, 'texture memory (MB) with HD').toBeLessThanOrEqual(256);
    }
    if (process.env['PERF_STRICT'] === '1') {
      expect(real.avg, 'real frame time (ms) at 4× throttle').toBeLessThanOrEqual(BUDGET_MS);
    }
    expect(errors).toEqual([]);
  });

// D-054: the far animals' HD twins are largest in the Bushveld (elephants, giraffes) and the
// Okavango (elephants, lechwe): each area's HD hunt within the medium tier's texture budget
// (Tech §9: 256 MB) on the Pixel 7 profile, once every herd draws its HD art.
for (const biome of ['bushveld-winter', 'okavango-spring'] as const)
  test(`HD texture memory with the far animals: ${biome}`, async ({ page, browserName }, info) => {
    test.skip(
      info.project.name !== 'pixel7-landscape' || browserName !== 'chromium',
      'the Pixel 7 profile (medium tier)',
    );
    test.setTimeout(400_000);
    await emulateCores(page);
    await boot(page, `biome=${biome}&layout=none&seed=3&huntSeconds=60&graphics=hd`);
    await startHunt(page, isTouchProject(info));
    await page.waitForFunction(
      () => {
        const tm = window.__TM__;
        const fauna = (tm?.graphics.bounds ?? []).filter((b) => b.key.startsWith('fauna/'));
        return (tm?.graphics.hdTextures ?? 0) > 0 && fauna.length > 0 && fauna.every((b) => b.hd);
      },
      null,
      { timeout: 180_000 },
    );
    // A few texture samples (the hook updates about twice a second).
    await page.waitForTimeout(2000);
    const h = await hook(page);
    const mb = Math.round((h.textureBytes / (1024 * 1024)) * 10) / 10;
    console.log(`[perf] ${biome} HD texture memory ${mb} MB`);
    await info.attach(`hd-memory-${biome}.json`, {
      body: JSON.stringify({ biome, textureMB: mb, top: h.textureTop }, null, 1),
      contentType: 'application/json',
    });
    expect(mb, `${biome}: texture memory (MB) with HD`).toBeLessThanOrEqual(256);
  });

// v1.4 B (D-039): Namibië on the Pixel 7 profile — the mirage on (Tuesday) and the weavers kept
// out the whole hunt (the family nest shot every 2 s), same method and budget as the smoke.
test('perf: Namibië mirage and angry weavers at 4× CPU throttle (Pixel 7)', async ({
  page,
  browserName,
}, info) => {
  test.skip(
    info.project.name !== 'pixel7-landscape' || browserName !== 'chromium',
    'measured on the Pixel 7 profile; CDP throttling needs Chromium',
  );
  test.setTimeout(400_000);
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  await emulateCores(page);
  await boot(page, 'biome=namibie&today=2026-10-20&seed=3&huntSeconds=30');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await startHunt(page, touch);
  await page.waitForFunction(() => (window.__TM__?.tick ?? 0) > 30, null, { timeout: 120_000 });
  // The nest tree stands at the west end: pan there first.
  await page.keyboard.down('ArrowLeft');
  await page.waitForFunction(
    () =>
      window.__TM__?.secretSpots.some((s) => s.partId === 'nest' && s.x > 200) === true ||
      (window.__TM__?.cameraX ?? 9999) <= 961,
    null,
    { timeout: 120_000 },
  );
  await page.keyboard.up('ArrowLeft');
  let maxWeavers = 0;
  while (!(await hook(page)).over) {
    const h = await hook(page);
    maxWeavers = Math.max(maxWeavers, h.weavers);
    const nest = h.secretSpots.find((s) => s.partId === 'nest');
    if (nest !== undefined) await tapAt(page, touch, nest.x, nest.y);
    if (h.shells === 0) {
      await page.keyboard.press('Space');
      if (touch) await tapAt(page, touch, h.designWidth * 0.5, h.designHeight * 0.5);
    }
    await waitTicks(page, 60);
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const h = await hook(page);
  const real = stats(h.frameTimes.slice(30));
  const cpu = stats(h.cpuFrameMs.slice(30));
  const report = {
    project: info.project.name,
    tier: h.quality.tier,
    throttle: 4,
    mirage: h.mirage,
    weaverBursts: h.weaverBursts,
    maxWeavers,
    // The weavers' and the mirage's own share of each frame (same page, so the box's load and
    // software GL drop out).
    sceneryMsPerFrame: h.sceneryFrames > 0 ? h.sceneryMs / h.sceneryFrames : 0,
    realFrameMs: real,
    cpuFrameMs: cpu,
  };
  console.log(`[perf] ${JSON.stringify(report)}`);
  writeFileSync(info.outputPath('perf.json'), JSON.stringify(report, null, 2));
  expect(h.mirage, 'the mirage is on (Tuesday, omen)').toBe(true);
  expect(h.weaverBursts).toBeGreaterThan(0);
  expect(maxWeavers).toBeGreaterThan(0);
  expect(cpu.n).toBeGreaterThan(30);
  // Their own cost: at most 1 ms a frame at 4× throttle (6 % of the frame budget).
  expect(
    report.sceneryMsPerFrame,
    'weavers + mirage ms per frame, 4× throttle',
  ).toBeLessThanOrEqual(1);
  expect(cpu.avg, 'CPU cost per frame (ms), mirage + weavers, 4× throttle').toBeLessThanOrEqual(
    BUDGET_MS,
  );
  expect(errors).toEqual([]);
});

// v1.7 (D-044): the Kalahari's Monday map on the Pixel 7 profile — two meerkat colonies (near and
// mid) in view from the start, the near one at the opening camera. Same method and budget as the
// smoke; the colonies' own drawing at most 1 ms a frame at 4× throttle.
test('perf: Kalahari meerkat colonies at 4× CPU throttle (Pixel 7)', async ({
  page,
  browserName,
}, info) => {
  test.skip(
    info.project.name !== 'pixel7-landscape' || browserName !== 'chromium',
    'measured on the Pixel 7 profile; CDP throttling needs Chromium',
  );
  test.setTimeout(400_000);
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  await emulateCores(page);
  await boot(page, 'biome=kalahari-summer&layout=mon&seed=3&huntSeconds=30');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await startHunt(page, touch);
  await page.waitForFunction(() => (window.__TM__?.tick ?? 0) > 30, null, { timeout: 120_000 });
  let maxOut = 0;
  while (!(await hook(page)).over) {
    const h = await hook(page);
    maxOut = Math.max(maxOut, h.meerkats.filter((m) => m.pose !== 'hidden').length);
    await waitTicks(page, 60);
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const h = await hook(page);
  const real = stats(h.frameTimes.slice(30));
  const cpu = stats(h.cpuFrameMs.slice(30));
  const report = {
    project: info.project.name,
    tier: h.quality.tier,
    throttle: 4,
    maxMeerkatsOut: maxOut,
    meerkatMsPerFrame: h.sceneryFrames > 0 ? h.meerkatMs / h.sceneryFrames : 0,
    realFrameMs: real,
    cpuFrameMs: cpu,
  };
  console.log(`[perf] ${JSON.stringify(report)}`);
  writeFileSync(info.outputPath('perf.json'), JSON.stringify(report, null, 2));
  expect(maxOut, 'meerkats came out').toBeGreaterThan(0);
  expect(cpu.n).toBeGreaterThan(30);
  expect(
    report.meerkatMsPerFrame,
    'meerkat colonies ms per frame, 4× throttle',
  ).toBeLessThanOrEqual(1);
  expect(cpu.avg, 'CPU cost per frame (ms), meerkats, 4× throttle').toBeLessThanOrEqual(BUDGET_MS);
  expect(errors).toEqual([]);
});

// v1.3 (D-036) scoped phase: the same method and budget as the smoke above (30 s hunt, the same
// auto quality tier — on a 4-core CI runner the Pixel 7 profile is low, desktop medium — 4× CPU
// throttle, CPU cost per frame ≤ 16.7 ms asserted, real frame time with
// PERF_STRICT=1), with the .22 and its small scope on Nog Verder. The bot raises the sight on the
// Ver flock, holds it about 1.5 s and fires, again and again. Only frames with the sight fully up
// count (the zoomed world, the Ver birds and the sight picture are drawn).
test('perf: scoped .22 on Nog Verder at 4× CPU throttle', async ({ page, browserName }, info) => {
  test.skip(
    !['desktop-chromium', 'pixel7-landscape'].includes(info.project.name) ||
      browserName !== 'chromium',
    'CDP throttling needs Chromium',
  );
  test.setTimeout(400_000);
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  await page.addInitScript(() => {
    localStorage.setItem(
      'tm.e2e.save.v1',
      JSON.stringify({
        v: 1,
        ftue: { done: true, skipped: false, step: '' },
        loadout: { weapon: 'twee_twee', sights: { twee_twee: 'scope_small' } },
        unlocks: { weapons: ['twee_twee'], sights: [] },
        bestRank: 'bosveldjagter',
      }),
    );
  });
  await emulateCores(page);
  await boot(page, 'seed=3&huntSeconds=30&today=2026-10-19&bonus=nogVerder');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await startHunt(page, touch);
  expect((await hook(page)).zoom.sight).toBe('scope_small');
  const pointer = async (type: string, x: number, y: number): Promise<void> => {
    await page.evaluate(
      ([kind, dx, dy, t]) => {
        const canvas = document.querySelector('#game canvas');
        const h = window.__TM__;
        if (!(canvas instanceof HTMLCanvasElement) || !h) return;
        const r = canvas.getBoundingClientRect();
        canvas.dispatchEvent(
          new PointerEvent(kind, {
            pointerId: t ? 21 : 1,
            pointerType: t ? 'touch' : 'mouse',
            button: 0,
            buttons: kind === 'pointerup' ? 0 : 1,
            clientX: r.left + (dx / h.designWidth) * r.width,
            clientY: r.top + (dy / h.designHeight) * r.height,
            bubbles: true,
            cancelable: true,
          }),
        );
      },
      [type, x, y, touch] as const,
    );
  };
  while (!(await hook(page)).over) {
    const h = await hook(page);
    const f = h.flockSpots.find((s) => s.plane === 'ver');
    const x = Math.min(h.designWidth - 200, Math.max(200, f?.x ?? h.designWidth / 2));
    const y = (f?.y ?? h.designHeight * 0.45) - 2;
    if (h.shells === 0) {
      await page.keyboard.press('Space');
      await waitTicks(page, 60);
      continue;
    }
    await pointer('pointerdown', x, y);
    await waitTicks(page, 90);
    await pointer('pointerup', x, y);
    await waitTicks(page, 30);
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const h = await hook(page);
  const scoped = (v: readonly number[]): number[] =>
    v.slice(30).filter((_, k) => h.cpuFrameScoped[k + 30] === true);
  const cpu = stats(scoped(h.cpuFrameMs));
  // Real frame times are sampled in HuntScene with their own scoped flags.
  const real = stats(h.frameTimes.slice(30).filter((_, k) => h.frameScoped[k + 30] === true));
  // v1.4 (#56): the like-for-like baseline — frames of this same hunt (same map, tier, throttle)
  // with the view fully open (zoom 1: between shots and reloads). Frames while the sight is
  // still coming up or going down are in neither set.
  const openReal = stats(h.frameTimes.slice(30).filter((_, k) => h.frameOpen[k + 30] === true));
  const openCpu = stats(h.cpuFrameMs.slice(30).filter((_, k) => h.cpuFrameOpen[k + 30] === true));
  const ratio = (a: number, b: number): number => (b > 0 ? Math.round((a / b) * 100) / 100 : 0);
  const report = {
    project: info.project.name,
    phase: 'scoped',
    tier: h.quality.tier,
    throttle: 4,
    sight: h.zoom.sight,
    scopedShare: h.cpuFrameScoped.filter(Boolean).length / Math.max(1, h.cpuFrameScoped.length),
    realFrameMs: real,
    realFps: real.avg > 0 ? 1000 / real.avg : 0,
    cpuFrameMs: cpu,
    openRealFrameMs: openReal,
    openCpuFrameMs: openCpu,
    // Scoped ÷ open on the median (p50) and the mean: under software GL only ratios mean anything.
    scopedOpenRealRatio: { p50: ratio(real.p50, openReal.p50), avg: ratio(real.avg, openReal.avg) },
    scopedOpenCpuRatio: { p50: ratio(cpu.p50, openCpu.p50), avg: ratio(cpu.avg, openCpu.avg) },
  };
  console.log(`[perf] ${JSON.stringify(report)}`);
  console.log(
    `[perf-ratio] ${info.project.name} (${h.quality.tier}): scoped/open real frame ` +
      `p50 ${report.scopedOpenRealRatio.p50}× (${real.p50.toFixed(0)} / ${openReal.p50.toFixed(0)} ms), ` +
      `avg ${report.scopedOpenRealRatio.avg}×; CPU p50 ${report.scopedOpenCpuRatio.p50}×`,
  );
  writeFileSync(info.outputPath('perf-scoped.json'), JSON.stringify(report, null, 2));
  await info.attach('perf-scoped.json', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json',
  });

  expect(cpu.n).toBeGreaterThan(30);
  expect(openReal.n, 'open frames in the scoped hunt').toBeGreaterThan(10);
  expect(cpu.avg, 'CPU cost per scoped frame (ms) at 4× throttle').toBeLessThanOrEqual(BUDGET_MS);
  if (process.env['PERF_STRICT'] === '1') {
    expect(real.avg, 'real scoped frame time (ms) at 4× throttle').toBeLessThanOrEqual(BUDGET_MS);
  }
  expect(errors).toEqual([]);
});

// M9 "Done when": the low tier holds ≥ 50 fps on the low-tier profile: the Pixel 7 profile at
// 6× CPU throttle (DevTools' "low-end mobile"), quality forced to low. Without a GPU (D-019) frames
// here come at a few per second, so each one also runs up to maxStepsPerFrame catch-up sim ticks
// that a phone at 50 fps never runs. The asserted figure is therefore the CPU cost of one rendered
// frame at 50 fps: (CPU per frame − sim time per frame) + 1.2 × the CPU cost of one sim tick
// (60 ticks/s ÷ 50 frames/s), measured on the same frames. Raw CPU per frame is reported too.
// Real fps on a real low-end phone is a human check.
const LOW_BUDGET_MS = 1000 / 50;

test('perf: low tier holds 50 fps (CPU) at 6× throttle on the Pixel 7 profile', async ({
  page,
  browserName,
}, info) => {
  test.skip(
    info.project.name !== 'pixel7-landscape' || browserName !== 'chromium',
    'low-tier profile = Pixel 7 + CDP throttling',
  );
  test.setTimeout(400_000);
  await page.addInitScript(() => {
    if (localStorage.getItem('tm.e2e.save.v1') === null)
      localStorage.setItem(
        'tm.e2e.save.v1',
        JSON.stringify({ v: 1, settings: { quality: 'low' } }),
      );
  });
  // D-029: PERF_PLACEHOLDERS=1 measures the same build with no delivered art (before/after).
  if (process.env['PERF_PLACEHOLDERS'] === '1')
    await page.route('**/assets/asset-index.json', (r) => r.fulfill({ status: 404, body: '' }));
  await boot(page, 'seed=3&huntSeconds=20');
  expect((await hook(page)).quality.tier).toBe('low');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await startHunt(page, true);
  const h0 = await hook(page);
  let i = 0;
  while (!(await hook(page)).over) {
    await tapAt(page, true, h0.designWidth * (0.2 + (i % 6) * 0.12), h0.designHeight * 0.4);
    i++;
    if ((await hook(page)).shells === 0) await page.keyboard.press('Space');
    await waitTicks(page, 30);
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const h = await hook(page);
  const cpu = stats(h.cpuFrameMs.slice(30));
  const simMs = h.simFrameMs.slice(30);
  const simSteps = h.simFrameSteps.slice(30);
  const sum = (v: readonly number[]): number => v.reduce((a, b) => a + b, 0);
  const tickMs = sum(simMs) / Math.max(1, sum(simSteps));
  const renderMs = cpu.avg - sum(simMs) / Math.max(1, simMs.length);
  const at50fps = renderMs + (60 / 50) * tickMs;
  const report = {
    project: info.project.name,
    tier: 'low',
    throttle: 6,
    score: h.score,
    pops: h.pops,
    cpuFrameMs: cpu,
    simTicksPerFrame: sum(simSteps) / Math.max(1, simSteps.length),
    simTickMs: tickMs,
    renderMs,
    frameCostAt50fpsMs: at50fps,
    // D-029: RGBA bytes of every texture at the end of the hunt (GPU memory estimate).
    textureMB: Math.round((h.textureBytes / 1024 / 1024) * 10) / 10,
  };
  console.log(`[perf-low] ${JSON.stringify(report)}`);
  writeFileSync(info.outputPath('perf-low.json'), JSON.stringify(report, null, 2));
  expect(cpu.n).toBeGreaterThan(30);
  expect(at50fps, 'CPU cost of a frame at 50 fps (ms), low tier, 6× throttle').toBeLessThanOrEqual(
    LOW_BUDGET_MS,
  );
});

// v1.0.1 (D-028 §4): what a score pop costs, pooled BitmapText vs the pre-v1.0.1 canvas Text, as
// an A/B in one page (Pixel 7 profile, 4× CPU throttle): rounds of 20 world pops each way and
// control rounds with none, in rotating order, during a running hunt. Each round counts the CPU
// spent over the pops' lifetime (50 ticks) and the 2D-canvas text draws (fillText/strokeText) and
// WebGL texture uploads (texImage2D/texSubImage2D) in it. Same page, same moment: the shared
// runner's load hits both ways alike, which whole-run frame averages can't promise (D-019).
// Asserted: the deterministic counts (a BitmapText pop draws no canvas text; a Text pop does).
test('perf: score pop A/B — pooled BitmapText vs canvas Text (Pixel 7, 4×)', async ({
  page,
  browserName,
}, info) => {
  test.skip(
    info.project.name !== 'pixel7-landscape' || browserName !== 'chromium',
    'Pixel 7 profile, CDP throttling',
  );
  test.setTimeout(400_000);
  const errors = collectErrors(page);
  await page.addInitScript(() => {
    const n = { text: 0, upload: 0, counting: false };
    (window as unknown as { __gpuCount: typeof n }).__gpuCount = n;
    const wrap = (proto: object, name: string, key: 'text' | 'upload'): void => {
      const o = proto as Record<string, (...a: unknown[]) => unknown>;
      const orig = o[name];
      if (typeof orig !== 'function') return;
      o[name] = function (this: unknown, ...a: unknown[]) {
        if (n.counting) n[key]++;
        return orig.apply(this, a);
      };
    };
    wrap(CanvasRenderingContext2D.prototype, 'fillText', 'text');
    wrap(CanvasRenderingContext2D.prototype, 'strokeText', 'text');
    for (const gl of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      wrap(gl, 'texImage2D', 'upload');
      wrap(gl, 'texSubImage2D', 'upload');
    }
  });
  await boot(page, 'seed=42&huntSeconds=90');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await startHunt(page, true);
  type Mode = 'control' | 'bitmap' | 'text';
  const N = 20;
  const round = async (
    mode: Mode,
  ): Promise<{ syncMs: number; cpuMs: number; text: number; upload: number }> => {
    const from = (await hook(page)).cpuFrameMs.length;
    const syncMs = await page.evaluate(
      ([m, n]) => {
        const c = (
          window as unknown as { __gpuCount: { text: number; upload: number; counting: boolean } }
        ).__gpuCount;
        c.text = 0;
        c.upload = 0;
        c.counting = true;
        return m === 'control' ? 0 : (window.__TM_TOOLS__?.popBench(n, m) ?? -1);
      },
      [mode, N] as const,
    );
    await waitTicks(page, 50);
    const c = await page.evaluate(() => {
      const g = (
        window as unknown as { __gpuCount: { text: number; upload: number; counting: boolean } }
      ).__gpuCount;
      g.counting = false;
      return { text: g.text, upload: g.upload };
    });
    const frames = (await hook(page)).cpuFrameMs.slice(from);
    return { syncMs, cpuMs: frames.reduce((a, b) => a + b, 0), ...c };
  };
  // Warm-up: the pop atlas is built on the first BitmapText pop; Phaser's Text path warms too.
  await round('bitmap');
  await round('text');
  const orders: Mode[][] = [
    ['control', 'bitmap', 'text'],
    ['text', 'control', 'bitmap'],
    ['bitmap', 'text', 'control'],
  ];
  const rows: Record<Mode, { syncMs: number; cpuMs: number; text: number; upload: number }[]> = {
    control: [],
    bitmap: [],
    text: [],
  };
  for (let r = 0; r < 6; r++) {
    for (const m of orders[r % orders.length] ?? []) rows[m].push(await round(m));
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const median = (xs: number[]): number => {
    const v = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(v.length / 2);
    return v.length % 2 === 1 ? (v[mid] ?? 0) : ((v[mid - 1] ?? 0) + (v[mid] ?? 0)) / 2;
  };
  const sum = (mode: Mode, k: 'syncMs' | 'cpuMs' | 'text' | 'upload'): number =>
    median(rows[mode].map((x) => x[k]));
  const perPop = (mode: Mode) => ({
    syncMsPerPop: sum(mode, 'syncMs') / N,
    extraCpuMsPerPop: (sum(mode, 'cpuMs') - sum('control', 'cpuMs')) / N,
    textDrawsPerPop: (sum(mode, 'text') - sum('control', 'text')) / N,
    uploadsPerPop: (sum(mode, 'upload') - sum('control', 'upload')) / N,
  });
  const report = {
    project: info.project.name,
    throttle: 4,
    popsPerRound: N,
    rounds: rows.control.length,
    windowCpuMsMedian: {
      control: sum('control', 'cpuMs'),
      bitmap: sum('bitmap', 'cpuMs'),
      text: sum('text', 'cpuMs'),
    },
    bitmap: perPop('bitmap'),
    text: perPop('text'),
    pops: (await hook(page)).pops,
  };
  console.log(`[perf-pops] ${JSON.stringify(report)}`);
  writeFileSync(info.outputPath('perf-pops.json'), JSON.stringify(report, null, 2));
  await info.attach('perf-pops.json', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json',
  });
  expect(report.text.textDrawsPerPop, 'a canvas Text pop draws text').toBeGreaterThanOrEqual(2);
  expect(report.bitmap.textDrawsPerPop, 'a BitmapText pop draws no canvas text').toBeLessThan(0.5);
  expect(errors).toEqual([]);
});
