// HUD screenshots at 16:9, 19.5:9 and 4:3 (M2 "Done when"), plus checks that every HUD part is
// inside the safe area and the shell belt is a ≥ 64 px tap target.
import { expect, test } from '@playwright/test';
import {
  SCREENSHOTS,
  boot,
  collectErrors,
  hook,
  isTouchProject,
  startHunt,
  tapAt,
  waitTicks,
} from './helpers';

const CASES: Record<string, { label: string; viewport?: { width: number; height: number } }[]> = {
  'desktop-chromium': [
    { label: '16x9', viewport: { width: 1280, height: 720 } },
    { label: '4x3', viewport: { width: 1024, height: 768 } },
  ],
  // iPhone 14 landscape is 844 × 390 CSS px ≈ 19.5:9.
  'iphone14-landscape': [{ label: '19.5x9' }],
  'pixel7-landscape': [{ label: '20x9' }],
};

test('HUD fits the safe area at every aspect ratio (screenshots)', async ({ page }, info) => {
  const cases = CASES[info.project.name];
  test.skip(cases === undefined, 'screenshot profiles only');
  test.setTimeout(120_000);
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  for (const c of cases ?? []) {
    if (c.viewport) await page.setViewportSize(c.viewport);
    await boot(page, 'seed=42&huntSeconds=60');
    await startHunt(page, touch);
    const start = await hook(page);
    expect(start.missingTextures).toEqual([]);
    for (let i = 0; i < 3; i++) {
      await tapAt(page, touch, start.designWidth * (0.3 + i * 0.2), start.designHeight * 0.35);
      await waitTicks(page, 12);
    }
    await waitTicks(page, 20);
    const h = await hook(page);
    const safe = h.safe;
    if (!safe) throw new Error('HUD not laid out');
    for (const [name, r] of Object.entries(h.rects)) {
      expect(r.x, `${c.label} ${name} left`).toBeGreaterThanOrEqual(safe.x);
      expect(r.y, `${c.label} ${name} top`).toBeGreaterThanOrEqual(safe.y);
      expect(r.x + r.w, `${c.label} ${name} right`).toBeLessThanOrEqual(safe.x + safe.w);
      expect(r.y + r.h, `${c.label} ${name} bottom`).toBeLessThanOrEqual(safe.y + safe.h);
    }
    expect(h.rects['belt']?.h ?? 0).toBeGreaterThanOrEqual(64);
    await page.screenshot({ path: `${SCREENSHOTS}/hud-${c.label}-${info.project.name}.png` });
  }
  expect(errors).toEqual([]);
});
