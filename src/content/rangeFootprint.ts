// 24 Oct update (D-037, review): where each kind of Skietbaan target stands on a plane, as hit
// circles in design px at the range's camera start (x = the spot's dx from the screen centre):
// paper and plate at their radius, a standing bird as its body's rx. The mixed course's spots on
// different planes must not overlap, or a nearer target would hide (and take the shots of) a
// farther one. Pure; used by the content cross-refs and the range tests.
import type { ContentBundle } from './schemas';

export type RangePlane = 'near' | 'mid' | 'far' | 'ver';
export type StaticKind = 'paper' | 'plate' | 'stand';

export interface Circle {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

/** The hit circle of a static target of `kind` on `plane` at spot dx. */
export function targetCircle(
  content: ContentBundle,
  plane: RangePlane,
  kind: StaticKind,
  dx: number,
): Circle {
  const setup = content.modes.modes.range;
  const spot = setup.spots[plane];
  const scale = content.scoring.planes[plane].scale;
  if (kind === 'paper') return { x: dx, y: spot.paper[0]?.y ?? 0, r: setup.paperRadiusPx * scale };
  if (kind === 'plate') return { x: dx, y: spot.plate[0]?.y ?? 0, r: setup.plateRadiusPx * scale };
  const c = content.birds.creatures.find((x) => x.id === setup.creature);
  const body = c !== undefined && 'hitbox' in c ? c.hitbox.body : { rx: 0, ox: 0, oy: 0 };
  return { x: dx + body.ox * scale, y: spot.stand.y + body.oy * scale, r: body.rx * scale };
}

export const overlaps = (a: Circle, b: Circle): boolean =>
  Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r;

/** Pairs of mixed-course spots on different planes whose targets could overlap (any kinds). */
export function mixedOverlaps(content: ContentBundle): string[] {
  const m = content.modes.modes.range.mixed;
  const planes: RangePlane[] = ['near', 'mid', 'far', 'ver'];
  const out: string[] = [];
  for (let i = 0; i < planes.length; i++)
    for (let j = i + 1; j < planes.length; j++) {
      const a = planes[i];
      const b = planes[j];
      if (a === undefined || b === undefined) continue;
      for (const da of m.planes[a].dx)
        for (const db of m.planes[b].dx)
          for (const ka of m.statics)
            for (const kb of m.statics)
              if (overlaps(targetCircle(content, a, ka, da), targetCircle(content, b, kb, db)))
                out.push(`${a} ${ka} at dx ${String(da)} overlaps ${b} ${kb} at dx ${String(db)}`);
    }
  return out;
}
