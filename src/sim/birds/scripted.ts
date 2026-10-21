// Scripted single birds (GDD §7): the kwêvoël flies in, perches on a prop calling "kwê-kwê!",
// then flies off; the Generaal (boss) appears at a prop, struts around it, runs once his pot is
// knocked off, and flies off when his time is up. Ou Grys (peekFromCover, M8) moves between
// cover props hidden and peeks out from each for a while; a hit sends him back behind cover.
// Hopping birds (the kuifkop and Kuifkop Koning, M8) peek from reeds and hop to the next reed in
// plain view. The whole route is drawn when the bird appears, so updates need no randomness.
// Positions are on the bird's plane.
import { cos, sin } from '../detmath';
import type { PlaneId } from '../types';
import { LAYER_BLEED_PX } from '../world';
import { enter, type Bird, type BirdCreature } from './Bird';

// Structure, not tuning: a bird is gone once it is this far above the top of the screen.
const EXIT_ABOVE_Y = -200;

export interface ScriptState {
  /** Perch / home point on the plane. */
  readonly homeX: number;
  readonly homeY: number;
  /** Ticks left in the stay (perched, or strutting/running for a boss). */
  stayTicks: number;
  /** Roam half-width around homeX (bosses). */
  readonly roamPx: number;
  /** Plane px per tick. */
  readonly walk: number;
  readonly run: number;
  readonly fly: number;
  /** Take-off angle when leaving (radians above horizontal). */
  readonly leaveAngle: number;
  vx: number;
  vy: number;
  dir: 1 | -1;
  /** Core width of the plane layer (exit test). */
  readonly coreWidth: number;
  /** Peeking boss route (Ou Grys), or null. */
  readonly peek: PeekPlan | null;
}

/** One stop on a peeking boss's route: a cover point, how long he hides on the way there and
 *  how long he peeks out from it. */
export interface PeekStop {
  readonly x: number;
  readonly y: number;
  readonly hideTicks: number;
  readonly peekTicks: number;
}

/** A visible hop between covers: its length and the height of its arc (plane px). */
export interface HopSpec {
  readonly ticks: number;
  readonly px: number;
}

export interface PeekPlan {
  readonly stops: readonly PeekStop[];
  /** Null: moves hidden between covers (Ou Grys). Else hops there in view (kuifkop). */
  readonly hop: HopSpec | null;
  /** Current stop, and ticks left in the current phase (hidden, peek or hop). */
  stop: number;
  ticksLeft: number;
  /** Where the current hop started. */
  fromX: number;
  fromY: number;
}

export interface ScriptedSpec {
  readonly id: number;
  readonly creature: BirdCreature;
  readonly plane: PlaneId;
  readonly scrollFactor: number;
  readonly planeScale: number;
  readonly coreWidth: number;
  readonly homeX: number;
  readonly homeY: number;
  readonly stayTicks: number;
  /** Speeds in plane px per tick. */
  readonly walk: number;
  readonly run: number;
  readonly fly: number;
  readonly leaveAngle: number;
  readonly dir: 1 | -1;
  /** Perch: start position (flies in from here). Boss: ignored (appears at home). */
  readonly startX: number;
  readonly startY: number;
  readonly roamPx: number;
  readonly armorLeft: number;
  readonly hitsLeft: number;
  /** Peeking boss route (route stops in order; the bird appears at the first, hidden). */
  readonly peekStops?: readonly PeekStop[];
  /** Hopping birds: visible hops between the stops. */
  readonly hop?: HopSpec;
}

function base(s: ScriptedSpec, motion: 'perch' | 'boss' | 'hop', x: number, y: number): Bird {
  const body = s.creature.hitbox.body;
  return {
    id: s.id,
    creature: s.creature,
    plane: s.plane,
    motion,
    x,
    y,
    facing: s.dir,
    phase: motion === 'perch' ? 'fly' : 'walk',
    phaseTicks: 0,
    age: 0,
    vx: 0,
    baseY: y,
    bobAmp: 0,
    bobPeriodTicks: 1,
    bobOffset: 0,
    exitMarginPx: (body.rx + Math.abs(body.ox)) * 2 * s.planeScale,
    scrollFactor: s.scrollFactor,
    groundY: y,
    hideDepth: 0,
    grassLine: 0,
    riseTicks: 0,
    stareTicks: 0,
    duckTicks: 0,
    armorLeft: s.armorLeft,
    hitsLeft: s.hitsLeft,
    fm: null,
    script: {
      homeX: s.homeX,
      homeY: s.homeY,
      stayTicks: s.stayTicks,
      roamPx: s.roamPx,
      walk: s.walk,
      run: s.run,
      fly: s.fly,
      leaveAngle: s.leaveAngle,
      vx: motion === 'boss' ? s.dir * s.walk : 0,
      vy: 0,
      dir: s.dir,
      coreWidth: s.coreWidth,
      peek:
        s.peekStops === undefined || s.peekStops.length === 0
          ? null
          : {
              stops: s.peekStops,
              hop: s.hop ?? null,
              stop: 0,
              ticksLeft: s.peekStops[0]?.hideTicks ?? 1,
              fromX: x,
              fromY: y,
            },
    },
  };
}

/** The kwêvoël: flies in from (startX, startY) to its perch. */
export function createPerchBird(s: ScriptedSpec): Bird {
  return base(s, 'perch', s.startX, s.startY);
}

/** A boss appearing at its home point, strutting (or, with a peek route, hidden at its first
 *  cover point). */
export function createBossBird(s: ScriptedSpec): Bird {
  const first = s.peekStops?.[0];
  const b = base(s, 'boss', first?.x ?? s.homeX, first?.y ?? s.homeY);
  if (first !== undefined) enter(b, 'hidden');
  return b;
}

/** A hopping target (kuifkop): starts hidden in its first cover. */
export function createHopperBird(s: ScriptedSpec): Bird {
  const first = s.peekStops?.[0];
  const b = base(s, 'hop', first?.x ?? s.homeX, first?.y ?? s.homeY);
  enter(b, 'hidden');
  return b;
}

/** A peeking or hopping bird was hit (not bagged): it ducks into cover, then the next stop. */
export function duckBoss(b: Bird): void {
  const p = b.script?.peek;
  if (p === null || p === undefined || (b.phase !== 'peek' && b.phase !== 'hop')) return;
  nextStop(b, p);
}

function nextStop(b: Bird, p: PeekPlan): void {
  p.stop = (p.stop + 1) % p.stops.length;
  p.ticksLeft = p.stops[p.stop]?.hideTicks ?? 1;
  enter(b, 'hidden');
}

/** One tick of a peeking boss on the ground: move hidden to the stop, then peek from it. */
function updatePeek(b: Bird, s: ScriptState, p: PeekPlan): void {
  const at = p.stops[p.stop];
  if (at === undefined) return;
  p.ticksLeft--;
  if (b.phase === 'hop' && p.hop !== null) {
    // In plain view on an arc to this stop.
    const t = 1 - Math.max(0, p.ticksLeft) / p.hop.ticks;
    b.x = p.fromX + (at.x - p.fromX) * t;
    b.y = p.fromY + (at.y - p.fromY) * t - p.hop.px * sin(Math.PI * t);
    b.facing = at.x >= p.fromX ? 1 : -1;
    if (p.ticksLeft <= 0) {
      b.x = at.x;
      b.y = at.y;
      p.ticksLeft = at.hideTicks;
      enter(b, 'hidden');
    }
    return;
  }
  if (b.phase === 'hidden') {
    const dx = at.x - b.x;
    const step = Math.min(Math.abs(dx), s.run);
    if (dx !== 0) {
      b.x += Math.sign(dx) * step;
      b.facing = dx > 0 ? 1 : -1;
    }
    b.y = at.y;
    if (p.ticksLeft <= 0) {
      b.x = at.x;
      p.ticksLeft = at.peekTicks;
      enter(b, 'peek');
    }
    return;
  }
  if (p.ticksLeft > 0) return;
  if (p.hop === null) {
    nextStop(b, p);
    return;
  }
  // Hop out of this cover to the next one, in plain view.
  p.fromX = b.x;
  p.fromY = b.y;
  p.stop = (p.stop + 1) % p.stops.length;
  p.ticksLeft = p.hop.ticks;
  enter(b, 'hop');
}

/** The boss lost his armour: he runs (GDD §7 Generaal: CLANG, then bag him). */
export function spookBoss(b: Bird): void {
  const s = b.script;
  if (s === null || b.motion !== 'boss' || b.phase !== 'walk') return;
  enter(b, 'run');
  s.vx = s.dir * s.run;
}

function takeOff(b: Bird, s: ScriptState): void {
  enter(b, b.motion === 'perch' ? 'fly' : 'flap');
  s.vx = s.dir * s.fly * cos(s.leaveAngle);
  s.vy = -s.fly * sin(s.leaveAngle);
  b.facing = s.dir;
}

function gone(b: Bird, s: ScriptState): boolean {
  return (
    b.y < EXIT_ABOVE_Y ||
    b.x < -LAYER_BLEED_PX - b.exitMarginPx ||
    b.x > s.coreWidth + LAYER_BLEED_PX + b.exitMarginPx
  );
}

/**
 * One tick of a scripted bird. `airMul(sign)` scales horizontal flying speed (wind). Returns
 * 'exited' when it has left.
 */
export function updateScripted(b: Bird, airMul: (sign: number) => number): 'exited' | null {
  const s = b.script;
  if (s === null) return null;
  if (b.motion === 'perch') {
    if (b.phase === 'perch') {
      s.stayTicks--;
      if (s.stayTicks <= 0) takeOff(b, s);
      return null;
    }
    if (s.vy < 0) {
      // Leaving.
      b.x += s.vx * airMul(s.vx);
      b.y += s.vy;
      return gone(b, s) ? 'exited' : null;
    }
    // Arriving: straight toward the perch.
    const dx = s.homeX - b.x;
    const dy = s.homeY - b.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const step = s.fly * airMul(dx);
    if (d <= step) {
      b.x = s.homeX;
      b.y = s.homeY;
      enter(b, 'perch');
      return null;
    }
    b.x += (dx / d) * step;
    b.y += (dy / d) * step;
    b.facing = dx >= 0 ? 1 : -1;
    return null;
  }
  // Boss.
  if (b.phase === 'flap') {
    b.x += s.vx * airMul(s.vx);
    b.y += s.vy;
    return gone(b, s) ? 'exited' : null;
  }
  s.stayTicks--;
  if (s.stayTicks <= 0) {
    takeOff(b, s);
    return null;
  }
  if (s.peek !== null) {
    updatePeek(b, s, s.peek);
    return null;
  }
  const speed = b.phase === 'run' ? s.run : s.walk;
  if ((s.dir > 0 && b.x > s.homeX + s.roamPx) || (s.dir < 0 && b.x < s.homeX - s.roamPx)) {
    s.dir = s.dir > 0 ? -1 : 1;
  }
  s.vx = s.dir * speed;
  b.x += s.vx;
  b.facing = s.dir;
  return null;
}
