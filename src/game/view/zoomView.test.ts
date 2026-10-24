import { describe, expect, it } from 'vitest';
import { tapToPlane } from '../../sim/camera';
import { designSizeFor } from '../layout';
import { fineAim, fromZoomed, NO_ZOOM, toZoomed, zoomFor } from './zoomView';

// Desktop 16:9, iPhone 14 landscape (19.5:9), Pixel 7 landscape (20:9), 4:3 tablet, 21:9.
const SCREENS = [
  [1280, 720],
  [844, 390],
  [915, 412],
  [1024, 768],
  [2520, 1080],
].map(([w, h]) => designSizeFor(w ?? 0, h ?? 0));

describe('zoom view (v1.3, D-036)', () => {
  it('no aim is no zoom', () => {
    expect(zoomFor(null, 1920, 1080)).toEqual(NO_ZOOM(1920, 1080));
  });

  it('a zoomed shot names the same world point on every screen (Tech §3.3)', () => {
    const cameraX = 2311.5;
    const aim = { zoom: 4, progress: 1, dx: -183.25, sy: 561.5 };
    const points = SCREENS.map(({ width, height }) => {
      const v = zoomFor(aim, width, height);
      // The unzoomed screen point under the reticle → plane x, for the far and Ver planes.
      const p = fromZoomed(v, v.reticleX, v.reticleY, width, height);
      const dx = p.x - width / 2;
      return [tapToPlane(cameraX, 0.35, dx, p.y), tapToPlane(cameraX, 0.22, dx, p.y)];
    });
    for (const pts of points) {
      expect(pts[0]?.x).toBeCloseTo(points[0]?.[0]?.x ?? NaN, 9);
      expect(pts[0]?.y).toBeCloseTo(561.5, 9);
      expect(pts[1]?.x).toBeCloseTo(points[0]?.[1]?.x ?? NaN, 9);
    }
  });

  it('centres the aim point once the sight is up, and never leaves the unzoomed screen', () => {
    const { width, height } = SCREENS[0] ?? { width: 1920, height: 1080 };
    const mid = zoomFor({ zoom: 2, progress: 1, dx: 100, sy: 500 }, width, height);
    expect(mid.z).toBe(2);
    expect([mid.reticleX, mid.reticleY]).toEqual([width / 2, height / 2]);
    // Aiming at the very edge: the view stops at the edge and the reticle moves off-centre.
    const edge = zoomFor({ zoom: 4, progress: 1, dx: -width / 2, sy: 0 }, width, height);
    const topLeft = fromZoomed(edge, 0, 0, width, height);
    const bottomRight = fromZoomed(edge, width, height, width, height);
    expect(topLeft.x).toBeGreaterThanOrEqual(0);
    expect(topLeft.y).toBeGreaterThanOrEqual(0);
    expect(bottomRight.x).toBeLessThanOrEqual(width);
    expect(bottomRight.y).toBeLessThanOrEqual(height);
    expect(edge.reticleX).toBeCloseTo(0, 9);
    expect(edge.reticleY).toBeCloseTo(0, 9);
  });

  it('eases in from the press point: no jump at the start of the raise', () => {
    const v = zoomFor({ zoom: 4, progress: 0, dx: 300, sy: 200 }, 1920, 1080);
    expect(v.z).toBe(1);
    expect([v.reticleX, v.reticleY]).toEqual([1260, 200]);
    const half = zoomFor({ zoom: 4, progress: 0.5, dx: 300, sy: 200 }, 1920, 1080);
    expect(half.z).toBeCloseTo(2.5, 9);
    const p = toZoomed(half, 1260, 200, 1920, 1080);
    expect([p.x, p.y]).toEqual([half.reticleX, half.reticleY]);
  });

  it('fine aim moves the aim by the pointer movement over the zoom, inside the screen', () => {
    const a = fineAim({ x: 900, y: 500 }, { x: 1000, y: 600 }, { x: 1080, y: 560 }, 4, 1920, 1080);
    expect(a).toEqual({ x: 920, y: 490 });
    expect(fineAim({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: -400, y: -400 }, 2, 1920, 1080)).toEqual({
      x: 0,
      y: 0,
    });
  });
});
