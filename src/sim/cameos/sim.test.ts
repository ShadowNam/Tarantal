// v1.13 (D-075): the veld cameos in the hunt — the modes they come along in, determinism, visits on
// every area, never removed or hurt, the reactions, −10 with the nest's cooldown only for a shot
// aimed at one (through the real hit test), the benefit of the doubt, pass-through pellets, the
// springbok alarm, the elephants' trumpet, the per-tick caps and their own stream.
import { describe, expect, it } from 'vitest';
import { quiet } from '../../../tools/simHarness';
import { CAMEO_PREVIEW_SPOT } from '../../content/cameoPreview';
import { loadContent } from '../../../tools/testContent';
import type { ContentBundle } from '../../content/schemas';
import type { SimEvent } from '../events';
import { hashEvents } from '../events';
import { createSim, type Sim } from '../Sim';
import type { CameoVisitView, ModeConfig, SeasonHuntConfig } from '../types';

const content = loadContent();
const C = content.cameos;

/** No Brakkie (he walks the near plane too): the cameo tests see only the cameos. */
const noDog: ContentBundle = { ...content, brakkie: { ...content.brakkie, areas: [] } };

function sim(mode: ModeConfig, seed = 1, c: ContentBundle = noDog): Sim {
  return createSim({ seed, content: c, mode, inputKind: 'pointer' });
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

/** Content with a preview: these kinds out in view `at` s in (and reacting at `react` s). */
function withPreview(
  kinds: ContentBundle['cameos']['areas'][number]['cameos'],
  at = 1,
  react?: number,
): ContentBundle {
  return {
    ...noDog,
    cameos: {
      ...C,
      preview: {
        atSeconds: at,
        kinds,
        ...CAMEO_PREVIEW_SPOT,
        ...(react === undefined ? {} : { reactSeconds: react }),
      },
    },
  };
}

function runUntil(s: Sim, done: () => boolean, maxTicks = 60 * 120): SimEvent[] {
  const ev: SimEvent[] = [];
  for (let i = 0; i < maxTicks && !s.isOver(); i++) {
    if (done()) return ev;
    s.step([]);
    ev.push(...s.drainEvents());
  }
  if (!done()) throw new Error('never happened');
  return ev;
}

/** A fire command whose aim point is on the visit's leader body (the first hitbox). */
function aimAt(s: Sim, v: CameoVisitView): { t: 'fire'; dx: number; sy: number } {
  const st = s.snapshot();
  const w = C.kinds[v.kind as Exclude<typeof v.kind, 'elephants'>];
  const m = v.members[0];
  const h = w.hitboxes.adult[0];
  if (m === undefined || h === undefined) throw new Error('no member');
  const sf = content.scoring.planes[v.plane].scrollFactor;
  const centre = (st.cameraX - 960) * sf + 960;
  return { t: 'fire', dx: m.x + h.ox * v.facing - centre, sy: m.y + h.oy };
}

describe('the veld cameos in the hunt (D-075)', () => {
  it('come along in Classic, the Daily and plain/omen Season Run hunts on every area', () => {
    for (const a of C.areas) {
      expect(sim({ id: 'classic', biome: a.biome }).snapshot().cameos).not.toBeNull();
      expect(sim({ id: 'daily', biome: a.biome }).snapshot().cameos).not.toBeNull();
    }
    for (const kind of ['plain', 'omen'] as const)
      expect(
        sim({
          id: 'seasonHunt',
          biome: 'karoo-autumn',
          weapon: 'dubbelloop',
          season: season(kind),
        }).snapshot().cameos,
      ).not.toBeNull();
  });

  it('stay away from boss hunts, Oupa se Les and the Harvest', () => {
    expect(
      sim({
        id: 'seasonHunt',
        biome: 'karoo-autumn',
        weapon: 'dubbelloop',
        season: season('boss'),
      }).snapshot().cameos,
    ).toBeNull();
    expect(sim({ id: 'ftue' }).snapshot().cameos).toBeNull();
    expect(sim({ id: 'harvest' }).snapshot().cameos).toBeNull();
  });

  it('the same seed gives the same hunt with them', () => {
    const run = (): string => {
      const s = sim({ id: 'classic', biome: 'kalahari-summer' }, 7);
      const ev: SimEvent[] = [];
      while (!s.isOver()) {
        s.step([]);
        ev.push(...s.drainEvents());
      }
      return hashEvents(ev);
    };
    expect(run()).toBe(run());
  });

  it('every walking cameo of an area visits in a hunt, at most maxActive at once, none removed', () => {
    for (const a of C.areas) {
      const s = sim({ id: 'classic', biome: a.biome }, 2);
      const arrived = new Set<string>();
      const size = new Map<number, number>();
      while (!s.isOver()) {
        s.step([]);
        for (const e of s.drainEvents()) if (e.type === 'cameoArrived') arrived.add(e.kind);
        const v = s.snapshot().cameos;
        expect(v?.visits.length ?? 0).toBeLessThanOrEqual(C.maxActive);
        for (const x of v?.visits ?? []) {
          // Never removed: a visit keeps every member until it leaves.
          const n = size.get(x.id) ?? x.members.length;
          expect(x.members.length).toBe(n);
          size.set(x.id, n);
        }
      }
      for (const k of a.cameos) if (k !== 'elephants') expect(arrived.has(k)).toBe(true);
    }
  });

  it('their events come only on a hunt they are on', () => {
    const s = sim({ id: 'ftue' }, 2);
    const types = new Set<string>();
    while (!s.isOver()) {
      s.step([]);
      for (const e of s.drainEvents()) types.add(e.type);
    }
    expect([...types].some((t) => t.startsWith('cameo'))).toBe(false);
  });

  it('their own stream: until the first cameo event the hunt is the same without them', () => {
    const run = (c: ContentBundle): SimEvent[] => {
      const s = sim({ id: 'classic', biome: 'bushveld-winter' }, 5, c);
      const ev: SimEvent[] = [];
      while (!s.isOver()) {
        s.step([]);
        ev.push(...s.drainEvents());
      }
      return ev;
    };
    const withThem = run(noDog);
    const without = run({ ...noDog, cameos: { ...C, areas: [] } });
    const first = withThem.findIndex((e) => e.type.startsWith('cameo'));
    expect(first).toBeGreaterThan(0);
    expect(hashEvents(withThem.slice(0, first))).toBe(hashEvents(without.slice(0, first)));
  });

  for (const kind of ['warthogs', 'dungBeetle', 'tortoise', 'ostrich', 'gemsbok'] as const) {
    it(`${kind}: a stray pellet plays the reaction and costs nothing; never hurt`, () => {
      const biome = C.areas.find((a) => a.cameos.includes(kind))?.biome ?? '';
      const s = sim({ id: 'classic', biome }, 3, withPreview([kind], 1, 2));
      runUntil(s, () => s.snapshot().cameos?.visits.some((v) => v.reaction !== null) ?? false);
      const v = s.snapshot().cameos?.visits[0];
      expect(v?.reaction).toBe(C.kinds[kind].reaction.kind);
      expect(s.snapshot().score).toBe(0);
    });
  }

  it('a shot aimed at one through the hit test: −10, again only after the cooldown', () => {
    let checked = 0;
    for (let seed = 1; seed <= 12 && checked === 0; seed++) {
      const s = sim({ id: 'classic', biome: 'karoo-autumn' }, seed, withPreview(['tortoise'], 0.5));
      runUntil(s, () => (s.snapshot().cameos?.visits.length ?? 0) > 0);
      const v0 = s.snapshot().cameos?.visits[0];
      if (v0 === undefined) continue;
      const score0 = s.snapshot().score;
      s.step([aimAt(s, v0)]);
      const h = s.drainEvents().find((e) => e.type === 'cameoHit');
      expect(h?.type).toBe('cameoHit');
      // A bird near the aim point on this seed: the benefit of the doubt (no points) — try another.
      if (h?.type !== 'cameoHit' || !h.aimed) {
        expect(s.snapshot().score).toBe(score0);
        continue;
      }
      expect(h.points).toBe(-C.hit.penalty);
      expect(s.snapshot().score).toBe(score0 - C.hit.penalty);
      // Again within the cooldown (the tortoise is hiding where it was): no points.
      const v1 = s.snapshot().cameos?.visits[0];
      if (v1 === undefined) throw new Error('gone');
      for (let i = 0; i < 30; i++) s.step([]);
      s.drainEvents();
      const v2 = s.snapshot().cameos?.visits[0] ?? v1;
      s.step([aimAt(s, v2)]);
      const again = s.drainEvents().find((e) => e.type === 'cameoHit');
      expect(again?.type === 'cameoHit' ? again.points : null).toBe(0);
      expect(s.result().penalties).toBe(1);
      checked++;
    }
    expect(checked).toBe(1);
  });

  it('springbok: a shot close by sets off the alarm; the nearest mid flock hears it', () => {
    let alarmed = 0;
    let threatened = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const s = sim(
        { id: 'classic', biome: 'kalahari-summer' },
        seed,
        withPreview(['springbok'], 0.5),
      );
      runUntil(s, () => (s.snapshot().cameos?.visits.length ?? 0) > 0);
      // Shoot the ground just in front of the herd (no pellet on them).
      const v = s.snapshot().cameos?.visits[0];
      if (v === undefined) continue;
      const f = aimAt(s, v);
      s.step([{ ...f, sy: f.sy + 120 }]);
      for (let i = 0; i < 60; i++) {
        s.step([]);
        for (const e of s.drainEvents()) {
          if (e.type === 'cameoAlarm') alarmed++;
          if (e.type === 'flockThreatened' && e.source === 'cameo') threatened++;
        }
      }
      expect(s.snapshot().cameos?.alarms).toBe(1);
    }
    expect(alarmed).toBeGreaterThan(0);
    expect(threatened).toBeGreaterThan(0);
  });

  it('the Okavango elephants trumpet (the preview), at most maxPerHunt times', () => {
    const s = sim({ id: 'classic', biome: 'okavango-spring' }, 1, withPreview(['elephants'], 0.5));
    let n = 0;
    while (!s.isOver()) {
      s.step([]);
      for (const e of s.drainEvents()) if (e.type === 'cameoTrumpeted') n++;
    }
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(C.kinds.elephants.herd.maxPerHunt);
  });

  it('a stray hit is the reaction only; preview visits react and stay drawn', () => {
    const s = sim(
      { id: 'classic', biome: 'bushveld-winter' },
      1,
      withPreview(['dungBeetle'], 0.5, 1),
    );
    runUntil(s, () => s.snapshot().cameos?.visits[0]?.reaction === 'tumble');
    expect(s.snapshot().cameos?.visits[0]?.members).toHaveLength(1);
  });
});

describe('the veld cameos through the real hit test (D-075, review)', () => {
  /** A world with no birds (nothing near the aim point), the cameos back on, these kinds out. */
  function birdless(biome: string, kinds: ContentBundle['cameos']['areas'][number]['cameos']) {
    const c = quiet(biome) as unknown as { -readonly [K in keyof ContentBundle]: ContentBundle[K] };
    c.cameos = { ...C, preview: { atSeconds: 0.5, kinds, ...CAMEO_PREVIEW_SPOT } };
    return c as ContentBundle;
  }

  it('a stray pellet (the aim point off it) plays the reaction and costs nothing', () => {
    const c = birdless('bushveld-winter', ['warthogs']);
    // Give the gun its spread back (quiet() zeroes it): pellets land round the aim point.
    const spread = content.weapons.weapons.find((w) => w.id === 'dubbelloop');
    const cw = c as unknown as { weapons: { weapons: { id: string; spreadPx: number }[] } };
    for (const w of cw.weapons.weapons)
      if (w.id === 'dubbelloop') w.spreadPx = spread?.kind === 'primary' ? spread.spreadPx : 70;
    let stray = 0;
    for (let seed = 1; seed <= 6 && stray === 0; seed++) {
      const s = sim({ id: 'classic', biome: 'bushveld-winter', weapon: 'dubbelloop' }, seed, c);
      runUntil(s, () => (s.snapshot().cameos?.visits.length ?? 0) > 0);
      const v = s.snapshot().cameos?.visits[0];
      if (v === undefined) continue;
      const f = aimAt(s, v);
      // Just above the sow's back: off her shapes, inside the pellets' spread.
      s.step([{ ...f, sy: f.sy - 45 }]);
      const h = s.drainEvents().find((e) => e.type === 'cameoHit');
      if (h?.type !== 'cameoHit') continue;
      expect(h.aimed).toBe(false);
      expect(h.points).toBe(0);
      expect(s.snapshot().score).toBe(0);
      expect(s.snapshot().cameos?.visits[0]?.reaction).toBe('bolt');
      stray++;
    }
    expect(stray).toBe(1);
  });

  it('a Kettie stone aimed at a cameo hits it: −10 and the reaction', () => {
    const c = birdless('karoo-autumn', ['tortoise']);
    let hit = false;
    for (let seed = 1; seed <= 6 && !hit; seed++) {
      const s = sim({ id: 'classic', biome: 'karoo-autumn', weapon: 'kettie' }, seed, c);
      runUntil(s, () => (s.snapshot().cameos?.visits.length ?? 0) > 0);
      const v = s.snapshot().cameos?.visits[0];
      if (v === undefined) continue;
      s.step([aimAt(s, v)]);
      const got: SimEvent[] = [];
      for (let i = 0; i < 90 && !s.isOver(); i++) {
        s.step([]);
        got.push(...s.drainEvents());
      }
      const h = got.find((e) => e.type === 'cameoHit');
      if (h?.type !== 'cameoHit') continue;
      expect(h.aimed).toBe(true);
      expect(h.points).toBe(-C.hit.penalty);
      hit = true;
    }
    expect(hit).toBe(true);
  });

  it('the Okavango elephants trumpet when a flock flushes near their herd (cooldown, max a hunt)', () => {
    const herd = C.kinds.elephants.herd;
    const c: ContentBundle = {
      ...noDog,
      cameos: {
        ...C,
        kinds: { ...C.kinds, elephants: { herd: { ...herd, chance: 1, nearPx: 5000 } } },
      },
    };
    const s = sim({ id: 'classic', biome: 'okavango-spring' }, 3, c);
    const ticks: number[] = [];
    let flushes = 0;
    let i = 0;
    while (!s.isOver()) {
      // Shoot at a mid flock now and then: threats make flocks run and flush.
      const st = s.snapshot();
      const b = st.birds.find((x) => x.plane === 'mid');
      const sf = content.scoring.planes.mid.scrollFactor;
      const cmd =
        i++ % 90 === 0 && b !== undefined
          ? [{ t: 'fire' as const, dx: b.x - ((st.cameraX - 960) * sf + 960), sy: b.y - 20 }]
          : [];
      s.step(cmd);
      for (const e of s.drainEvents()) {
        if (e.type === 'cameoTrumpeted') ticks.push(e.tick);
        if (e.type === 'flockStateChanged' && e.to === 'flush') flushes++;
      }
    }
    expect(flushes).toBeGreaterThan(0);
    expect(ticks.length).toBeGreaterThanOrEqual(1);
    expect(ticks.length).toBeLessThanOrEqual(herd.maxPerHunt);
    for (let k = 1; k < ticks.length; k++)
      expect((ticks[k] ?? 0) - (ticks[k - 1] ?? 0)).toBeGreaterThanOrEqual(
        herd.cooldownSeconds * 60,
      );
  });
});
