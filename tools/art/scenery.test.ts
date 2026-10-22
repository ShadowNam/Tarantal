// D-031: graphics pass 2 interim art keeps the game's geometry. Flyers stay inside the bird frame
// box and sit on their content/birds.json body hitbox; every shared sprite and prop is drawn at
// its placeholder's size and origin (the windpomp's wider frame keeps the tower on the occluder);
// layers are the delivered width; the same input renders the same pixels.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { BirdClip } from '../../src/game/assets/assetIndex';
import {
  createPlaceholderManifest,
  loadBiomeArt,
} from '../../src/game/placeholder/ProceduralAssetFactory';
import { coreWidth, LAYER_BLEED_PX } from '../../src/sim/world';
import { BIRD_BOX } from '../assets/targets';
import { loadContent } from '../testContent';
import { BIOME_PLANS } from './biomes';
import { loadArtConfig } from './config';
import { FLYER_FRAMES, FLYERS, renderFlyerFrame } from './flyers';
import { propBox, renderLayer, renderProp } from './landscape';
import { renderSprite, SPRITES } from './sprites';

const cfg = loadArtConfig();
const content = loadContent();
type Img = { width: number; height: number; data: Uint8Array };

function edgeAlpha(img: Img): number {
  let max = 0;
  for (let x = 0; x < img.width; x++)
    for (const y of [0, img.height - 1])
      max = Math.max(max, img.data[(y * img.width + x) * 4 + 3] ?? 0);
  for (let y = 0; y < img.height; y++)
    for (const x of [0, img.width - 1])
      max = Math.max(max, img.data[(y * img.width + x) * 4 + 3] ?? 0);
  return max;
}

/** Share of the body hitbox's inner 70 % covered by opaque pixels. */
function bodyCover(img: Img, rx: number, ry: number): number {
  const k = img.width / BIRD_BOX.width;
  let n = 0;
  let hit = 0;
  for (let py = 0; py < img.height; py += 2)
    for (let px = 0; px < img.width; px += 2) {
      const x = px / k - BIRD_BOX.originX;
      const y = py / k - BIRD_BOX.originY;
      if ((x / rx) ** 2 + (y / ry) ** 2 > 0.7) continue;
      n++;
      if ((img.data[(py * img.width + px) * 4 + 3] ?? 0) > 128) hit++;
    }
  return n === 0 ? 0 : hit / n;
}

/** The thin biplane and the slim, tilted kwêvoël fill less of their ellipse than a round bird. */
const MIN_COVER: Readonly<Record<string, number>> = { sproeier: 0.6, kwevoel: 0.7 };

describe('interim flyers fit the bird box and their hitbox (D-031)', () => {
  for (const [creature, planes] of Object.entries(FLYERS)) {
    it(
      creature,
      () => {
        const c = content.birds.creatures.find((x) => x.id === creature);
        const hb = c !== undefined && 'hitbox' in c ? c.hitbox.body : undefined;
        expect(hb, `${creature} has a body hitbox`).toBeDefined();
        for (const [plane, clips] of Object.entries(planes) as [
          'near' | 'mid' | 'far',
          readonly BirdClip[],
        ][])
          for (const clip of clips)
            for (let k = 0; k < (FLYER_FRAMES[clip] ?? 1); k++) {
              const img = renderFlyerFrame(cfg, content, creature, plane, clip, k);
              expect(edgeAlpha(img), `${plane} ${clip}/${k} touches the frame edge`).toBe(0);
              if (clip === 'hit_poof' || hb === undefined) continue;
              expect(bodyCover(img, hb.rx, hb.ry), `${plane} ${clip}/${k} body`).toBeGreaterThan(
                MIN_COVER[creature] ?? 0.85,
              );
            }
      },
      60_000,
    );
  }
});

describe('interim sprites and props keep the placeholder geometry (D-031)', () => {
  it('shared sprites: placeholder size, deterministic', async () => {
    const home = content.biomes.find((b) => b.id === content.modes.modes.classic.biome);
    if (home === undefined) throw new Error('no home biome');
    expect(await loadBiomeArt(home.id)).toBe(true);
    const m = createPlaceholderManifest(content, home);
    for (const spec of SPRITES) {
      const size = m.size(spec.key);
      expect(size, spec.key).not.toBeNull();
      if (size === null) continue;
      const a = renderSprite(cfg, spec, size, m.origin(spec.key));
      expect([a.width, a.height], spec.key).toEqual([size.width, size.height]);
      if (spec.key === 'ui/reticle') {
        const b = renderSprite(cfg, spec, size, m.origin(spec.key));
        expect(createHash('sha1').update(b.data).digest('hex')).toBe(
          createHash('sha1').update(a.data).digest('hex'),
        );
      }
    }
  }, 60_000);

  for (const plan of BIOME_PLANS) {
    it(`${plan.biome}: props at placeholder size, occluder inside the art`, async () => {
      const biome = content.biomes.find((b) => b.id === plan.biome);
      if (biome === undefined) throw new Error(plan.biome);
      expect(await loadBiomeArt(biome.id)).toBe(true);
      const m = createPlaceholderManifest(content, biome);
      for (const prop of biome.props) {
        const size = m.size(prop.asset);
        if (size === null) throw new Error(prop.asset);
        const r = renderProp(cfg, plan, biome, prop, size, m.origin(prop.asset));
        const frame = plan.props[prop.asset]?.frame;
        if (frame === undefined) {
          expect([r.img.width, r.img.height], prop.asset).toEqual([size.width, size.height]);
          const o = m.origin(prop.asset);
          expect([r.originX, r.originY]).toEqual([o.x, o.y]);
        }
        // The occluder box lies inside the texture (what you see is what blocks pellets).
        const box = propBox(prop);
        const ox = r.originX * r.img.width;
        const oy = r.originY * r.img.height;
        expect(ox + box.ox - box.w / 2, `${prop.asset} left`).toBeGreaterThanOrEqual(0);
        expect(ox + box.ox + box.w / 2, `${prop.asset} right`).toBeLessThanOrEqual(r.img.width);
        expect(oy + box.oy - box.h / 2, `${prop.asset} top`).toBeGreaterThanOrEqual(0);
        expect(oy + box.oy + box.h / 2, `${prop.asset} bottom`).toBeLessThanOrEqual(r.img.height);
      }
    }, 120_000);

    it(`${plan.biome}: every layer at the delivered width and its plan's band`, () => {
      const biome = content.biomes.find((b) => b.id === plan.biome);
      if (biome === undefined) throw new Error(plan.biome);
      for (const layer of biome.layers) {
        const img = renderLayer(cfg, plan, layer);
        expect(img.width, layer.id).toBe(coreWidth(layer.scrollFactor) + LAYER_BLEED_PX * 2);
        expect(img.height, layer.id).toBe(plan.layers[layer.id]?.height);
      }
    }, 120_000);
  }
});
