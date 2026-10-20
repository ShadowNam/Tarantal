import { describe, expect, it } from 'vitest';
import { CAMERA_MAX_X, CAMERA_MIN_X } from '../../sim/world';
import { GestureRecognizer } from './gestures';
import { edgeDirection, PanController } from './panController';

const tuning = { tapMaxMs: 180, tapMaxMovePx: 12, flickMinPx: 60, flickMaxMs: 200 };
const pan = {
  dragPlaneScrollFactor: 0.6,
  inertiaDecayPerSec: 5,
  inertiaMaxPxPerSec: 2400,
  inertiaStopPxPerSec: 20,
  edgePanPxPerSec: 1400,
  keyPanPxPerSec: 1600,
};

describe('GestureRecognizer (GDD §18.2)', () => {
  it('short, still contact is a tap at the touch-down point', () => {
    const g = new GestureRecognizer(tuning);
    g.down(1, 500, 400, 0);
    g.move(1, 505, 403, 60);
    expect(g.up(1, 506, 404, 120)).toEqual({ kind: 'tap', x: 500, y: 400 });
  });

  it('a long press is not a tap', () => {
    const g = new GestureRecognizer(tuning);
    g.down(1, 500, 400, 0);
    expect(g.up(1, 500, 400, 181).kind).not.toBe('tap');
  });

  it('moving 12 px or more is not a tap and starts panning', () => {
    const g = new GestureRecognizer(tuning);
    g.down(1, 500, 400, 0);
    expect(g.move(1, 506, 400, 10)).toBe(0);
    expect(g.move(1, 513, 400, 20)).toBe(13);
    expect(g.move(1, 533, 400, 30)).toBe(20);
    expect(g.up(1, 533, 400, 60).kind).toBe('dragEnd');
  });

  it('fast downward swipe ≥ 60 px within 200 ms is a flick-down (reload)', () => {
    const g = new GestureRecognizer(tuning);
    g.down(1, 500, 300, 0);
    g.move(1, 502, 340, 60);
    expect(g.up(1, 505, 380, 150)).toEqual({ kind: 'flickDown' });
  });

  it('slow or upward or sideways swipes are not flicks', () => {
    const g = new GestureRecognizer(tuning);
    g.down(1, 500, 300, 0);
    expect(g.up(1, 500, 380, 260).kind).toBe('dragEnd');
    g.down(2, 500, 300, 0);
    expect(g.up(2, 500, 220, 100).kind).toBe('dragEnd');
    g.down(3, 500, 300, 0);
    expect(g.up(3, 600, 370, 100).kind).toBe('dragEnd');
  });

  it('release velocity comes from the last ~80 ms', () => {
    const g = new GestureRecognizer(tuning);
    g.down(1, 0, 0, 0);
    for (let t = 10; t <= 200; t += 10) g.move(1, t * 2, 0, t);
    const end = g.up(1, 400, 0, 200);
    expect(end.kind).toBe('dragEnd');
    if (end.kind === 'dragEnd') expect(end.vx).toBeCloseTo(2000, -1);
  });

  it('only the first finger pans; a second finger can still tap', () => {
    const g = new GestureRecognizer(tuning);
    g.down(1, 100, 500, 0);
    g.down(2, 900, 300, 5);
    expect(g.move(1, 150, 500, 30)).toBe(50);
    expect(g.move(2, 901, 300, 30)).toBe(0);
    expect(g.up(2, 901, 300, 80)).toEqual({ kind: 'tap', x: 900, y: 300 });
  });
});

describe('PanController (Tech §6)', () => {
  it('drag moves the camera so the mid plane follows the finger', () => {
    const p = new PanController(pan, 2000);
    p.drag(60); // finger right → look left
    expect(p.tick()).toBe(1900);
    expect(p.tick()).toBeNull(); // unchanged → no command
  });

  it('inertia decays exponentially, is capped at 2400/s and stops', () => {
    const p = new PanController(pan, 2000);
    p.release(-1e6);
    const first = p.tick() ?? 0;
    expect(first - 2000).toBeCloseTo(2400 / 60, 0);
    let last = first;
    let steps = 0;
    for (; steps < 600; steps++) {
      const v = p.tick();
      if (v === null) break;
      expect(v - last).toBeLessThanOrEqual(2400 / 60 + 1e-9);
      last = v;
    }
    expect(steps).toBeLessThan(600);
    expect(p.tick()).toBeNull();
  });

  it('clamps to the camera range and kills inertia at the end', () => {
    const p = new PanController(pan, CAMERA_MAX_X - 5);
    p.release(-2000);
    p.tick();
    expect(p.cameraX).toBe(CAMERA_MAX_X);
    expect(p.tick()).toBeNull();
    const q = new PanController(pan, CAMERA_MIN_X);
    q.drag(1000);
    q.tick();
    expect(q.cameraX).toBe(CAMERA_MIN_X);
  });

  it('keys pan at keyPanPxPerSec; keys win over the screen edge', () => {
    const p = new PanController(pan, 2000);
    p.setKeyDirection(1);
    p.setEdgeDirection(-1);
    for (let i = 0; i < 60; i++) p.tick();
    expect(p.cameraX).toBeCloseTo(3600, 0);
  });

  it('output is quantised to 0.5 like every camera command', () => {
    const p = new PanController(pan, 2000);
    p.drag(0.1);
    p.tick();
    p.drag(0.37);
    const v = p.tick() ?? p.cameraX;
    expect(v * 2).toBe(Math.round(v * 2));
  });

  it('edge pan triggers in the outer 12 % of the screen', () => {
    expect(edgeDirection(100, 1920, 0.12)).toBe(-1);
    expect(edgeDirection(231, 1920, 0.12)).toBe(0);
    expect(edgeDirection(1700, 1920, 0.12)).toBe(1);
    expect(edgeDirection(960, 1920, 0.12)).toBe(0);
  });
});
