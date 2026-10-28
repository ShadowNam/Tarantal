// 1.9.3 (D-056, GDD §11.3b): makalani palms in the Okavango and the nuts hanging under their
// crowns. A nut is the v1.8 juggle body (../juggle/body): one or two pellets crack it off its
// stalk and it drops spinning; every air hit kicks it higher (the chain, like a can); it bounces
// hard once and rolls to a stop, or leaves out of the top. popPellets in one shot, or a hit by a
// pop weapon (the rifles), burst it. Sizes follow the plane's scale (the hit radius floored by its
// minHitRadiusPx: nuts are targets, D-049); flight numbers are × tuningRatio. Pure and
// deterministic: cluster sizes, colours and kick jitter come from the 'nuts' stream only.
import type { Biome, Layout, Makalani, NutColour, PalmKind, Scoring } from '../../content/schemas';
import { hitRadius, tuningRatio } from '../planes';
import type { RandomStream } from '../rng';
import { coreWidth } from '../world';
import {
  kick,
  restingBody,
  rollBody,
  scaledTuning,
  stepBody,
  type JuggleBody,
  type JuggleTuning,
  type KickResult,
  type StepResult,
} from '../juggle/body';

/** Nut ids start here, clear of birds, the Spookjag (1,000,000) and the cans (2,000,000). */
export const NUT_ID_BASE = 3_000_000;
/** The "Hard soos 'n makalani" secret's id (secretTriggered propId). */
export const MAKALANI_SECRET = 'makalani';

/** Where a cluster's nuts hang around its anchor, in nut diameters (a bunch: up to 8). */
const SLOTS: readonly (readonly [number, number])[] = [
  [0, 0],
  [-1.02, 0.28],
  [1.0, 0.3],
  [-0.48, 1.08],
  [0.52, 1.1],
  [-1.42, 1.22],
  [1.46, 1.26],
  [0.02, 2.02],
];

export type PalmPlane = 'near' | 'mid';

export interface PalmGroup {
  readonly index: number;
  readonly kind: PalmKind;
  readonly plane: PalmPlane;
  /** The foot (design px on its plane) and the mirror. */
  readonly x: number;
  readonly footY: number;
  readonly flip: boolean;
  /** The water line it is mirrored at (null: not by water). */
  readonly waterY: number | null;
  readonly scale: number;
  /** Each trunk's foot and top (plane px). */
  readonly trunks: readonly {
    readonly footX: number;
    readonly topX: number;
    readonly topY: number;
  }[];
  /** Each cluster's anchor (plane px) and the top of the trunk its stalk hangs from. */
  readonly clusters: readonly {
    readonly x: number;
    readonly y: number;
    readonly fromX: number;
    readonly fromY: number;
  }[];
}

export interface Nut {
  readonly id: number;
  readonly palm: number;
  readonly cluster: number;
  readonly plane: PalmPlane;
  readonly colour: NutColour;
  readonly body: JuggleBody;
  /** Where it hung (its stalk's end stays there). */
  readonly hangX: number;
  readonly hangY: number;
  readonly r: number;
  readonly hitR: number;
  readonly airHitR: number;
  popped: boolean;
}

export interface Palms {
  readonly groups: readonly PalmGroup[];
  readonly nuts: Nut[];
  /** Per plane: the flight numbers there. */
  readonly tuning: Readonly<Record<PalmPlane, JuggleTuning>>;
  knocks: number;
  airHits: number;
  pops: number;
  weg: number;
  bestChain: number;
  /** The secret was found this hunt. */
  hard: boolean;
}

export interface PalmDeps {
  readonly palms: NonNullable<Layout['palms']>;
  readonly biome: Pick<Biome, 'palmY' | 'waterY'>;
  readonly makalani: Makalani;
  readonly planes: Scoring['planes'];
  readonly tuningRefScale: number;
  readonly rng: RandomStream;
}

/** Sets the day's palm groups and their nuts up (null: none can stand on this map). */
export function startPalms(d: PalmDeps): Palms | null {
  const { makalani: m, planes } = d;
  const groups: PalmGroup[] = [];
  const nuts: Nut[] = [];
  const weights = (['brown', 'orange', 'green'] as const).map((c) => m.colours[c]);
  d.palms.forEach((p, index) => {
    const kind = m.palms[p.kind];
    const footY = d.biome.palmY?.[p.plane];
    if (footY === undefined || !kind.planes.includes(p.plane)) return;
    const pl = planes[p.plane];
    const s = pl.scale;
    const flip = p.flip === true;
    const sx = flip ? -s : s;
    const x = p.u * coreWidth(pl.scrollFactor);
    const trunks = kind.trunks.map((t) => ({
      footX: x + t.dx * sx,
      topX: x + t.topDx * sx,
      topY: footY - t.h * s,
    }));
    const water = p.water === true ? (d.biome.waterY?.[p.plane] ?? null) : null;
    const clusters = kind.clusters.flatMap((c) => {
      const t = kind.trunks[c.trunk];
      if (t === undefined) return [];
      const fromX = x + t.topDx * sx;
      const fromY = footY - t.h * s;
      return [{ x: fromX + c.dx * sx, y: fromY + c.dy * s, fromX, fromY }];
    });
    const r = m.nutR * s;
    const ground = footY - r;
    clusters.forEach((c, ci) => {
      const n = d.rng.int(m.perCluster[0], m.perCluster[1]);
      for (let i = 0; i < n; i++) {
        const slot = SLOTS[i] ?? [0, 0];
        const hx = c.x + slot[0] * 2 * r * (flip ? -1 : 1);
        const hy = c.y + slot[1] * 2 * r;
        const colour =
          (['brown', 'orange', 'green'] as const)[d.rng.weightedIndex(weights)] ?? 'brown';
        nuts.push({
          id: NUT_ID_BASE + nuts.length,
          palm: index,
          cluster: ci,
          plane: p.plane,
          colour,
          body: restingBody(hx, hy, ground, r),
          hangX: hx,
          hangY: hy,
          r,
          hitR: hitRadius(m.nutR, s, pl.minHitRadiusPx),
          airHitR: m.nutR * m.airHitMul * s,
          popped: false,
        });
      }
    });
    groups.push({
      index,
      kind: p.kind,
      plane: p.plane,
      x,
      footY,
      flip,
      waterY: water,
      scale: s,
      trunks,
      clusters,
    });
  });
  if (groups.length === 0) return null;
  const tuning = (plane: PalmPlane): JuggleTuning =>
    scaledTuning(m.juggle, tuningRatio(planes[plane].scale, d.tuningRefScale));
  return {
    groups,
    nuts,
    tuning: { near: tuning('near'), mid: tuning('mid') },
    knocks: 0,
    airHits: 0,
    pops: 0,
    weg: 0,
    bestChain: 0,
    hard: false,
  };
}

/** Can a shot still hit it (hanging or in the air)? */
export const nutLive = (n: Nut): boolean =>
  !n.popped && (n.body.state === 'rest' || n.body.state === 'air' || n.body.state === 'bounced');

/** A nut's hit radius now: larger while it tumbles in the air. */
export function nutHitR(n: Nut): number {
  return n.body.state === 'air' || n.body.state === 'bounced' ? n.airHitR : n.hitR;
}

export type NutHit =
  | { readonly kind: 'pop'; readonly wasHanging: boolean }
  | ({ readonly kind: 'knock' | 'juggle' } & Pick<KickResult, 'chain'>);

/** One shot's pellets on a nut: a pop (enough pellets, or a pop weapon), else a kick. */
export function hitNut(
  p: Palms,
  n: Nut,
  meanDx: number,
  pellets: number,
  popWeapon: boolean,
  popPellets: number,
  rng: RandomStream,
): NutHit | null {
  if (!nutLive(n)) return null;
  if (popWeapon || pellets >= popPellets) {
    const wasHanging = n.body.state === 'rest';
    n.popped = true;
    n.body.state = 'gone';
    n.body.vx = 0;
    n.body.vy = 0;
    p.pops++;
    return { kind: 'pop', wasHanging };
  }
  const r = nutHitR(n);
  const k = kick(n.body, p.tuning[n.plane], r > 0 ? meanDx / r : 0, pellets, rng);
  if (k === null) return null;
  if (k.kind === 'knock') p.knocks++;
  else {
    p.airHits++;
    p.bestChain = Math.max(p.bestChain, k.chain);
  }
  return { kind: k.kind, chain: k.chain };
}

/** One tick for every nut in flight or rolling, in id order. */
export function stepNuts(p: Palms): { readonly nut: Nut; readonly r: NonNullable<StepResult> }[] {
  const out: { nut: Nut; r: NonNullable<StepResult> }[] = [];
  for (const n of p.nuts) {
    if (n.popped) continue;
    const t = p.tuning[n.plane];
    if (n.body.state === 'landed') {
      rollBody(n.body, t);
      continue;
    }
    const r = stepBody(n.body, t, 0);
    if (r === null) continue;
    if (r === 'gone') p.weg++;
    out.push({ nut: n, r });
  }
  return out;
}

/** Points for a nut event, before Stampede (rounded). */
export function nutPoints(
  s: Scoring['nuts'],
  plane: PalmPlane,
  what: 'knock' | 'weg' | 'pop' | { readonly chain: number },
): number {
  const base =
    what === 'knock'
      ? s.knockOff
      : what === 'weg'
        ? s.weg
        : what === 'pop'
          ? s.pop
          : s.airHit + s.airHitStep * (Math.min(what.chain, s.chainCap) - 1);
  return Math.round(base * s.planeMul[plane]);
}
