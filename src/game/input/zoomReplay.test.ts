// v1.4 (D-038, Tech §3.3): a zoomed Langloop hunt on Die Verste played through the InputMapper on
// a desktop, a Pixel 7 and an iPhone 14 landscape screen. The same play (the same design px from
// the screen centre, the same zoom steps) gives the same commands and so the same hunt: the
// viewport width never reaches the sim, zoomed or not.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseFeel } from '../../content/feel';
import feelJson from '../../../content/client/feel.json';
import { base } from '../../../tools/simHarness';
import { hashEvents, type SimEvent } from '../../sim/events';
import { sanitiseCommand } from '../../sim/commands';
import { createSim } from '../../sim/Sim';
import type { Command, InputKind, ModeConfig } from '../../sim/types';
import { designSizeFor } from '../layout';
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
    getBoundingClientRect: () => ({ left: 0, top: 0, width: cssWidth, height: cssHeight }),
    setPointerCapture: () => undefined,
    emit(type: string, e: Record<string, unknown>) {
      for (const fn of listeners.get(type) ?? []) fn({ preventDefault: () => undefined, ...e });
    },
  };
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

const MODE: ModeConfig = {
  id: 'classic',
  layout: 'mon',
  bonus: 'dieVerste',
  weapon: 'langloop',
  sight: 'scope_var',
};
const SCREENS = [
  { name: 'desktop', css: [1280, 720] },
  { name: 'Pixel 7 landscape', css: [915, 412] },
  { name: 'iPhone 14 landscape', css: [844, 390] },
] as const;
/** Touch zoom buttons for the test: two 90 px squares at the bottom-right corner. */
const ZOOM_OUT = { dx: -150, sy: 1000 };
const ZOOM_IN = { dx: -50, sy: 1000 };

function play(css: readonly [number, number], kind: InputKind) {
  const { width } = designSizeFor(css[0], css[1]);
  const sx = css[0] / width;
  const sy = css[1] / 1080;
  const canvas = fakeCanvas(css[0], css[1]);
  const sim = createSim({ seed: 56, content: base, mode: MODE, inputKind: kind });
  const queued: Command[] = [];
  const right = width; // screen right edge in design px
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
      sightZoom: () => {
        const w = sim.snapshot().weapon;
        return [3, 6, 9][w.zoomStep] ?? 3;
      },
      zoomSteps: () => ({ zooms: [3, 6, 9], step: sim.snapshot().weapon.zoomStep }),
      zoomButtonAt: (x, y) => {
        if (kind === 'pointer' || y < 960) return null;
        if (Math.abs(x - (right + ZOOM_OUT.dx)) < 45) return -1;
        if (Math.abs(x - (right + ZOOM_IN.dx)) < 45) return 1;
        return null;
      },
      queue: (c) => queued.push(c),
      aim: () => undefined,
      fingerDown: () => undefined,
      toggleDebug: () => undefined,
    },
    960,
    () => 0,
  );
  mapper.setEnabled(true);
  const pointerType = kind === 'pointer' ? 'mouse' : 'touch';
  /** A point `dx` design px from the screen centre, in client px. */
  const at = (dx: number, y: number) => ({
    clientX: (width / 2 + dx) * sx,
    clientY: y * sy,
  });
  const atRight = (p: { dx: number; sy: number }) => ({
    clientX: (right + p.dx) * sx,
    clientY: p.sy * sy,
  });
  const zoom = (delta: -1 | 1, t: number) => {
    if (kind === 'pointer') {
      canvas.emit('wheel', { deltaY: delta > 0 ? -100 : 100, deltaMode: 0 });
      return;
    }
    const p = atRight(delta > 0 ? ZOOM_IN : ZOOM_OUT);
    const e = { pointerId: 9, pointerType, button: 0, timeStamp: t * 16 };
    canvas.emit('pointerdown', { ...e, ...p });
    canvas.emit('pointerup', { ...e, ...p });
  };
  const log: [number, Command[]][] = [];
  const events: SimEvent[] = [...sim.drainEvents()];
  for (let t = 0; t < 3000 && !sim.isOver(); t++) {
    const phase = t % 100;
    const aimX = ((t * 53) % 800) - 400;
    const e = { pointerId: 1, pointerType, button: 0, timeStamp: t * 16 };
    if (phase === 2) canvas.emit('pointerdown', { ...e, ...at(aimX, 420) });
    else if (phase === 20) zoom(1, t);
    else if (phase === 30 && t % 300 === 30) zoom(1, t);
    else if (phase > 30 && phase < 70 && phase % 5 === 0)
      canvas.emit('pointermove', { ...e, ...at(aimX + phase * 2, 420 + phase) });
    else if (phase === 70) canvas.emit('pointerup', { ...e, ...at(aimX + 140, 490) });
    else if (phase === 80) zoom(-1, t);
    else if (phase === 85 && sim.snapshot().weapon.shells === 0) queued.push({ t: 'reload' });
    // The runner sends perTick's commands, then the queued ones.
    const cmds = [...mapper.perTick(), ...queued.splice(0)];
    // What the sim takes in (positions quantised to 0.5 px), as the replay log records it.
    const taken = cmds.map(sanitiseCommand).filter((c): c is Command => c !== null);
    if (taken.length > 0) log.push([sim.tick, taken]);
    sim.step(cmds);
    events.push(...sim.drainEvents());
  }
  while (!sim.isOver()) {
    sim.step([]);
    events.push(...sim.drainEvents());
  }
  mapper.destroy();
  return { width, log, hash: hashEvents(events), events, score: sim.result().score };
}

describe('a zoomed Langloop hunt is the same hunt on every screen (D-038)', () => {
  for (const kind of ['pointer', 'touch'] as const) {
    it(`${kind}: desktop, Pixel 7 and iPhone 14 landscape give the same commands and events`, () => {
      const runs = SCREENS.map((s) => play(s.css, kind));
      // Three different design widths, one hunt.
      expect(new Set(runs.map((r) => r.width)).size).toBe(3);
      const [first, ...rest] = runs;
      if (first === undefined) throw new Error('no runs');
      const zooms = first.events.filter((e) => e.type === 'zoomChanged');
      expect(zooms.length).toBeGreaterThanOrEqual(20);
      expect(first.events.filter((e) => e.type === 'shotFired').length).toBeGreaterThanOrEqual(15);
      for (const r of rest) {
        expect(r.log).toEqual(first.log);
        expect(r.hash).toBe(first.hash);
        expect(r.score).toBe(first.score);
      }
    });
  }
});
