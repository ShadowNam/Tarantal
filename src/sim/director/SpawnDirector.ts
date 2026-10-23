// Budget-based spawn director (Tech §3.6): fly-overs on the mid/far sky lanes and pop-ups on the
// near plane at the biome's pacing rates, non-target fly-over events, and flocks topped up to the
// pacing keyframes' per-plane counts. Randomness: rng.stream('spawns') for fly-overs and pop-ups,
// 'flocks' for flocks, 'events' for events. Flocks draw no 'spawns' numbers; they do share the
// per-hunt caps (maxPerHunt) with fly-overs, so a rare morph in a flock is not seen again aloft.
import type { ContentBundle, Biome } from '../../content/schemas';
import {
  createFlockBird,
  createFlyover,
  createPopup,
  type Bird,
  type BirdCreature,
} from '../birds/Bird';
import { planeCentreX } from '../camera';
import { msToTicks, TICKS_PER_SECOND } from '../clock';
import type { Flock, FlockParams } from '../flocks/Flock';
import type { RandomStream } from '../rng';
import type { PlaneId } from '../types';
import { PLANES } from '../types';
import { coreWidth, LAYER_BLEED_PX, MAX_HALF_VIEW_WIDTH } from '../world';
import { flockTargetsAt, pacingAt } from './pacing';

const TICKS_PER_MINUTE = TICKS_PER_SECOND * 60;
/** Each spawn waits for a credit threshold drawn from this range (jitter around the mean rate). */
const THRESHOLD_MIN = 0.5;
const THRESHOLD_MAX = 1.5;
// Structure, not tuning (D-020): placement retries, and the smallest flock worth spawning when
// the screen is nearly full.
/** Flocks smaller than this are not worth spawning. */
const MIN_FLOCK_SPAWN = 3;
/** Later flocks spawn at least this far (plane px, beyond the widest screen) out of view. */
const OUT_OF_VIEW_MARGIN_PX = 120;
/** Placement attempts per spawn, and the wait before retrying when none fit. */
const PLACE_TRIES = 8;
const RETRY_TICKS = 30;

export interface DirectorContext {
  readonly tick: number;
  readonly cameraX: number;
  readonly aliveBirds: number;
  readonly stampede: boolean;
  nextId(): number;
}

export interface FlockSpawnContext extends DirectorContext {
  readonly flocks: readonly Flock[];
  nextFlockId(): number;
}

export interface Director {
  /** Birds to add this tick. */
  tick(ctx: DirectorContext): Bird[];
  /** Spawns a non-target fly-over for a world event (hadeda, crop sprayer). */
  spawnEventFlyover(ctx: DirectorContext, creatureId: string, rng: RandomStream): Bird[];
  /** New flocks (with their member birds) to top each plane up to the pacing target. */
  spawnFlocks(ctx: FlockSpawnContext): Flock[];
  /** A flock of `size` birds around plane x (secret rewards), drawing from `rng`. Null if the
   *  plane has no lanes or there is no room. Ignores spacing and maxFlocks (it is a burst). */
  spawnFlockAt(
    ctx: FlockSpawnContext,
    plane: PlaneId,
    x: number,
    size: number,
    rng: RandomStream,
  ): Flock | null;
}

export interface DirectorDeps {
  readonly content: ContentBundle;
  readonly biome: Biome;
  readonly durationTicks: number;
  readonly spawns: RandomStream;
  readonly flocks: RandomStream;
  readonly flockParams: FlockParams;
  /** Multiplies fly-over and pop-up rates (FTUE pacing). Default 1. */
  readonly rateMul?: number;
}

export function createDirector(deps: DirectorDeps): Director {
  const { content, biome, durationTicks, spawns, flockParams: fp } = deps;
  const flockRng = deps.flocks;
  const rateMul = deps.rateMul ?? 1;
  const flockRetryAt: Record<PlaneId, number> = { near: 0, mid: 0, far: 0 };
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
    behaviour: 'flyover' | 'popup' | 'flock',
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

  function pick(
    plane: PlaneId,
    behaviour: 'flyover' | 'popup' | 'flock',
    rng: RandomStream = spawns,
  ): BirdCreature | null {
    const list = candidates(plane, behaviour);
    const i = rng.weightedIndex(list.map((x) => x.w));
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
    // v1.2: a map's fly-over routes may weight the sky lanes and fix the direction.
    const planeWeights = biome.flyovers?.planeWeights ?? flyover.planeWeights;
    const weights = lanes.map((p) =>
      biome.lanes[p]?.skyY === undefined ? 0 : planeWeights[p as 'mid' | 'far'],
    );
    const plane = lanes[spawns.weightedIndex(weights)];
    const sky = plane === undefined ? undefined : biome.lanes[plane]?.skyY;
    if (plane === undefined || sky === undefined) return [];
    const ratio = planes[plane].scale / planes.mid.scale;
    const size = Math.min(
      spawns.int(flyover.groupSize[0], flyover.groupSize[1]),
      maxBirds - ctx.aliveBirds,
    );
    // The coin is always drawn, so a fixed route leaves the rest of the stream as it was.
    const coin: 1 | -1 = spawns.chance(0.5) ? 1 : -1;
    const dir: 1 | -1 = biome.flyovers?.dir ?? coin;
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

  /** Home x for a new flock on a plane, or null if none fits right now. */
  function placeFlock(ctx: FlockSpawnContext, plane: PlaneId, ratio: number): number | null {
    const core = coreWidth(scrollFactorOf(plane));
    const spread = fp.spawnSpreadPx * ratio;
    const centre = planeCentreX(ctx.cameraX, scrollFactorOf(plane));
    const others = ctx.flocks.filter((f) => f.plane === plane);
    const spaced = (x: number): boolean =>
      others.every((f) => f.members.every((b) => Math.abs(b.x - x) >= fp.spawnSpacingPx * ratio));
    const clampX = (x: number): number => Math.min(core - spread, Math.max(spread, x));
    if (ctx.tick === 0) {
      // Warm-up (GDD §8): the first flocks forage in view.
      for (let i = 0; i < PLACE_TRIES; i++) {
        const x = clampX(centre + flockRng.range(-fp.startInViewPx, fp.startInViewPx) * ratio);
        if (spaced(x)) return x;
      }
      return null;
    }
    const hidden = (x: number): boolean =>
      Math.abs(x - centre) > MAX_HALF_VIEW_WIDTH + spread + OUT_OF_VIEW_MARGIN_PX;
    // v1.2: a map's feeding spots for this plane come first; anywhere else if none fits.
    const spots = (biome.feedingSpots ?? []).filter((s) => s.plane === plane);
    if (spots.length > 0) {
      for (let i = 0; i < PLACE_TRIES; i++) {
        const spot = spots[flockRng.int(0, spots.length - 1)];
        if (spot === undefined) break;
        const x = clampX(flockRng.range(spot.u[0] * core, spot.u[1] * core));
        if (hidden(x) && spaced(x)) return x;
      }
    }
    for (let i = 0; i < PLACE_TRIES; i++) {
      const x = flockRng.range(spread, core - spread);
      if (hidden(x) && spaced(x)) return x;
    }
    // Fall back to the panorama edge farther from the camera (never on screen).
    const edge = centre < core / 2 ? core - spread : spread;
    return hidden(edge) && spaced(edge) ? edge : null;
  }

  function buildFlock(
    ctx: FlockSpawnContext,
    plane: PlaneId,
    room: number,
    rng: RandomStream = flockRng,
    at: { readonly x: number; readonly size: number } | null = null,
  ): Flock | null {
    const lane = biome.lanes[plane];
    const groundY = lane?.groundY;
    const skyY = lane?.skyY;
    if (groundY === undefined || skyY === undefined) return null;
    const scale = planes[plane].scale;
    const ratio = scale / planes.mid.scale;
    const size = Math.min(at === null ? rng.int(fp.sizeMin, fp.sizeMax) : at.size, room);
    if (size < MIN_FLOCK_SPAWN) return null;
    const homeX = at === null ? placeFlock(ctx, plane, ratio) : at.x;
    if (homeX === null) return null;
    const id = ctx.nextFlockId();
    const spread = fp.spawnSpreadPx * ratio;
    const f = scrollFactorOf(plane);
    const members: Bird[] = [];
    for (let i = 0; i < size; i++) {
      const creature = pick(plane, 'flock', rng);
      if (creature === null) break;
      const sp = creature.speeds ?? {};
      const perTick = (v: number): number => (v * ratio) / TICKS_PER_SECOND;
      members.push(
        createFlockBird({
          id: ctx.nextId(),
          creature,
          plane,
          scrollFactor: f,
          planeScale: scale,
          x: homeX + rng.range(-spread, spread),
          y: rng.range(groundY[0], groundY[1]),
          facing: rng.chance(0.5) ? 1 : -1,
          member: {
            flockId: id,
            zigPhase: rng.range(0, 2 * Math.PI),
            walk: perTick(sp.walk ?? 0),
            run: perTick(sp.run ?? 0),
            fly: perTick(sp.fly ?? 0),
            glide: perTick(sp.glide ?? 0),
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
    if (members.length < MIN_FLOCK_SPAWN) return null;
    return {
      id,
      plane,
      spawnSize: members.length,
      ratio,
      groundY,
      skyY,
      coreWidth: coreWidth(f),
      members,
      state: 'forage',
      stateTicks: 0,
      windowTicks: 0,
      windowFresh: false,
      freezeTicks: 0,
      calmTicks: 0,
      homeX,
      goalX: homeX,
      goalY: rng.range(groundY[0], groundY[1]),
      goalTicks: 0,
      threatX: homeX,
      dir: 1,
      eligible: true,
    };
  }

  return {
    tick(ctx) {
      const rates = pacingAt(biome.pacing, ctx.tick / durationTicks, ctx.stampede);
      const out: Bird[] = [];
      flyoverCredit += (rates.flyoversPerMin * rateMul) / TICKS_PER_MINUTE;
      if (flyoverCredit >= flyoverThreshold) {
        flyoverCredit -= flyoverThreshold;
        flyoverThreshold = spawns.range(THRESHOLD_MIN, THRESHOLD_MAX);
        if (ctx.aliveBirds + out.length < maxBirds) out.push(...spawnFlyoverGroup(ctx));
      }
      popupCredit += (rates.popupsPerMin * rateMul) / TICKS_PER_MINUTE;
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

    spawnFlocks(ctx) {
      const targets = flockTargetsAt(biome.pacing, ctx.tick / durationTicks);
      const out: Flock[] = [];
      let alive = ctx.aliveBirds;
      for (const plane of PLANES) {
        if (ctx.tick < flockRetryAt[plane]) continue;
        let live = ctx.flocks.filter((f) => f.plane === plane).length;
        while (
          live < targets[plane] &&
          ctx.flocks.length + out.length < biome.pacing.maxFlocks &&
          alive < maxBirds
        ) {
          const flock = buildFlock(
            { ...ctx, flocks: [...ctx.flocks, ...out] },
            plane,
            maxBirds - alive,
          );
          if (flock === null) {
            flockRetryAt[plane] = ctx.tick + RETRY_TICKS;
            break;
          }
          out.push(flock);
          alive += flock.members.length;
          live++;
        }
      }
      return out;
    },

    spawnFlockAt(ctx, plane, x, size, rng) {
      return buildFlock(ctx, plane, maxBirds - ctx.aliveBirds, rng, { x, size });
    },
  };
}
