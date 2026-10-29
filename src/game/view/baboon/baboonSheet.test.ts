// v1.8b (D-062): the baboon sheet's table — its size matches baboonKeys.ts (the placeholder's),
// frames fit and never overlap, every box holds its feet; the view picks a frame for every ridge
// pose and raider phase, the mother's own frames for a mother.
import { describe, expect, it } from 'vitest';
import { RaidActionSchema } from '../../../content/schemas';
import type { RaiderView } from '../../../sim/types';
import { BABOON_SHEET_H, BABOON_SHEET_W } from './baboonKeys';
import { BABOON_FRAMES, BABOON_FRAME_NAMES, baboonFrames, baboonSheetHeight } from './baboonSheet';
import { raiderFrame, ridgeFrame } from './BaboonView';

describe('baboon sheet (D-062)', () => {
  it('fits the size the placeholder declares', () => {
    expect(baboonSheetHeight()).toBe(BABOON_SHEET_H);
    for (const f of baboonFrames()) expect(f.x + f.w).toBeLessThanOrEqual(BABOON_SHEET_W);
    expect(baboonFrames()).toHaveLength(BABOON_FRAME_NAMES.length);
  });

  it('frames never overlap, and each holds its feet', () => {
    const fr = baboonFrames();
    for (let i = 0; i < fr.length; i++) {
      const a = fr[i];
      if (a === undefined) continue;
      expect(a.ox, a.name).toBeGreaterThanOrEqual(0);
      expect(a.ox, a.name).toBeLessThanOrEqual(a.w);
      // The tumble's feet are below its spinning body (it hops up as it falls).
      if (a.name !== 'tumble') expect(a.oy, a.name).toBeLessThanOrEqual(a.h);
      for (let j = i + 1; j < fr.length; j++) {
        const b = fr[j];
        if (b === undefined) continue;
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart, `${a.name} / ${b.name}`).toBe(true);
      }
    }
  });

  it('has a frame for every ridge pose and every raid (the mother with her own)', () => {
    const poses = ['sit', 'groom', 'look', 'play', 'walk', 'bark', 'down', 'up'] as const;
    for (const role of ['lookout', 'male', 'mother', 'juvenile'] as const)
      for (const pose of poses) {
        const f = ridgeFrame({ id: 1, role, x: 0, y: 0, facing: 1, pose, t: 0, dur: 10 });
        expect(f, `${role} ${pose}`).not.toBeNull();
        if (f !== null) expect(BABOON_FRAMES[f]).toBeDefined();
        if (role === 'mother' && f !== null) expect(f.startsWith('r_mother'), pose).toBe(true);
      }
    expect(
      ridgeFrame({ id: 1, role: 'male', x: 0, y: 0, facing: 1, pose: 'out', t: 0, dur: 0 }),
    ).toBeNull();
    const raider = (over: Partial<RaiderView>): RaiderView => ({
      id: 1,
      raidId: 1,
      layerId: 'mid',
      plane: 'mid',
      scale: 0.42,
      action: 'hat',
      x: 0,
      y: 0,
      facing: 1,
      phase: 'act',
      t: 0,
      dur: 100,
      hits: 0,
      ...over,
    });
    for (const action of RaidActionSchema.options)
      for (const phase of ['approach', 'act', 'leave', 'flee', 'tumble'] as const)
        for (const t of [0, 10, 95])
          expect(BABOON_FRAMES[raiderFrame(raider({ action, phase, t }), 54)]).toBeDefined();
    expect(raiderFrame(raider({ phase: 'tumble', t: 1 }), 54)).toBe('tumble');
    expect(raiderFrame(raider({ phase: 'tumble', t: 50 }), 54)).toBe('down');
    expect(raiderFrame(raider({ action: 'throw', t: 90 }), 54)).toBe('throw_b');
  });
});
