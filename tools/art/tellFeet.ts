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
