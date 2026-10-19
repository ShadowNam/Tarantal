import { describe, expect, it } from 'vitest';
import { clampCameraX, planeToDx, quantiseHalf, tapToPlane } from './camera';
import { CAMERA_MAX_X, CAMERA_MIN_X, coreWidth } from './world';

const PLANES = { near: 1.0, mid: 0.6, far: 0.35 } as const;

describe('camera geometry (Tech §3.3)', () => {
  it('has the documented core widths', () => {
    expect(coreWidth(PLANES.mid)).toBe(3840);
    expect(coreWidth(PLANES.near)).toBe(5120);
    expect(coreWidth(PLANES.far)).toBe(3040);
    expect(coreWidth(1.2)).toBe(5760);
  });

  it('maps a tap at the screen centre at the left camera end to x = 960 on every plane', () => {
    for (const f of Object.values(PLANES)) {
      expect(tapToPlane(CAMERA_MIN_X, f, 0, 500)).toEqual({ x: 960, y: 500 });
    }
  });

  it('maps a tap at the screen centre at the right camera end to 960 + R × f', () => {
    expect(tapToPlane(CAMERA_MAX_X, PLANES.near, 0, 0).x).toBe(4160);
    expect(tapToPlane(CAMERA_MAX_X, PLANES.mid, 0, 0).x).toBe(2880);
    expect(tapToPlane(CAMERA_MAX_X, PLANES.far, 0, 0).x).toBe(2080);
  });

  it('a 16:9 screen (dx = ±960) at either camera end sees exactly the core width edges', () => {
    for (const f of Object.values(PLANES)) {
      expect(tapToPlane(CAMERA_MIN_X, f, -960, 0).x).toBe(0);
      expect(tapToPlane(CAMERA_MAX_X, f, 960, 0).x).toBeCloseTo(coreWidth(f), 9);
    }
  });

  it('a 21:9 screen edge (dx = ±1260) lands inside the 300 px bleed', () => {
    for (const f of Object.values(PLANES)) {
      expect(tapToPlane(CAMERA_MIN_X, f, -1260, 0).x).toBe(-300);
      expect(tapToPlane(CAMERA_MAX_X, f, 1260, 0).x).toBeCloseTo(coreWidth(f) + 300, 9);
    }
  });

  it('a tap at the same dx moves less on far planes as the camera pans (parallax)', () => {
    const pan = (f: number) => tapToPlane(2000, f, 300, 0).x - tapToPlane(1000, f, 300, 0).x;
    expect(pan(PLANES.near)).toBe(1000);
    expect(pan(PLANES.mid)).toBe(600);
    expect(pan(PLANES.far)).toBeCloseTo(350, 9);
  });

  it('planeToDx inverts tapToPlane', () => {
    for (const f of Object.values(PLANES)) {
      for (const cx of [960, 1777.5, 4160]) {
        for (const dx of [-1260, -3.5, 0, 840]) {
          expect(planeToDx(cx, f, tapToPlane(cx, f, dx, 0).x)).toBeCloseTo(dx, 9);
        }
      }
    }
  });

  it('quantises to 0.5 and clamps the camera to [960, 960 + R]', () => {
    expect(quantiseHalf(10.24)).toBe(10);
    expect(quantiseHalf(10.26)).toBe(10.5);
    expect(quantiseHalf(-3.3)).toBe(-3.5);
    expect(clampCameraX(0)).toBe(960);
    expect(clampCameraX(99999)).toBe(4160);
    expect(clampCameraX(2000.3)).toBe(2000.5);
  });
});
