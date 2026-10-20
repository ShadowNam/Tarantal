// Test fixtures: a flock built by hand (no director), for FSM, steering and threat unit tests.
import type { ContentBundle } from '../../content/schemas';
import { createFlockBird, type Bird, type BirdCreature } from '../birds/Bird';
import { TICKS_PER_SECOND } from '../clock';
import { createStream, type RandomStream } from '../rng';
import type { PlaneId } from '../types';
import { coreWidth } from '../world';
import { flockParams, type Flock, type FlockParams } from './Flock';

export interface FlockFixture {
  readonly flock: Flock;
  readonly params: FlockParams;
  readonly rng: RandomStream;
}

export function makeFlock(
  content: ContentBundle,
  opts: { plane?: PlaneId; size?: number; x?: number; spacing?: number; id?: number } = {},
): FlockFixture {
  const plane = opts.plane ?? 'mid';
  const size = opts.size ?? 6;
  const x = opts.x ?? 1500;
  const spacing = opts.spacing ?? 40;
  const { planes } = content.scoring;
  const ratio = planes[plane].scale / planes.mid.scale;
  const biome = content.biomes[0];
  const lane = biome?.lanes[plane];
  const groundY = lane?.groundY ?? [690, 760];
  const skyY = lane?.skyY ?? [160, 420];
  const found = content.birds.creatures.find((c) => c.id === 'tarentaal');
  if (found === undefined || found.kind === 'helper') throw new Error('no tarentaal');
  const creature: BirdCreature = found;
  const sp = creature.speeds ?? {};
  const perTick = (v: number | undefined): number => ((v ?? 0) * ratio) / TICKS_PER_SECOND;
  const id = opts.id ?? 1;
  const members: Bird[] = [];
  for (let i = 0; i < size; i++) {
    members.push(
      createFlockBird({
        id: id * 100 + i,
        creature,
        plane,
        scrollFactor: planes[plane].scrollFactor,
        planeScale: planes[plane].scale,
        x: x + (i - (size - 1) / 2) * spacing * ratio,
        y: (groundY[0] + groundY[1]) / 2,
        facing: 1,
        member: {
          flockId: id,
          zigPhase: i,
          walk: perTick(sp.walk),
          run: perTick(sp.run),
          fly: perTick(sp.fly),
          glide: perTick(sp.glide),
          vx: 0,
          vy: 0,
          launchTicks: 0,
          flapTicks: 0,
          angle: 0,
          climbK: 0,
          cruiseY: skyY[0],
          landY: groundY[0],
          landTicks: 0,
        },
      }),
    );
  }
  const flock: Flock = {
    id,
    plane,
    spawnSize: size,
    ratio,
    groundY,
    skyY,
    coreWidth: coreWidth(planes[plane].scrollFactor),
    members,
    state: 'forage',
    stateTicks: 0,
    windowTicks: 0,
    freezeTicks: 0,
    calmTicks: 0,
    homeX: x,
    goalX: x,
    goalY: groundY[0],
    goalTicks: 0,
    threatX: x,
    dir: 1,
    eligible: true,
  };
  return { flock, params: flockParams(content), rng: createStream(7) };
}
