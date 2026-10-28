// 1.9.4 (D-057) close-ups of the tree-life art straight from the art code (no browser):
// docs/art-preview/compare/tree-life-*.png, 1 px = 1 texture px. Fruit are drawn in place.
// Run: npx tsx tools/art/treeLifePreview.ts [baobab|...]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { blank, encodePng, type Rgba } from '../assets/image';
import { loadContent } from '../testContent';
import {
  createPlaceholderManifest,
  loadBiomeArt,
} from '../../src/game/placeholder/ProceduralAssetFactory';
import { BIOME_PLANS } from './biomes';
import { loadArtConfig } from './config';
import { renderProp } from './landscape';
import { over } from './scenePreview';
import { mix } from './scenery';

const OUT =
  process.env.PREVIEW_OUT ??
  join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'compare');
const cfg = loadArtConfig();
const content = loadContent();

function backdrop(
  w: number,
  h: number,
  ground: number,
  sky: [string, string],
  sand: [string, string],
): Rgba {
  const img = blank(w, h);
  const hex = (s: string): number[] => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  for (let y = 0; y < h; y++) {
    const c =
      y >= ground
        ? hex(mix(sand[0], sand[1], (y - ground) / Math.max(1, h - ground)))
        : hex(mix(sky[0], sky[1], Math.min(1, y / h)));
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

async function prop(
  biomeId: string,
  key: string,
  name: string,
  footPx: number,
  res?: number,
): Promise<void> {
  const biome = content.biomes.find((b) => b.id === biomeId);
  const plan = BIOME_PLANS.find((p) => p.biome === biomeId);
  if (biome === undefined || plan === undefined) throw new Error(biomeId);
  await loadBiomeArt(biome.id);
  const m = createPlaceholderManifest(content, biome);
  const pr = biome.props.find((p) => p.asset === key);
  const size = m.size(key);
  if (pr === undefined || size === null) throw new Error(key);
  const r = renderProp(cfg, plan, biome, pr, size, m.origin(key), res);
  const foot = Math.round(r.img.height * r.originY + footPx * (res ?? r.master));
  const bg = backdrop(
    r.img.width,
    r.img.height,
    Math.min(r.img.height - 1, foot),
    ['#9CB8CC', '#E4D8C0'],
    ['#B8A47A', '#9C8862'],
  );
  over(bg, r.img, 0, 0);
  mkdirSync(OUT, { recursive: true });
  const path = join(OUT, `tree-life-${name}.png`);
  writeFileSync(path, encodePng(bg));
  console.log(`${path} (${bg.width}×${bg.height})`);
}

const want = process.argv[2] ?? 'all';
if (want === 'all' || want === 'baobab')
  await prop('bushveld-winter', 'bushveld/baobab', 'baobab', 260);

if (want === 'all' || want === 'residents') {
  const { renderResidentSheet } = await import('./baobabLife');
  const img = renderResidentSheet(4);
  const bg = backdrop(
    img.width,
    img.height,
    img.height,
    ['#9A8A80', '#9A8A80'],
    ['#9A8A80', '#9A8A80'],
  );
  over(bg, img, 0, 0);
  mkdirSync(OUT, { recursive: true });
  const path = join(OUT, 'tree-life-residents-sheet.png');
  writeFileSync(path, encodePng(bg));
  console.log(`${path} (${bg.width}×${bg.height})`);
}

if (want === 'all' || want === 'sausage')
  await prop('okavango-spring', 'okavango/sausage_tree', 'sausage-tree', 260, 2);

if (want === 'all' || want === 'colony') {
  const { renderColonySheet } = await import('./colony');
  const img = renderColonySheet(4);
  const bg = backdrop(
    img.width,
    img.height,
    img.height,
    ['#C8A070', '#C8A070'],
    ['#C8A070', '#C8A070'],
  );
  over(bg, img, 0, 0);
  mkdirSync(OUT, { recursive: true });
  const path = join(OUT, 'tree-life-colony-sheet.png');
  writeFileSync(path, encodePng(bg));
  console.log(`${path} (${bg.width}×${bg.height})`);
}
