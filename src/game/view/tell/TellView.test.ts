// v1.7e (review R11): TellView never cuts its frames from the empty placeholder. It is ready only
// once the manifest says the delivered sheet is under the key; until then it polls upgrade()
// every 30 frames and draws nothing.
import { describe, expect, it, vi } from 'vitest';
import type { ParallaxView } from '../ParallaxView';

vi.mock('phaser', () => ({ TintModes: { FILL: 1 } }));
const { TellView } = await import('./TellView');
const { TELL_SHEET, TELL_SHEET_W } = await import('./tellKeys');

/** A texture manager whose `tells/sheet` is a full-size canvas (the placeholder) or the file. */
function fakeScene(width: number) {
  const frames = new Set<string>();
  const tex = {
    getSourceImage: () => ({ width }),
    has: (n: string) => frames.has(n),
    get: () => ({}),
    add: (n: string) => {
      frames.add(n);
      return { customPivot: false, pivotX: 0, pivotY: 0 };
    },
  };
  return {
    scene: { textures: { exists: (k: string) => k === TELL_SHEET, get: () => tex } },
    frames,
  };
}

describe('TellView and the late tell sheet (review R11)', () => {
  it('rejects the full-size empty placeholder and polls upgrade() until the file is in', () => {
    const { scene, frames } = fakeScene(TELL_SHEET_W);
    let delivered = false;
    const manifest = {
      delivered: vi.fn(() => delivered),
      upgrade: vi.fn(() => [] as string[]),
    };
    const v = new TellView(scene as never, {} as ParallaxView, () => 0, manifest);
    for (let k = 0; k < 61; k++) expect(v.sheetReady()).toBe(false);
    // Polled on frames 0, 30 and 60 only; no frames cut from the placeholder.
    expect(manifest.upgrade).toHaveBeenCalledTimes(3);
    expect(manifest.upgrade).toHaveBeenCalledWith(scene.textures, TELL_SHEET);
    expect(frames.size).toBe(0);
    // The late group lands: the next poll swaps it in and the frames are cut.
    manifest.upgrade.mockImplementation(() => {
      delivered = true;
      return [TELL_SHEET];
    });
    let ready = false;
    for (let k = 0; k < 31 && !ready; k++) ready = v.sheetReady();
    expect(ready).toBe(true);
    expect(frames.size).toBeGreaterThan(0);
  });

  it('is ready at once when the delivered sheet is already under the key', () => {
    const { scene, frames } = fakeScene(TELL_SHEET_W * 2);
    const manifest = { delivered: () => true, upgrade: vi.fn(() => [] as string[]) };
    const v = new TellView(scene as never, {} as ParallaxView, () => 0, manifest);
    expect(v.sheetReady()).toBe(true);
    expect(manifest.upgrade).not.toHaveBeenCalled();
    expect(frames.size).toBe(52);
  });
});
