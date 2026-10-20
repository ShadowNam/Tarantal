// Secrets (GDD §8, §11.1): shootable prop parts with puzzle-ish triggers, built entirely from the
// biome JSON (props[].secret). Nothing here knows a secret by id: removing a secret from the JSON
// removes it from the game. Multi-hit secrets mark parts until all are hit within the window
// (parts may orbit a rotor); single-hit secrets pay once per hunt or again after a cooldown.
import type { Biome } from '../../content/schemas';
import { secondsToTicks } from '../clock';
import { cos, degToRad, sin } from '../detmath';
import type { OccluderShape } from '../weapons/hitTest';
import type { PlaneId, SecretView } from '../types';
import { coreWidth } from '../world';

type Prop = Biome['props'][number];
type SecretDef = NonNullable<Prop['secret']>;
export type SecretReward = SecretDef['reward'];

export interface SecretPart {
  readonly id: string;
  /** Offset from the prop (or from the rotor hub when the secret has a rotor). */
  readonly ox: number;
  readonly oy: number;
  readonly shape: OccluderShape;
  hit: boolean;
}

export interface Secret {
  readonly propId: string;
  readonly layerId: string;
  readonly scrollFactor: number;
  /** The layer's plane, if it is a plane layer. */
  readonly plane: PlaneId | null;
  /** Prop position on its layer. */
  readonly x: number;
  readonly y: number;
  readonly parts: SecretPart[];
  readonly rotor: { readonly ox: number; readonly oy: number; readonly radPerTick: number } | null;
  angle: number;
  /** Multi-hit window length in ticks (0 = no time limit). */
  readonly windowLength: number;
  windowLeft: number;
  /** Single-hit cooldown in ticks (0 = once per hunt). */
  readonly cooldownLength: number;
  cooldownLeft: number;
  done: boolean;
  readonly reward: SecretReward;
}

function shapeOf(s: NonNullable<Prop['occluder']>): OccluderShape {
  return s.type === 'rect'
    ? { type: 'rect', w: s.w, h: s.h }
    : { type: 'ellipse', rx: s.rx, ry: s.ry };
}

/** Every secret in the biome, in props order. */
export function buildSecrets(biome: Biome): Secret[] {
  const layers = new Map(biome.layers.map((l) => [l.id, l]));
  const out: Secret[] = [];
  for (const prop of biome.props) {
    const def = prop.secret;
    const layer = layers.get(prop.layer);
    if (def === undefined || layer === undefined) continue;
    const partDefs = def.type === 'multiHit' ? def.parts : [def.part];
    const rotor = def.type === 'multiHit' ? def.rotor : undefined;
    out.push({
      propId: prop.id,
      layerId: layer.id,
      scrollFactor: layer.scrollFactor,
      plane: layer.plane ?? null,
      x: prop.u * coreWidth(layer.scrollFactor),
      y: prop.y,
      parts: partDefs.map((p) => ({
        id: p.id,
        ox: p.shape.ox,
        oy: p.shape.oy,
        shape: shapeOf(p.shape),
        hit: false,
      })),
      rotor:
        rotor === undefined
          ? null
          : { ox: rotor.ox, oy: rotor.oy, radPerTick: degToRad(rotor.degPerSec) / 60 },
      angle: 0,
      windowLength:
        def.type === 'multiHit' && def.windowSeconds !== undefined
          ? secondsToTicks(def.windowSeconds)
          : 0,
      windowLeft: 0,
      cooldownLength:
        def.type === 'singleHit' && def.cooldownSeconds !== undefined
          ? secondsToTicks(def.cooldownSeconds)
          : 0,
      cooldownLeft: 0,
      done: false,
      reward: def.reward,
    });
  }
  return out;
}

/** A part's centre on its layer (rotor parts turn about the hub). */
export function partPosition(s: Secret, p: SecretPart): { x: number; y: number } {
  if (s.rotor === null) return { x: s.x + p.ox, y: s.y + p.oy };
  const c = cos(s.angle);
  const n = sin(s.angle);
  return {
    x: s.x + s.rotor.ox + p.ox * c - p.oy * n,
    y: s.y + s.rotor.oy + p.ox * n + p.oy * c,
  };
}

export const isReady = (s: Secret): boolean => !s.done && s.cooldownLeft === 0;

/** Parts that can be hit right now (unhit parts of a ready secret). */
export function activeParts(s: Secret): SecretPart[] {
  return isReady(s) ? s.parts.filter((p) => !p.hit) : [];
}

export type SecretTick = 'reset' | 'ready' | null;

/** Advances the rotor, the multi-hit window and the cooldown by one tick. */
export function tickSecret(s: Secret): SecretTick {
  if (s.rotor !== null) {
    s.angle += s.rotor.radPerTick;
    const full = 2 * Math.PI;
    if (s.angle >= full) s.angle -= full;
    else if (s.angle < 0) s.angle += full;
  }
  if (s.windowLeft > 0) {
    s.windowLeft--;
    if (s.windowLeft === 0) {
      for (const p of s.parts) p.hit = false;
      return 'reset';
    }
  }
  if (s.cooldownLeft > 0) {
    s.cooldownLeft--;
    if (s.cooldownLeft === 0) return 'ready';
  }
  return null;
}

export type PartHit =
  { readonly kind: 'progress'; readonly partsLeft: number } | { readonly kind: 'triggered' } | null;

/** Marks a part hit. Returns progress, the trigger, or null if the part can't be hit now. */
export function hitPart(s: Secret, partId: string): PartHit {
  if (!isReady(s)) return null;
  const part = s.parts.find((p) => p.id === partId);
  if (part === undefined || part.hit) return null;
  part.hit = true;
  const left = s.parts.filter((p) => !p.hit).length;
  if (left > 0) {
    // The window opens on the first mark.
    if (s.windowLength > 0 && s.windowLeft === 0) s.windowLeft = s.windowLength;
    return { kind: 'progress', partsLeft: left };
  }
  s.windowLeft = 0;
  if (s.cooldownLength > 0) {
    s.cooldownLeft = s.cooldownLength;
    for (const p of s.parts) p.hit = false;
  } else {
    s.done = true;
  }
  return { kind: 'triggered' };
}

export function secretView(s: Secret): SecretView {
  return {
    propId: s.propId,
    layerId: s.layerId,
    parts: s.parts.map((p) => ({ id: p.id, ...partPosition(s, p), hit: p.hit })),
    angle: s.angle,
    ready: isReady(s),
    done: s.done,
    windowTicks: s.windowLeft,
    cooldownTicks: s.cooldownLeft,
  };
}
