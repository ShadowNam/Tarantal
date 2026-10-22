// Perf smoke (Tech §15): 30 s hunt under 4× CPU throttle on desktop and the Pixel 7 (medium-tier
// phone) profile. Reports real frame time (rAF-to-rAF) and the CPU time our frame costs
// (Phaser pre-step → post-render: sim, views, HUD, render submission).
//   - CPU frame cost avg ≤ 16.7 ms is always asserted: it is what the code controls.
//   - Real frame time avg ≤ 16.7 ms (60 fps) is asserted with PERF_STRICT=1, on a machine with a
//     GPU. Headless CI and sandboxes rasterise WebGL in software (SwiftShader), where even an empty
//     WebGL page can't hold 60 fps, so there it is reported only (D-019).
import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import {
  boot,
  burstAtFlock,
  collectErrors,
  hook,
  isTouchProject,
  startHunt,
  stats,
  tapAt,
  waitTicks,
} from './helpers';

const BUDGET_MS = 1000 / 60;

test('perf smoke: 30 s hunt at 4× CPU throttle', async ({ page, browserName }, info) => {
  test.skip(
    !['desktop-chromium', 'pixel7-landscape'].includes(info.project.name) ||
      browserName !== 'chromium',
    'CDP throttling needs Chromium',
  );
  test.setTimeout(400_000);
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  await boot(page, 'seed=3&huntSeconds=30');
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
  writeFileSync(info.outputPath('perf.json'), JSON.stringify(report, null, 2));
  await info.attach('perf.json', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json',
  });

  expect(cpu.n).toBeGreaterThan(30);
  expect(cpu.avg, 'CPU cost per frame (ms) at 4× throttle').toBeLessThanOrEqual(BUDGET_MS);
  if (process.env['PERF_STRICT'] === '1') {
    expect(real.avg, 'real frame time (ms) at 4× throttle').toBeLessThanOrEqual(BUDGET_MS);
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
  };
  console.log(`[perf-low] ${JSON.stringify(report)}`);
  writeFileSync(info.outputPath('perf-low.json'), JSON.stringify(report, null, 2));
  expect(cpu.n).toBeGreaterThan(30);
  expect(at50fps, 'CPU cost of a frame at 50 fps (ms), low tier, 6× throttle').toBeLessThanOrEqual(
    LOW_BUDGET_MS,
  );
});

// v1.0.1 (D-028 §4): the smoke test above taps a fixed grid and often bags nothing, so it can't
// show what a kill costs. This run aims at flocks (Pixel 7, 4× throttle) so most frames follow a
// bag: score pops, POOF bubbles and feathers. Reported for before/after comparisons; the CPU
// budget is asserted as in the smoke test.
test('perf: kill-heavy 30 s hunt at 4× CPU throttle on the Pixel 7 profile', async ({
  page,
  browserName,
}, info) => {
  test.skip(
    info.project.name !== 'pixel7-landscape' || browserName !== 'chromium',
    'Pixel 7 profile, CDP throttling',
  );
  test.setTimeout(400_000);
  const errors = collectErrors(page);
  await boot(page, 'seed=42&huntSeconds=30');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await startHunt(page, true);
  while (!(await hook(page)).over) {
    const h = await hook(page);
    const flock = h.flockSpots.find((f) => f.alive > 0);
    if (h.shells === 0) await page.keyboard.press('Space');
    else if (flock !== undefined) await burstAtFlock(page, true, flock.id, 2, 10);
    await waitTicks(page, 20);
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const h = await hook(page);
  const frames = h.cpuFrameMs.slice(30);
  const cpu = stats(frames);
  const report = {
    project: info.project.name,
    throttle: 4,
    score: h.score,
    pops: h.pops,
    cpuFrameMs: { ...cpu, max: Math.max(...frames) },
  };
  console.log(`[perf-kills] ${JSON.stringify(report)}`);
  writeFileSync(info.outputPath('perf-kills.json'), JSON.stringify(report, null, 2));
  expect(h.score, 'the run bagged birds').toBeGreaterThan(0);
  expect(cpu.avg, 'CPU cost per frame (ms) at 4× throttle').toBeLessThanOrEqual(BUDGET_MS);
  expect(errors).toEqual([]);
});
