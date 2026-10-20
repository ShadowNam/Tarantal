// Flock state machine (GDD §6.1, Tech §3.5). Pure functions over a Flock; each returns the
// transition it caused (the sim turns it into a flockStateChanged event).
//
//   FORAGE ─threat─▶ ALERT ─threat in window─▶ RUN ─threat in window─▶ FLUSH ─all landed─▶ SETTLE
//     ▲                │ window expires          │ no threat for 4–7 s                       │
//     └────────────────┘                         └──────────────▶ SETTLE ─all walking─▶ FORAGE
//
// A threat in RUN after the window has closed reopens the window and restarts the calm timer but
// does not flush: every step needs a threat inside the window opened by the previous one (D-020).
// A threat in SETTLE counts like one in FORAGE. Whole Flock stays possible only until the flock
// first calms down (ALERT → FORAGE, or SETTLE). Forced reactions (Vuvuzela, Stampede, events)
// jump straight to RUN or FLUSH.
import { enter } from '../birds/Bird';
import type { FlockCause } from '../events';
import type { RandomStream } from '../rng';
import type { FlockState } from '../types';
import { centroid, drawTicks, type Flock, type FlockParams } from './Flock';

export interface Transition {
  readonly from: FlockState;
  readonly to: FlockState;
  readonly cause: FlockCause;
}

function setState(f: Flock, to: FlockState, cause: FlockCause): Transition {
  const from = f.state;
  f.state = to;
  f.stateTicks = 0;
  return { from, to, cause };
}

function openWindow(f: Flock, p: FlockParams): void {
  f.windowTicks = p.windowTicks;
  f.windowFresh = true;
}

function enterAlert(f: Flock, p: FlockParams, rng: RandomStream, cause: FlockCause): Transition {
  openWindow(f, p);
  f.freezeTicks = drawTicks(rng, p.alertTicks);
  for (const b of f.members) {
    enter(b, 'alert');
    if (b.fm) {
      b.fm.vx = 0;
      b.fm.vy = 0;
    }
  }
  return setState(f, 'alert', cause);
}

function enterRun(f: Flock, p: FlockParams, rng: RandomStream, cause: FlockCause): Transition {
  openWindow(f, p);
  f.calmTicks = drawTicks(rng, p.settleTimeoutTicks);
  f.dir = awayFrom(f);
  for (const b of f.members) enter(b, 'run');
  return setState(f, 'run', cause);
}

function enterFlush(f: Flock, p: FlockParams, rng: RandomStream, cause: FlockCause): Transition {
  f.windowTicks = 0;
  f.dir = awayFrom(f);
  for (const b of f.members) {
    const m = b.fm;
    if (m === null) continue;
    enter(b, 'launch');
    m.vx = 0;
    m.vy = 0;
    m.launchTicks = drawTicks(rng, p.staggerTicks);
    m.flapTicks = drawTicks(rng, p.flightTicks);
    m.angle = rng.range(p.flushAngleRad[0], p.flushAngleRad[1]);
    m.cruiseY = rng.range(f.skyY[0], f.skyY[1]);
    m.landY = rng.range(f.groundY[0], f.groundY[1]);
  }
  return setState(f, 'flush', cause);
}

function enterSettle(f: Flock, p: FlockParams, rng: RandomStream, cause: FlockCause): Transition {
  f.eligible = false;
  for (const b of f.members) {
    // Birds that already landed keep running on (or are walking again).
    if (b.phase === 'land' || b.phase === 'walk') continue;
    enter(b, 'land');
    if (b.fm) b.fm.landTicks = drawTicks(rng, p.landRunTicks);
  }
  return setState(f, 'settle', cause);
}

function enterForage(f: Flock, cause: FlockCause): Transition {
  f.windowTicks = 0;
  // Calming down after losing a bird ends Whole Flock (GDD §6.4 "before it settles", D-020):
  // waiting out the window between shots is the plinker's safe play; the bonus rewards
  // escalation. A flock that only got spooked (a hadeda, a stray shot) keeps its chance.
  if (f.members.length < f.spawnSize) f.eligible = false;
  if (cause === 'settled') f.homeX = centroid(f).x;
  f.goalTicks = 0;
  for (const b of f.members) enter(b, 'walk');
  return setState(f, 'forage', cause);
}

/** Direction away from the last threat (ties go right). */
function awayFrom(f: Flock): 1 | -1 {
  return centroid(f).x >= f.threatX ? 1 : -1;
}

/** One threat (GDD §6.2) from plane x `fromX`. Returns the transition, or null if it only
 *  reopened the window (RUN) or changed nothing (FLUSH). */
export function applyThreat(
  f: Flock,
  fromX: number,
  p: FlockParams,
  rng: RandomStream,
): Transition | null {
  if (f.state === 'flush') return null;
  f.threatX = fromX;
  switch (f.state) {
    case 'forage':
    case 'settle':
      return enterAlert(f, p, rng, 'threat');
    case 'alert':
      // ALERT only lasts while its window is open, so a threat here is always inside it.
      return enterRun(f, p, rng, 'threat');
    case 'run':
      if (f.windowTicks > 0) return enterFlush(f, p, rng, 'threat');
      openWindow(f, p);
      f.calmTicks = drawTicks(rng, p.settleTimeoutTicks);
      f.dir = awayFrom(f);
      return null;
  }
}

/** Jumps straight to RUN or FLUSH (Vuvuzela, Stampede, world events). Never de-escalates. */
export function forceState(
  f: Flock,
  to: 'run' | 'flush',
  fromX: number,
  cause: FlockCause,
  p: FlockParams,
  rng: RandomStream,
): Transition | null {
  if (f.state === 'flush' || f.state === to) return null;
  f.threatX = fromX;
  return to === 'run' ? enterRun(f, p, rng, cause) : enterFlush(f, p, rng, cause);
}

/** Advances the FSM timers one tick (before members move). */
export function tickFsm(f: Flock, p: FlockParams, rng: RandomStream): Transition | null {
  f.stateTicks++;
  if (f.windowFresh) f.windowFresh = false;
  else if (f.windowTicks > 0) f.windowTicks--;
  switch (f.state) {
    case 'forage':
      return null;
    case 'alert':
      if (f.freezeTicks > 0) f.freezeTicks--;
      return f.windowTicks === 0 ? enterForage(f, 'window') : null;
    case 'run':
      f.calmTicks--;
      return f.calmTicks <= 0 ? enterSettle(f, p, rng, 'timeout') : null;
    case 'flush':
      if (f.members.length > 0 && f.members.every((b) => b.phase === 'land' || b.phase === 'walk'))
        return enterSettle(f, p, rng, 'landed');
      return null;
    case 'settle':
      return f.members.every((b) => b.phase === 'walk') ? enterForage(f, 'settled') : null;
  }
}
