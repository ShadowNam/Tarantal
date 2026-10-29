// v1.7e (D-061) Bushveld rocks and middle distance: views straight from art-source/ (no browser)
// for judging the redraw: the centre view, a mid-distance close-up and a far-ridge close-up at a
// few camera positions (layers and props only; no birds, herds or tree residents).
// Run: npx tsx tools/art/bushveldPreview.ts [dir] [prefix]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { crop, encodePng, resize } from '../assets/image';
import { loadContent } from '../testContent';
import { composeScene } from './scenePreview';

const ROOT = join(import.meta.dirname, '..', '..');
const out = process.argv[2] ?? join(ROOT, 'docs', 'art-preview', 'compare');
const prefix = process.argv[3] ?? 'v17e-bushveld';
const biome = loadContent().biomes.find((b) => b.id === 'bushveld-winter');
if (biome === undefined) throw new Error('no bushveld-winter biome');
mkdirSync(out, { recursive: true });

for (const cx of [1400, 2200, 3200]) {
  const scene = composeScene(biome, cx);
  writeFileSync(join(out, `${prefix}-cx${cx}.png`), encodePng(resize(scene, 1280, 720)));
  // Mid distance: the band from the far veld to the near grass, at full resolution.
  writeFileSync(join(out, `${prefix}-cx${cx}-mid.png`), encodePng(crop(scene, 480, 520, 960, 420)));
  // Far: the ridge and the far veld.
  writeFileSync(
    join(out, `${prefix}-cx${cx}-far.png`),
    encodePng(crop(scene, 400, 400, 1120, 260)),
  );
}
