// v1.7e (D-061): the secrets' tell animals in the sim — every secret that pays names one, it is
// hittable, a hit costs nothing (score and Frenzy unchanged) and it comes back; its stream is its
// own; it leaves for good once its secret is spent.
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import { quiet as quietOf } from '../../../tools/simHarness';
import { createSim } from '../Sim';
import { planeToDx } from '../camera';
import type { SimEvent } from '../events';
import { tellIssues } from '../../content/tellChecks';

const content = loadContent();

function sim(biome: string, seed = 7) {
  return createSim({
    seed,
    content: quietOf(biome),
    mode: { id: 'classic', biome, huntSeconds: 120 },
    inputKind: 'pointer',
  });
}

describe('tell animals (D-061)', () => {
  it('every secret that pays has a tell, and none covers its part', () => {
    for (const b of content.biomes) {
      expect(tellIssues(content, b)).toEqual([]);
      for (const p of b.props) {
        const s = p.secret;
        if (s === undefined) continue;
        expect(s.tell !== undefined, `${b.id}/${p.id}`).toBe(s.reward.penalty === undefined);
      }
    }
  });

  it('a hunt has one tell per paying secret, resting, acting and resting again', () => {
    const s = sim('bushveld-winter');
    const first = s.snapshot().tells;
    expect(first.map((t) => t.propId).sort()).toEqual(['baobab', 'boulder_crack', 'dassie_koppie']);
    const phases = new Set<string>();
    for (let k = 0; k < 60 * 15; k++) {
      s.step([]);
      s.drainEvents();
      for (const t of s.snapshot().tells) phases.add(t.phase);
    }
    expect(phases).toContain('rest');
    expect(phases).toContain('act');
  });

  it('a hit costs nothing: no points, no Frenzy change; it is gone, then back', () => {
    const s = sim('bushveld-winter', 11);
    for (let k = 0; k < 30; k++) s.step([]);
    s.drainEvents();
    const st = s.snapshot();
    const t = st.tells.find((x) => x.propId === 'baobab');
    expect(t).toBeDefined();
    if (t === undefined) return;
    const layer = content.biomes
      .find((b) => b.id === 'bushveld-winter')
      ?.layers.find((l) => l.id === t.layerId);
    const sp = content.birds.tells.species.find((x) => x.id === t.species);
    if (layer === undefined || sp === undefined) throw new Error('no layer or species');
    // Aim at the tell's hit centre (the camera stays where the hunt opens: pan there first).
    const cx = (t.x - 960) / layer.scrollFactor + 960;
    const events: SimEvent[] = [];
    const spooked = (): boolean => events.some((e) => e.type === 'tellSpooked');
    for (let k = 0; k < 240; k++) {
      s.step([{ t: 'cameraTarget', cx: Math.round(cx * 2) / 2 }]);
      s.drainEvents();
    }
    const before = s.snapshot();
    for (let shot = 0; shot < 80 && !spooked(); shot++) {
      const now = s.snapshot();
      const dx = planeToDx(now.cameraX, layer.scrollFactor, t.x + sp.hit.ox * t.facing);
      s.step([{ t: 'fire', dx, sy: t.y + sp.hit.oy }]);
      for (let k = 0; k < 40; k++) {
        s.step([]);
        events.push(...s.drainEvents());
      }
      if (!spooked()) for (let k = 0; k < 90; k++) s.step([{ t: 'reload' }]);
    }
    expect(spooked()).toBe(true);
    const after = s.snapshot();
    expect(after.score).toBe(before.score);
    expect(events.some((e) => e.type === 'penaltyApplied')).toBe(false);
    expect(after.tells.find((x) => x.id === t.id)?.phase).toBe('gone');
    let back = false;
    for (let k = 0; k < 60 * 12 && !back; k++) {
      s.step([]);
      s.drainEvents();
      back = s.snapshot().tells.find((x) => x.id === t.id)?.phase !== 'gone';
    }
    expect(back).toBe(true);
  });
});
