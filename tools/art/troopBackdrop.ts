// v1.8c (D-063, review round 1 item 11): a troop on its far ridge must never seem to sit ON
// something of the far veld in front of it — a farmhouse roof, a tractor, a tree. The ridge scrolls
// slower than the far veld, so over the camera sweep the troop lines up with a whole stretch of
// it: far x in [troop x0, troop x1 + CAMERA_RANGE × (far veld's scroll − ridge's scroll)]. Over that
// stretch the far veld's art (its top opaque row per column) and every prop on it must stay at
// least MARGIN px below the troop's lowest seat (where a baboon's feet are). Returns the clashes.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Biome, ContentBundle } from '../../src/content/schemas';
import { decodePng } from '../assets/image';
import { CAMERA_RANGE, coreWidth } from '../../src/sim/world';
import { ridgeLine } from './ridgeLine';

/** Px the far veld keeps below the troop's lowest seat. */
export const MARGIN = 12;

interface Box {
  readonly x0: number;
  readonly x1: number;
  readonly top: number;
  readonly what: string;
}

/** A far-veld prop's box (layer px) from its sprite (art-source/sprites, its master and origin). */
function propBox(root: string, p: Biome['props'][number], x: number): Box {
  const png = join(root, 'art-source', 'sprites', `${p.asset}.png`);
  const side = JSON.parse(readFileSync(png.replace(/\.png$/, '.json'), 'utf8')) as {
    master?: number;
    originX?: number;
    originY?: number;
  };
  const img = decodePng(readFileSync(png));
  const m = side.master ?? 1;
  const w = img.width / m;
  const h = img.height / m;
  const left = x - w * (side.originX ?? 0.5);
  return { x0: left, x1: left + w, top: p.y - h * (side.originY ?? 0.5), what: p.id };
}

export function troopBackdropIssues(
  content: ContentBundle,
  biome: Biome,
  root = process.cwd(),
  frontLayer = 'far_veld',
): string[] {
  const out: string[] = [];
  const front = biome.layers.find((l) => l.id === frontLayer);
  if (biome.baboons === undefined || front === undefined) return out;
  const skyline = ridgeLine(biome.id, frontLayer, root);
  const half = content.birds.baboons.hitboxes.sit.body.rx;
  for (const t of biome.baboons.troops) {
    const ridge = biome.layers.find((l) => l.id === t.layer);
    if (ridge === undefined) continue;
    const k = content.scoring.planes[t.plane].scale;
    const cx = t.u * coreWidth(ridge.scrollFactor);
    const x0 = cx + Math.min(...t.seats.map((s) => s.dx)) - half * k;
    const x1 = cx + Math.max(...t.seats.map((s) => s.dx)) + half * k;
    const feet = Math.max(...t.seats.map((s) => s.y));
    const from = x0;
    const to = x1 + CAMERA_RANGE * (front.scrollFactor - ridge.scrollFactor);
    for (let x = Math.floor(from); x <= Math.ceil(to); x += 2) {
      const y = skyline.at(x);
      if (y !== null && y < feet + MARGIN) {
        out.push(`${biome.id}/${t.id}: the ${frontLayer} art rises to y ${y} at x ${x}`);
        break;
      }
    }
    for (const p of biome.props.filter((q) => q.layer === frontLayer)) {
      const b = propBox(root, p, p.u * coreWidth(front.scrollFactor));
      if (b.x1 > from && b.x0 < to && b.top < feet + MARGIN)
        out.push(`${biome.id}/${t.id}: ${b.what} (top y ${Math.round(b.top)}) behind the troop`);
    }
  }
  return out;
}
