// v1.1 (D-032, GDD §17.1): each gun's look on screen — its ammo on the HUD and its crosshair —
// worked out from feel.json `guns` and the weapon's own numbers (spreadPx, the Kettie's drop).
// Pure and Phaser-free: HudScene and CrosshairView only place what this returns, so adding a
// gun's look (the .22, the Langloop) is data, not code.
import type {
  AmmoDisplay,
  AmmoType,
  Crosshair,
  CrosshairPart,
  GunLook,
  Weapon,
} from '../../content/schemas';
import type { WeaponView } from '../../sim/types';

/** Full and spent texture keys of an ammo type. */
export function ammoKeys(type: string): { full: string; spent: string } {
  return { full: `ui/ammo/${type}`, spent: `ui/ammo/${type}_spent` };
}

export interface GunLookFor {
  readonly ammo: AmmoDisplay;
  readonly type: AmmoType;
  readonly typeId: string;
  readonly crosshair: Crosshair;
}

/** The look for a weapon id; an unknown id (content validation forbids it) gets the first. */
export function gunLookFor(guns: GunLook, weaponId: string): GunLookFor {
  const entry = guns.weapons[weaponId] ?? Object.values(guns.weapons)[0];
  if (entry === undefined) throw new Error('feel.json guns.weapons is empty');
  const type = guns.ammo[entry.ammo.type];
  if (type === undefined) throw new Error(`ammo type ${entry.ammo.type} missing`);
  return { ammo: entry.ammo, type, typeId: entry.ammo.type, crosshair: entry.crosshair };
}

/** Problems with feel.json `guns` against content/weapons.json (content:validate). */
export function checkGunLook(guns: GunLook, weapons: readonly Weapon[]): string[] {
  const errors: string[] = [];
  if (guns.crosshairStyles[guns.crosshairStyle] === undefined)
    errors.push(`guns.crosshairStyle: no style "${guns.crosshairStyle}"`);
  for (const w of weapons) {
    const look = guns.weapons[w.id];
    if (look === undefined) {
      errors.push(`guns.weapons: no look for weapon "${w.id}"`);
      continue;
    }
    if (guns.ammo[look.ammo.type] === undefined)
      errors.push(`guns.weapons.${w.id}: no ammo type "${look.ammo.type}"`);
    const rounds = roundsOf(w);
    if (look.ammo.layout === 'belt' && rounds === null)
      errors.push(`guns.weapons.${w.id}: a belt needs a magazine or crate shots`);
    if (look.ammo.layout === 'pile' && rounds !== null)
      errors.push(`guns.weapons.${w.id}: a pile is for unlimited ammo`);
    if (look.ammo.layout === 'hopper' && (w.kind !== 'crate' || w.durationMs === undefined))
      errors.push(`guns.weapons.${w.id}: a hopper is for a timed crate weapon`);
    for (const p of look.crosshair.parts) {
      const usesSpread =
        (p.shape === 'ring' && p.r === 'spread') || (p.shape === 'ticks' && p.at === 'spread');
      if (usesSpread && w.spreadPx <= 0)
        errors.push(`guns.weapons.${w.id}: "spread" ring on a weapon with spreadPx 0`);
      if (p.shape === 'drop' && (w.kind !== 'primary' || w.projectile === null))
        errors.push(`guns.weapons.${w.id}: a drop line needs a projectile`);
    }
  }
  const known = new Set(weapons.map((w) => w.id));
  for (const id of Object.keys(guns.weapons))
    if (!known.has(id)) errors.push(`guns.weapons.${id}: no such weapon in weapons.json`);
  return errors;
}

/** Rounds a full belt holds (primary magazine or crate shots); null = unlimited or timed. */
export function roundsOf(w: Weapon): number | null {
  if (w.kind === 'primary') return w.magazine > 0 ? w.magazine : null;
  return w.shots ?? null;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** One ammo image on the HUD: centre position, texture, alpha, and (hopper) the fraction of the
 *  full texture's height shown from the bottom up (1 = all of it). */
export interface AmmoSlot {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly alpha: number;
  readonly fill: number;
}

export type AmmoState = Pick<
  WeaponView,
  | 'shells'
  | 'magazine'
  | 'reloading'
  | 'reloadProgress'
  | 'perShellReload'
  | 'cooldownTicks'
  | 'ticksLeft'
  | 'totalTicks'
>;

/**
 * The ammo images for the weapon state, inside the belt rect (right-aligned, so the rounds sit
 * next to the screen edge whatever the gun). Belt: one round per magazine slot, the loaded ones
 * on the left (the next to fire is the rightmost loaded one); a fired round shows its spent
 * texture or leaves the slot empty; a per-shell reload fades the next round in. Pile: `count`
 * rounds stacked 3-2-1…, the top one gone while the next draw is not ready. Hopper: the full
 * texture cropped to the time left, over the empty one.
 */
export function ammoSlots(
  display: AmmoDisplay,
  type: AmmoType,
  typeId: string,
  w: AmmoState,
  rect: Rect,
): AmmoSlot[] {
  const keys = ammoKeys(typeId);
  const cy = rect.y + rect.h / 2;
  const pad = 20;
  if (display.layout === 'hopper') {
    const frac =
      w.ticksLeft !== null && w.totalTicks !== null && w.totalTicks > 0
        ? Math.max(0, Math.min(1, w.ticksLeft / w.totalTicks))
        : 1;
    // Only the fill band empties: the level sits `frac` of the way up it.
    const [top, bottom] = type.fillBand ?? [0, 1];
    const shown = 1 - bottom + (bottom - top) * frac;
    const x = rect.x + rect.w - pad - type.width / 2;
    return [
      { key: keys.spent, x, y: cy, alpha: 1, fill: 1 },
      { key: keys.full, x, y: cy, alpha: 1, fill: frac >= 1 ? 1 : shown },
    ];
  }
  if (display.layout === 'pile') {
    const out: AmmoSlot[] = [];
    // Rows of 3, 2, 1 from the bottom, each centred over the one below; the top stone (the
    // last one placed) is in the pouch while the band is drawn.
    const rows = pileRows(display.count);
    const widest = Math.max(...rows);
    const cx = rect.x + rect.w - pad - ((widest - 1) * type.pitch + type.width) / 2;
    const rowH = type.height * 0.62;
    const baseY = cy + ((rows.length - 1) * rowH) / 2;
    const ready = w.cooldownTicks === 0;
    let placed = 0;
    rows.forEach((n, row) => {
      for (let k = 0; k < n; k++) {
        placed++;
        if (placed === display.count && !ready) continue;
        const x = cx + (k - (n - 1) / 2) * type.pitch;
        out.push({ key: keys.full, x, y: baseY - row * rowH, alpha: 1, fill: 1 });
      }
    });
    return out;
  }
  const n = Math.max(0, w.magazine);
  const loaded = w.shells < 0 ? n : Math.min(n, w.shells);
  const loading = w.reloading && w.perShellReload && w.shells >= 0 ? w.shells : -1;
  const out: AmmoSlot[] = [];
  const right = rect.x + rect.w - pad - type.width / 2;
  for (let i = 0; i < n; i++) {
    const x = right - (n - 1 - i) * type.pitch;
    if (i < loaded) out.push({ key: keys.full, x, y: cy, alpha: 1, fill: 1 });
    else if (i === loading)
      out.push({ key: keys.full, x, y: cy, alpha: 0.35 + 0.65 * w.reloadProgress, fill: 1 });
    else if (type.spent === 'sprite') out.push({ key: keys.spent, x, y: cy, alpha: 1, fill: 1 });
  }
  return out;
}

/** Pile rows from the bottom: 3, 2, 1, 3, … (the last row takes what is left). */
export function pileRows(count: number): number[] {
  const rows: number[] = [];
  let left = count;
  let width = 3;
  while (left > 0) {
    const n = Math.min(width, left);
    rows.push(n);
    left -= n;
    width = width > 1 ? width - 1 : 3;
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------
// Crosshair geometry

/** A stroked path (open or closed) or a filled dot, in px around the aim point; `w` = width
 *  multiplier of the style's lineWidth. */
export type CrosshairPrim =
  | {
      readonly kind: 'path';
      readonly pts: readonly (readonly [number, number])[];
      readonly closed: boolean;
      readonly w: number;
    }
  | { readonly kind: 'dot'; readonly r: number };

/** The numbers a crosshair can take from its weapon. */
export interface CrosshairWeapon {
  readonly spreadPx: number;
  /** Kettie: drop in px at the near, mid and far bands (null = no projectile). */
  readonly dropPx: readonly number[] | null;
}

export function crosshairWeapon(w: Weapon | undefined): CrosshairWeapon {
  if (w === undefined) return { spreadPx: 0, dropPx: null };
  const p = w.kind === 'primary' ? w.projectile : null;
  return {
    spreadPx: w.spreadPx,
    dropPx: p === null ? null : [p.dropPx.near, p.dropPx.mid, p.dropPx.far],
  };
}

const RING_POINTS = 72;

/** Fixed, low-frequency unevenness round the ring (−1…1): a hand-cut wobble, not noise. */
function roughAt(k: number): number {
  const a = (k / RING_POINTS) * Math.PI * 2;
  return (Math.sin(3 * a + 1.1) + 0.6 * Math.sin(7 * a + 2.3) + 0.3 * Math.sin(13 * a + 0.4)) / 1.9;
}

function radiusOf(r: number | 'spread', scale: number, wpn: CrosshairWeapon): number {
  return r === 'spread' ? wpn.spreadPx * scale : r;
}

/** A crosshair's paths and dots for a weapon. */
export function crosshairPrims(xh: Crosshair, wpn: CrosshairWeapon): CrosshairPrim[] {
  const out: CrosshairPrim[] = [];
  for (const p of xh.parts) out.push(...partPrims(p, wpn));
  return out;
}

function partPrims(p: CrosshairPart, wpn: CrosshairWeapon): CrosshairPrim[] {
  switch (p.shape) {
    case 'ring': {
      const r = radiusOf(p.r, p.scale, wpn);
      if (r <= 0) return [];
      const pt = (k: number): [number, number] => {
        const a = (k / RING_POINTS) * Math.PI * 2;
        const rr = r * (1 + p.rough * 0.08 * roughAt(k));
        return [Math.cos(a) * rr, Math.sin(a) * rr];
      };
      if (p.gaps === 0) {
        const pts: [number, number][] = [];
        for (let k = 0; k < RING_POINTS; k++) pts.push(pt(k));
        return [{ kind: 'path', pts, closed: true, w: p.width }];
      }
      // `gaps` breaks, each a fifth of a segment: arcs between them.
      const per = RING_POINTS / p.gaps;
      const out: CrosshairPrim[] = [];
      for (let g = 0; g < p.gaps; g++) {
        const pts: [number, number][] = [];
        const from = Math.round(g * per + per * 0.1);
        const to = Math.round((g + 1) * per - per * 0.1);
        for (let k = from; k <= to; k++) pts.push(pt(k));
        out.push({ kind: 'path', pts, closed: false, w: p.width });
      }
      return out;
    }
    case 'dot':
      return [{ kind: 'dot', r: p.r }];
    case 'ticks': {
      const r = radiusOf(p.at, 1, wpn);
      const out: CrosshairPrim[] = [];
      for (let k = 0; k < p.count; k++) {
        const a = (k / p.count) * Math.PI * 2 - Math.PI / 2;
        const c = Math.cos(a);
        const s = Math.sin(a);
        out.push({
          kind: 'path',
          pts: [
            [c * (r + p.inner), s * (r + p.inner)],
            [c * (r + p.outer), s * (r + p.outer)],
          ],
          closed: false,
          w: p.width,
        });
      }
      return out;
    }
    case 'cross': {
      const seg = (x0: number, y0: number, x1: number, y1: number): CrosshairPrim => ({
        kind: 'path',
        pts: [
          [x0, y0],
          [x1, y1],
        ],
        closed: false,
        w: p.width,
      });
      const a = p.gap;
      const b = p.gap + p.len;
      return [seg(-b, 0, -a, 0), seg(a, 0, b, 0), seg(0, -b, 0, -a), seg(0, a, 0, b)];
    }
    case 'vee':
      return [
        {
          kind: 'path',
          pts: [
            [-p.size * 0.6, -p.size],
            [0, 0],
            [p.size * 0.6, -p.size],
          ],
          closed: false,
          w: p.width,
        },
      ];
    case 'drop': {
      const drops = wpn.dropPx ?? [];
      const far = Math.max(0, ...drops);
      if (far <= 0) return [];
      const out: CrosshairPrim[] = [
        {
          kind: 'path',
          pts: [
            [0, 0],
            [0, far],
          ],
          closed: false,
          w: p.width,
        },
      ];
      // A mark at each band's drop (skipping ones too close to the point to read).
      for (const d of drops) {
        if (d < p.mark * 0.8) continue;
        out.push({
          kind: 'path',
          pts: [
            [-p.mark / 2, d],
            [p.mark / 2, d],
          ],
          closed: false,
          w: p.width,
        });
      }
      return out;
    }
  }
}

/** Half the width and height the crosshair covers (for tests and hit-free placement). */
export function crosshairExtent(prims: readonly CrosshairPrim[]): number {
  let m = 0;
  for (const p of prims) {
    if (p.kind === 'dot') m = Math.max(m, p.r);
    else for (const [x, y] of p.pts) m = Math.max(m, Math.abs(x), Math.abs(y));
  }
  return m;
}
