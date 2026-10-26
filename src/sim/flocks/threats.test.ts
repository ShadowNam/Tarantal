// Every threat source in GDD §6.2 (Tech §3.4): weapon radii (hit or miss, scaled by plane, one
// threat per shot per flock), silent bags, and world-event reactions by scope.
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import { planeCentreX } from '../camera';
import { applyThreat, forceState } from './fsm';
import { makeFlock } from './testing';
import { radiusOnPlane, reactionTargets, shotThreats, type PlaneGeometry } from './threats';

const content = loadContent();
const P = content.scoring.planes;
const R = content.scoring.tuningRefScale;
const geo: PlaneGeometry = {
  near: { scrollFactor: P.near.scrollFactor, scale: P.near.scale, ratio: P.near.scale / R },
  mid: { scrollFactor: P.mid.scrollFactor, scale: P.mid.scale, ratio: P.mid.scale / R },
  far: { scrollFactor: P.far.scrollFactor, scale: P.far.scale, ratio: P.far.scale / R },
  ver: { scrollFactor: P.ver.scrollFactor, scale: P.ver.scale, ratio: P.ver.scale / R },
};
const CAM = 2000;
/** D-049: px tunings are written at tuningRefScale; on the mid plane they are × this. */
const MID = P.mid.scale / R;
const radiusOf = (id: string): number => {
  const w = content.weapons.weapons.find((x) => x.id === id);
  if (w === undefined) throw new Error(id);
  return w.alertRadiusPx;
};

/** A single-member flock at plane x on its ground lane, and the screen point dx px beside it. */
function loneFlock(plane: 'mid' | 'far', offsetX: number, id = 1) {
  const centre = planeCentreX(CAM, geo[plane].scrollFactor);
  const fx = makeFlock(content, { plane, size: 1, x: centre, id });
  const bird = fx.flock.members[0];
  if (!bird) throw new Error('empty');
  return { ...fx, impact: { dx: offsetX, sy: bird.y } };
}

describe('shot threats', () => {
  it('Dubbelloop / Pomp: 260 px (at the tuning scale) around an impact on the mid plane', () => {
    expect(radiusOf('dubbelloop')).toBe(260);
    expect(radiusOf('pomp')).toBe(260);
    const near = loneFlock('mid', 260 * MID - 5);
    expect(shotThreats([near.flock], [near.impact], CAM, 260, geo, new Set())).toHaveLength(1);
    const far = loneFlock('mid', 260 * MID + 5);
    expect(shotThreats([far.flock], [far.impact], CAM, 260, geo, new Set())).toHaveLength(0);
  });

  it('the radius scales with the plane (D-049: far plane 260 × 0.15 / 0.5 = 78 px)', () => {
    expect(radiusOnPlane(260, 'far', geo)).toBeCloseTo((260 * P.far.scale) / R, 6);
    const r = radiusOnPlane(260, 'far', geo);
    const inR = loneFlock('far', r - 4);
    expect(shotThreats([inR.flock], [inR.impact], CAM, 260, geo, new Set())).toHaveLength(1);
    const outR = loneFlock('far', r + 4);
    expect(shotThreats([outR.flock], [outR.impact], CAM, 260, geo, new Set())).toHaveLength(0);
  });

  it('a shot is at most one threat per flock, however many pellets land near it', () => {
    const { flock, impact, params, rng } = loneFlock('mid', 0);
    const pellets = Array.from({ length: 8 }, (_, i) => ({ dx: impact.dx + i * 5, sy: impact.sy }));
    const threats = shotThreats([flock], pellets, CAM, 260, geo, new Set());
    expect(threats).toHaveLength(1);
    for (const t of threats) applyThreat(t.flock, t.x, params, rng);
    expect(flock.state).toBe('alert');
  });

  it('threatens every flock in range and leaves the others alone', () => {
    const a = loneFlock('mid', 0, 1);
    const b = makeFlock(content, {
      size: 3,
      x: planeCentreX(CAM, geo.mid.scrollFactor) + 200,
      id: 2,
    });
    const c = makeFlock(content, {
      size: 3,
      x: planeCentreX(CAM, geo.mid.scrollFactor) + 900,
      id: 3,
    });
    const ids = shotThreats([a.flock, b.flock, c.flock], [a.impact], CAM, 260, geo, new Set()).map(
      (t) => t.flock.id,
    );
    expect(ids).toEqual([1, 2]);
  });

  it('Kettie: 120 px', () => {
    expect(radiusOf('kettie')).toBe(120);
    const inR = loneFlock('mid', 120 * MID - 5);
    expect(shotThreats([inR.flock], [inR.impact], CAM, 120, geo, new Set())).toHaveLength(1);
    const outR = loneFlock('mid', 120 * MID + 5);
    expect(shotThreats([outR.flock], [outR.impact], CAM, 120, geo, new Set())).toHaveLength(0);
  });

  it('Windbuks is silent: no threat from impacts, but a bag threatens its own flock only', () => {
    expect(radiusOf('windbuks')).toBe(0);
    const own = loneFlock('mid', 0, 1);
    const neighbour = makeFlock(content, {
      size: 3,
      x: planeCentreX(CAM, geo.mid.scrollFactor) + 10,
      id: 2,
    });
    const flocks = [own.flock, neighbour.flock];
    expect(shotThreats(flocks, [own.impact], CAM, 0, geo, new Set())).toHaveLength(0);
    const t = shotThreats(flocks, [own.impact], CAM, 0, geo, new Set([1]));
    expect(t.map((x) => x.flock.id)).toEqual([1]);
  });

  it('Voorlaaier 600 px and Mielie-Masjien 200 px (crate weapons)', () => {
    expect(radiusOf('voorlaaier')).toBe(600);
    expect(radiusOf('mielie_masjien')).toBe(200);
    const at = (dx: number) => loneFlock('mid', dx);
    const hits = (dx: number, r: number): number => {
      const f = at(dx);
      return shotThreats([f.flock], [f.impact], CAM, r, geo, new Set()).length;
    };
    expect([
      hits(600 * MID - 10, 600),
      hits(600 * MID + 10, 600),
      hits(200 * MID - 5, 200),
      hits(200 * MID + 5, 200),
    ]).toEqual([1, 0, 1, 0]);
  });

  it('the threat comes from the impact side: the flock runs away from it', () => {
    const { flock, impact, params, rng } = loneFlock('mid', -100);
    for (let i = 0; i < 2; i++) {
      for (const t of shotThreats([flock], [impact], CAM, 260, geo, new Set()))
        applyThreat(t.flock, t.x, params, rng);
    }
    expect(flock.state).toBe('run');
    expect(flock.dir).toBe(1);
  });
});

describe('world-event reactions', () => {
  const centre = planeCentreX(CAM, geo.mid.scrollFactor);
  const inView = () => makeFlock(content, { size: 3, x: centre + 300, id: 1 });
  const offView = () => makeFlock(content, { size: 3, x: centre + 1500, id: 2 });

  it('hadeda: one threat to every flock, on screen or not', () => {
    const a = inView();
    const b = offView();
    const targets = reactionTargets([a.flock, b.flock], { kind: 'all' }, CAM, geo);
    expect(targets.map((t) => t.flock.id)).toEqual([1, 2]);
    for (const t of targets) applyThreat(t.flock, t.x, a.params, a.rng);
    expect([a.flock.state, b.flock.state]).toEqual(['alert', 'alert']);
  });

  it('Vuvuzela: visible flocks (reference 1920 px view) straight to FLUSH, others untouched', () => {
    const a = inView();
    const b = offView();
    const targets = reactionTargets([a.flock, b.flock], { kind: 'visible' }, CAM, geo);
    expect(targets.map((t) => t.flock.id)).toEqual([1]);
    for (const t of targets) forceState(t.flock, 'flush', t.x, 'gadget', a.params, a.rng);
    expect([a.flock.state, b.flock.state]).toEqual(['flush', 'forage']);
  });

  it('area events (dust devil contact, Bles the dog, reservoir flush) reach flocks in the area', () => {
    const a = inView();
    const b = offView();
    const scope = {
      kind: 'area',
      dx: 300,
      sy: a.flock.members[0]?.y ?? 720,
      radiusMidPx: 150,
    } as const;
    const targets = reactionTargets([a.flock, b.flock], scope, CAM, geo);
    expect(targets.map((t) => t.flock.id)).toEqual([1]);
    // Reservoir flush: straight to FLUSH; dust devil / dog: one threat.
    forceState(a.flock, 'flush', targets[0]?.x ?? 0, 'event', a.params, a.rng);
    expect(a.flock.state).toBe('flush');
    applyThreat(b.flock, 0, b.params, b.rng);
    expect(b.flock.state).toBe('alert');
  });

  it('bakkie alarm: every flock straight to RUN', () => {
    const a = inView();
    const b = offView();
    for (const t of reactionTargets([a.flock, b.flock], { kind: 'all' }, CAM, geo))
      forceState(t.flock, 'run', t.x, 'event', a.params, a.rng);
    expect([a.flock.state, b.flock.state]).toEqual(['run', 'run']);
  });
});
