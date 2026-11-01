// v1.11 (D-068): the braai sheet's table — every frame inside the sheet the keys name, none
// overlapping, origins inside their frames, and the GPU cost inside the Okavango Reënbui HD headroom.
import { describe, expect, it } from 'vitest';
import {
  BRAAI_SHEET_H,
  BRAAI_SHEET_W,
  FLAME_FRAMES,
  GPU_BYTES_CAP,
  SPARK_FRAMES,
  braaiFrames,
  braaiSheetHeight,
  braaiSheetWidth,
  braaiTexelsPerPx,
  flameFrame,
  sheetRect,
  sparkFrame,
} from './braaiSheet';

describe('braai sheet (D-068)', () => {
  const frames = braaiFrames();

  it('fits the sheet the keys name, frames 2 px apart, origins inside', () => {
    expect(braaiSheetWidth()).toBeLessThanOrEqual(BRAAI_SHEET_W - 2);
    expect(braaiSheetHeight()).toBeLessThanOrEqual(BRAAI_SHEET_H - 2);
    for (const fr of frames) {
      const f = sheetRect(fr);
      expect([1, 0.5, 0.25]).toContain(fr.res);
      expect(f.x).toBeGreaterThanOrEqual(2);
      expect(f.y).toBeGreaterThanOrEqual(2);
      expect(fr.ox).toBeGreaterThanOrEqual(0);
      expect(fr.ox).toBeLessThanOrEqual(fr.w);
      expect(fr.oy).toBeGreaterThanOrEqual(0);
      expect(fr.oy).toBeLessThanOrEqual(fr.h);
      for (const or of frames)
        if (or !== fr) {
          const o = sheetRect(or);
          const apart =
            f.x + f.w + 2 <= o.x ||
            o.x + o.w + 2 <= f.x ||
            f.y + f.h + 2 <= o.y ||
            o.y + o.h + 2 <= f.y;
          expect(apart, `${fr.name} touches ${or.name}`).toBe(true);
        }
    }
    expect(new Set(frames.map((f) => f.name)).size).toBe(frames.length);
  });

  it('has every frame the view asks for', () => {
    const names = new Set<string>(frames.map((f) => f.name));
    for (let i = -2; i < FLAME_FRAMES * 2; i++) expect(names.has(flameFrame(i))).toBe(true);
    for (let i = -2; i < SPARK_FRAMES * 2; i++) expect(names.has(sparkFrame(i))).toBe(true);
    for (const n of [
      'sit_idle',
      'sit_sip',
      'sit_poke',
      'poker',
      'dance_a',
      'dance_b',
      'hearth',
      'glow',
      'stars',
      'milky',
      'cross',
      'bakkie',
    ])
      expect(names.has(n), n).toBe(true);
  });

  it('costs at most GPU_BYTES_CAP at 1× (≈ 0.84 MiB: the Okavango Reënbui HD hunt has ~1.2 MB)', () => {
    expect(braaiTexelsPerPx(BRAAI_SHEET_W)).toBe(1);
    expect(braaiTexelsPerPx(BRAAI_SHEET_W * 2)).toBe(2);
    expect(BRAAI_SHEET_W * BRAAI_SHEET_H * 4).toBeLessThanOrEqual(GPU_BYTES_CAP);
    expect(GPU_BYTES_CAP).toBeLessThanOrEqual(0.85 * 1024 * 1024);
  });

  it('the dance frames mirror round their feet; the soft frames are the smaller ones', () => {
    for (const f of frames.filter((x) => x.name.startsWith('dance_'))) expect(f.ox * 2).toBe(f.w);
    const soft = frames
      .filter((f) => f.res !== 1)
      .map((f) => f.name)
      .sort();
    expect(soft).toEqual(['bakkie', 'glow', 'milky', 'spark_0', 'spark_1', 'spark_2', 'stars']);
  });
});
