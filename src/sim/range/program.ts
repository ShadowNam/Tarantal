// v1.3x (D-037) Skietbaan spawn program: the targets for one plane, from modes.json range.
// Paper targets stand at fixed spots; a bird target (standing bird, fly-over, small flock) is put
// up at its spot and comes back respawnMs after it was bagged or left. Pure and deterministic:
// randomness only from the 'range' stream (fly-over bob, flock placement).
import { createFlyover, type Bird, type BirdCreature } from '../birds/Bird';
import { planeCentreX } from '../camera';
import { msToTicks, TICKS_PER_SECOND } from '../clock';
import type { PaperView } from '../types';
import type { RangeProgram, RangeProgramFactory, RangeStep, RangeWorld } from './types';

const NOTHING: RangeStep = { birds: [], flocks: [], retire: [] };

export const createRangeProgram: RangeProgramFactory = ({
  content,
  range,
  cameraX,
  rng,
}): RangeProgram => {
  const setup = content.modes.modes.range;
  const spots = setup.spots[range.plane];
  const { planes } = content.scoring;
  const plane = planes[range.plane];
  const centre = planeCentreX(cameraX, plane.scrollFactor);
  const found = content.birds.creatures.find((c) => c.id === setup.creature);
  if (found === undefined || found.kind === 'helper')
    throw new Error(`range creature ${setup.creature} is not a bird`);
  const creature: BirdCreature = found;
  const respawnTicks = Math.max(1, msToTicks(setup.respawnMs));
  const papers: PaperView[] =
    range.target === 'paper'
      ? spots.paper.map((p, i) => ({
          id: i + 1,
          plane: range.plane,
          x: centre + p.dx,
          y: p.y,
          r: setup.paperRadiusPx * plane.scale,
        }))
      : [];
  const ratio = plane.scale / planes.mid.scale;
  const body = creature.hitbox.body;
  const margin = (body.rx + Math.abs(body.ox)) * 2 * plane.scale;
  /** Tick the next bird target is due (-1 = one is up). Due at once at the start. */
  let dueAt = 0;
  /** Fly-overs alternate: left → right first. */
  let dir: 1 | -1 = 1;

  function flyover(world: RangeWorld): Bird {
    const fly = creature.speeds?.fly ?? 0;
    const d = setup.spots[range.plane];
    const defaults = content.birds.flyoverDefaults;
    const bird = createFlyover({
      id: world.nextBirdId(),
      creature,
      plane: range.plane,
      scrollFactor: plane.scrollFactor,
      planeScale: plane.scale,
      vx: (dir * fly * ratio) / TICKS_PER_SECOND,
      x: centre - dir * (d.flyHalfPx + margin),
      y: d.flyY,
      bobAmp: defaults.bobPx * ratio,
      bobPeriodTicks: Math.max(
        1,
        msToTicks(rng.range(defaults.bobPeriodMs[0], defaults.bobPeriodMs[1])),
      ),
      bobOffset: rng.range(0, 2 * Math.PI),
    });
    dir = dir > 0 ? -1 : 1;
    return bird;
  }

  /** A guineafowl standing still on its spot (a flock-motion bird outside any flock: nothing
   *  moves it; shots near it don't make it run). */
  function standing(world: RangeWorld): Bird {
    const b = createFlyover({
      id: world.nextBirdId(),
      creature,
      plane: range.plane,
      scrollFactor: plane.scrollFactor,
      planeScale: plane.scale,
      vx: 0,
      x: centre + spots.stand.dx,
      y: spots.stand.y,
      bobAmp: 0,
      bobPeriodTicks: 1,
      bobOffset: 0,
    });
    return { ...b, motion: 'flock', phase: 'alert', facing: 1 };
  }

  return {
    papers,
    step(world) {
      if (range.target === 'paper') return NOTHING;
      // A bird beyond the range's half-width has left it: a fly-over past the far side of its
      // path, a flushed flock member flying off (it would land again out of view).
      const retire: number[] = [];
      for (const b of world.birds)
        if (Math.abs(b.x - centre) > spots.flyHalfPx + margin) retire.push(b.id);
      if (world.birds.length > retire.length) {
        dueAt = -1;
        return retire.length === 0 ? NOTHING : { ...NOTHING, retire };
      }
      if (dueAt < 0) dueAt = world.tick + respawnTicks;
      if (world.tick < dueAt) return retire.length === 0 ? NOTHING : { ...NOTHING, retire };
      if (range.target === 'flock') {
        const f = world.spawnFlockAt(range.plane, centre + spots.flockDx, setup.flockSize);
        // No room yet: try again next tick.
        if (f === null) return { ...NOTHING, retire };
        dueAt = -1;
        return { birds: [], flocks: [f], retire };
      }
      dueAt = -1;
      return {
        birds: [range.target === 'stand' ? standing(world) : flyover(world)],
        flocks: [],
        retire,
      };
    },
  };
};
