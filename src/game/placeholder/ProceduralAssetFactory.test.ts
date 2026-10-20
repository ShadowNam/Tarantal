import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import en from '../../i18n/en.json';
import af from '../../i18n/af.json';
import { coreWidth, LAYER_BLEED_PX } from '../../sim/world';
import { birdKey, MAX_TILE_WIDTH, TEX } from '../assets/AssetManifest';
import { createPlaceholderManifest } from './ProceduralAssetFactory';

const content = loadContent();
const biome = content.biomes.find((b) => b.id === content.modes.modes.classic.biome);
if (!biome) throw new Error('classic biome missing');
const m = createPlaceholderManifest(content, biome);

describe('placeholder manifest', () => {
  it('cuts every parallax layer into tiles ≤ 2048 px covering core width + bleed', () => {
    for (const layer of biome.layers) {
      const art = m.layer(layer.asset);
      expect(art, layer.id).toBeDefined();
      if (!art) continue;
      expect(art.tileWidth / art.scale).toBeLessThanOrEqual(MAX_TILE_WIDTH);
      expect(art.left).toBe(-LAYER_BLEED_PX);
      expect(art.tiles.length * art.tileWidth).toBeGreaterThanOrEqual(
        coreWidth(layer.scrollFactor) + 2 * LAYER_BLEED_PX,
      );
    }
  });

  it('has art for every bird the biome can spawn, on each of its planes', () => {
    for (const c of content.birds.creatures) {
      if (c.kind === 'helper' || (c.biomes && !c.biomes.includes(biome.id))) continue;
      for (const plane of c.planes) {
        for (const frame of ['up', 'down', 'stand'] as const) {
          expect(m.has(m.bird(c.id, plane, frame)), `${c.id}/${plane}/${frame}`).toBe(true);
        }
      }
    }
    // Unknown creatures fall back to the plain tarentaal.
    expect(m.bird('nobody', 'mid', 'up')).toBe(birdKey('tarentaal', 'mid', 'up'));
  });

  it('draws every bird so its whole hitbox is inside the texture (what you see is what you hit)', () => {
    for (const c of content.birds.creatures) {
      if (c.kind === 'helper') continue;
      for (const plane of c.planes) {
        const key = m.bird(c.id, plane, 'up');
        if (!key.startsWith(`bird/${c.id}/`)) continue;
        const o = m.origin(key);
        const spec = (
          m as unknown as { specs: Map<string, { width: number; height: number }> }
        ).specs.get(key);
        if (!spec) throw new Error(key);
        const s = content.scoring.planes[plane].scale;
        const ox = o.x * spec.width;
        const oy = o.y * spec.height;
        const { body, head } = c.hitbox;
        const parts = [
          { x: body.ox, y: body.oy, rx: body.rx, ry: body.ry },
          ...(head ? [{ x: head.ox, y: head.oy, rx: head.r, ry: head.r }] : []),
        ];
        for (const p of parts) {
          for (const facing of [1, -1]) {
            const cx = ox + p.x * s * facing;
            expect(cx - p.rx * s, `${key} left`).toBeGreaterThanOrEqual(0);
            expect(cx + p.rx * s, `${key} right`).toBeLessThanOrEqual(spec.width);
          }
          expect(oy + (p.y - p.ry) * s, `${key} top`).toBeGreaterThanOrEqual(0);
          expect(oy + (p.y + p.ry) * s, `${key} bottom`).toBeLessThanOrEqual(spec.height);
        }
      }
    }
  });

  it('has every prop, UI and FX texture', () => {
    for (const p of biome.props) expect(m.has(p.asset), p.asset).toBe(true);
    for (const key of Object.values(TEX)) expect(m.has(key), key).toBe(true);
  });
});

describe('i18n for M2', () => {
  it('every rank id has a title in every language', () => {
    for (const r of content.scoring.ranks) {
      expect(Object.hasOwn(en, `rank.${r.id}`), r.id).toBe(true);
      expect(Object.hasOwn(af, `rank.${r.id}`), r.id).toBe(true);
    }
  });
  it('af has every M2 HUD, start, FX, tally and rank string', () => {
    const m2 = Object.keys(en).filter((k) => /^(start|hud|fx|tally|rank)\./.test(k));
    expect(m2.length).toBeGreaterThan(20);
    for (const k of m2) expect(Object.hasOwn(af, k), k).toBe(true);
  });
});
