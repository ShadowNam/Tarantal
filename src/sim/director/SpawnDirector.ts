// Minimal budget-based spawn director for M1 (Tech §3.6): fly-overs on the mid/far sky lanes and
// pop-ups on the near plane at the biome's pacing rates, plus non-target fly-over events.
// Flocks join in M3. All randomness comes from rng.stream('spawns') (or 'events' for events).
import type { ContentBundle, Biome } from '../../content/schemas';
import { createFlyover, createPopup, type Bird, type BirdCreature } from '../birds/Bird';
import { planeCentreX } from '../camera';
import { msToTicks, TICKS_PER_SECOND } from '../clock';
import type { RandomStream } from '../rng';
import type { PlaneId } from '../types';
import { coreWidth, LAYER_BLEED_PX } from '../world';
import { pacingAt } from './pacing';

const TICKS_PER_MINUTE = TICKS_PER_SECOND * 60;
/** Each spawn waits for a credit threshold drawn from this range (jitter around the mean rate). */
const THRESHOLD_MIN = 0.5;
const THRESHOLD_MAX = 1.5;

export interface DirectorContext {
  readonly tick: number;
  readonly cameraX: number;
  readonly aliveBirds: number;
  readonly stampede: boolean;
  nextId(): number;
}

export interface Director {
  /** Birds to add this tick. */
  tick(ctx: DirectorContext): Bird[];
  /** Spawns a non-target fly-over for a world event (hadeda, crop sprayer). */
  spawnEventFlyover(ctx: DirectorContext, creatureId: string, rng: RandomStream): Bird[];
}

export interface DirectorDeps {
  readonly content: ContentBundle;
  readonly biome: Biome;
  readonly durationTicks: number;
  readonly spawns: RandomStream;
}

export function createDirector(deps: DirectorDeps): Director {
  const { content, biome, durationTicks, spawns } = deps;
  const { planes } = content.scoring;
  const flyover = content.birds.flyoverDefaults;
  const popup = content.birds.popupDefaults;
  const creatures = new Map(content.birds.creatures.map((c) => [c.id, c]));
  const spawnedCount = new Map<string, number>();
  const maxBirds = biome.pacing.maxBirdsOnScreen;

  let flyoverThreshold = spawns.range(THRESHOLD_MIN, THRESHOLD_MAX);
  // Start with one group due so the sky is never empty at the first shot.
  let flyoverCredit = flyoverThreshold;
  let popupThreshold = spawns.range(THRESHOLD_MIN, THRESHOLD_MAX);
  let popupCredit = 0;

  /** Spawn-table creatures that can appear on a plane with a behaviour, under their caps. */
  function candidates(
    plane: PlaneId,
    behaviour: 'flyover' | 'popup',
  ): { c: BirdCreature; w: number }[] {
    const out: { c: BirdCreature; w: number }[] = [];
    for (const entry of biome.spawnTable) {
      const c = creatures.get(entry.creature);
      if (c?.kind !== 'target') continue;
      if (!c.planes.includes(plane) || !c.behaviours.includes(behaviour)) continue;
      if (c.maxPerHunt !== undefined && (spawnedCount.get(c.id) ?? 0) >= c.maxPerHunt) continue;
      out.push({ c, w: entry.weight });
    }
    return out;
  }

  function pick(plane: PlaneId, behaviour: 'flyover' | 'popup'): BirdCreature | null {
    const list = candidates(plane, behaviour);
    const i = spawns.weightedIndex(list.map((x) => x.w));
    const chosen = list[i]?.c;
    if (chosen === undefined) return null;
    spawnedCount.set(chosen.id, (spawnedCount.get(chosen.id) ?? 0) + 1);
    return chosen;
  }

  function scrollFactorOf(plane: PlaneId): number {
    return planes[plane].scrollFactor;
  }

  /** Builds one fly-over entering from the left (dir 1) or right (dir −1) edge. */
  function makeFlyover(
    ctx: DirectorContext,
    creature: BirdCreature,
    plane: PlaneId,
    dir: 1 | -1,
    y: number,
    offsetPx: number,
    rng: RandomStream,
  ): Bird {
    const scale = planes[plane].scale;
    const ratio = scale / planes.mid.scale;
    const f = scrollFactorOf(plane);
    const fly = creature.speeds?.fly ?? 0;
    const margin = (creature.hitbox.body.rx + Math.abs(creature.hitbox.body.ox)) * 2 * scale;
    const x =
      dir > 0
        ? -LAYER_BLEED_PX - margin - offsetPx
        : coreWidth(f) + LAYER_BLEED_PX + margin + offsetPx;
    return createFlyover({
      id: ctx.nextId(),
      creature,
      plane,
      scrollFactor: f,
      planeScale: scale,
      vx: (dir * fly * ratio) / TICKS_PER_SECOND,
      x,
      y,
      bobAmp: flyover.bobPx * ratio,
      bobPeriodTicks: Math.max(
        1,
        msToTicks(rng.range(flyover.bobPeriodMs[0], flyover.bobPeriodMs[1])),
      ),
      bobOffset: rng.range(0, 2 * Math.PI),
    });
  }

  function spawnFlyoverGroup(ctx: DirectorContext): Bird[] {
    const lanes: PlaneId[] = ['mid', 'far'];
    const weights = lanes.map((p) =>
      biome.lanes[p]?.skyY === undefined ? 0 : flyover.planeWeights[p as 'mid' | 'far'],
    );
    const plane = lanes[spawns.weightedIndex(weights)];
    const sky = plane === undefined ? undefined : biome.lanes[plane]?.skyY;
    if (plane === undefined || sky === undefined) return [];
    const ratio = planes[plane].scale / planes.mid.scale;
    const size = Math.min(
      spawns.int(flyover.groupSize[0], flyover.groupSize[1]),
      maxBirds - ctx.aliveBirds,
    );
    const dir: 1 | -1 = spawns.chance(0.5) ? 1 : -1;
    const leaderY = spawns.range(sky[0], sky[1]);
    const out: Bird[] = [];
    let offset = 0;
    for (let i = 0; i < size; i++) {
      const creature = pick(plane, 'flyover');
      if (creature === null) break;
      const spacing = spawns.range(flyover.groupSpacingPx[0], flyover.groupSpacingPx[1]) * ratio;
      // Followers trail the leader and fan out vertically by up to half the spacing.
      const y =
        i === 0
          ? leaderY
          : Math.min(sky[1], Math.max(sky[0], leaderY + spawns.range(-spacing / 2, spacing / 2)));
      out.push(makeFlyover(ctx, creature, plane, dir, y, offset, spawns));
      offset += spacing;
    }
    return out;
  }

  function spawnPopup(ctx: DirectorContext): Bird[] {
    const lane = biome.lanes.near?.popupY;
    if (lane === undefined || ctx.aliveBirds >= maxBirds) return [];
    const creature = pick('near', 'popup');
    if (creature === null) return [];
    const centre = planeCentreX(ctx.cameraX, planes.near.scrollFactor);
    return [
      createPopup({
        id: ctx.nextId(),
        creature,
        planeScale: planes.near.scale,
        x: centre + spawns.range(-popup.spawnHalfWidthPx, popup.spawnHalfWidthPx),
        groundY: spawns.range(lane[0], lane[1]),
        facing: spawns.chance(0.5) ? 1 : -1,
        riseTicks: Math.max(1, msToTicks(popup.riseMs)),
        stareTicks: Math.max(1, msToTicks(spawns.range(popup.stareMs[0], popup.stareMs[1]))),
        duckTicks: Math.max(1, msToTicks(popup.duckMs)),
      }),
    ];
  }

  return {
    tick(ctx) {
      const rates = pacingAt(biome.pacing, ctx.tick / durationTicks, ctx.stampede);
      const out: Bird[] = [];
      flyoverCredit += rates.flyoversPerMin / TICKS_PER_MINUTE;
      if (flyoverCredit >= flyoverThreshold) {
        flyoverCredit -= flyoverThreshold;
        flyoverThreshold = spawns.range(THRESHOLD_MIN, THRESHOLD_MAX);
        if (ctx.aliveBirds + out.length < maxBirds) out.push(...spawnFlyoverGroup(ctx));
      }
      popupCredit += rates.popupsPerMin / TICKS_PER_MINUTE;
      if (popupCredit >= popupThreshold) {
        popupCredit -= popupThreshold;
        popupThreshold = spawns.range(THRESHOLD_MIN, THRESHOLD_MAX);
        out.push(...spawnPopup({ ...ctx, aliveBirds: ctx.aliveBirds + out.length }));
      }
      return out;
    },

    spawnEventFlyover(ctx, creatureId, rng) {
      const creature = creatures.get(creatureId);
      if (creature === undefined || creature.kind === 'helper' || ctx.aliveBirds >= maxBirds)
        return [];
      const plane = creature.planes[0];
      const sky = plane === undefined ? undefined : biome.lanes[plane]?.skyY;
      if (plane === undefined || sky === undefined) return [];
      const dir: 1 | -1 = rng.chance(0.5) ? 1 : -1;
      return [makeFlyover(ctx, creature, plane, dir, rng.range(sky[0], sky[1]), 0, rng)];
    },
  };
}
