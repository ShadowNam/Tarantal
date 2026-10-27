// 1.9.2 (D-055): the product owner heard "Ten seconds!" with much less than 10 s left. The call
// waited out the 6 s bark gap behind the Stampede's bark (said at 15 s left). Now:
//   - the clock: over the last 10 s (inside the Stampede) the sim's ticksLeft falls at wall-clock
//     pace (within 3 %), so "10 s left" is 10 real seconds;
//   - the call: Oupa says it on the frame ticksLeft reaches 10 s (by 9.5 s left at the latest),
//     even though the Stampede bark claimed the gap 5 s earlier.
// Everything is read inside the page each animation frame (one round trip).
import { expect, test } from '@playwright/test';
import { loadFeel } from '../../tools/testContent';
import { boot, collectErrors, isLandscape, isTouchProject, startHunt } from './helpers';

const barks = loadFeel().barks;
const CALL = barks.triggers.lastSeconds.lines[0] ?? 'bark.ten_seconds';

test.use({ serviceWorkers: 'block' });

interface Timing {
  /** performance.now() and tick when ticksLeft first was ≤ 10 s, and when the hunt ended. */
  t10: number;
  tick10: number;
  tEnd: number;
  tickEnd: number;
  /** ticksLeft on the frame the call showed (null = never said). */
  saidAt: number | null;
  stampedeBark: boolean;
}

test('the last 10 s last 10 s, and "Ten seconds!" is said at 10 s left', async ({ page }, info) => {
  test.skip(!isLandscape(info), 'portrait shows the rotate card');
  test.setTimeout(240_000);
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  // 20 s Classic hunt: the Stampede (and its bark) at 15 s left, the call at 10 s left.
  await boot(page, 'seed=7&huntSeconds=20&graphics=standard');
  await startHunt(page, touch);
  const r = await page.evaluate(
    ([line, tps, stampedeLines]) =>
      new Promise<Timing>((resolve) => {
        const out: Timing = {
          t10: 0,
          tick10: -1,
          tEnd: 0,
          tickEnd: -1,
          saidAt: null,
          stampedeBark: false,
        };
        const step = (): void => {
          const h = window.__TM__;
          if (h) {
            if (h.barks.some((b) => stampedeLines.includes(b))) out.stampedeBark = true;
            if (out.tick10 < 0 && h.ticksLeft <= 10 * tps) {
              out.t10 = performance.now();
              out.tick10 = h.tick;
            }
            if (out.saidAt === null && h.barks.includes(line)) out.saidAt = h.ticksLeft;
            if (out.tick10 >= 0 && (h.ticksLeft <= 0 || h.over)) {
              out.tEnd = performance.now();
              out.tickEnd = h.tick;
              resolve(out);
              return;
            }
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    [CALL, 60, barks.triggers.stampede.lines] as const,
  );
  // The clock: ticks over wall time within 3 % of 60 a second.
  const seconds = (r.tEnd - r.t10) / 1000;
  const ticks = r.tickEnd - r.tick10;
  expect(ticks).toBeGreaterThan(540);
  expect(Math.abs(ticks / seconds / 60 - 1)).toBeLessThan(0.03);
  // The call: on time, after the Stampede's own bark.
  expect(r.stampedeBark).toBe(true);
  expect(r.saidAt).not.toBeNull();
  expect(r.saidAt ?? 0).toBeGreaterThanOrEqual(
    (barks.lastSeconds - barks.lastSecondsLateSeconds) * 60,
  );
  expect(r.saidAt ?? Infinity).toBeLessThanOrEqual(barks.lastSeconds * 60);
  expect(errors).toEqual([]);
});
