// v1.7e (review R8): where each tell animal's feet land on its prop's art. A tell must stand on
// its prop: an opaque pixel at its feet or within FEET_DROP_PX below them.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ContentBundle } from '../../src/content/schemas';
import { readPng } from '../assets/image';

/** How far below the feet (prop px) the art may start (feet drawn just above a surface). */
export const FEET_DROP_PX = 4;

export interface TellFoot {
  readonly biome: string;
  readonly prop: string;
  readonly species: string;
  /** The first opaque pixel at or below the feet, in prop px (null: none within the drop). */
  readonly drop: number | null;
}

/** Every tell of every biome, with how far below its feet its prop's art starts. */
export function tellFeet(content: ContentBundle, root: string): TellFoot[] {
  const out: TellFoot[] = [];
  for (const b of content.biomes)
    for (const p of b.props) {
      const t = p.secret?.tell;
      if (t === undefined) continue;
      const png = join(root, 'art-source', 'sprites', `${p.asset}.png`);
      const side = JSON.parse(readFileSync(png.replace(/\.png$/, '.json'), 'utf8')) as {
        master?: number;
        originX?: number;
        originY?: number;
      };
      const img = readPng(png);
      const k = side.master ?? 1;
      const ox = (side.originX ?? 0.5) * img.width;
      const oy = (side.originY ?? 0.5) * img.height;
      let drop: number | null = null;
      for (let d = 0; d <= FEET_DROP_PX * k && drop === null; d++) {
        for (const dx of [-1, 0, 1]) {
          const x = Math.round(ox + t.ox * k) + dx;
          const y = Math.round(oy + t.oy * k) + d;
          if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
          if ((img.data[(y * img.width + x) * 4 + 3] ?? 0) > 128) {
            drop = d / k;
            break;
          }
        }
      }
      out.push({ biome: b.id, prop: p.id, species: t.species, drop });
    }
  return out;
}

/** v1.12 (polish b): lizards that lie flat on their rock — their whole length must be on it. The
 *  boulder crack's skink is left out: its crown is shorter than the skink, and it must stay clear
 *  of the crack it hints at, so its head reaches the rock's shoulder (noted in D-069). */
export const LYING_SPECIES: readonly string[] = ['rock_agama'];

export interface TellEnds {
  readonly biome: string;
  readonly prop: string;
  readonly species: string;
  /** How far above the feet line the prop's art starts at each end of the animal (prop px; ≥ 0:
   *  the art reaches up to the animal's line or higher there), null: no art in that column. */
  readonly head: number | null;
  readonly tail: number | null;
}

/**
 * v1.12 (polish b): for the lizards that lie flat, the prop's art at both ends of the animal (its
 * frame's drawn width at the species' scale, the head ahead of the feet, the tail behind them; a
 * left-facing tell mirrored). A tail past its rock's edge has no art at or above its line there.
 */
export function tellEnds(
  content: ContentBundle,
  root: string,
  boxes: Readonly<Record<string, { readonly w: number; readonly ox: number }>>,
): TellEnds[] {
  const out: TellEnds[] = [];
  for (const b of content.biomes)
    for (const p of b.props) {
      const t = p.secret?.tell;
      if (t === undefined || !LYING_SPECIES.includes(t.species)) continue;
      const box = boxes[t.species];
      if (box === undefined) continue;
      const scale = content.birds.tells.species.find((s) => s.id === t.species)?.scale ?? 1;
      const png = join(root, 'art-source', 'sprites', `${p.asset}.png`);
      const side = JSON.parse(readFileSync(png.replace(/\.png$/, '.json'), 'utf8')) as {
        master?: number;
        originX?: number;
        originY?: number;
      };
      const img = readPng(png);
      const k = side.master ?? 1;
      const ox = (side.originX ?? 0.5) * img.width;
      const oy = (side.originY ?? 0.5) * img.height;
      /** The art's top in the column at prop x, measured up from the feet line (null: none). */
      const above = (x: number): number | null => {
        const px = Math.round(ox + x * k);
        if (px < 0 || px >= img.width) return null;
        for (let y = 0; y < img.height; y++)
          if ((img.data[(y * img.width + px) * 4 + 3] ?? 0) > 128) return t.oy - (y - oy) / k;
        return null;
      };
      const f = t.facing ?? 1;
      // Frames face right: the head reaches w − ox ahead of the feet, the tail ox behind (4 px in).
      const ahead = (box.w - box.ox - 4) * scale;
      const behind = (box.ox - 4) * scale;
      out.push({
        biome: b.id,
        prop: p.id,
        species: t.species,
        head: above(t.ox + f * ahead),
        tail: above(t.ox - f * behind),
      });
    }
  return out;
}
