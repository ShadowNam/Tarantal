// A guineafowl flock (GDD §6, Tech §3.5): its members (ordinary Birds with motion 'flock'), the
// FSM state, the escalation window and the timers that drive it. Tunables come from
// birds.json → flockDefaults, converted to ticks once in flockParams().
import type { ContentBundle } from '../../content/schemas';
import type { Bird } from '../birds/Bird';
import { degToRad } from '../detmath';
import { msToTicks } from '../clock';
import type { RandomStream } from '../rng';
import type { FlockState, FlockView, PlaneId } from '../types';

export interface TickRange {
  readonly min: number;
  readonly max: number;
}

/** flockDefaults in sim units: ticks, radians, and px at the mid plane (scale with Flock.ratio). */
export interface FlockParams {
  readonly sizeMin: number;
  readonly sizeMax: number;
  readonly windowTicks: number;
  readonly alertTicks: TickRange;
  readonly staggerTicks: TickRange;
  readonly flightTicks: TickRange;
  readonly settleTimeoutTicks: TickRange;
  readonly forageGoalTicks: TickRange;
  readonly landRunTicks: TickRange;
  readonly flushAngleRad: readonly [number, number];
  readonly forageWanderPx: number;
  readonly glideSinkPerTick: number;
  readonly spawnSpreadPx: number;
  readonly spawnSpacingPx: number;
  readonly startInViewPx: number;
  readonly alertShuffleMul: number;
  readonly landRunSpeedMul: number;
  readonly fleeLookAheadPx: number;
  readonly zigPeriodTicks: number;
  readonly zigWeight: number;
  readonly separationRadiusPx: number;
  readonly turnRate: number;
  readonly separation: number;
  readonly alignment: number;
  readonly cohesion: number;
  readonly noise: number;
  readonly neighbourRadiusPx: number;
}

function ticks(range: readonly [number, number]): TickRange {
  return { min: Math.max(0, msToTicks(range[0])), max: Math.max(0, msToTicks(range[1])) };
}

export function flockParams(content: ContentBundle): FlockParams {
  const d = content.birds.flockDefaults;
  return {
    sizeMin: d.sizeMin,
    sizeMax: d.sizeMax,
    windowTicks: Math.max(1, msToTicks(d.escalationWindowMs)),
    alertTicks: ticks(d.alertMs),
    staggerTicks: ticks(d.flushStaggerMs),
    flightTicks: ticks(d.flightMs),
    settleTimeoutTicks: ticks(d.settleTimeoutMs),
    forageGoalTicks: ticks(d.forageGoalMs),
    landRunTicks: ticks(d.landRunMs),
    flushAngleRad: [degToRad(d.flushAngleDeg[0]), degToRad(d.flushAngleDeg[1])],
    forageWanderPx: d.forageWanderPx,
    glideSinkPerTick: d.glideSinkPxPerSec / 60,
    spawnSpreadPx: d.spawnSpreadPx,
    spawnSpacingPx: d.spawnSpacingPx,
    startInViewPx: d.startInViewPx,
    alertShuffleMul: d.alertShuffleMul,
    landRunSpeedMul: d.landRunSpeedMul,
    fleeLookAheadPx: d.fleeLookAheadPx,
    zigPeriodTicks: Math.max(1, msToTicks(d.runZigzag.periodMs)),
    zigWeight: d.runZigzag.weight,
    separationRadiusPx: d.boids.separationRadiusPx,
    turnRate: d.boids.turnRate,
    separation: d.boids.separation,
    alignment: d.boids.alignment,
    cohesion: d.boids.cohesion,
    noise: d.boids.noise,
    neighbourRadiusPx: d.boids.neighbourRadiusPx,
  };
}

export function drawTicks(rng: RandomStream, r: TickRange): number {
  return rng.int(r.min, r.max);
}

/** Per-member flock data, kept on the Bird (Bird.fm). Velocities in plane px per tick. */
export interface FlockMember {
  readonly flockId: number;
  /** Zigzag phase offset (radians) so members don't weave in lockstep. */
  readonly zigPhase: number;
  readonly walk: number;
  readonly run: number;
  readonly fly: number;
  readonly glide: number;
  vx: number;
  vy: number;
  /** Ticks left crouched before take-off (phase 'launch'). */
  launchTicks: number;
  /** Ticks left flapping (phase 'flap'). */
  flapTicks: number;
  /** Take-off angle above horizontal. */
  angle: number;
  /** Per-tick blend toward level flight (set at take-off). */
  climbK: number;
  cruiseY: number;
  landY: number;
  /** Ticks left running on after landing (phase 'land'). */
  landTicks: number;
}

export interface Flock {
  readonly id: number;
  readonly plane: PlaneId;
  readonly spawnSize: number;
  /** plane scale / mid scale: converts mid-plane px and speeds to this plane. */
  readonly ratio: number;
  readonly groundY: readonly [number, number];
  readonly skyY: readonly [number, number];
  /** Core width of the flock's plane layer. */
  readonly coreWidth: number;
  /** Alive members, in id order. */
  members: Bird[];
  state: FlockState;
  stateTicks: number;
  /** Escalation window ticks left; 0 = closed. */
  windowTicks: number;
  /** ALERT: ticks left frozen. */
  freezeTicks: number;
  /** RUN: ticks without a threat before it settles. */
  calmTicks: number;
  homeX: number;
  goalX: number;
  goalY: number;
  goalTicks: number;
  /** Plane x of the last threat; RUN and FLUSH head away from it. */
  threatX: number;
  /** +1 / −1: direction of the current run or flight. */
  dir: 1 | -1;
  /** Whole Flock is still possible (false once it calms down — window expiry or SETTLE — or a
   *  member exits). */
  eligible: boolean;
}

/** Members' plane-space centre (the flock's own home if it has no members). */
export function centroid(f: Flock): { x: number; y: number } {
  if (f.members.length === 0) return { x: f.homeX, y: f.goalY };
  let x = 0;
  let y = 0;
  for (const b of f.members) {
    x += b.x;
    y += b.y;
  }
  return { x: x / f.members.length, y: y / f.members.length };
}

export function flockView(f: Flock): FlockView {
  return {
    id: f.id,
    plane: f.plane,
    state: f.state,
    spawnSize: f.spawnSize,
    alive: f.members.length,
    eligible: f.eligible,
  };
}
