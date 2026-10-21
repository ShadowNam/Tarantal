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
      queue: (c) => queued.push(c),
      aim: () => undefined,
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
