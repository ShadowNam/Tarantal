// v1.13 (D-075, lesson 18): nothing floats — every veld cameo walks on drawn ground. On each map with
// cameos, the plane layer a cameo walks (the mid plane at its front ground line, the near plane at
// nearGroundY) is opaque under its feet all along the panorama it may cross (within 2 px below the
// feet, ±4 px across), at every depth a herd member may stand.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { LAYER_BLEED_PX, coreWidth } from '../../src/sim/world';
import { loadContent } from '../testContent';

const content = loadContent();
const C = content.cameos;

const arts = new Map<string, { top: number; png: PNG }>();
function art(biome: string, layer: string): { top: number; png: PNG } {
  const key = `${biome}/${layer}`;
  const have = arts.get(key);
  if (have !== undefined) return have;
  const dir = join(process.cwd(), 'art-source', 'layers', biome);
  const meta = JSON.parse(readFileSync(join(dir, `${layer}.json`), 'utf8')) as { top: number };
  const got = { top: meta.top, png: PNG.sync.read(readFileSync(join(dir, `${layer}.png`))) };
  arts.set(key, got);
  return got;
}

/** True when the layer's art is opaque under (x, y): rows y+1 and y+2, x ± 4. */
function onGround(biome: string, layer: string, x: number, y: number): boolean {
  const a = art(biome, layer);
  for (const dy of [1, 2])
    for (let dx = -4; dx <= 4; dx += 2) {
      const px = Math.round(x + dx) + LAYER_BLEED_PX;
      const py = Math.round(y + dy) - a.top;
      if (px < 0 || py < 0 || px >= a.png.width || py >= a.png.height) return false;
      if ((a.png.data[(py * a.png.width + px) * 4 + 3] ?? 0) <= 128) return false;
    }
  return true;
}

describe('nothing floats: the veld cameos walk on drawn ground (D-075)', () => {
  for (const area of C.areas) {
    const biome = content.biomes.find((b) => b.id === area.biome);
    if (biome === undefined) continue;
    for (const kind of area.cameos) {
      if (kind === 'elephants') continue;
      const w = C.kinds[kind];
      it(`${area.biome}: ${kind} on the ${w.plane} plane`, () => {
        const layer = biome.layers.find((l) => l.plane === w.plane);
        if (layer === undefined) throw new Error(`no ${w.plane} layer`);
        const ground =
          w.plane === 'near'
            ? C.nearGroundY
            : (biome.lanes.mid?.groundY?.[1] ?? Number.NaN) + C.midGroundDy;
        const bad: string[] = [];
        for (const dy of w.depthPx === 0 ? [0] : [-w.depthPx, 0, w.depthPx])
          for (let x = 0; x <= coreWidth(layer.scrollFactor); x += 40)
            if (!onGround(area.biome, layer.id, x, ground + dy))
              bad.push(`x ${String(x)} dy ${String(dy)}`);
        expect(bad.slice(0, 5), `${String(bad.length)} points in the air`).toEqual([]);
      });
    }
  }
});
