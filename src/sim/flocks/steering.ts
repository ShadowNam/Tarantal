// Moves a flock's members one tick (Tech §3.5). Ground birds steer with boids (separation,
// alignment, cohesion) toward a flock goal plus noise from rng.stream('flockNoise'); RUN adds a
// zigzag. Flushed birds crouch for their stagger, take off steeply, level out in the sky lane,
// glide down and land. All new velocities are computed from last tick's positions (members in id
// order), so the result does not depend on update order.
import { enter, type Bird } from '../birds/Bird';
import { cos, sin } from '../detmath';
import type { RandomStream } from '../rng';
import { LAYER_BLEED_PX } from '../world';
import { centroid, drawTicks, type Flock, type FlockParams } from './Flock';

// Structure, not tuning (D-020): foraging birds stop pressing toward a goal this close to it, and
// move in depth (y, the narrow ground lane) at half the speed they move across.
const GOAL_ARRIVE_PX = 30;
const DEPTH_SPEED = 0.5;

function len(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

function isGrounded(b: Bird): boolean {
  return b.phase === 'walk' || b.phase === 'alert' || b.phase === 'run' || b.phase === 'land';
}

/** Moves the flock one tick. Returns the members that left the panorama (to despawn). */
export function moveFlock(f: Flock, p: FlockParams, rng: RandomStream): Bird[] {
  const c = centroid(f);
  updateGoal(f, p, rng, c.x);
  steerGround(f, p, rng);
  const exited: Bird[] = [];
  for (const b of f.members) {
    const m = b.fm;
    if (m === null) continue;
    if (!isGrounded(b)) fly(f, b, p, rng);
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
  const wander = p.forageWanderPx * f.ratio;
  const margin = p.spawnSpreadPx * f.ratio;
  const home = Math.min(f.coreWidth - margin, Math.max(margin, f.homeX));
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
    if (gl > GOAL_ARRIVE_PX * f.ratio || f.state === 'run') {
      tx += gx / Math.max(gl, 1e-6);
      ty += gy / Math.max(gl, 1e-6);
    }
    tx += rng.range(-1, 1) * p.noise;
    ty += rng.range(-1, 1) * p.noise;
    if (b.phase === 'run') {
      ty += sin((2 * Math.PI * f.stateTicks) / p.zigPeriodTicks + m.zigPhase) * p.zigWeight;
    }
    const tl = len(tx, ty);
    const speed = groundSpeed(f, b, p);
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
function fly(f: Flock, b: Bird, p: FlockParams, rng: RandomStream): void {
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
    m.vx += (f.dir * m.fly - m.vx) * m.climbK;
    m.vy += (0 - m.vy) * m.climbK;
    b.x += m.vx;
    b.y = Math.max(f.skyY[0], b.y + m.vy);
    m.flapTicks--;
    if (m.flapTicks <= 0) enter(b, 'glide');
    return;
  }
  // glide
  m.vx = f.dir * m.glide;
  m.vy = p.glideSinkPerTick * f.ratio;
  b.x += m.vx;
  b.y += m.vy;
  if (b.y >= m.landY) {
    b.y = m.landY;
    m.vx = f.dir * m.run * p.landRunSpeedMul;
    m.vy = 0;
    m.landTicks = Math.max(1, drawTicks(rng, p.landRunTicks));
    enter(b, 'land');
  }
}
