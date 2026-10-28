// 1.9.3 (D-056): makalani nuts through the whole shot pipeline — one or two pellets crack a nut
// off its stalk and it drops; air hits juggle it (the chain); popPellets in one shot or a rifle
// burst it; it bounces hard and rolls; event bonuses × Stampede only; the "Hard soos 'n
// makalani" secret once a hunt; a nut shot alerts the flocks; a nut never blocks a bird; the
// same seed and shots give the same flight.
import { describe, expect, it } from 'vitest';
import {
  aimAt,
  base,
  biomeOf,
  ofType,
  quiet,
  run,
  withMidFlock,
  type Content,
} from '../../tools/simHarness';
import { hashEvents, type SimEvent } from './events';
import { createSim, type Sim } from './Sim';
import type { ModeConfig, NutView } from './types';
import { resolvePellet, type HitExtra } from './weapons/hitTest';

const OKA = 'okavango-spring';
const MODE: ModeConfig = { id: 'classic', biome: OKA, layout: 'mon', weapon: 'windbuks' };

/** One near palm in the middle of the pan (u 0.5) on Monday's Okavango map. */
function withPalm(
  c: Content,
  plane: 'near' | 'mid' = 'near',
  kind: 'single' | 'pair' = 'single',
): Content {
  const b = biomeOf(c, OKA);
  const mon = b.layouts.find((l) => l.id === 'mon');
  if (mon === undefined) throw new Error('no mon');
  mon.palms = [{ kind, plane, u: 0.5 }];
  return c;
}

const sim = (
  c: Content,
  mode: ModeConfig = MODE,
  seed = 7,
  input: 'pointer' | 'touch' = 'pointer',
): Sim => createSim({ seed, content: c, mode, inputKind: input });

const nuts = (s: Sim): readonly NutView[] => s.snapshot().nuts?.nuts ?? [];
const nut = (s: Sim, id: number): NutView => {
  const n = nuts(s).find((k) => k.id === id);
  if (n === undefined) throw new Error(`no nut ${String(id)}`);
  return n;
};

function reloaded(s: Sim): void {
  for (let i = 0; i < 600 && s.snapshot().weapon.cooldownTicks > 0; i++) run(s, 1);
  if (s.snapshot().weapon.shells > 0 && !s.snapshot().weapon.reloading) return;
  run(s, 1, [{ t: 'reload' }]);
  for (let i = 0; i < 600 && s.snapshot().weapon.reloading; i++) run(s, 1);
}

/** Fires at a nut where the snapshot shows it (the shot resolves before this tick's flight). */
function shootNut(s: Sim, c: Content, id: number, ox = 0): SimEvent[] {
  reloaded(s);
  const n = nut(s, id);
  return run(s, 1, aimAt(c.scoring.planes[n.plane].scrollFactor, n.x + ox, n.y));
}

const first = (s: Sim): number => nuts(s)[0]?.id ?? 0;

describe('makalani nuts (D-056)', () => {
  it('hangs 3–8 nuts per cluster under the crown, sized by the plane; the same seed, the same bunch', () => {
    const c = withPalm(quiet(OKA));
    const s = sim(c);
    const v = s.snapshot().nuts;
    const m = c.birds.makalani;
    expect(v?.palms.length).toBe(1);
    const clusters = m.palms.single.clusters.length;
    for (let ci = 0; ci < clusters; ci++) {
      const n = (v?.nuts ?? []).filter((x) => x.cluster === ci).length;
      expect(n).toBeGreaterThanOrEqual(m.perCluster[0]);
      expect(n).toBeLessThanOrEqual(m.perCluster[1]);
    }
    for (const n of v?.nuts ?? []) {
      expect(n.state).toBe('rest');
      expect(n.r).toBeCloseTo(m.nutR * c.scoring.planes.near.scale, 9);
      // Under the crown: above the trunk's foot by most of its height.
      expect(n.y).toBeLessThan((c.biomes.find((b) => b.id === OKA)?.palmY?.near ?? 0) - 400);
    }
    expect(JSON.stringify(sim(c).snapshot().nuts)).toBe(JSON.stringify(v));
    // A mid palm: smaller nuts, the hit radius floored by the plane's minimum.
    const mid = nuts(sim(withPalm(quiet(OKA), 'mid')))[0];
    expect(mid?.r).toBeCloseTo(m.nutR * c.scoring.planes.mid.scale, 9);
    expect(mid?.hitR).toBe(Math.max(mid?.r ?? 0, c.scoring.planes.mid.minHitRadiusPx));
    // Maps without palms: no nuts.
    expect(
      sim(quiet(OKA), { id: 'classic', biome: OKA, weapon: 'windbuks' }).snapshot().nuts,
    ).toBeUndefined();
  });

  it('one pellet cracks a nut off: it drops spinning (no big kick up) and pays the knock-off', () => {
    const c = withPalm(quiet(OKA));
    const s = sim(c);
    const id = first(s);
    const y0 = nut(s, id).y;
    const ev = shootNut(s, c, id);
    const k = ofType(ev, 'nutKnocked');
    expect(k.length).toBe(1);
    expect(k[0]?.pellets).toBe(1);
    expect(k[0]?.points).toBe(Math.round(c.scoring.nuts.knockOff * c.scoring.nuts.planeMul.near));
    run(s, 4);
    // It barely rises before it falls.
    expect(y0 - nut(s, id).y).toBeLessThan(10);
    run(s, 20);
    expect(nut(s, id).y).toBeGreaterThan(y0);
    expect(nut(s, id).spin).not.toBe(0);
    expect(nut(s, id).state).toBe('air');
  });

  it('hit again in the air it is kicked up: the chain grows and pays more each hit', () => {
    const c = withPalm(quiet(OKA));
    const s = sim(c);
    const id = first(s);
    shootNut(s, c, id);
    const paid: number[] = [];
    for (let n = 1; n <= 3; n++) {
      // Wait until it has fallen low (high up, a few kicks clear the top: Weg!), then hit it.
      for (let i = 0; i < 240; i++) {
        const v = nut(s, id);
        if (v.state !== 'air' || (v.y > 650 && s.snapshot().weapon.cooldownTicks === 0)) break;
        run(s, 1);
      }
      expect(nut(s, id).state).toBe('air');
      const y = nut(s, id).y;
      const j = ofType(shootNut(s, c, id), 'nutJuggled')[0];
      expect(j?.chain).toBe(n);
      paid.push(j?.points ?? 0);
      run(s, 3);
      expect(nut(s, id).y).toBeLessThan(y);
    }
    expect(paid[1]).toBeGreaterThan(paid[0] ?? Infinity);
    expect(paid[2]).toBeGreaterThan(paid[1] ?? Infinity);
    expect(s.snapshot().nuts?.bestChain).toBe(3);
  });

  it('bounces hard once, then rolls to a stop on the ground', () => {
    const c = withPalm(quiet(OKA));
    const s = sim(c);
    const id = first(s);
    shootNut(s, c, id, 6);
    const landed: SimEvent[] = [];
    for (let i = 0; i < 600 && nut(s, id).state !== 'landed'; i++)
      landed.push(...ofType(run(s, 1), 'nutLanded'));
    expect(landed.map((e) => (e.type === 'nutLanded' ? e.final : null))).toEqual([false, true]);
    const x = nut(s, id).x;
    run(s, 10);
    const rolled = nut(s, id).x;
    expect(rolled).not.toBe(x);
    run(s, 600);
    const still = nut(s, id).x;
    run(s, 30);
    expect(nut(s, id).x).toBe(still);
    // A landed nut is done: no more hits.
    expect(ofType(shootNut(s, c, id), 'nutJuggled').length).toBe(0);
  });

  it('three or more pellets in one shot pop it: husk and ivory, the pop bonus', () => {
    const c = withPalm(quiet(OKA));
    const gun = c.weapons.weapons.find((w) => w.id === 'dubbelloop');
    if (gun === undefined || gun.kind !== 'primary') throw new Error('no dubbelloop');
    gun.spreadPx = 0;
    const s = sim(c, { ...MODE, weapon: 'dubbelloop' });
    const id = first(s);
    const ev = shootNut(s, c, id);
    const p = ofType(ev, 'nutPopped');
    expect(p.length).toBe(1);
    expect(p[0]?.pellets).toBeGreaterThanOrEqual(c.birds.makalani.popPellets);
    expect(p[0]?.hanging).toBe(true);
    expect(p[0]?.points).toBe(Math.round(c.scoring.nuts.pop * c.scoring.nuts.planeMul.near));
    expect(nut(s, id).state).toBe('popped');
    expect(ofType(ev, 'nutKnocked').length).toBe(0);
    // Two pellets only crack it off.
    const g2 = structuredClone(c);
    const two = g2.weapons.weapons.find((w) => w.id === 'dubbelloop');
    if (two === undefined) throw new Error('no dubbelloop');
    two.pellets = 2;
    const s2 = sim(g2, { ...MODE, weapon: 'dubbelloop' });
    expect(ofType(shootNut(s2, g2, first(s2)), 'nutKnocked')[0]?.pellets).toBe(2);
  });

  it('a rifle hit pops it, and three pops are "Hard soos \'n makalani" once a hunt (+25)', () => {
    const c = withPalm(quiet(OKA), 'near', 'single');
    // The windbuks stands in for a rifle here (a rifle fires through its sight: rifle.test.ts).
    expect(c.birds.makalani.popWeapons).toContain('twee_twee');
    c.birds.makalani.popWeapons = ['windbuks'];
    const s = sim(c);
    const ids = nuts(s)
      .map((n) => n.id)
      .slice(0, 5);
    const all: SimEvent[] = [];
    for (const id of ids) all.push(...shootNut(s, c, id));
    expect(ofType(all, 'nutPopped').length).toBe(ids.length);
    const secret = ofType(all, 'secretTriggered').filter((e) => e.propId === 'makalani');
    expect(secret.length).toBe(1);
    const bonus = ofType(all, 'bonusAwarded').filter((e) => e.bonus === 'secret');
    expect(bonus.some((b) => b.base === c.scoring.nuts.secretBonus)).toBe(true);
    expect(nuts(s).filter((n) => n.state === 'popped').length).toBe(ids.length);
  });

  it('a nut shot alerts a nearby flock like any shot', () => {
    const c = withPalm(withMidFlock(quiet(OKA), OKA), 'mid');
    const s = sim(c);
    run(s, 60);
    const birds = s.snapshot().birds.filter((b) => b.plane === 'mid');
    expect(birds.length).toBeGreaterThan(0);
    // Move the palm beside the flock and shoot one of its nuts.
    const sf = c.scoring.planes.mid.scrollFactor;
    const c2 = withMidFlock(quiet(OKA), OKA);
    const mon = biomeOf(c2, OKA).layouts.find((l) => l.id === 'mon');
    if (mon === undefined) throw new Error('no mon');
    mon.palms = [
      { kind: 'single', plane: 'mid', u: ((birds[0]?.x ?? 0) + 40) / (1920 + 3200 * sf) },
    ];
    // The windbuks is quiet: give it the shotgun's reach, so the nut shot is the only difference.
    const gun = c2.weapons.weapons.find((w) => w.id === 'windbuks');
    if (gun === undefined || gun.kind !== 'primary') throw new Error('no windbuks');
    gun.alertRadiusPx = 900;
    const s2 = sim(c2);
    run(s2, 60);
    const ev = shootNut(s2, c2, first(s2));
    expect(ofType(ev, 'nutKnocked').length).toBe(1);
    expect(ofType(ev, 'flockThreatened').length).toBeGreaterThan(0);
  });

  it('a nut never blocks a bird: a pellet through a nut onto a bird behind hits the bird', () => {
    const nutExtra: HitExtra = {
      kind: 'can',
      canId: 3_000_000,
      x: 960,
      y: 500,
      r: 20,
      hx: 0,
      hy: 0,
      passThrough: true,
    };
    const geo = {
      slices: [
        { layerId: 'near', plane: 'near' as const, scrollFactor: 1, occluders: [] },
        { layerId: 'mid', plane: 'mid' as const, scrollFactor: 1, occluders: [] },
      ],
      planeScale: { near: 1, mid: 1, far: 1, ver: 1 },
      assistPx: { near: 0, mid: 0, far: 0, ver: 0 },
    };
    const bird = {
      id: 9,
      x: 960,
      y: 520,
      facing: 1 as const,
      hittable: true,
      snappable: true,
      hitbox: { body: { rx: 30, ry: 30, ox: 0, oy: 0 } },
    };
    const extras = new Map([['near', [nutExtra]]]);
    const none = { near: [], mid: [], far: [], ver: [] };
    const withBird = { ...none, mid: [bird] };
    const r1 = resolvePellet(0, 500, 960, geo, withBird as never, extras);
    expect(r1.birdId).toBe(9);
    expect(r1.canId).toBeUndefined();
    const r2 = resolvePellet(0, 500, 960, geo, none, extras);
    expect(r2.canId).toBe(3_000_000);
  });

  it('the same seed and shots give the same flight; maps without palms play as before', () => {
    const c = withPalm(quiet(OKA));
    const play = (): string => {
      const s = sim(c);
      const id = first(s);
      const ev = [...shootNut(s, c, id), ...run(s, 20)];
      ev.push(...shootNut(s, c, id), ...run(s, 300));
      return hashEvents(ev);
    };
    expect(play()).toBe(play());
    const plain = sim(quiet(OKA), { id: 'classic', biome: OKA, weapon: 'windbuks' });
    expect(run(plain, 600).some((e) => e.type.startsWith('nut'))).toBe(false);
  });

  it('a Kettie stone through a near nut hits the mid bird behind it (review M1)', () => {
    // A foraging mid bird; a near palm moved so that a nut hangs exactly in front of it.
    const flock = (): Content => withMidFlock(quiet(OKA), OKA);
    const probe = sim(flock(), { ...MODE, weapon: 'kettie' });
    run(probe, 90);
    const bird = probe.snapshot().birds.find((b) => b.plane === 'mid' && b.hittable);
    if (bird === undefined) throw new Error('no mid bird');
    const camera = probe.snapshot().cameraX;
    const midSf = base.scoring.planes.mid.scrollFactor;
    const dx = bird.x - 960 - (camera - 960) * midSf;
    const nearX = (camera - 960) * 1 + 960 + dx;
    const m = base.birds.makalani.palms.single;
    const trunk = m.trunks[0];
    const cluster = m.clusters[0];
    if (trunk === undefined || cluster === undefined) throw new Error('no single palm');
    const play = (weapon: string): SimEvent[] => {
      const c = flock();
      const b = biomeOf(c, OKA);
      const mon = b.layouts.find((l) => l.id === 'mon');
      if (mon === undefined) throw new Error('no mon');
      const footX = nearX - trunk.topDx - cluster.dx;
      mon.palms = [{ kind: 'single', plane: 'near', u: footX / 5120 }];
      b.palmY = { ...b.palmY, near: bird.y + trunk.h - cluster.dy };
      const s = sim(c, { ...MODE, weapon });
      run(s, 89);
      const n = s.snapshot().nuts?.nuts[0];
      expect(n?.x).toBeCloseTo(nearX, 6);
      expect(n?.y).toBeCloseTo(bird.y, 6);
      // Fire at the bird's screen point (the camera is where the probe's was).
      return [...run(s, 1, [{ t: 'fire', dx, sy: bird.y }]), ...run(s, 60)];
    };
    for (const weapon of ['windbuks', 'kettie']) {
      const ev = play(weapon);
      const impact = ofType(ev, 'pelletImpact')[0];
      expect(impact?.birdId, weapon).not.toBeNull();
      expect(ofType(ev, 'nutKnocked').length, weapon).toBe(0);
      expect(ofType(ev, 'nutPopped').length, weapon).toBe(0);
    }
  });
});
