// v1.23.1 (D-083): a bird's true size beside the guineafowl (content birds.json sizeMul). The
// hitbox in content is in the guineafowl's units, like the art; sizeMul scales the body ellipse
// and the head circle (radii and offsets) the way the renderer scales the drawing, so the hit
// shapes stay on the art. Pure; the plane's scale and its minHitRadiusPx floor apply after this.
import type { Creature } from '../../content/schemas';
import type { Hitbox } from '../weapons/hitTest';

type WithHitbox = Extract<Creature, { hitbox: unknown }>;

/** The creature's size on top of its plane's scale (1 = the guineafowl's units). */
export const sizeMulOf = (c: Creature): number => ('sizeMul' in c ? (c.sizeMul ?? 1) : 1);

/** A hitbox scaled by k (radii and offsets). k = 1 returns it unchanged. */
export function scaleHitbox(h: Hitbox, k: number): Hitbox {
  if (k === 1) return h;
  const body = { rx: h.body.rx * k, ry: h.body.ry * k, ox: h.body.ox * k, oy: h.body.oy * k };
  return h.head === undefined
    ? { body }
    : { body, head: { r: h.head.r * k, ox: h.head.ox * k, oy: h.head.oy * k } };
}

/** The hit shapes as drawn: the content hitbox × sizeMul (at plane scale 1). */
export const birdHitbox = (c: WithHitbox): Hitbox => scaleHitbox(c.hitbox, sizeMulOf(c));

/**
 * Where a percher sits so its feet stay on the perch (content perchFeetOy): its home point
 * moves down by the feet's offset × the plane's scale × (1 − sizeMul).
 */
export function perchFeetShift(c: Creature, planeScale: number): number {
  const feet = 'perchFeetOy' in c ? (c.perchFeetOy ?? 0) : 0;
  return feet * planeScale * (1 - sizeMulOf(c));
}
