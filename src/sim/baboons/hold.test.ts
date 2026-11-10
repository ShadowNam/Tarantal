// v1.18 (D-081, review): holdRaids — the Harvest's Phase 2 has the field. No raid starts after it;
// the raid in hand ends cleanly: raiders at the field run off, a raid out of sight is called off
// (its raiders go back up the ridge), raiders coming down in sight run straight back out.
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import { createRng } from '../rng';
import {
  createBaboons,
  holdRaids,
  stepBaboons,
  type BaboonCtx,
  type BaboonNote,
  type BaboonsState,
  type RaidPhase,
} from './baboons';

const content = loadContent();
const T = content.birds.baboons;
const SCALE = { near: 1, mid: 0.42, far: 0.15, ver: 0.07 };

function troop(biomeId: string, seed = 3): { s: BaboonsState; ctx: BaboonCtx } {
  const biome = content.biomes.find((b) => b.id === biomeId);
  if (biome === undefined) throw new Error(`no ${biomeId}`);
  let id = 1;
  for (let k = 0; k < 40; k++) {
    const ctx: BaboonCtx = { tuning: T, rng: createRng(seed + k).stream('baboons') };
    const s = createBaboons(biome, SCALE, ctx, () => id++);
    if (s !== null) return { s, ctx };
  }
  throw new Error(`no troop on ${biomeId}`);
}

/** Steps until the raid is in `phase` (bounded); the notes on the way. */
function until(s: BaboonsState, ctx: BaboonCtx, phase: RaidPhase): BaboonNote[] {
  const notes: BaboonNote[] = [];
  for (let i = 0; i < 60 * 600; i++) {
    if (s.raid?.phase === phase) return notes;
    notes.push(...stepBaboons(s, ctx));
  }
  throw new Error(`no raid reached ${phase}`);
}

function run(s: BaboonsState, ctx: BaboonCtx, ticks: number): BaboonNote[] {
  const notes: BaboonNote[] = [];
  for (let i = 0; i < ticks; i++) notes.push(...stepBaboons(s, ctx));
  return notes;
}

describe('holdRaids (v1.18, D-081, review)', () => {
  for (const biomeId of ['oes', 'karoo-autumn'])
    describe(biomeId, () => {
      it('no raid starts after it, however long', () => {
        const { s, ctx } = troop(biomeId);
        holdRaids(s, T);
        const notes = run(s, ctx, 60 * 300);
        expect(notes.filter((n) => n.kind === 'warn' || n.kind === 'start')).toEqual([]);
        expect(s.raid).toBeNull();
      });

      it('raiders at the field run off now and the raid ends', () => {
        const { s, ctx } = troop(biomeId);
        until(s, ctx, 'on');
        holdRaids(s, T);
        expect(s.raid?.raiders.every((r) => r.phase === 'flee')).toBe(true);
        const notes = run(s, ctx, 60 * 20);
        expect(notes.filter((n) => n.kind === 'done' || n.kind === 'warn')).toEqual([]);
        expect(s.raid).toBeNull();
      });

      it('a raid still at its bark is called off; nobody comes down; the lookout stops', () => {
        const { s, ctx } = troop(biomeId);
        until(s, ctx, 'warn');
        const raid = s.raid;
        holdRaids(s, T);
        const notes = run(s, ctx, 60 * 30);
        expect(notes.filter((n) => n.kind === 'start' || n.kind === 'warn')).toEqual([]);
        expect(s.raid).toBeNull();
        const members = s.troops.find((t) => t.id === raid?.troopId)?.members ?? [];
        expect(members.filter((m) => m.pose === 'bark')).toEqual([]);
      });

      it('a raid on its way down never starts at the field: its raiders leave', () => {
        const { s, ctx } = troop(biomeId);
        until(s, ctx, 'travel');
        holdRaids(s, T);
        const notes = run(s, ctx, 60 * 30);
        expect(notes.filter((n) => n.kind === 'start' || n.kind === 'done')).toEqual([]);
        expect(s.raid).toBeNull();
      });
    });
});
