// The device's viewport width never enters the sim (Tech §3.3, M7 "Done when"): a tap at the same
// offset from the screen centre becomes the same Command at every design width and CSS scale.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseFeel } from '../../content/feel';
import feelJson from '../../../content/client/feel.json';
import type { Command } from '../../sim/types';
import { InputMapper } from './InputMapper';

const parsed = parseFeel(feelJson);
if (!parsed.ok) throw new Error('feel.json invalid');
const feel = parsed.feel;

type Listener = (e: unknown) => void;

function fakeCanvas(cssWidth: number, cssHeight: number) {
  const listeners = new Map<string, Listener[]>();
  return {
    addEventListener: (type: string, fn: Listener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), fn]);
    },
    removeEventListener: () => undefined,
    getBoundingClientRect: () => ({ left: 10, top: 20, width: cssWidth, height: cssHeight }),
    setPointerCapture: () => undefined,
    emit(type: string, e: Record<string, unknown>) {
      for (const fn of listeners.get(type) ?? []) fn({ preventDefault: () => undefined, ...e });
    },
  };
}

/** Commands from one tap at (dx, sy) design px from the centre, on a screen `width` wide. */
function tap(
  width: number,
  scale: number,
  pointerType: 'mouse' | 'touch',
  dx: number,
  sy: number,
  offsetPx = 0,
): Command[] {
  const canvas = fakeCanvas(width * scale, 1080 * scale);
  const queued: Command[] = [];
  const mapper = new InputMapper(
    canvas as unknown as HTMLCanvasElement,
    feel,
    {
      designSize: () => ({ width, height: 1080 }),
      isOnBelt: () => false,
      isOnGadget: () => false,
      itemAt: () => null,
      isOnUi: () => false,
      pause: () => undefined,
      holdToFire: () => false,
      weaponHolds: () => false,
      readyToFire: () => true,
      queue: (c) => queued.push(c),
      aim: () => undefined,
      crosshairOffsetPx: () => offsetPx,
      fingerDown: () => undefined,
      toggleDebug: () => undefined,
    },
    0,
  );
  mapper.setEnabled(true);
  const clientX = 10 + (width / 2 + dx) * scale;
  const clientY = 20 + sy * scale;
  const e = { pointerId: 7, pointerType, button: 0, clientX, clientY, timeStamp: 1000 };
  canvas.emit('pointerdown', e);
  canvas.emit('pointerup', { ...e, timeStamp: 1060 });
  mapper.destroy();
  return queued;
}

beforeEach(() => {
  vi.stubGlobal('window', {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('InputMapper: offset crosshair (v1.1, GDD §18.2)', () => {
  it('a touch tap fires straight above the finger; a mouse click is unchanged', () => {
    expect(tap(1920, 1, 'touch', -100, 600, 70)).toEqual([{ t: 'fire', dx: -100, sy: 530 }]);
    expect(tap(1920, 0.5, 'touch', -100, 600, 70)).toEqual([{ t: 'fire', dx: -100, sy: 530 }]);
    expect(tap(1920, 1, 'mouse', -100, 600, 70)).toEqual([{ t: 'fire', dx: -100, sy: 600 }]);
    expect(tap(1920, 1, 'touch', -100, 600, 0)).toEqual([{ t: 'fire', dx: -100, sy: 600 }]);
    // Never above the top of the screen.
    expect(tap(1920, 1, 'touch', 0, 30, 70)).toEqual([{ t: 'fire', dx: 0, sy: 0 }]);
  });
});

describe('InputMapper: viewport width never reaches the sim', () => {
  for (const pointerType of ['mouse', 'touch'] as const) {
    it(`${pointerType}: the same tap gives the same fire command at 1440, 1920 and 2520 wide`, () => {
      const results = [1440, 1920, 2520].flatMap((w) =>
        [0.5, 1, 1.75].map((scale) => tap(w, scale, pointerType, -312.5, 640)),
      );
      for (const r of results) expect(r).toEqual([{ t: 'fire', dx: -312.5, sy: 640 }]);
    });
  }
});

describe('M9 Settings → hold to fire (any weapon)', () => {
  function holdRig(weaponHolds: boolean) {
    const canvas = fakeCanvas(1920, 1080);
    const queued: Command[] = [];
    let ready = true;
    const mapper = new InputMapper(
      canvas as unknown as HTMLCanvasElement,
      feel,
      {
        designSize: () => ({ width: 1920, height: 1080 }),
        isOnBelt: () => false,
        isOnGadget: () => false,
        itemAt: () => null,
        isOnUi: () => false,
        pause: () => undefined,
        holdToFire: () => true,
        weaponHolds: () => weaponHolds,
        readyToFire: () => ready,
        queue: (c) => queued.push(c),
        aim: () => undefined,
        fingerDown: () => undefined,
        toggleDebug: () => undefined,
      },
      0,
    );
    mapper.setEnabled(true);
    const e = { pointerId: 3, pointerType: 'mouse', button: 0, timeStamp: 1 };
    return {
      queued,
      mapper,
      setReady: (r: boolean) => {
        ready = r;
      },
      down: (x: number, y: number) => {
        canvas.emit('pointerdown', { ...e, clientX: 10 + x, clientY: 20 + y });
      },
      move: (x: number, y: number) => {
        canvas.emit('pointermove', { ...e, clientX: 10 + x, clientY: 20 + y });
      },
      up: () => {
        canvas.emit('pointerup', e);
      },
    };
  }

  it('a gun without its own hold fires on press, then each tick it is ready, at the held spot', () => {
    const r = holdRig(false);
    r.down(1060, 500);
    expect(r.queued).toEqual([{ t: 'fire', dx: 100, sy: 500 }]);
    r.move(860, 400);
    // Moves aim the repeat; they are no commands of their own.
    expect(r.queued).toHaveLength(1);
    expect(r.mapper.perTick()).toEqual([{ t: 'fire', dx: -100, sy: 400 }]);
    r.setReady(false); // reloading or cooling down: nothing (never an empty click)
    expect(r.mapper.perTick()).toEqual([]);
    r.setReady(true);
    r.up();
    expect(r.mapper.perTick()).toEqual([]);
    expect(r.queued).toHaveLength(1);
  });

  it("a gun with its own hold (Mielie-Masjien) keeps the sim's hold commands", () => {
    const r = holdRig(true);
    r.down(960, 500);
    r.up();
    expect(r.queued.map((c) => c.t)).toEqual(['fireHoldStart', 'fireHoldEnd']);
    expect(r.mapper.perTick()).toEqual([]);
  });
});

describe('M9 hold to fire on touch keeps the gestures (D-026)', () => {
  function touchRig() {
    const canvas = fakeCanvas(1920, 1080);
    const queued: Command[] = [];
    let clock = 0;
    const mapper = new InputMapper(
      canvas as unknown as HTMLCanvasElement,
      feel,
      {
        designSize: () => ({ width: 1920, height: 1080 }),
        isOnBelt: () => false,
        isOnGadget: () => false,
        itemAt: () => null,
        isOnUi: () => false,
        pause: () => undefined,
        holdToFire: () => true,
        weaponHolds: () => false,
        readyToFire: () => true,
        queue: (c) => queued.push(c),
        aim: () => undefined,
        fingerDown: () => undefined,
        toggleDebug: () => undefined,
      },
      960,
      () => clock,
    );
    mapper.setEnabled(true);
    const ev = (x: number, y: number, t: number) => ({
      pointerId: 4,
      pointerType: 'touch',
      button: 0,
      clientX: 10 + x,
      clientY: 20 + y,
      timeStamp: t,
    });
    /** Advance the clock and run one sim tick; returns that tick's commands. */
    const tick = (t: number): Command[] => {
      clock = t;
      return mapper.perTick();
    };
    return { canvas, queued, mapper, ev, tick };
  }
  const fires = (cmds: readonly Command[]) => cmds.filter((c) => c.t === 'fire').length;
  /** Exactly one shot, at design (1000, 500): dx 40 from the centre. */
  const oneShotAt40 = (cmds: readonly Command[]): void => {
    expect(cmds).toHaveLength(1);
    const c = cmds[0];
    expect(c?.t).toBe('fire');
    if (c?.t === 'fire') {
      expect(c.dx).toBeCloseTo(40, 6);
      expect(c.sy).toBeCloseTo(500, 6);
    }
  };
  const hold = feel.input.touchHoldMs;

  it('a quick tap still fires once, and never starts a repeat', () => {
    const r = touchRig();
    r.canvas.emit('pointerdown', r.ev(1000, 500, 1000));
    expect(fires(r.tick(1000 + hold / 3))).toBe(0);
    r.canvas.emit('pointerup', r.ev(1000, 500, 1000 + hold / 2));
    oneShotAt40(r.queued);
    expect(fires(r.tick(1000 + hold * 3))).toBe(0);
  });

  it('a still finger becomes the hold after touchHoldMs and fires while ready', () => {
    const r = touchRig();
    r.canvas.emit('pointerdown', r.ev(1000, 500, 1000));
    expect(fires(r.tick(1000 + hold - 1))).toBe(0);
    expect(r.queued).toEqual([]);
    r.tick(1000 + hold); // the hold starts: its first shot is queued
    oneShotAt40(r.queued);
    expect(fires(r.tick(1000 + hold + 17))).toBe(1);
    // Lifting ends it: no tap shot on release, no more repeats.
    r.canvas.emit('pointerup', r.ev(1000, 500, 1000 + hold + 40));
    expect(r.queued).toHaveLength(1);
    expect(fires(r.tick(1000 + hold + 60))).toBe(0);
  });

  it('a drag pans and never fires', () => {
    const r = touchRig();
    r.canvas.emit('pointerdown', r.ev(1000, 500, 1000));
    r.canvas.emit('pointermove', r.ev(940, 502, 1000 + hold / 3));
    r.canvas.emit('pointermove', r.ev(800, 505, 1000 + hold / 2));
    const cmds = [r.tick(1000 + hold * 2), r.tick(1000 + hold * 3)].flat();
    r.canvas.emit('pointerup', r.ev(700, 505, 1000 + hold * 3));
    expect(fires([...r.queued, ...cmds])).toBe(0);
    expect(cmds.some((c) => c.t === 'cameraTarget')).toBe(true);
  });

  it('a flick down reloads and never fires', () => {
    const r = touchRig();
    r.canvas.emit('pointerdown', r.ev(1000, 400, 1000));
    r.canvas.emit('pointermove', r.ev(1000, 460, 1040));
    r.canvas.emit('pointerup', r.ev(1000, 500, 1080));
    const cmds = r.tick(1000 + hold * 2);
    expect(r.queued).toEqual([{ t: 'reload' }]);
    expect(fires(cmds)).toBe(0);
  });
});

describe('v1.3 rifles: hold to zoom, release to fire (D-036)', () => {
  function rifleRig(width: number, scale: number, zoom: number | null = 4) {
    const canvas = fakeCanvas(width * scale, 1080 * scale);
    const queued: Command[] = [];
    const mapper = new InputMapper(
      canvas as unknown as HTMLCanvasElement,
      feel,
      {
        designSize: () => ({ width, height: 1080 }),
        // The ammo display: the bottom-right corner.
        isOnBelt: (x, y) => x > width - 200 && y > 900,
        isOnGadget: () => false,
        itemAt: () => null,
        isOnUi: () => false,
        pause: () => undefined,
        holdToFire: () => false,
        weaponHolds: () => false,
        readyToFire: () => true,
        sightZoom: () => zoom,
        queue: (c) => queued.push(c),
        aim: () => undefined,
        fingerDown: () => undefined,
        toggleDebug: () => undefined,
      },
      0,
    );
    mapper.setEnabled(true);
    const at = (dx: number, sy: number) => ({
      clientX: 10 + (width / 2 + dx) * scale,
      clientY: 20 + sy * scale,
    });
    return { canvas, queued, mapper, at };
  }

  it('press raises the sight at the pointer, moves aim finer (÷ zoom, one per tick), release fires', () => {
    for (const [width, scale] of [
      [1920, 1],
      [1440, 0.6],
      [2520, 0.4],
    ] as const) {
      const { canvas, queued, mapper, at } = rifleRig(width, scale);
      const e = { pointerId: 1, pointerType: 'mouse', button: 0, timeStamp: 0 };
      canvas.emit('pointerdown', { ...e, ...at(-200, 500) });
      canvas.emit('pointermove', { ...e, ...at(-180, 520) });
      canvas.emit('pointermove', { ...e, ...at(-160, 540) });
      const tick = mapper.perTick();
      canvas.emit('pointerup', { ...e, ...at(-160, 540) });
      mapper.destroy();
      // The same commands at every width and CSS scale: dx from the centre, unzoomed px.
      expect(queued[0]).toEqual({ t: 'aimStart', dx: -200, sy: 500 });
      expect(tick.filter((c) => c.t === 'aimMove')).toEqual([{ t: 'aimMove', dx: -190, sy: 510 }]);
      expect(queued.at(-1)).toEqual({ t: 'aimRelease' });
    }
  });

  it('right-click while holding cancels (no reload); otherwise it reloads', () => {
    const { canvas, queued, mapper, at } = rifleRig(1920, 1);
    const e = { pointerId: 1, pointerType: 'mouse', timeStamp: 0 };
    canvas.emit('pointerdown', { ...e, button: 0, ...at(0, 500) });
    canvas.emit('pointerdown', { ...e, button: 2, ...at(0, 500) });
    canvas.emit('pointerup', { ...e, button: 0, ...at(0, 500) });
    canvas.emit('pointerdown', { ...e, button: 2, ...at(0, 500) });
    mapper.destroy();
    expect(queued.map((c) => c.t)).toEqual(['aimStart', 'aimCancel', 'reload']);
  });

  it('touch: sliding onto the ammo display cancels; a quick tap is a press and release', () => {
    const { canvas, queued, mapper, at } = rifleRig(1920, 1);
    const t = { pointerId: 3, pointerType: 'touch', button: 0 };
    canvas.emit('pointerdown', { ...t, timeStamp: 0, ...at(100, 400) });
    canvas.emit('pointermove', { ...t, timeStamp: 50, ...at(500, 700) });
    canvas.emit('pointermove', { ...t, timeStamp: 100, ...at(880, 1000) });
    canvas.emit('pointerup', { ...t, timeStamp: 150, ...at(880, 1000) });
    expect(queued.map((c) => c.t)).toEqual(['aimStart', 'aimCancel']);
    queued.length = 0;
    canvas.emit('pointerdown', { ...t, pointerId: 4, timeStamp: 1000, ...at(-50, 600) });
    canvas.emit('pointerup', { ...t, pointerId: 4, timeStamp: 1040, ...at(-50, 600) });
    mapper.destroy();
    expect(queued).toEqual([{ t: 'aimStart', dx: -50, sy: 600 }, { t: 'aimRelease' }]);
  });

  it('touch: a flick down still reloads (and lowers the sight)', () => {
    const { canvas, queued, mapper, at } = rifleRig(1920, 1);
    const t = { pointerId: 5, pointerType: 'touch', button: 0 };
    canvas.emit('pointerdown', { ...t, timeStamp: 0, ...at(0, 300) });
    canvas.emit('pointermove', { ...t, timeStamp: 40, ...at(0, 450) });
    canvas.emit('pointerup', { ...t, timeStamp: 80, ...at(0, 620) });
    mapper.destroy();
    expect(queued.map((c) => c.t)).toEqual(['aimStart', 'aimCancel', 'reload']);
  });

  it('a gun without a sight still fires on press', () => {
    const { canvas, queued, mapper, at } = rifleRig(1920, 1, null);
    canvas.emit('pointerdown', {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      timeStamp: 0,
      ...at(30, 400),
    });
    mapper.destroy();
    expect(queued).toEqual([{ t: 'fire', dx: 30, sy: 400 }]);
  });
});
