// v1.12 (D-069): Brakkie in the hunt — the modes he comes along in, his own stream (a content
// change to him moves no other system's draws before he acts), and a shot through the real hit
// test: aimed at him −25 (the nest's cooldown), a pellet that strikes him without that, nothing.
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import type { SimEvent } from '../events';
import { hashEvents } from '../events';
import { createSim, type Sim } from '../Sim';
import type { ModeConfig, SeasonHuntConfig } from '../types';

const content = loadContent();
const B = content.brakkie;

function sim(mode: ModeConfig, seed = 1): Sim {
  return createSim({ seed, content, mode, inputKind: 'pointer' });
}

function season(kind: 'plain' | 'omen' | 'boss'): SeasonHuntConfig {
  return {
    kind,
    ...(kind === 'boss' ? { boss: 'generaal' } : {}),
    charms: [],
    consumables: [],
    rental: null,
    runShellBonus: 0,
  } as SeasonHuntConfig;
}

describe('Brakkie in the hunt (D-069)', () => {
  it('comes along in Classic, the Daily and plain/omen Season Run hunts on every area', () => {
    for (const a of B.areas) {
      expect(sim({ id: 'classic', biome: a.biome }).snapshot().brakkie).not.toBeNull();
      expect(sim({ id: 'daily', biome: a.biome }).snapshot().brakkie).not.toBeNull();
    }
    for (const kind of ['plain', 'omen'] as const)
      expect(
        sim({
          id: 'seasonHunt',
          biome: 'karoo-autumn',
          weapon: 'dubbelloop',
          season: season(kind),
        }).snapshot().brakkie,
      ).not.toBeNull();
  });

  it('stays home in boss hunts, Oupa se Les and the Harvest', () => {
    expect(
      sim({
        id: 'seasonHunt',
        biome: 'karoo-autumn',
        weapon: 'dubbelloop',
        season: season('boss'),
      }).snapshot().brakkie,
    ).toBeNull();
    expect(sim({ id: 'ftue' }).snapshot().brakkie).toBeNull();
    expect(sim({ id: 'harvest' }).snapshot().brakkie).toBeNull();
  });

  it('the same seed gives the same hunt with him', () => {
    const run = (): string => {
      const s = sim({ id: 'classic', biome: 'okavango-spring' }, 7);
      const ev: SimEvent[] = [];
      while (!s.isOver()) {
        s.step([]);
        ev.push(...s.drainEvents());
      }
      return hashEvents(ev);
    };
    expect(run()).toBe(run());
  });

  it('a shot aimed at him through the hit test: −25, again only after the cooldown', () => {
    const s = sim({ id: 'classic', biome: 'karoo-autumn' }, 3);
    const ev: SimEvent[] = [];
    // Wait until he rests in view with no bird of his plane near (nothing in front of him).
    let guard = 0;
    for (;;) {
      s.step([]);
      ev.push(...s.drainEvents());
      const d = s.snapshot().brakkie;
      if (d?.phase === 'rest' && d.pose !== 'lie') break;
      if (++guard > 60 * 60) throw new Error('he never rested');
    }
    const d = s.snapshot().brakkie;
    if (d === null) throw new Error('no dog');
    const box = B.hitboxes.stand;
    const st = s.snapshot();
    // Near layer (scroll factor 1): planeX = cameraX + dx.
    const fire = {
      t: 'fire' as const,
      dx: d.x + box.body.ox * d.scale * d.facing - st.cameraX,
      sy: d.y + box.body.oy * d.scale,
    };
    const score0 = st.score;
    s.step([fire]);
    const hit = s.drainEvents().filter((e) => e.type === 'brakkieHit');
    expect(hit).toHaveLength(1);
    expect(hit[0]?.type === 'brakkieHit' && hit[0].aimed).toBe(true);
    expect(s.snapshot().score).toBe(score0 - B.hit.penalty);
    expect(s.snapshot().brakkie?.phase).toBe('yelp');
    expect(s.result().penalties).toBeGreaterThanOrEqual(1);
  });

  it('his events come only on a hunt he is on', () => {
    const s = sim({ id: 'ftue' }, 2);
    const types = new Set<string>();
    while (!s.isOver()) {
      s.step([]);
      for (const e of s.drainEvents()) types.add(e.type);
    }
    expect([...types].some((t) => t.startsWith('brakkie'))).toBe(false);
  });
});
