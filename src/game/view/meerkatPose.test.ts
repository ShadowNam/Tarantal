import { describe, expect, it } from 'vitest';
import {
  MEERKAT_FRAMES,
  MIRRORED_FRAMES,
  RIM_FRAMES,
  sheetFrames,
  SHEET_H,
  SHEET_W,
} from '../assets/desertAssets';
import { DIG_TICKS, meerkatFrame, RUN_TICKS } from './meerkatPose';

const ALL: readonly string[] = [...MEERKAT_FRAMES, ...Object.keys(MIRRORED_FRAMES)];

const m = (pose: Parameters<typeof meerkatFrame>[0]['pose'], extra = {}) => ({
  pose,
  look: 0 as const,
  poseTicks: 0,
  pup: false,
  ...extra,
});

describe('meerkat frames (v1.7, D-044)', () => {
  it('a hidden meerkat shows nothing; every other pose a frame of the sheet', () => {
    expect(meerkatFrame(m('hidden'))).toBeNull();
    expect(meerkatFrame(m('hidden', { pup: true }))).toBeNull();
    for (const pose of [
      'peek',
      'emerge',
      'sit',
      'sentinel',
      'forage',
      'sunbathe',
      'run',
      'stand',
      'dive',
      'tumble',
      'scold',
      'photo',
    ] as const) {
      for (const pup of [false, true]) {
        const f = meerkatFrame(m(pose, { pup }));
        expect(f, pose).not.toBeNull();
        expect(ALL).toContain(f);
      }
    }
  });

  it('the peek looks left then right; the sentinel turns its head and barks', () => {
    expect(meerkatFrame(m('peek', { look: -1 }))).toBe('peek_l');
    expect(meerkatFrame(m('peek', { look: 1 }))).toBe('peek_r');
    expect(meerkatFrame(m('sentinel', { look: -1 }))).toBe('stand_l');
    expect(meerkatFrame(m('sentinel', { look: 0 }))).toBe('stand_c');
    expect(meerkatFrame(m('sentinel', { look: 1 }))).toBe('stand_r');
    expect(meerkatFrame(m('sentinel'), true)).toBe('bark');
    expect(meerkatFrame(m('photo'))).toBe('front');
  });

  it('the run cycle and digging step on sim ticks (a held tick holds the frame)', () => {
    const run = [0, 1, 2, 3, 4].map((i) => meerkatFrame(m('run', { poseTicks: i * RUN_TICKS })));
    expect(run).toEqual(['run_0', 'run_1', 'run_2', 'run_3', 'run_0']);
    expect(meerkatFrame(m('forage', { poseTicks: 0 }))).toBe('dig_a');
    expect(meerkatFrame(m('forage', { poseTicks: DIG_TICKS }))).toBe('dig_b');
    expect(meerkatFrame(m('run', { poseTicks: 5 }))).toBe(meerkatFrame(m('run', { poseTicks: 5 })));
  });

  it('the sheet holds every frame inside its size; rim frames are real frames', () => {
    const frames = sheetFrames();
    expect(new Set(frames.map((f) => f.name)).size).toBe(frames.length);
    for (const f of frames) {
      expect(f.x + f.w).toBeLessThanOrEqual(SHEET_W);
      expect(f.y + f.h).toBeLessThanOrEqual(SHEET_H);
    }
    for (const r of RIM_FRAMES) expect(ALL).toContain(r);
    // A mirrored frame is its twin's cell, flipped by the view.
    for (const [name, of] of Object.entries(MIRRORED_FRAMES)) {
      const a = frames.find((f) => f.name === name);
      const b = frames.find((f) => f.name === of);
      expect(a?.mirror).toBe(true);
      expect([a?.x, a?.y]).toEqual([b?.x, b?.y]);
    }
  });
});
