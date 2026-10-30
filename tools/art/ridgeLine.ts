// v1.8b (D-062): the far ridge's skyline (the top opaque row of each column of the layer's art),
// so a baboon troop's seats sit on the ridge: used to place the seats (`npx tsx
// tools/art/ridgeLine.ts`) and by tools/art/ridgeLine.test.ts to check every seat stays on it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { LAYER_BLEED_PX } from '../../src/sim/world';

export interface RidgeLine {
  /** Layer y of the skyline at layer x (null: no art in that column). */
  readonly at: (x: number) => number | null;
}

/** The skyline of a biome's layer art (art-source/layers/<biome>/<layer>.png). */
export function ridgeLine(biome: string, layer: string, root = process.cwd()): RidgeLine {
  const dir = join(root, 'art-source', 'layers', biome);
  const meta = JSON.parse(readFileSync(join(dir, `${layer}.json`), 'utf8')) as { top: number };
  const png = PNG.sync.read(readFileSync(join(dir, `${layer}.png`)));
  const tops: (number | null)[] = [];
  for (let x = 0; x < png.width; x++) {
    let y = 0;
    while (y < png.height && (png.data[(y * png.width + x) * 4 + 3] ?? 0) <= 128) y++;
    tops.push(y >= png.height ? null : y + meta.top);
  }
  return { at: (x) => tops[Math.round(x) + LAYER_BLEED_PX] ?? null };
}

/** Where a seat's feet go: the skyline's median over ±r px (a crest pixel never decides it). */
export function seatY(line: RidgeLine, x: number, r = 8): number | null {
  const ys: number[] = [];
  for (let d = -r; d <= r; d++) {
    const y = line.at(x + d);
    if (y !== null) ys.push(y);
  }
  if (ys.length === 0) return null;
  ys.sort((a, b) => a - b);
  return ys[Math.floor(ys.length / 2)] ?? null;
}
