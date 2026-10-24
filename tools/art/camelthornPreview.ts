// v1.4 B (D-039) close-up previews of the camelthorn and the family nest, straight from the art
// code (no browser): docs/art-preview/compare/v14-camelthorn-*.png. Full colour PNG, at 1:1 with
// the 2× textures (1 px = 1 texture px). Run: npx tsx tools/art/camelthornPreview.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { blank, crop, encodePng, resize, type Rgba } from '../assets/image';
import { loadContent } from '../testContent';
import {
  createPlaceholderManifest,
  loadBiomeArt,
} from '../../src/game/placeholder/ProceduralAssetFactory';
import { BIOME_PLANS } from './biomes';
import { loadArtConfig } from './config';
import { renderLoose, renderProp } from './landscape';
import { composeScene, over } from './scenePreview';
import { planeCentreX } from '../../src/sim/camera';
import { camelthornLook, camelthornSpec, camelthornTree } from './camelthorn';
import { mix } from './scenery';

const OUT = join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'compare');
const cfg = loadArtConfig();
const content = loadContent();
const biome = content.biomes.find((b) => b.id === 'kalahari-summer');
const plan = BIOME_PLANS.find((p) => p.biome === 'kalahari-summer');
if (biome === undefined || plan === undefined) throw new Error('no kalahari');
await loadBiomeArt(biome.id);
const m = createPlaceholderManifest(content, biome);

/** A sky gradient with a strip of red sand from `ground` down. */
function backdrop(w: number, h: number, ground: number): Rgba {
  const img = blank(w, h);
  const hex = (s: string): number[] => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  for (let y = 0; y < h; y++) {
    const t = y / h;
    const c =
      y >= ground
        ? hex(mix('#D9824C', '#C8643A', (y - ground) / Math.max(1, h - ground)))
        : hex(mix('#7FB2DA', '#EBD7B8', Math.min(1, t * 1.15)));
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      img.data[i] = c[0] ?? 0;
      img.data[i + 1] = c[1] ?? 0;
      img.data[i + 2] = c[2] ?? 0;
      img.data[i + 3] = 255;
    }
  }
  return img;
}

function save(name: string, img: Rgba): void {
  mkdirSync(OUT, { recursive: true });
  const path = join(OUT, `v14-camelthorn-${name}.png`);
  writeFileSync(path, encodePng(img));
  console.log(`${path} (${img.width}×${img.height})`);
}

// 1. The tree with the nest, alone on sky, at 1:1 with its 2× texture.
for (const key of ['kalahari/weaver_camelthorn', 'kalahari/dead_camelthorn']) {
  const prop = biome.props.find((p) => p.asset === key);
  const size = m.size(key);
  if (prop === undefined || size === null) throw new Error(key);
  const r = renderProp(cfg, plan, biome, prop, size, m.origin(key));
  const footY = Math.round(
    r.img.height * r.originY + (key.endsWith('weaver_camelthorn') ? 530 : 470),
  );
  const bg = backdrop(r.img.width, r.img.height, Math.min(r.img.height - 1, footY));
  over(bg, r.img, 0, 0);
  const name = key.endsWith('weaver_camelthorn') ? 'nest-tree' : 'dead';
  save(name, bg);
  if (name === 'nest-tree') {
    // The nest itself, cropped at 1:1 (texture px).
    const cx = Math.round(r.img.width / 2);
    const cy = Math.round(r.img.height * r.originY + -78 * r.master);
    save('nest-closeup', crop(bg, cx - 360, cy - 210, 720, 420));
  }
}

// 2. The plain variants (young, mature umbrella, old half-dead), side by side at 2×.
const look = (c: (n: string) => string, pen: { ink: string; w: number }) => camelthornLook(c, pen);
const W = 3300;
const H = 1060;
const FOOT = 940;
const row = backdrop(W, H, FOOT);
const variants = [
  { kind: 'young', x: 330, k: 1 },
  { kind: 'mature', x: 1250, k: 1 },
  { kind: 'old', x: 2560, k: 1 },
] as const;
for (const v of variants) {
  const frame = { w: 640, h: 440, ox: 320, oy: 390 };
  const img = renderLoose(
    cfg,
    'kalahari-summer',
    'mid',
    `camelthorn/${v.kind}`,
    frame,
    2,
    (ctx) =>
      camelthornTree(
        ctx.rnd,
        camelthornSpec(v.kind, 0, 0, v.k, v.kind === 'old' ? -8 : 10),
        look(ctx.c, ctx.pen),
        ctx.pen,
      ).svg,
  );
  over(row, img, v.x - frame.ox * 2, FOOT - frame.oy * 2 + 10);
}
save('variants', row);

// 3. The nest tree on the near plane of a Kalahari hunt (composed from the delivered layers, the
// way ParallaxView places them), at the desktop (1920) and Pixel 7 landscape (≈2398) design
// widths, plus a 1:1 crop of the 2× texture as a high-DPI screen shows it.
{
  const prop = biome.props.find((p) => p.asset === 'kalahari/weaver_camelthorn');
  const size = m.size('kalahari/weaver_camelthorn');
  if (prop === undefined || size === null) throw new Error('weaver');
  const r = renderProp(cfg, plan, biome, prop, size, m.origin(prop.asset));
  const half = resize(r.img, r.img.width / 2, r.img.height / 2);
  const cx = 2300;
  for (const [name, width] of [
    ['desktop', 1920],
    ['pixel7', 2398],
  ] as const) {
    const stamp = {
      layer: 'near',
      x: planeCentreX(cx, 1) - width * 0.18,
      y: 1010 - 260,
      img: half,
      ox: half.width * r.originX,
      oy: half.height * r.originY,
    };
    const scene = composeScene(biome, cx, width, [stamp], (k) => m.origin(k));
    save(`near-hunt-${name}`, scene);
  }
}
