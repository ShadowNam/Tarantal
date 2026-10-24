// v1.3x (D-037) Skietbaan choices: every gun (locked ones too; a rifle once per sight), the
// distances and targets, and how a choice becomes the range's mode. Pure.
import type { ContentBundle } from '../../content/schemas';
import { layoutForDay } from '../../meta/maps';
import type { ModeConfig, PlaneId, RangeTarget } from '../../sim/types';

export const RANGE_PLANES: readonly PlaneId[] = ['near', 'mid', 'far', 'ver'];
export const RANGE_TARGETS: readonly RangeTarget[] = ['paper', 'stand', 'flyover', 'flock'];

/** A gun as the range offers it. */
export interface RangeGun {
  /** Stats key: the weapon id, with the sight for rifles (`twee_twee:scope_small`). */
  readonly id: string;
  readonly weapon: string;
  readonly sight: string | null;
  readonly crate: boolean;
  /** Pellets per shot (shotguns show pellets on target per shot). */
  readonly pellets: number;
  /** Reaches the Ver plane (rifles). */
  readonly reachesVer: boolean;
}

/** Primaries in content order (a rifle once per sight it fits), then the crate guns. */
export function rangeGuns(content: ContentBundle): RangeGun[] {
  const out: RangeGun[] = [];
  const all = content.weapons.weapons;
  for (const w of all) {
    if (w.kind !== 'primary') continue;
    const base = {
      weapon: w.id,
      crate: false,
      pellets: w.pellets,
      reachesVer: w.reachesVer === true,
    };
    if (w.aim === undefined) out.push({ ...base, id: w.id, sight: null });
    else for (const s of w.aim.sights) out.push({ ...base, id: `${w.id}:${s}`, sight: s });
  }
  for (const w of all) {
    if (w.kind !== 'crate') continue;
    out.push({
      id: w.id,
      weapon: w.id,
      sight: null,
      crate: true,
      pellets: w.pellets,
      // Crate guns are shotguns and a mielie gun: they fall short of Ver, as in a hunt.
      reachesVer: false,
    });
  }
  return out;
}

/** A gun reaches a distance (only rifles reach Ver, as in a hunt). */
export function reaches(gun: RangeGun, plane: PlaneId): boolean {
  return plane !== 'ver' || gun.reachesVer;
}

export interface RangeChoice {
  readonly gun: string;
  readonly biome: string;
  readonly plane: PlaneId;
  readonly target: RangeTarget;
}

/** The setup page's first choice: modes.json range (its gun, Karoo), near, the paper target. */
export function defaultChoice(content: ContentBundle): RangeChoice {
  const r = content.modes.modes.range;
  return { gun: r.weapon, biome: r.biome, plane: 'near', target: 'paper' };
}

/** The range's mode for a choice: today's weekday light; a crate gun over the range's primary. */
export function rangeMode(content: ContentBundle, choice: RangeChoice, day: number): ModeConfig {
  const gun = rangeGuns(content).find((g) => g.id === choice.gun);
  if (gun === undefined) throw new Error(`no range gun ${choice.gun}`);
  const primary = gun.crate ? content.modes.modes.range.weapon : gun.weapon;
  return {
    id: 'range',
    biome: choice.biome,
    weapon: primary,
    layout: layoutForDay(day),
    ...(gun.sight === null ? {} : { sight: gun.sight }),
    range: {
      plane: choice.plane,
      target: choice.target,
      ...(gun.crate ? { crate: gun.weapon } : {}),
    },
  };
}

/** The guineafowl's body width at a distance (design px): groups are compared with it. */
export function bodyWidthPx(content: ContentBundle, plane: PlaneId): number {
  const c = content.birds.creatures.find((x) => x.id === content.modes.modes.range.creature);
  if (c === undefined || c.kind === 'helper') return 0;
  return 2 * c.hitbox.body.rx * content.scoring.planes[plane].scale;
}
