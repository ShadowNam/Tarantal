// Moves a flock's members one tick (Tech §3.5). Ground birds steer with boids (separation,
// alignment, cohesion) toward a flock goal plus noise from rng.stream('flockNoise'); RUN adds a
// zigzag. Flushed birds crouch for their stagger, take off steeply, level out in the sky lane,
// glide down and land. All new velocities are computed from last tick's positions (members in id
// order), so the result does not depend on update order. Flight keeps the take-off heading: it
// crosses at fly·cos θ while climbing and glide·cos θ while gliding down.
import { enter, type Bird } from '../birds/Bird';
import { cos, sin } from '../detmath';
import type { RandomStream } from '../rng';
import { LAYER_BLEED_PX } from '../world';
import { centroid, drawTicks, type Flock, type FlockParams } from './Flock';

// Structure, not tuning (D-020): ground birds move in depth (y, the narrow ground lane) at half
// the speed they move across.
const DEPTH_SPEED = 0.5;

function len(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

function isGrounded(b: Bird): boolean {
  return b.phase === 'walk' || b.phase === 'alert' || b.phase === 'run' || b.phase === 'land';
}

/** Moves the flock one tick. Returns the members that left the panorama (to despawn).
 *  `airMul(sign)` scales flying birds' speed across the plane (wind, D-021). */
export function moveFlock(
  f: Flock,
  p: FlockParams,
  rng: RandomStream,
  airMul: (sign: number) => number = () => 1,
): Bird[] {
  const c = centroid(f);
  updateGoal(f, p, rng, c.x);
  steerGround(f, p, rng);
  const exited: Bird[] = [];
  for (const b of f.members) {
    const m = b.fm;
    if (m === null) continue;
    if (!isGrounded(b)) fly(f, b, p, rng, airMul);
    else {
      b.x += m.vx;
      b.y = Math.min(f.groundY[1], Math.max(f.groundY[0], b.y + m.vy));
      if (b.phase === 'land') {
        m.landTicks--;
        if (m.landTicks <= 0) enter(b, 'walk');
      }
    }
    if (m.vx > 0.05) b.facing = 1;
    else if (m.vx < -0.05) b.facing = -1;
    const left = -LAYER_BLEED_PX - b.exitMarginPx;
    const right = f.coreWidth + LAYER_BLEED_PX + b.exitMarginPx;
    if (b.x < left || b.x > right) exited.push(b);
  }
  return exited;
}

function updateGoal(f: Flock, p: FlockParams, rng: RandomStream, cx: number): void {
  if (f.state === 'run') {
    // Flee: well ahead of the flock, away from the threat.
    f.goalX = cx + f.dir * p.fleeLookAheadPx * f.ratio;
    return;
  }
  f.goalTicks--;
  if (f.goalTicks > 0) return;
  f.goalTicks = Math.max(1, drawTicks(rng, p.forageGoalTicks));
  // v1.10 Reënbui (D-067): a feeding flock forages round its alate column (the same draws).
  const feeding = f.feedX !== undefined;
  const wander = (feeding ? (f.feedSpreadPx ?? 0) : p.forageWanderPx) * f.ratio;
  const margin = p.spawnSpreadPx * f.ratio;
  const home = Math.min(f.coreWidth - margin, Math.max(margin, f.feedX ?? f.homeX));
  f.goalX = home + rng.range(-wander, wander);
  f.goalY = rng.range(f.groundY[0], f.groundY[1]);
}

function groundSpeed(f: Flock, b: Bird, p: FlockParams): number {
  const m = b.fm;
  if (m === null) return 0;
  switch (b.phase) {
    case 'alert':
      return f.freezeTicks > 0 ? 0 : m.walk * p.alertShuffleMul;
    case 'run':
      return m.run;
    case 'land':
      return m.run * p.landRunSpeedMul;
    default:
      return m.walk;
  }
}

/** v1.10 Reënbui (D-067): a feeding flock's walkers still far from their column hurry there. */
function feedHurry(f: Flock, b: Bird): boolean {
  if (f.feedX === undefined || b.phase !== 'walk' || f.state !== 'forage') return false;
  return Math.abs(b.x - f.feedX) > (f.feedHurryPx ?? Infinity) * f.ratio;
}

function steerGround(f: Flock, p: FlockParams, rng: RandomStream): void {
  const ground = f.members.filter(isGrounded);
  const radius = p.neighbourRadiusPx * f.ratio;
  const sepRadius = Math.min(radius, p.separationRadiusPx * f.ratio);
  const next: { vx: number; vy: number }[] = [];
  for (const b of ground) {
    const m = b.fm;
    if (m === null) {
      next.push({ vx: 0, vy: 0 });
      continue;
    }
    let sx = 0;
    let sy = 0;
    let ax = 0;
    let ay = 0;
    let cx = 0;
    let cy = 0;
    let n = 0;
    for (const o of ground) {
      if (o === b || o.fm === null) continue;
      const dx = b.x - o.x;
      const dy = b.y - o.y;
      const d = len(dx, dy);
      if (d >= radius) continue;
      n++;
      ax += o.fm.vx;
      ay += o.fm.vy;
      cx += o.x;
      cy += o.y;
      if (d < sepRadius) {
        // Push apart, harder the closer they are (coincident birds split along x by id order).
        const push = 1 - d / sepRadius;
        if (d > 1e-6) {
          sx += (dx / d) * push;
          sy += (dy / d) * push;
        } else sx += o.id < b.id ? push : -push;
      }
    }
    let tx = 0;
    let ty = 0;
    if (n > 0) {
      const al = len(ax / n, ay / n);
      if (al > 1e-6) {
        tx += (ax / n / al) * p.alignment;
        ty += (ay / n / al) * p.alignment;
      }
      const hx = cx / n - b.x;
      const hy = cy / n - b.y;
      const hl = len(hx, hy);
      if (hl > 1e-6) {
        tx += (hx / hl) * p.cohesion;
        ty += (hy / hl) * p.cohesion;
      }
    }
    tx += sx * p.separation;
    ty += sy * p.separation;
    const gx = f.goalX - b.x;
    const gy = f.goalY - b.y;
    const gl = len(gx, gy);
    // Running birds always head for the flee point. Foraging birds only feel the goal once they
    // stray past half the wander radius (full pull at the radius), so separation can spread the
    // flock out instead of every bird piling onto the same point.
    const half = (p.forageWanderPx * f.ratio) / 2;
    const pull = f.state === 'run' ? 1 : Math.min(1, Math.max(0, (gl - half) / half));
    if (pull > 0 && gl > 1e-6) {
      tx += (gx / gl) * pull;
      ty += (gy / gl) * pull;
    }
    tx += rng.range(-1, 1) * p.noise;
    ty += rng.range(-1, 1) * p.noise;
    if (b.phase === 'run') {
      ty += sin((2 * Math.PI * f.stateTicks) / p.zigPeriodTicks + m.zigPhase) * p.zigWeight;
    }
    const tl = len(tx, ty);
    const speed = feedHurry(f, b) ? m.run * (f.feedHurryMul ?? 1) : groundSpeed(f, b, p);
    const wantX = tl > 1e-6 ? (tx / tl) * speed : 0;
    const wantY = tl > 1e-6 ? (ty / tl) * speed * DEPTH_SPEED : 0;
    next.push({ vx: m.vx + (wantX - m.vx) * p.turnRate, vy: m.vy + (wantY - m.vy) * p.turnRate });
  }
  ground.forEach((b, i) => {
    const v = next[i];
    if (b.fm === null || v === undefined) return;
    if (groundSpeed(f, b, p) === 0) {
      b.fm.vx = 0;
      b.fm.vy = 0;
    } else {
      b.fm.vx = v.vx;
      b.fm.vy = v.vy;
    }
  });
}

/** Take-off, flight, glide and touch-down for one flushed bird. */
function fly(
  f: Flock,
  b: Bird,
  p: FlockParams,
  rng: RandomStream,
  airMul: (sign: number) => number,
): void {
  const m = b.fm;
  if (m === null) return;
  if (b.phase === 'launch') {
    m.launchTicks--;
    if (m.launchTicks > 0) return;
    enter(b, 'flap');
    const dir = f.dir;
    m.vx = dir * m.fly * cos(m.angle);
    m.vy = -m.fly * sin(m.angle);
    // Blend toward level flight so the climb tops out near the bird's cruise height.
    const climb = Math.max(40 * f.ratio, b.y - m.cruiseY);
    m.climbK = Math.min(0.2, Math.max(0.01, -m.vy / climb));
    b.facing = dir;
  }
  if (b.phase === 'flap') {
    // A fountain, not a getaway (GDD §6.1): the climb flattens out at cruise height while the
    // horizontal speed stays the take-off component fly·cos θ.
    m.vy += (0 - m.vy) * m.climbK;
    b.x += m.vx * airMul(m.vx);
    b.y = Math.max(f.skyY[0], b.y + m.vy);
    m.flapTicks--;
    if (m.flapTicks <= 0) enter(b, 'glide');
    return;
  }
  // glide: the same heading — glide·cos θ across — sinking at glideSinkPxPerSec.
  m.vx = f.dir * m.glide * cos(m.angle);
  m.vy = p.glideSinkPerTick * f.ratio;
  b.x += m.vx * airMul(m.vx);
  b.y += m.vy;
  if (b.y >= m.landY) {
    b.y = m.landY;
    m.vx = f.dir * m.run * p.landRunSpeedMul;
    m.vy = 0;
    m.landTicks = Math.max(1, drawTicks(rng, p.landRunTicks));
    enter(b, 'land');
  }
}

/**
 * v1.10 (D-067): where a flock will be on the ground — for a bird on the ground (walking,
 * running, landing) where it is; for one in the air, the x where its flight puts it down: the
 * flap left at fly·cos θ, then the glide at glide·cos θ sinking at glideSinkPxPerSec from cruise
 * height to its landing y. Read only: it draws nothing (the wind is left out).
 */
export function landingX(f: Flock, p: FlockParams): number {
  if (f.members.length === 0) return f.homeX;
  const sink = Math.max(1e-6, p.glideSinkPerTick * f.ratio);
  let sum = 0;
  for (const b of f.members) {
    const m = b.fm;
    if (m === null || isGrounded(b)) {
      sum += b.x;
      continue;
    }
    const glideAcross = f.dir * m.glide * cos(m.angle);
    if (b.phase === 'glide') {
      sum += b.x + glideAcross * Math.max(0, (m.landY - b.y) / sink);
      continue;
    }
    const flyAcross = f.dir * m.fly * cos(m.angle) * Math.max(0, m.flapTicks);
    const fromY = Math.min(b.y, m.cruiseY);
    sum += b.x + flyAcross + glideAcross * Math.max(0, (m.landY - fromY) / sink);
  }
  return sum / f.members.length;
}

/** True when every bird of a flushed flock is on its way down or back on the ground. */
export function comingDown(f: Flock): boolean {
  return f.members.length > 0 && f.members.every((b) => b.phase !== 'launch' && b.phase !== 'flap');
}
