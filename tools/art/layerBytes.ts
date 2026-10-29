// v1.7d (D-059): bytes of one biome's layers as shipped (png8 at the plan's palette, gzip -9),
// to tune detail against the chunk budget without a full assets:pack.
// Run: npx tsx tools/art/layerBytes.ts <biome> [layerId ...]
import { gzipSync } from 'node:zlib';
import { encodePng8 } from '../assets/image';
import { loadContent } from '../testContent';
import { BIOME_PLANS } from './biomes';
import { loadArtConfig } from './config';
import { renderLayer } from './landscape';

const [biomeId = 'namibie', ...only] = process.argv.slice(2);
const cfg = loadArtConfig();
const biome = loadContent().biomes.find((b) => b.id === biomeId);
const plan = BIOME_PLANS.find((p) => p.biome === biomeId);
if (biome === undefined || plan === undefined) throw new Error(`no biome ${biomeId}`);
let total = 0;
for (const layer of biome.layers) {
  if (only.length > 0 && !only.includes(layer.id)) continue;
  const lp = plan.layers[layer.id];
  const img = renderLayer(cfg, plan, layer);
  const png = encodePng8(img, Number(process.env.NV_COLOURS ?? 0) || (lp?.colours ?? 256));
  const gz = gzipSync(png, { level: 9 }).length;
  total += gz;
  console.log(`${layer.id.padEnd(12)} ${(gz / 1024).toFixed(1).padStart(8)} KB`);
}
console.log(`${'total'.padEnd(12)} ${(total / 1024).toFixed(1).padStart(8)} KB`);
