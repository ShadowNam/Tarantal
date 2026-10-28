// 1.9.3 (D-056): shared steps for the makalani specs (makalani.spec.ts, art-preview-makalani.spec.ts)
// and the far-fence cans. Everything is read from the test hook (`nuts`, `farCans`, `canLog`).
// Shots are pointer events dispatched on the canvas inside the page, a fresh pointerId each (as
// blikkiesHelpers.ts does), each one frame-perfect: the sim is held at the current tick
// (`__TM_HOLD_AT__`), the target is read once the frame shows that tick, the pointer goes down on
// it and the hold is let go. Every in-page loop is bounded by frames as well as by its goal (CI's
// software WebGL runs at 10–20 fps).
import type { Page } from '@playwright/test';

/** Monday's Okavango map: a mid pair and a mid single by the water, a near single at the west
 *  end (content/biomes/okavango-spring.json). */
export const PALMS_MON =
  'biome=okavango-spring&layout=mon&seed=42&huntSeconds=90&graphics=standard';
/** Wednesday's Karoo map: the near fence and the far (mid-plane) fence. */
export const FAR_FENCE_WED =
  'biome=karoo-autumn&layout=wed&seed=42&huntSeconds=90&graphics=standard';

export type ThingSource = 'nuts' | 'farCans';

/** Pans (arrow keys) until a hanging nut (on `plane`) or a far can stands within 300 px of the
 *  screen centre, then waits for the camera to stop. */
export async function thingsInView(
  page: Page,
  source: ThingSource,
  plane: 'near' | 'mid' | null = null,
): Promise<void> {
  await page.waitForFunction(
    ([src, pl]) => {
      const g = window.__TM__;
      if (g === undefined || g.tick < 30) return false;
      if (src === 'farCans') return (g.farCans?.spots.length ?? 0) > 0;
      return (g.nuts?.nuts ?? []).some((n) => pl === null || n.plane === pl);
    },
    [source, plane] as const,
    { timeout: 120_000 },
  );
  const where = (): Promise<{ x: number; centre: number }> =>
    page.evaluate(
      ([src, pl]) => {
        const g = window.__TM__;
        const centre = (g?.designWidth ?? 1920) / 2;
        const xs =
          src === 'farCans'
            ? (g?.farCans?.spots ?? []).map((c) => c.x)
            : (g?.nuts?.nuts ?? [])
                .filter((n) => n.state === 'rest' && (pl === null || n.plane === pl))
                .map((n) => n.x);
        const best = xs.sort((a, b) => Math.abs(a - centre) - Math.abs(b - centre))[0] ?? centre;
        return { x: best, centre };
      },
      [source, plane] as const,
    );
  const w = await where();
  if (Math.abs(w.x - w.centre) >= 300) {
    const key = w.x > w.centre ? 'ArrowRight' : 'ArrowLeft';
    await page.keyboard.down(key);
    await page.waitForFunction(
      ([src, pl]) => {
        const g = window.__TM__;
        if (g === undefined) return false;
        const centre = g.designWidth / 2;
        const xs =
          src === 'farCans'
            ? (g.farCans?.spots ?? []).map((c) => c.x)
            : (g.nuts?.nuts ?? [])
                .filter((n) => n.state === 'rest' && (pl === null || n.plane === pl))
                .map((n) => n.x);
        // At the end of the pan the camera stops: close enough when a target is in view.
        return xs.some((x) => Math.abs(x - centre) < 300 || (x > 120 && x < g.designWidth - 120));
      },
      [source, plane] as const,
      { timeout: 300_000 },
    );
    await page.keyboard.up(key);
  }
  await page.waitForFunction(
    () => {
      const g = window.__TM__;
      const s = window as unknown as { __camStill?: { x: number; t: number } };
      if (g === undefined) return false;
      if (s.__camStill?.x !== g.cameraX) {
        s.__camStill = { x: g.cameraX, t: g.tick };
        return false;
      }
      return g.tick - s.__camStill.t >= 10;
    },
    null,
    { timeout: 60_000 },
  );
}

export interface ShotRun {
  /** The hunt's can and nut events so far ("nut-knock:5", "nut-juggle:1:10", "knock:7", …). */
  readonly log: string[];
  /** The id of the thing the last shot aimed at. */
  readonly lastId: number;
  /** Stopped because the belt is empty (the caller reloads and goes on). */
  readonly empty: boolean;
}

/**
 * Shoots nuts (or far cans) from inside the page until `until` shows in the log ('knock': a
 * crack-off or knock-off; 'juggle': an air hit), the belt is empty, `budgetMs` or `maxFrames`
 * runs out. A thing in the air comes first — once it falls (the top of its arc), one shot an arc —
 * else the resting one nearest the screen centre (on `plane` when given). With `holdOnDone` the
 * sim stays held two ticks after the goal (the pop is on screen), else it runs on.
 */
export async function shootThings(
  page: Page,
  touch: boolean,
  source: ThingSource,
  /** 'knock', 'juggle' (an air hit), 'pop', or a chain length (nuts: the hunt's longest). */
  until: 'knock' | 'juggle' | 'pop' | number,
  cooldownTicks: number,
  opts: {
    plane?: 'near' | 'mid';
    budgetMs?: number;
    maxFrames?: number;
    holdOnDone?: boolean;
  } = {},
): Promise<ShotRun> {
  return page.evaluate(
    ([src, goal, isTouch, cd, plane, budget, maxFrames, keepHeld]) =>
      new Promise<ShotRun>((resolve) => {
        const w = window as unknown as {
          __thingPointer?: number;
          __TM_HOLD_AT__?: (tick: number) => void;
        };
        const hold = (t: number): void => {
          w.__TM_HOLD_AT__?.(t);
        };
        const deadline = performance.now() + budget;
        let frames = 0;
        let lastFireTick = -1e9;
        let waitShots = -1;
        let phase: 'idle' | 'holding' | 'wait' = 'idle';
        let heldAt = -1;
        let heldFrames = 0;
        let lastId = -1;
        let seenTick = -1;
        let prevY = new Map<number, number>();
        let curY = new Map<number, number>();
        const shotArc = new Map<number, string>();
        type Spot = {
          id: number;
          x: number;
          y: number;
          state: string;
          chain: number;
          plane: string;
        };
        const spots = (): Spot[] => {
          const g = window.__TM__;
          if (g === undefined) return [];
          if (src === 'farCans')
            return (g.farCans?.spots ?? []).map((c) => ({
              ...c,
              plane: g.farCans?.plane ?? 'mid',
            }));
          return g.nuts?.nuts ?? [];
        };
        const track = (): void => {
          const g = window.__TM__;
          if (g === undefined || g.tick === seenTick) return;
          seenTick = g.tick;
          prevY = curY;
          curY = new Map(spots().map((c) => [c.id, c.y]));
        };
        const reached = (log: readonly string[]): boolean => {
          const prefix = src === 'nuts' ? 'nut-' : '';
          if (typeof goal === 'number')
            return src === 'nuts'
              ? (window.__TM__?.nuts?.bestChain ?? 0) >= goal
              : (window.__TM__?.farCans?.bestChain ?? 0) >= goal;
          if (goal === 'pop') return log.some((e) => e.startsWith('nut-pop'));
          return goal === 'knock'
            ? log.some((e) => e.startsWith(`${prefix}knock`))
            : log.some((e) => e.startsWith(`${prefix}juggle`));
        };
        const done = (empty: boolean): void => {
          const t0 = window.__TM__?.tick ?? 0;
          hold(keepHeld && !empty ? t0 + 2 : 1e12);
          resolve({ log: [...(window.__TM__?.canLog ?? [])], lastId, empty });
        };
        const pick = (): { x: number; y: number; id: number; arc: string } | null => {
          const g = window.__TM__;
          if (g === undefined) return null;
          const all = spots();
          const inView = (x: number, y: number): boolean =>
            x > 60 && x < g.designWidth - 60 && y > 30;
          const air = all.find(
            (c) => (c.state === 'air' || c.state === 'bounced') && inView(c.x, c.y),
          );
          if (air !== undefined) {
            const arc = `${String(air.chain)}/${air.state}`;
            const before = prevY.get(air.id);
            const falling = before !== undefined && air.y > before;
            if (!falling || shotArc.get(air.id) === arc) return null;
            return { x: air.x, y: air.y, id: air.id, arc };
          }
          if (
            goal !== 'knock' &&
            goal !== 'pop' &&
            all.some((c) => c.state === 'air' || c.state === 'bounced')
          )
            return null;
          const centre = g.designWidth / 2;
          const rest = all
            .filter(
              (c) => c.state === 'rest' && inView(c.x, c.y) && (plane === '' || c.plane === plane),
            )
            .sort((a, b) => Math.abs(a.x - centre) - Math.abs(b.x - centre))[0];
          return rest === undefined ? null : { x: rest.x, y: rest.y, id: rest.id, arc: 'rest' };
        };
        const fire = (x: number, y: number): void => {
          const g = window.__TM__;
          const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
          if (g === undefined || canvas === null) return;
          w.__thingPointer = (w.__thingPointer ?? 7300) + 1;
          const r = canvas.getBoundingClientRect();
          const init: PointerEventInit = {
            clientX: r.left + (x / g.designWidth) * r.width,
            clientY: r.top + (y / g.designHeight) * r.height,
            pointerId: w.__thingPointer,
            pointerType: isTouch ? 'touch' : 'mouse',
            isPrimary: true,
            button: 0,
            buttons: 1,
            bubbles: true,
            cancelable: true,
          };
          waitShots = g.shots;
          lastFireTick = g.tick;
          canvas.dispatchEvent(new PointerEvent('pointerdown', init));
          canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
        };
        const frame = (): void => {
          const g = window.__TM__;
          if (g === undefined || performance.now() > deadline || g.over || ++frames > maxFrames) {
            done(false);
            return;
          }
          track();
          if (phase !== 'holding' && reached(g.canLog)) {
            done(false);
            return;
          }
          if (phase === 'wait') {
            if (g.shots > waitShots) phase = 'idle';
          } else if (phase === 'holding') {
            if (g.tick === heldAt && ++heldFrames >= 2) {
              const t = pick();
              if (t !== null) {
                shotArc.set(t.id, t.arc);
                lastId = t.id;
                fire(t.x, t.y);
                phase = 'wait';
              } else phase = 'idle';
              hold(1e12);
            } else if (g.tick !== heldAt) heldAt = g.tick;
          } else {
            if (g.shells === 0 && !g.reloading) {
              done(true);
              return;
            }
            const ready = !g.reloading && g.shells > 0 && g.tick - lastFireTick >= cd;
            if (ready && pick() !== null) {
              heldAt = g.tick;
              heldFrames = 0;
              hold(g.tick);
              phase = 'holding';
            }
          }
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
    [
      source,
      until,
      touch,
      cooldownTicks,
      opts.plane ?? '',
      opts.budgetMs ?? 120_000,
      opts.maxFrames ?? 6000,
      opts.holdOnDone === true,
    ] as const,
  );
}
