// v1.17b (D-080): the true-size ostriches keep the aimed-at rule — only a shot aimed at a bird or
// the nest costs the penalty; a stray pellet (aimed off them, at a target, or with a target near
// the aim point) is free, and the pair still hisses and runs.
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import type { SimEvent } from '../events';
import { createStream } from '../rng';
import { createOstrichSystem, type OstrichAim } from './system';

const content = loadContent();
const biome = content.biomes.find((b) => b.id === 'namibie');
if (biome === undefined) throw new Error('no Namibië');

function setup(): {
  sys: ReturnType<typeof createOstrichSystem>;
  events: SimEvent[];
  penalties: number[];
} {
  const events: SimEvent[] = [];
  const penalties: number[] = [];
  const sys = createOstrichSystem(biome as NonNullable<typeof biome>, content, createStream(3), {
    tick: () => 100,
    emit: (e) => events.push(e),
    penalty: (p) => penalties.push(p),
  });
  return { sys, events, penalties };
}

const aimAt = (x: number, y: number, extra: Partial<OstrichAim> = {}): OstrichAim => ({
  hitTarget: false,
  targetNearAim: false,
  aimOn: () => ({ x, y }),
  ...extra,
});

describe('ostriches: the aimed-at rule (D-080)', () => {
  it('comes with the size grown to true', () => {
    expect(content.birds.ostriches.sizeMul).toBeGreaterThan(2);
  });

  it('a shot aimed at the bird costs the penalty; a stray pellet is free but they still run', () => {
    const T = content.birds.ostriches;
    for (const stray of [false, true]) {
      const { sys, events, penalties } = setup();
      const f = sys.view()[0];
      const b = f?.birds.find((x) => !x.sitter) ?? f?.birds[0];
      if (f === undefined || b === undefined) throw new Error('no ostrich');
      const body = b.pose === 'sit' ? T.hitboxes.sit.body : T.hitboxes.stand.body;
      const cx = b.x + body.ox * f.size * b.facing;
      const cy = f.ground + body.oy * f.size;
      // Stray: aimed well clear of every bird and the nest (a pellet of the spread hit it).
      const aim = stray ? aimAt(cx + 5000, cy - 2000) : aimAt(cx, cy);
      sys.shot(1, [b.id], [], 960, true, false, aim);
      const hit = events.find((e) => e.type === 'ostrichHit');
      expect(hit?.type === 'ostrichHit' && hit.aimed).toBe(!stray);
      expect(hit?.type === 'ostrichHit' && hit.points).toBe(stray ? 0 : -T.hit.penalty);
      expect(penalties).toEqual(stray ? [] : [-T.hit.penalty]);
      expect(events.some((e) => e.type === 'ostrichesRan')).toBe(true);
    }
  });

  it('aimed at it but a target hit or near the aim point: the benefit of the doubt', () => {
    const T = content.birds.ostriches;
    for (const extra of [{ hitTarget: true }, { targetNearAim: true }]) {
      const { sys, penalties } = setup();
      const f = sys.view()[0];
      const b = f?.birds[0];
      if (f === undefined || b === undefined) throw new Error('no ostrich');
      const body = b.pose === 'sit' ? T.hitboxes.sit.body : T.hitboxes.stand.body;
      sys.shot(
        1,
        [b.id],
        [],
        960,
        true,
        false,
        aimAt(b.x + body.ox * f.size * b.facing, f.ground + body.oy * f.size, extra),
      );
      expect(penalties).toEqual([]);
    }
  });
});
