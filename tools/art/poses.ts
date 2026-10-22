// Key poses for the 11 bird clips (art bible §3.4, D-029). Each clip is a list of frames built from
// the rest pose; frame counts come from tools/assets/targets.ts CLIP_SPEC. Offsets are small so the
// body stays on its content/birds.json hitbox (the sim moves the bird, the clip only animates it).
import type { BirdClip } from '../../src/game/assets/assetIndex';
import { CLIP_SPEC } from '../assets/targets';
import { REST, type Pose, type Wing } from './bird';

const TAU = Math.PI * 2;
const pose = (o: Partial<Pose>): Pose => ({ ...REST, ...o });
const flight = (angle: number, len = 1): Wing => ({ kind: 'flight', angle, len });

/** Ground squash pivot: the belly (body units). */
const GROUND = 90;

function forageWalk(n: number): Pose[] {
  return Array.from({ length: n }, (_, k) => {
    const p = (k / n) * TAU;
    const lift = (ph: number) => Math.max(0, Math.cos(ph)) * 14;
    const c2 = Math.cos(2 * p);
    return pose({
      y: 2 * c2,
      sx: 1 + 0.03 * c2,
      sy: 1 - 0.03 * c2,
      pivotY: GROUND,
      rot: 2 * Math.sin(p),
      // Chicken-style head thrust: forward, hold, back.
      head: { dx: 12 * Math.sin(p) - 2, dy: 3 * c2, rot: 3 * Math.sin(p) },
      tail: 6 * Math.sin(p),
      legs: {
        kind: 'stand',
        legs: [
          { hip: -24, foot: [-22 + 22 * Math.sin(p + Math.PI), 150 - lift(p + Math.PI)] },
          { hip: 22, foot: [24 + 22 * Math.sin(p), 150 - lift(p)] },
        ],
      },
    });
  });
}

function peck(n: number): Pose[] {
  const down = [0, 0.4, 0.85, 1, 0.6, 0.2];
  return Array.from({ length: n }, (_, k) => {
    const t = down[k % down.length] ?? 0;
    const hit = t === 1;
    return pose({
      rot: 12 * t,
      pivotY: GROUND,
      sx: hit ? 1.04 : 1,
      sy: hit ? 0.96 : 1,
      head: { dx: 30 * t, dy: 175 * t, rot: 70 * t },
      neckBend: 8 - 30 * t,
      tail: -8 * t,
      beak: k === 4 ? 0.5 : 0,
    });
  });
}

function alert(n: number): Pose[] {
  const up = [0.35, 0.75, 1, 1];
  return Array.from({ length: n }, (_, k) => {
    const t = up[k % up.length] ?? 1;
    return pose({
      pivotY: GROUND,
      sx: 1 - 0.05 * t,
      sy: 1 + 0.07 * t,
      head: { dx: -2 * t, dy: -22 * t, rot: k === 3 ? -6 : 0 },
      neckBend: 4,
      eyes: k === 0 ? 'calm' : 'wide',
      wing: { kind: 'folded', lift: 0.3 * t },
      tail: -12 * t,
    });
  });
}

function run(n: number): Pose[] {
  return Array.from({ length: n }, (_, k) => {
    const p = (k / n) * TAU;
    const bounce = Math.abs(Math.sin(p));
    return pose({
      x: 6,
      y: -6 * bounce,
      rot: 16,
      pivotY: GROUND,
      sx: 1 + 0.05 * (1 - bounce),
      sy: 1 - 0.05 * (1 - bounce),
      head: { dx: 18, dy: 12 - 4 * bounce, rot: 10 },
      neckBend: -6,
      eyes: 'wide',
      beak: k % 2 === 0 ? 0.7 : 0.2,
      wing: { kind: 'folded', lift: 0.45 + 0.35 * Math.sin(2 * p) },
      tail: -16,
      legs: { kind: 'blur', phase: k / n },
    });
  });
}

function takeoff(n: number): Pose[] {
  const frames: Pose[] = [
    pose({
      y: 8,
      sx: 1.12,
      sy: 0.84,
      pivotY: GROUND,
      head: { dx: 10, dy: 14, rot: 0 },
      eyes: 'wide',
      wing: { kind: 'folded', lift: 0.4 },
      tail: -10,
    }),
    pose({
      y: 10,
      sx: 1.16,
      sy: 0.8,
      pivotY: GROUND,
      head: { dx: 14, dy: 16, rot: -4 },
      eyes: 'wide',
      wing: flight(-25, 0.85),
      tail: -14,
    }),
    pose({
      y: -6,
      rot: -18,
      sx: 0.9,
      sy: 1.14,
      head: { dx: 6, dy: -10, rot: -10 },
      eyes: 'wide',
      wing: flight(-15, 0.95),
      legs: { kind: 'dangle' },
      tail: 10,
    }),
    pose({
      y: -10,
      rot: -22,
      sx: 1.06,
      sy: 0.94,
      head: { dx: 10, dy: -6, rot: -10 },
      eyes: 'wide',
      beak: 0.6,
      wing: flight(-165, 0.95),
      legs: { kind: 'dangle' },
      tail: 12,
      fx: { shed: 0.1 },
    }),
    pose({
      y: -10,
      rot: -20,
      head: { dx: 12, dy: -6, rot: -8 },
      eyes: 'wide',
      wing: flight(-95, 0.6),
      legs: { kind: 'dangle' },
      tail: 8,
      fx: { shed: 0.5 },
    }),
    pose({
      y: -10,
      rot: -16,
      sx: 0.96,
      sy: 1.04,
      head: { dx: 14, dy: -4, rot: -6 },
      eyes: 'wide',
      wing: flight(-20, 0.95),
      legs: { kind: 'tucked' },
      tail: 6,
      fx: { shed: 0.9 },
    }),
  ];
  return frames.slice(0, n);
}

/** Wing beat: up, up-mid, mid, down, down-mid, mid (clumsy, bible §3.4). */
const BEAT: readonly [number, number, number][] = [
  [-18, 1, 1.04],
  [-55, 0.8, 1.0],
  [-95, 0.55, 0.97],
  [-160, 1.1, 0.93],
  [-135, 0.9, 0.96],
  [-80, 0.6, 1.0],
];

function flap(n: number): Pose[] {
  return Array.from({ length: n }, (_, k) => {
    const [angle, len, sy] = BEAT[k % BEAT.length] ?? [-18, 1, 1];
    return pose({
      y: angle < -140 ? -4 : 2,
      rot: -6,
      sx: 2 - sy,
      sy,
      head: { dx: 16, dy: -4, rot: -4 },
      neckBend: 2,
      eyes: 'wide',
      wing: flight(angle, len),
      legs: { kind: 'tucked' },
      tail: -8,
      fx: k === 4 ? { shed: 0.3 } : k === 5 ? { shed: 0.7 } : {},
    });
  });
}

function glide(n: number): Pose[] {
  return Array.from({ length: n }, (_, k) =>
    pose({
      rot: 4,
      head: { dx: 18, dy: 4, rot: 4 },
      eyes: 'calm',
      wing: flight(k % 2 === 0 ? -68 : -74, 0.95),
      legs: { kind: 'tucked' },
      tail: -4 + (k % 2) * 4,
    }),
  );
}

function land(n: number): Pose[] {
  const frames: Pose[] = [
    pose({
      rot: -14,
      y: -6,
      head: { dx: 4, dy: -12, rot: -8 },
      eyes: 'wide',
      wing: flight(-25, 0.95),
      legs: {
        kind: 'stand',
        legs: [
          { hip: -10, foot: [40, 140] },
          { hip: 18, foot: [62, 136] },
        ],
      },
      tail: 12,
    }),
    pose({
      y: 8,
      sx: 1.16,
      sy: 0.82,
      pivotY: GROUND,
      head: { dx: 26, dy: 22, rot: 8 },
      eyes: 'wide',
      wing: flight(-100, 0.55),
      tail: -6,
    }),
    pose({
      x: 6,
      rot: 14,
      pivotY: GROUND,
      head: { dx: 40, dy: 34, rot: 14 },
      eyes: 'wide',
      beak: 0.5,
      wing: { kind: 'folded', lift: 0.7 },
      legs: {
        kind: 'stand',
        legs: [
          { hip: -24, foot: [-30, 150] },
          { hip: 22, foot: [58, 146] },
        ],
      },
      tail: -14,
    }),
    pose({
      pivotY: GROUND,
      sx: 0.97,
      sy: 1.04,
      head: { dx: 2, dy: -6, rot: 0 },
      eyes: 'calm',
      tail: -4,
    }),
  ];
  return frames.slice(0, n);
}

function hitPoof(n: number): Pose[] {
  const limp = flight(-120, 0.7);
  const frames: Pose[] = [
    pose({
      sx: 1.2,
      sy: 0.82,
      eyes: 'swirl',
      wing: limp,
      legs: { kind: 'dangle' },
      beak: 0.6,
      fx: { feathers: { n: 7, r: 150, drop: -10 }, backPuff: { size: 0.8, alpha: 1 } },
    }),
    pose({
      sx: 1.1,
      sy: 0.9,
      eyes: 'swirl',
      wing: limp,
      legs: { kind: 'dangle' },
      beak: 0.6,
      fx: { feathers: { n: 10, r: 175, drop: 0 }, puff: { size: 0.8, alpha: 1 } },
    }),
    pose({
      alpha: 0,
      fx: {
        feathers: { n: 12, r: 150, drop: 4 },
        puff: { size: 1, alpha: 1 },
        stars: { n: 3, spin: 0, alpha: 1 },
      },
    }),
    pose({
      alpha: 0,
      fx: {
        feathers: { n: 12, r: 180, drop: 12 },
        puff: { size: 1.05, alpha: 0.85 },
        stars: { n: 3, spin: 1, alpha: 1 },
      },
    }),
    pose({
      alpha: 0,
      fx: {
        feathers: { n: 12, r: 200, drop: 24 },
        puff: { size: 0.85, alpha: 0.55 },
        stars: { n: 3, spin: 2, alpha: 0.8 },
      },
    }),
    pose({
      alpha: 0,
      fx: {
        feathers: { n: 10, r: 210, drop: 38 },
        puff: { size: 0.6, alpha: 0.3 },
        stars: { n: 3, spin: 3, alpha: 0.5 },
      },
    }),
  ];
  return frames.slice(0, n);
}

function tumble(n: number): Pose[] {
  return Array.from({ length: n }, (_, k) =>
    pose({
      spin: (k / n) * 360,
      scale: 0.82,
      eyes: 'swirl',
      wing: flight(-110, 0.65),
      legs: { kind: 'dangle' },
      beak: 0.5,
      fx: { stars: { n: 3, spin: k * 1.2, alpha: 1 } },
    }),
  );
}

function peek(n: number): Pose[] {
  const eyes = ['front', 'front', 'frontBlink', 'front', 'frontLeft', 'frontRight'] as const;
  return Array.from({ length: n }, (_, k) =>
    pose({
      pivotY: GROUND,
      sx: 0.98,
      sy: 1.04,
      head: { dx: -6, dy: -8 + (k === 2 ? 2 : 0), rot: 0 },
      neckBend: 0,
      eyes: eyes[k % eyes.length] ?? 'front',
      wing: { kind: 'folded', lift: k >= 4 ? 0.15 : 0 },
    }),
  );
}

const BUILDERS: Readonly<Record<BirdClip, (n: number) => Pose[]>> = {
  forage_walk: forageWalk,
  peck,
  alert,
  run,
  takeoff,
  flap,
  glide,
  land,
  hit_poof: hitPoof,
  tumble,
  peek,
};

/** The frames of a clip at the bible's frame count. */
export function clipPoses(clip: BirdClip): Pose[] {
  return BUILDERS[clip](CLIP_SPEC[clip].frames);
}
