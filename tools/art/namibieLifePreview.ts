// v1.7d (D-059) Namibië veld life: the centre view and a near-ground close-up straight from
// art-source/ (no browser): the layers and props (scenePreview) with the veld sheet's sprites
// stamped at their placements (over the props: a preview of the look, not the exact order).
// Run: npx tsx tools/art/namibieLifePreview.ts [dir] [prefix] [cx]
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { planeCentreX } from '../../src/sim/camera';
import { LAYER_BLEED_PX } from '../../src/sim/world';
import { blank, decodePng, encodePng, resize, type Rgba } from '../assets/image';
import { loadContent } from '../testContent';
import { composeScene, over } from './scenePreview';
import {
  VELD_LAYERS,
  VELD_SHEET,
  veldFrames,
  type VeldSpot,
} from '../../src/game/view/namib/veldSheet';

const ROOT = join(import.meta.dirname, '..', '..');
const out = process.argv[2] ?? join(ROOT, 'docs', 'art-preview', 'compare');
const prefix = process.argv[3] ?? 'v17d-namibie';
const cx = Number(process.argv[4] ?? 1920);
const biome = loadContent().biomes.find((b) => b.id === 'namibie');
if (biome === undefined) throw new Error('no namibie biome');

function crop(img: Rgba, x: number, y: number, w: number, h: number): Rgba {
  const o = blank(w, h);
  for (let r = 0; r < h; r++) {
    const from = ((y + r) * img.width + x) * 4;
    o.data.set(img.data.subarray(from, from + w * 4), r * w * 4);
  }
  return o;
}

function flipX(img: Rgba): Rgba {
  const o = blank(img.width, img.height);
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) {
      const a = (y * img.width + x) * 4;
      const b = (y * img.width + (img.width - 1 - x)) * 4;
      o.data.set(img.data.subarray(a, a + 4), b);
    }
  return o;
}

const scene = composeScene(biome, cx);
const sheet = decodePng(readFileSync(join(ROOT, 'art-source', 'sprites', `${VELD_SHEET}.png`)));
const frames = veldFrames();
const spots = JSON.parse(
  readFileSync(join(ROOT, 'src', 'game', 'view', 'namib', 'veld-namibie.json'), 'utf8'),
) as VeldSpot[];
for (let li = 0; li < VELD_LAYERS.length; li++) {
  const layer = biome.layers.find((l) => l.id === VELD_LAYERS[li]);
  if (layer === undefined) continue;
  const rootX = 1920 / 2 - planeCentreX(cx, layer.scrollFactor) - LAYER_BLEED_PX;
  for (const [l, fi, x, y, s100, flip] of [...spots].sort((a, b) => a[3] - b[3])) {
    const f = frames[fi];
    if (l !== li || f === undefined) continue;
    const s = s100 / 100;
    const sx = rootX + x;
    if (sx < -400 || sx > 2320) continue;
    let img = resize(
      crop(sheet, f.x, f.y, f.w, f.h),
      Math.max(1, Math.round(f.w * s)),
      Math.max(1, Math.round(f.h * s)),
    );
    if (flip === 1) img = flipX(img);
    const ox = flip === 1 ? (f.w - f.ox) * s : f.ox * s;
    over(scene, img, sx - ox, y - f.oy * s);
  }
}
mkdirSync(out, { recursive: true });
writeFileSync(join(out, `${prefix}-centre.png`), encodePng(scene));
writeFileSync(join(out, `${prefix}-near.png`), encodePng(crop(scene, 560, 600, 800, 480)));
console.log(`${out}/${prefix}-centre.png, -near.png`);
