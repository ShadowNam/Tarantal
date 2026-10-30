// v1.8c (D-063): nothing floats on the Harvest's map. Every stand point — the workers beside the
// gap, the gap's posts, the warthogs' dig spots (mid and near), the baboon raid spots, the farmhouse
// and the tractor — has drawn, opaque ground under its feet in the layer's art (within 2 px below
// the feet, ±4 px across), so a sprite placed by its feet stands on the field, not in the air.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { LAYER_BLEED_PX, coreWidth } from '../../src/sim/world';
import { loadContent } from '../testContent';

const content = loadContent();
const biome = content.biomes.find((b) => b.id === content.modes.modes.harvest.biome);

interface LayerArt {
  readonly top: number;
  readonly png: PNG;
}

const arts = new Map<string, LayerArt>();
function art(layer: string): LayerArt {
  const have = arts.get(layer);
  if (have !== undefined) return have;
  const dir = join(process.cwd(), 'art-source', 'layers', biome?.id ?? '');
  const meta = JSON.parse(readFileSync(join(dir, `${layer}.json`), 'utf8')) as { top: number };
  const got = { top: meta.top, png: PNG.sync.read(readFileSync(join(dir, `${layer}.png`))) };
  arts.set(layer, got);
  return got;
}

/** True when the layer's art is opaque under (x, y): rows y+1 and y+2, x ± 4. */
function onGround(layer: string, x: number, y: number): boolean {
  const a = art(layer);
  for (const dy of [1, 2])
    for (let dx = -4; dx <= 4; dx += 2) {
      const px = Math.round(x + dx) + LAYER_BLEED_PX;
      const py = Math.round(y + dy) - a.top;
      if (px < 0 || py < 0 || px >= a.png.width || py >= a.png.height) return false;
      if ((a.png.data[(py * a.png.width + px) * 4 + 3] ?? 0) <= 128) return false;
    }
  return true;
}

describe('nothing floats on the Harvest map (D-063)', () => {
  it('every stand point has drawn ground under its feet', () => {
    const h = biome?.harvest;
    if (biome === undefined || h === undefined) throw new Error('no Harvest map');
    const w = (id: string): number => {
      const l = biome.layers.find((x) => x.id === id);
      if (l === undefined) throw new Error(`no layer ${id}`);
      return coreWidth(l.scrollFactor);
    };
    const gapX = h.gap.u * w(h.gap.layer);
    const points: { what: string; layer: string; x: number; y: number }[] = [
      ...h.workers.map((k, i) => ({
        what: `worker ${String(i)}`,
        layer: h.gap.layer,
        x: gapX + k.dx,
        y: k.y,
      })),
      ...[-160, 0, 160].map((dx) => ({
        what: `gap post ${String(dx)}`,
        layer: h.gap.layer,
        x: gapX + dx,
        y: h.gap.y,
      })),
      ...h.digSpots.map((d) => ({
        what: `dig spot ${d.layer} u ${String(d.u)}`,
        layer: d.layer,
        x: d.u * w(d.layer),
        y: d.y,
      })),
      ...(biome.baboons?.spots ?? []).map((s) => ({
        what: `raid spot ${s.id}`,
        layer: s.layer,
        x: (s.u ?? 0) * w(s.layer) + s.ox,
        y: s.y,
      })),
      ...biome.props
        .filter((p) => p.id === 'farmhouse' || p.id === 'tractor')
        .map((p) => ({ what: p.id, layer: p.layer, x: p.u * w(p.layer), y: p.y })),
    ];
    const floating = points.filter((p) => !onGround(p.layer, p.x, p.y)).map((p) => p.what);
    expect(floating).toEqual([]);
  });
});
