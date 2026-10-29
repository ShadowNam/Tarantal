// v1.7e (review R12): a lazy image that outlives its timeout (a slow connection) is not lost: its
// own load is kept (imageArrival), and once it lands it is cached again (no second request).
import { afterEach, describe, expect, it, vi } from 'vitest';

/** A stand-in for HTMLImageElement: the test fires onload by hand. */
class FakeImage {
  static made: FakeImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  decoding = '';
  src = '';
  constructor() {
    FakeImage.made.push(this);
  }
}

vi.stubGlobal('Image', FakeImage);
vi.stubGlobal('window', globalThis);
const { imageArrival, loadImage } = await import('./finalLoader');

afterEach(() => {
  vi.useRealTimers();
});

describe('a lazy image that outlives its timeout (review R12)', () => {
  it('times out to null, then arrives via imageArrival and is cached again', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const path = 'assets/late/img/tells_sheet.test.png';
    const first = loadImage(path, 15_000);
    vi.advanceTimersByTime(15_001);
    expect(await first).toBeNull();
    const img = FakeImage.made.at(-1);
    if (img === undefined) throw new Error('no image made');
    const later = imageArrival(path);
    img.onload?.();
    expect(await later).toBe(img);
    // A later load (the next hunt, a retry) gets the arrived image without a new request.
    const made = FakeImage.made.length;
    expect(await loadImage(path, 15_000)).toBe(img);
    expect(FakeImage.made.length).toBe(made);
  });

  it('an image never asked for has no arrival', async () => {
    expect(await imageArrival('assets/never.png')).toBeNull();
  });
});
