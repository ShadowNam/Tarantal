// A single bird in the sim. Two lightweight motions (GDD §6.5, §5.2): fly-overs across the
// mid/far sky and near-plane pop-ups. Flock members (motion 'flock', GDD §6) are moved by their
// flock (src/sim/flocks/), not by updateBird().
import type { Creature } from '../../content/schemas';
import { cos, sin } from '../detmath';
import type { FlockMember } from '../flocks/Flock';
import type { ScriptState } from './scripted';
import type { BagBehaviour, BirdMotion, BirdPhase, BirdView, PlaneId } from '../types';
import { coreWidth, LAYER_BLEED_PX } from '../world';

/** Creatures the sim can spawn as birds (helpers like the meerkat are not shootable birds). */
export type BirdCreature = Exclude<Creature, { kind: 'helper' }>;

export interface Bird {
  readonly id: number;
  readonly creature: BirdCreature;
  readonly plane: PlaneId;
  readonly motion: BirdMotion;
  x: number;
  y: number;
  facing: 1 | -1;
  phase: BirdPhase;
  /** Ticks spent in the current phase. */
  phaseTicks: number;
  age: number;
  // fly-over
  readonly vx: number;
  readonly baseY: number;
  readonly bobAmp: number;
  readonly bobPeriodTicks: number;
  readonly bobOffset: number;
  readonly exitMarginPx: number;
  readonly scrollFactor: number;
  // pop-up
  readonly groundY: number;
  readonly hideDepth: number;
  /** Pop-ups: body bottom while staring = the grass line they hide behind (render-only). */
  readonly grassLine: number;
  readonly riseTicks: number;
  readonly stareTicks: number;
  readonly duckTicks: number;
  // damage
  armorLeft: number;
  hitsLeft: number;
  /** Flock members only. */
  readonly fm: FlockMember | null;
  /** Scripted birds only (motion 'perch', 'boss' or 'hop', birds/scripted.ts). */
  readonly script: ScriptState | null;
}

/** Behaviour when bagged (scoring.json behaviourAdd): forage +0, alert +0, run +0.5, flying +1.0. */
export function behaviourOf(bird: Bird): BagBehaviour {
  if (bird.motion === 'flyover') return 'flying';
  if (bird.motion === 'popup') return 'forage';
  switch (bird.phase) {
    case 'alert':
      return 'alert';
    // A kuifkop caught mid-hop (M8) is on the move, like a runner.
    case 'run':
    case 'land':
    case 'hop':
      return 'run';
    // A flushed bird crouched for its take-off is already "flushed" (GDD §5.3: +1.0).
    case 'launch':
    case 'flap':
    case 'glide':
      return 'flying';
    default:
      return 'forage';
  }
}

/** Pop-ups can be shot while rising and staring, not while ducking back into the grass; a
 *  peeking boss only while it peeks out from cover (D-018 "behind cover", D-025). */
export function isHittable(bird: Bird): boolean {
  if (bird.phase === 'hidden') return false;
  return bird.motion !== 'popup' || bird.phase !== 'duck';
}

export function damageOf(creature: BirdCreature): { armorLeft: number; hitsLeft: number } {
  if (creature.kind === 'boss') {
    return { armorLeft: creature.armorHits ?? 0, hitsLeft: creature.hitsToBag };
  }
  return { armorLeft: 0, hitsLeft: 1 };
}

export interface FlyoverSpec {
  readonly id: number;
  readonly creature: BirdCreature;
  readonly plane: PlaneId;
  readonly scrollFactor: number;
  readonly planeScale: number;
  /** Plane px per tick, signed (positive = left → right). */
  readonly vx: number;
  /** Start x in plane coordinates. */
  readonly x: number;
  readonly y: number;
  readonly bobAmp: number;
  readonly bobPeriodTicks: number;
  readonly bobOffset: number;
}

export function createFlyover(s: FlyoverSpec): Bird {
  const body = s.creature.hitbox.body;
  return {
    id: s.id,
    creature: s.creature,
    plane: s.plane,
    motion: 'flyover',
    x: s.x,
    y: s.y,
    facing: s.vx >= 0 ? 1 : -1,
    phase: 'fly',
    phaseTicks: 0,
    age: 0,
    vx: s.vx,
    baseY: s.y,
    bobAmp: s.bobAmp,
    bobPeriodTicks: s.bobPeriodTicks,
    bobOffset: s.bobOffset,
    exitMarginPx: (body.rx + Math.abs(body.ox)) * 2 * s.planeScale,
    scrollFactor: s.scrollFactor,
    groundY: s.y,
    hideDepth: 0,
    grassLine: 0,
    riseTicks: 0,
    stareTicks: 0,
    duckTicks: 0,
    ...damageOf(s.creature),
    fm: null,
    script: null,
  };
}

export interface FlockBirdSpec {
  readonly id: number;
  readonly creature: BirdCreature;
  readonly plane: PlaneId;
  readonly scrollFactor: number;
  readonly planeScale: number;
  readonly x: number;
  readonly y: number;
  readonly facing: 1 | -1;
  readonly member: FlockMember;
}

export function createFlockBird(s: FlockBirdSpec): Bird {
  const body = s.creature.hitbox.body;
  return {
    id: s.id,
    creature: s.creature,
    plane: s.plane,
    motion: 'flock',
    x: s.x,
    y: s.y,
    facing: s.facing,
    phase: 'walk',
    phaseTicks: 0,
    age: 0,
    vx: 0,
    baseY: s.y,
    bobAmp: 0,
    bobPeriodTicks: 1,
    bobOffset: 0,
    exitMarginPx: (body.rx + Math.abs(body.ox)) * 2 * s.planeScale,
    scrollFactor: s.scrollFactor,
    groundY: s.y,
    hideDepth: 0,
    grassLine: 0,
    riseTicks: 0,
    stareTicks: 0,
    duckTicks: 0,
    ...damageOf(s.creature),
    fm: s.member,
    script: null,
  };
}

export interface PopupSpec {
  readonly id: number;
  readonly creature: BirdCreature;
  readonly planeScale: number;
  readonly x: number;
  readonly groundY: number;
  readonly facing: 1 | -1;
  readonly riseTicks: number;
  readonly stareTicks: number;
  readonly duckTicks: number;
}

export function createPopup(s: PopupSpec): Bird {
  const body = s.creature.hitbox.body;
  const hideDepth = (body.ry * 2 + Math.abs(body.oy)) * s.planeScale;
  return {
    id: s.id,
    creature: s.creature,
    plane: 'near',
    motion: 'popup',
    x: s.x,
    y: s.groundY + hideDepth,
    facing: s.facing,
    phase: 'rise',
    phaseTicks: 0,
    age: 0,
    vx: 0,
    baseY: s.groundY,
    bobAmp: 0,
    bobPeriodTicks: 1,
    bobOffset: 0,
    exitMarginPx: 0,
    scrollFactor: 1,
    groundY: s.groundY,
    hideDepth,
    grassLine: s.groundY + (body.oy + body.ry) * s.planeScale,
    riseTicks: s.riseTicks,
    stareTicks: s.stareTicks,
    duckTicks: s.duckTicks,
    ...damageOf(s.creature),
    fm: null,
    script: null,
  };
}

export type BirdExit = 'exited' | 'ducked' | null;

/**
 * Advances one tick. Returns why the bird leaves, if it does. Flock members and scripted birds
 * only age here (their flock / birds/scripted.ts moves them). `airMul(sign)` scales flying speed
 * across the screen (wind).
 */
export function updateBird(b: Bird, airMul: (sign: number) => number = () => 1): BirdExit {
  b.age++;
  b.phaseTicks++;
  if (b.motion === 'flock' || b.motion === 'perch' || b.motion === 'boss' || b.motion === 'hop')
    return null;
  if (b.motion === 'flyover') {
    b.x += b.vx * airMul(b.vx);
    b.y = b.baseY + b.bobAmp * sin((2 * Math.PI * b.age) / b.bobPeriodTicks + b.bobOffset);
    const right = coreWidth(b.scrollFactor) + LAYER_BLEED_PX + b.exitMarginPx;
    const left = -LAYER_BLEED_PX - b.exitMarginPx;
    if ((b.vx > 0 && b.x > right) || (b.vx < 0 && b.x < left)) return 'exited';
    return null;
  }
  // Pop-up: rise → stare → duck, easing in and out of the grass.
  if (b.phase === 'rise') {
    const t = Math.min(1, b.phaseTicks / b.riseTicks);
    b.y = b.groundY + b.hideDepth * (1 - easeOut(t));
    if (b.phaseTicks >= b.riseTicks) enter(b, 'stare');
  } else if (b.phase === 'stare') {
    b.y = b.groundY;
    if (b.phaseTicks >= b.stareTicks) enter(b, 'duck');
  } else {
    const t = Math.min(1, b.phaseTicks / b.duckTicks);
    b.y = b.groundY + b.hideDepth * (1 - easeOut(1 - t));
    if (b.phaseTicks >= b.duckTicks) return 'ducked';
  }
  return null;
}

export function enter(b: Bird, phase: BirdPhase): void {
  b.phase = phase;
  b.phaseTicks = 0;
}

/** Smooth 0..1 ease (half cosine), via detmath. */
function easeOut(t: number): number {
  return (1 - cos(Math.PI * t)) / 2;
}

export function viewOf(b: Bird): BirdView {
  return {
    id: b.id,
    creature: b.creature.id,
    kind: b.creature.kind,
    plane: b.plane,
    x: b.x,
    y: b.y,
    facing: b.facing,
    motion: b.motion,
    phase: b.phase,
    behaviour: behaviourOf(b),
    hittable: isHittable(b),
    flockId: b.fm?.flockId ?? null,
    ground: b.motion === 'popup' ? b.grassLine : null,
    armored: b.armorLeft > 0,
  };
}
