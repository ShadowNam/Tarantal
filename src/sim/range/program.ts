// v1.3x (D-037) Skietbaan spawn program, from modes.json range. The course is a list of slots:
// paper targets and steel plates stand at fixed spots; a bird target (standing bird, fly-over,
// small flock) is put up at its spot and comes back respawnMs after it was bagged or left.
// One plane and one kind, or (24 Oct update) the mixed course: every kind on every plane at
// once, laid out from the 'range' stream. Pure and deterministic: randomness only from the
// 'range' stream (the mixed layout, fly-over bob, flock placement).
import type { ContentBundle } from '../../content/schemas';
import { createFlyover, type Bird, type BirdCreature } from '../birds/Bird';
import { planeCentreX, planeToDx } from '../camera';
import { tuningRatio } from '../planes';
import type { Flock } from '../flocks/Flock';
import { msToTicks, TICKS_PER_SECOND } from '../clock';
import type { RandomStream } from '../rng';
import type { PaperView, PlaneId, RangeConfig, RangeTarget } from '../types';
import { PLANES } from '../types';
import type { RangeHit, RangeProgram, RangeProgramFactory, RangeWorld } from './types';

/** One target spot of the course (x, y in its plane's px; dx from the screen centre). */
export interface RangeSlot {
  readonly plane: PlaneId;
  readonly target: RangeTarget;
  readonly dx: number;
  /** A paper or plate spot's own y (design px); absent (the mixed course): its kind's first. */
  readonly y?: number;
}

type MixedSetup = ContentBundle['modes']['modes']['range']['mixed'];

function shuffle<T>(items: readonly T[], rng: RandomStream): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const a = out[i];
    const b = out[j];
    if (a === undefined || b === undefined) continue;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

function pick<T>(items: readonly T[], rng: RandomStream): T {
  const v = items[rng.int(0, items.length - 1)];
  // Content validation gives every list at least one item.
  if (v === undefined) throw new Error('empty range list');
  return v;
}

/**
 * 24 Oct update (D-037): the mixed course. Per plane `count` static targets on dx spots drawn
 * from its list, their kinds drawn from `statics` with each kind at least once; one fly-over and
 * one small flock on planes drawn from `movers` (the flock on a free spot of its plane).
 */
export function mixedLayout(mixed: MixedSetup, rng: RandomStream): RangeSlot[] {
  const spots = PLANES.map((plane) => {
    const p = mixed.planes[plane];
    const dx = shuffle(p.dx, rng);
    return { plane, used: dx.slice(0, p.count), free: dx.slice(p.count) };
  });
  const total = spots.reduce((n, s) => n + s.used.length, 0);
  const kinds: RangeTarget[] = [...mixed.statics];
  while (kinds.length < total) kinds.push(pick(mixed.statics, rng));
  const dealt = shuffle(kinds.slice(0, total), rng);
  const out: RangeSlot[] = [];
  let k = 0;
  for (const s of spots)
    for (const dx of s.used) out.push({ plane: s.plane, target: dealt[k++] ?? 'paper', dx });
  out.push({ plane: pick(mixed.movers.flyover, rng), target: 'flyover', dx: 0 });
  const flockPlane = pick(mixed.movers.flock, rng);
  const free = spots.find((s) => s.plane === flockPlane)?.free ?? [];
  out.push({ plane: flockPlane, target: 'flock', dx: free[0] ?? 0 });
  return out;
}

/** The slots of one plane and one kind (outside the mixed course). */
function singleLayout(
  setup: ContentBundle['modes']['modes']['range'],
  plane: PlaneId,
  target: RangeTarget,
): RangeSlot[] {
  const spots = setup.spots[plane];
  // v1.8 (D-050): the Blikkies fence is the sim's (cans/cans.ts): no slot here.
  if (target === 'cans') return [];
  if (target === 'paper') return spots.paper.map((p) => ({ plane, target, dx: p.dx, y: p.y }));
  if (target === 'plate') return spots.plate.map((p) => ({ plane, target, dx: p.dx, y: p.y }));
  if (target === 'stand') return [{ plane, target, dx: spots.stand.dx }];
  if (target === 'flock') return [{ plane, target, dx: spots.flockDx }];
  return [{ plane, target, dx: 0 }];
}

export function rangeLayout(
  content: ContentBundle,
  range: RangeConfig,
  rng: RandomStream,
): RangeSlot[] {
  const setup = content.modes.modes.range;
  if (range.plane === 'all' || range.target === 'mixed') return mixedLayout(setup.mixed, rng);
  return singleLayout(setup, range.plane, range.target);
}

/** A bird slot while the course runs: its birds up now, and when the next is due. */
interface Live {
  readonly slot: RangeSlot;
  ids: number[];
  /** Tick the next bird target is due (-1 = one is up). Due at once at the start. */
  dueAt: number;
  /** Fly-overs alternate: left → right first. */
  dir: 1 | -1;
}

export const createRangeProgram: RangeProgramFactory = ({
  content,
  range,
  cameraX,
  rng,
}): RangeProgram => {
  const setup = content.modes.modes.range;
  const { planes } = content.scoring;
  const found = content.birds.creatures.find((c) => c.id === setup.creature);
  if (found === undefined || found.kind === 'helper')
    throw new Error(`range creature ${setup.creature} is not a bird`);
  const creature: BirdCreature = found;
  const respawnTicks = Math.max(1, msToTicks(setup.respawnMs));
  const body = creature.hitbox.body;
  const centre = (plane: PlaneId): number => planeCentreX(cameraX, planes[plane].scrollFactor);
  const margin = (plane: PlaneId): number =>
    (body.rx + Math.abs(body.ox)) * 2 * planes[plane].scale;
  const ratio = (plane: PlaneId): number =>
    tuningRatio(planes[plane].scale, content.scoring.tuningRefScale);

  const slots = rangeLayout(content, range, rng);
  const papers: PaperView[] = [];
  const live: Live[] = [];
  for (const slot of slots) {
    const spots = setup.spots[slot.plane];
    const scale = planes[slot.plane].scale;
    if (slot.target === 'paper' || slot.target === 'plate') {
      const plate = slot.target === 'plate';
      papers.push({
        id: papers.length + 1,
        kind: slot.target,
        plane: slot.plane,
        x: centre(slot.plane) + slot.dx,
        y: slot.y ?? (plate ? spots.plate : spots.paper)[0]?.y ?? spots.stand.y,
        r: (plate ? setup.plateRadiusPx : setup.paperRadiusPx) * scale,
      });
    } else live.push({ slot, ids: [], dueAt: 0, dir: 1 });
  }
  /** Bird id → the kind of target it is (birds up now). */
  const kindOf = new Map<number, RangeTarget>();

  function flyover(world: RangeWorld, l: Live): Bird {
    const plane = l.slot.plane;
    const fly = creature.speeds?.fly ?? 0;
    const d = setup.spots[plane];
    const defaults = content.birds.flyoverDefaults;
    const bird = createFlyover({
      id: world.nextBirdId(),
      creature,
      plane,
      scrollFactor: planes[plane].scrollFactor,
      planeScale: planes[plane].scale,
      vx: (l.dir * fly * ratio(plane)) / TICKS_PER_SECOND,
      x: centre(plane) - l.dir * (d.flyHalfPx + margin(plane)),
      y: d.flyY,
      bobAmp: defaults.bobPx * ratio(plane),
      bobPeriodTicks: Math.max(
        1,
        msToTicks(rng.range(defaults.bobPeriodMs[0], defaults.bobPeriodMs[1])),
      ),
      bobOffset: rng.range(0, 2 * Math.PI),
    });
    l.dir = l.dir > 0 ? -1 : 1;
    return bird;
  }

  /** A guineafowl standing still on its spot (a flock-motion bird outside any flock: nothing
   *  moves it; shots near it don't make it run). */
  function standing(world: RangeWorld, l: Live): Bird {
    const plane = l.slot.plane;
    const b = createFlyover({
      id: world.nextBirdId(),
      creature,
      plane,
      scrollFactor: planes[plane].scrollFactor,
      planeScale: planes[plane].scale,
      vx: 0,
      x: centre(plane) + l.slot.dx,
      y: setup.spots[plane].stand.y,
      bobAmp: 0,
      bobPeriodTicks: 1,
      bobOffset: 0,
    });
    return { ...b, motion: 'flock', phase: 'alert', facing: 1 };
  }

  return {
    papers,
    targetOf: (birdId) => kindOf.get(birdId) ?? null,
    aimTarget(camX, dx, sy, birds) {
      if (range.plane !== 'all' && range.target !== 'mixed')
        return { plane: range.plane, target: range.target };
      const all: { plane: PlaneId; target: RangeTarget; x: number; y: number }[] = papers.map(
        (p) => ({ plane: p.plane, target: p.kind, x: p.x, y: p.y }),
      );
      for (const b of birds) {
        const target = kindOf.get(b.id);
        if (target !== undefined) all.push({ plane: b.plane, target, x: b.x, y: b.y });
      }
      let best: { plane: PlaneId; target: RangeTarget } = { plane: 'near', target: 'paper' };
      let bestD = Infinity;
      for (const t of all) {
        const ex = planeToDx(camX, planes[t.plane].scrollFactor, t.x) - dx;
        const ey = t.y - sy;
        const d = ex * ex + ey * ey;
        if (d < bestD) {
          bestD = d;
          best = { plane: t.plane, target: t.target };
        }
      }
      return best;
    },
    hits(paperPellets, pelletsOn, birds) {
      const out: RangeHit[] = [];
      for (const [id, n] of paperPellets) {
        const p = papers.find((x) => x.id === id);
        if (p !== undefined) out.push({ plane: p.plane, target: p.kind, id, pellets: n });
      }
      for (const b of birds) {
        const n = pelletsOn.get(b.id);
        const target = kindOf.get(b.id);
        if (n !== undefined && target !== undefined)
          out.push({ plane: b.plane, target, id: b.id, pellets: n });
      }
      return out;
    },
    step(world) {
      if (live.length === 0) return { birds: [], flocks: [], retire: [] };
      // A bird beyond its plane's range half-width has left it: a fly-over past the far side of
      // its path, a flushed flock member flying off (it would land again out of view).
      const retire: number[] = [];
      const alive = new Set<number>();
      for (const b of world.birds) {
        const half = setup.spots[b.plane].flyHalfPx + margin(b.plane);
        if (Math.abs(b.x - centre(b.plane)) > half) retire.push(b.id);
        else alive.add(b.id);
      }
      const birds: Bird[] = [];
      const flocks: Flock[] = [];
      for (const l of live) {
        const gone = l.ids.filter((id) => !alive.has(id));
        for (const id of gone) kindOf.delete(id);
        l.ids = l.ids.filter((id) => alive.has(id));
        if (l.ids.length > 0) {
          l.dueAt = -1;
          continue;
        }
        if (l.dueAt < 0) l.dueAt = world.tick + respawnTicks;
        if (world.tick < l.dueAt) continue;
        const plane = l.slot.plane;
        if (l.slot.target === 'flock') {
          const f = world.spawnFlockAt(plane, centre(plane) + l.slot.dx, setup.flockSize);
          // No room yet: try again next tick.
          if (f === null) continue;
          flocks.push(f);
          l.ids = f.members.map((m) => m.id);
        } else {
          const b = l.slot.target === 'stand' ? standing(world, l) : flyover(world, l);
          birds.push(b);
          l.ids = [b.id];
        }
        for (const id of l.ids) kindOf.set(id, l.slot.target);
        l.dueAt = -1;
      }
      return { birds, flocks, retire };
    },
  };
};
