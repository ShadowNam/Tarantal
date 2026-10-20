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
