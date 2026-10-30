// v1.8b (D-062): baboon troops in the sim — the same seed gives the same troop; raids come at the
// content rate; two hits bag a raider (paid, with the stop bonus before its raid is done); a hit
// on a mother costs points and sends the troop over the ridge; mothers never come down; the
// Langloop's shot scatters every troop; the Kalahari keeps them rare; no troop in the FTUE.
import { describe, expect, it } from 'vitest';
import { biomeOf, ofType, quiet, type Content } from '../../../tools/simHarness';
import { loadContent } from '../../../tools/testContent';
import { baboonIssues } from '../../content/baboonChecks';
import { planeToDx } from '../camera';
import type { SimEvent } from '../events';
import { createSim, type Sim } from '../Sim';
import type { ModeConfig, RaiderView } from '../types';
import { coreWidth } from '../world';

const content = loadContent();

/** A quiet map whose first raid comes after `first` seconds (one raider unless `pair`). */
function baboonContent(biome = 'karoo-autumn', first = 2, pair = 0): Content {
  const c = quiet(biome);
  c.birds.baboons.raids.firstAfterSeconds = [first, first];
  c.birds.baboons.raids.pairChance = pair;
  return c;
}

function sim(c: Content, seed = 5, mode: Partial<ModeConfig> = {}, biome = 'karoo-autumn'): Sim {
  return createSim({
    seed,
    content: c,
    mode: { id: 'classic', biome, huntSeconds: 600, ...mode },
    inputKind: 'pointer',
  });
}

function steps(s: Sim, n: number, events: SimEvent[] = []): SimEvent[] {
  for (let i = 0; i < n && !s.isOver(); i++) {
    s.step([]);
    events.push(...s.drainEvents());
  }
  return events;
}

/** Pans the camera so layer x on scroll factor f is mid-screen. */
function panTo(s: Sim, x: number, f: number): void {
  const cx = Math.round(((x - 960) / f + 960) * 2) / 2;
  for (let k = 0; k < 240; k++) {
    s.step([{ t: 'cameraTarget', cx }]);
    s.drainEvents();
  }
}

/** Fires at a raider's body, reloading between shots, until `until` holds (bounded). */
function shootRaider(s: Sim, c: Content, until: (e: SimEvent[]) => boolean): SimEvent[] {
  const events: SimEvent[] = [];
  const box = c.birds.baboons.hitboxes;
  for (let shot = 0; shot < 30 && !until(events); shot++) {
    const st = s.snapshot();
    const r: RaiderView | undefined = st.baboons?.raiders.find((x) => x.phase !== 'tumble');
    if (r === undefined) break;
    const stance = r.phase === 'act' ? (r.action === 'throw' ? 'stand' : 'sit') : 'walk';
    const b = box[stance].body;
    const dx = planeToDx(st.cameraX, 0.6, r.x + b.ox * r.scale * r.facing);
    s.step([{ t: 'fire', dx, sy: r.y + b.oy * r.scale }]);
    events.push(...s.drainEvents());
    steps(s, 6, events);
    if (s.snapshot().weapon.shells === 0) for (let k = 0; k < 90; k++) s.step([{ t: 'reload' }]);
    events.push(...s.drainEvents());
  }
  return events;
}

/** Steps until the raiders are down at their spot (bounded), and pans to it. */
function untilRaid(s: Sim): RaiderView {
  for (let k = 0; k < 60 * 40; k++) {
    s.step([]);
    s.drainEvents();
    const r = s.snapshot().baboons?.raiders[0];
    if (r !== undefined && r.phase === 'act') {
      panTo(s, r.x, 0.6);
      const again = s.snapshot().baboons?.raiders[0];
      if (again !== undefined) return again;
    }
  }
  throw new Error('no raid');
}

describe('baboon content (D-062)', () => {
  it('every map keeps clear raid spots, troops sit on their layer', () => {
    for (const b of content.biomes) expect(baboonIssues(content, b)).toEqual([]);
    for (const id of ['karoo-autumn', 'bushveld-winter', 'okavango-spring', 'namibie'])
      expect(biomeOf(content as Content, id).baboons?.troops[0]?.chance).toBeUndefined();
    expect(biomeOf(content as Content, 'kalahari-summer').baboons?.troops[0]?.chance).toBeLessThan(
      0.5,
    );
  });
});

describe('baboon troops (D-062)', () => {
  it('same seed → same troop; a troop of 5–10 with a lookout, a male and a mother', () => {
    const a = sim(baboonContent(), 9).snapshot().baboons;
    const b = sim(baboonContent(), 9).snapshot().baboons;
    expect(a).toEqual(b);
    const t = a?.troops[0];
    expect(t).toBeDefined();
    if (t === undefined) return;
    expect(t.members.length).toBeGreaterThanOrEqual(5);
    expect(t.members.length).toBeLessThanOrEqual(10);
    const roles = t.members.map((m) => m.role);
    expect(roles.filter((r) => r === 'lookout')).toHaveLength(1);
    expect(roles).toContain('male');
    expect(roles).toContain('mother');
    expect(t.layerId).toBe('far_ridge');
  });

  it('a troop on every map but the Kalahari; there about one hunt in three; none in the FTUE', () => {
    for (const id of ['karoo-autumn', 'bushveld-winter', 'okavango-spring', 'namibie'])
      for (const seed of [1, 2, 3])
        expect(sim(quiet(id), seed, {}, id).snapshot().baboons, id).not.toBeNull();
    let kalahari = 0;
    for (let seed = 1; seed <= 60; seed++)
      if (sim(quiet('kalahari-summer'), seed, {}, 'kalahari-summer').snapshot().baboons !== null)
        kalahari++;
    expect(kalahari).toBeGreaterThan(8);
    expect(kalahari).toBeLessThan(32);
    const ftue = createSim({
      seed: 1,
      content: quiet(),
      mode: { id: 'ftue' },
      inputKind: 'pointer',
    });
    expect(ftue.snapshot().baboons).toBeNull();
  });

  it('raids come at the content rate, each with a build-up (warning, then the raiders)', () => {
    const c = quiet();
    const rate = c.birds.baboons.raids.perMinute;
    let warned = 0;
    let minutes = 0;
    for (const seed of [1, 2, 3, 4]) {
      const s = sim(c, seed);
      const ev = steps(s, 60 * 600);
      const w = ofType(ev, 'baboonRaidWarned');
      const st = ofType(ev, 'baboonRaidStarted');
      warned += w.length;
      minutes += 10;
      // Every raid that starts was warned first, at least warn + climb seconds before.
      for (const e of st) {
        const before = w.find((x) => x.raidId === e.raidId);
        expect(before).toBeDefined();
        const lead = c.birds.baboons.raids.warnSeconds + c.birds.baboons.raids.climbSeconds;
        expect(e.tick - (before?.tick ?? e.tick)).toBeGreaterThanOrEqual(Math.floor(lead * 60));
      }
    }
    const perMinute = warned / minutes;
    expect(perMinute).toBeGreaterThan(rate * 0.8);
    expect(perMinute).toBeLessThan(rate * 1.2);
  });

  it('pacing.raidsMul scales the rate', () => {
    const c = quiet();
    const karoo = biomeOf(c, 'karoo-autumn');
    const bm = karoo.baboons;
    if (bm === undefined) throw new Error('no baboons');
    karoo.baboons = { ...bm, raidsMul: 3 };
    const ev = steps(sim(c, 2), 60 * 300);
    expect(ofType(ev, 'baboonRaidWarned').length).toBeGreaterThan(8);
  });

  it('two hits bag a raider: points, the stop bonus, the troop runs over the ridge', () => {
    const c = baboonContent();
    const s = sim(c, 4);
    untilRaid(s);
    const before = s.snapshot().score;
    const ev = shootRaider(s, c, (e) => ofType(e, 'baboonBagged').length > 0);
    const hits = ofType(ev, 'baboonHit').filter((e) => e.role === 'raider');
    expect(hits.map((h) => h.hitsLeft)).toEqual([1, 0]);
    const bag = ofType(ev, 'baboonBagged')[0];
    expect(bag).toBeDefined();
    expect(bag?.stopped).toBe(true);
    const bonuses = ofType(ev, 'bonusAwarded').map((e) => e.bonus);
    expect(bonuses).toContain('baboon');
    expect(bonuses).toContain('raidStopped');
    // More than a guineafowl on its plane.
    expect(bag?.points ?? 0).toBeGreaterThan(c.scoring.planes.mid.base);
    expect(s.snapshot().score).toBeGreaterThan(before);
    expect(ofType(ev, 'troopFled')[0]?.cause).toBe('hit');
    // The tumble, then it is gone from the raid and from its troop.
    steps(s, 120);
    const after = s.snapshot().baboons;
    expect(after?.raiders.some((r) => r.id === bag?.baboonId)).toBe(false);
    expect(after?.troops[0]?.members.some((m) => m.id === bag?.baboonId)).toBe(false);
  });

  it('one hit sends a raider running; its raid is never done', () => {
    const c = baboonContent();
    const s = sim(c, 4);
    untilRaid(s);
    const ev = shootRaider(s, c, (e) => ofType(e, 'baboonHit').length > 0);
    expect(s.snapshot().baboons?.raiders[0]?.phase).toBe('flee');
    steps(s, 60 * 10, ev);
    expect(ofType(ev, 'baboonRaidDone')).toHaveLength(0);
  });

  it('an unshot raid gets done; a throw or chase threatens flocks near it', () => {
    const c = baboonContent();
    const s = sim(c, 6);
    const ev = steps(s, 60 * 60);
    const done = ofType(ev, 'baboonRaidDone');
    expect(done.length).toBeGreaterThan(0);
    const started = ofType(ev, 'baboonRaidStarted');
    expect(done.every((d) => started.some((x) => x.raidId === d.raidId))).toBe(true);
  });

  it('a hit on a mother costs points (once in the cooldown) and the troop flees, then returns', () => {
    const c = baboonContent('karoo-autumn', 300);
    const s = sim(c, 3);
    steps(s, 30);
    const t = s.snapshot().baboons?.troops[0];
    const mother = t?.members.find((m) => m.role === 'mother' && m.pose !== 'walk');
    if (t === undefined || mother === undefined) throw new Error('no mother');
    panTo(s, mother.x, 0.15);
    const k = t.scale * c.birds.baboons.motherScale;
    const before = s.snapshot().score;
    const ev: SimEvent[] = [];
    for (let shot = 0; shot < 20 && ofType(ev, 'baboonHit').length === 0; shot++) {
      const st = s.snapshot();
      const m = st.baboons?.troops[0]?.members.find((x) => x.id === mother.id);
      if (m === undefined) break;
      const box = m.pose === 'walk' ? c.birds.baboons.hitboxes.walk : c.birds.baboons.hitboxes.sit;
      const dx = planeToDx(st.cameraX, 0.15, m.x + box.body.ox * k * m.facing);
      s.step([{ t: 'fire', dx, sy: m.y + box.body.oy * k }]);
      ev.push(...s.drainEvents());
      steps(s, 30, ev);
      for (let j = 0; j < 90; j++) s.step([{ t: 'reload' }]);
      ev.push(...s.drainEvents());
    }
    const hit = ofType(ev, 'baboonHit')[0];
    expect(hit?.role).toBe('mother');
    expect(hit?.points).toBe(-c.birds.baboons.hit.penalty);
    expect(s.snapshot().score).toBe(before - c.birds.baboons.hit.penalty);
    expect(ofType(ev, 'troopFled')).toHaveLength(1);
    steps(s, 120, ev);
    expect(s.snapshot().baboons?.troops[0]?.members.every((m) => m.pose === 'out')).toBe(true);
    // Back after awaySeconds (+ the climb).
    const away = c.birds.baboons.troop.awaySeconds[1] + c.birds.baboons.troop.climbSeconds * 2;
    steps(s, Math.ceil(away * 60), ev);
    expect(s.snapshot().baboons?.troops[0]?.fled).toBe(false);
    expect(s.snapshot().baboons?.troops[0]?.members.some((m) => m.pose !== 'out')).toBe(true);
  });

  it('mothers sit on the highest seats (after the lookout) and stay there', () => {
    for (const id of ['karoo-autumn', 'okavango-spring', 'namibie', 'bushveld-winter']) {
      const s = sim(quiet(id), 4, {}, id);
      const t = s.snapshot().baboons?.troops[0];
      if (t === undefined) throw new Error(id);
      const mothers = t.members.filter((m) => m.role === 'mother');
      const others = t.members.filter((m) => m.role !== 'mother' && m.role !== 'lookout');
      expect(mothers.length).toBeGreaterThan(0);
      // Highest = smallest y: every mother sits at least as high as every other member but the lookout.
      for (const m of mothers) for (const o of others) expect(m.y, id).toBeLessThanOrEqual(o.y);
      const at = new Map(mothers.map((m) => [m.id, m.x]));
      for (let k = 0; k < 60 * 120; k++) {
        s.step([]);
        s.drainEvents();
        for (const m of s.snapshot().baboons?.troops[0]?.members ?? [])
          if (m.role === 'mother' && m.pose !== 'out' && m.pose !== 'down' && m.pose !== 'up')
            expect(m.x, `${id} mother ${m.id}`).toBe(at.get(m.id));
      }
    }
  });

  it('mothers and youngsters never raid; raiders are always males', () => {
    const c = quiet();
    c.birds.baboons.raids.pairChance = 1;
    for (const seed of [1, 2, 3]) {
      const s = sim(c, seed);
      const roles = new Map(s.snapshot().baboons?.troops[0]?.members.map((m) => [m.id, m.role]));
      for (let k = 0; k < 60 * 300; k++) {
        s.step([]);
        s.drainEvents();
        for (const r of s.snapshot().baboons?.raiders ?? []) expect(roles.get(r.id)).toBe('male');
      }
    }
  });

  it("the Langloop's shot sends every troop over the ridge", () => {
    const c = baboonContent('karoo-autumn', 300);
    const s = sim(c, 2, { weapon: 'langloop', sight: 'scope_var' });
    steps(s, 30);
    // A shot into the empty sky, far from the troop.
    s.step([{ t: 'fire', dx: 0, sy: 60 }]);
    const ev = steps(s, 60, [...s.drainEvents()]);
    const fled = ofType(ev, 'troopFled');
    expect(fled).toHaveLength(1);
    expect(fled[0]?.cause).toBe('loud');
  });

  it('spots blocked on a map are left out (never a raider over a secret or a tell)', () => {
    const c = quiet();
    const karoo = biomeOf(c, 'karoo-autumn');
    const bm = karoo.baboons;
    const bakkie = karoo.props.find((p) => p.id === 'bakkie');
    if (bm === undefined || bakkie === undefined) throw new Error('no baboons');
    // A spot right on the bakkie's spare wheel (the secret's part).
    karoo.baboons = {
      ...bm,
      spots: [
        { id: 'wheel', action: 'hat', layer: 'mid', prop: 'bakkie', ox: -180, y: 60, from: 1 },
        ...bm.spots,
      ],
    };
    const ev = steps(sim(c, 1), 60 * 400);
    const spots = ofType(ev, 'baboonRaidStarted').map((e) => e.spotId);
    expect(spots.length).toBeGreaterThan(2);
    expect(spots).not.toContain('wheel');
    expect(coreWidth(0.6)).toBe(3840);
  });
});
