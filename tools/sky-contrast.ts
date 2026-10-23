// v1.2 (D-033) bird readability report: for every biome, the plain map, each weekday layout and
// Verder on each, the median contrast between the tarentaal's plumage and the sky band the birds
// fly through (design y 120–420, the mid and far sky lanes), as the layout's light draws it.
// tools/sky-contrast.test.ts fails a map below MIN_SKY_CONTRAST_RATIO × its plain map.
//   npx tsx tools/sky-contrast.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { WEEKDAY_IDS, type Biome, type Feel, type Light } from '../src/content/schemas';
import { medianSkyContrast } from '../src/game/view/skyContrast';
import { loadContent, loadFeel } from './testContent';

/** A weekday map keeps at least this share of its plain map's sky contrast (80 %, D-033). */
export const MIN_SKY_CONTRAST_RATIO = 0.8;
/** The fly-over band (design px): the top of the far sky lane to the bottom of the mid one. */
export const SKY_BAND: readonly [number, number] = [120, 420];
/** The tarentaal's plumage (ProceduralAssetFactory TARENTAAL.plumage; the interim art matches). */
export const BIRD = 0x2e2f45;

const root = join(import.meta.dirname, '..');

/** Sky pixels of a biome's sky layer in the fly-over band, every 8th pixel each way. */
export function skyBand(biome: Biome): { rgb: number; y: number }[] {
  const index = JSON.parse(readFileSync(join(root, 'public/assets/asset-index.json'), 'utf8')) as {
    layers: Record<string, { tiles: { path: string }[]; height: number }>;
  };
  const sky = biome.layers.find((l) => l.id === 'sky');
  const entry = sky === undefined ? undefined : index.layers[sky.asset];
  if (entry === undefined) throw new Error(`${biome.id}: no sky art`);
  const out: { rgb: number; y: number }[] = [];
  for (const tile of entry.tiles) {
    const png = PNG.sync.read(readFileSync(join(root, 'public', tile.path)));
    const k = png.height / entry.height;
    for (let y = SKY_BAND[0]; y <= SKY_BAND[1]; y += 8) {
      const row = Math.min(png.height - 1, Math.floor(y * k));
      for (let x = 0; x < png.width; x += 8) {
        const i = (row * png.width + x) * 4;
        if ((png.data[i + 3] ?? 0) < 128) continue;
        const rgb =
          ((png.data[i] ?? 0) << 16) | ((png.data[i + 1] ?? 0) << 8) | (png.data[i + 2] ?? 0);
        out.push({ rgb, y });
      }
    }
  }
  return out;
}

export interface SkyRow {
  readonly biome: string;
  readonly map: string;
  readonly contrast: number;
  /** contrast / the plain map's. */
  readonly ratio: number;
}

export function skyContrastRows(content = loadContent(), feel: Feel = loadFeel()): SkyRow[] {
  const rows: SkyRow[] = [];
  const lights = (ids: readonly (string | undefined)[]): Light[] =>
    ids.flatMap((id) =>
      id === undefined || feel.lights[id] === undefined ? [] : [feel.lights[id]],
    );
  for (const biome of content.biomes) {
    const sky = skyBand(biome);
    const plain = medianSkyContrast(sky, [], BIRD);
    rows.push({ biome: biome.id, map: 'plain', contrast: plain, ratio: 1 });
    const verder = biome.bonusMaps[0];
    for (const day of WEEKDAY_IDS) {
      const layout = biome.layouts.find((l) => l.id === day);
      const c = medianSkyContrast(sky, lights([layout?.light]), BIRD);
      rows.push({ biome: biome.id, map: day, contrast: c, ratio: c / plain });
      const v = medianSkyContrast(sky, lights([layout?.light, verder?.light]), BIRD);
      rows.push({ biome: biome.id, map: `${day}+verder`, contrast: v, ratio: v / plain });
    }
  }
  return rows;
}

if (process.argv[1]?.endsWith('sky-contrast.ts')) {
  console.log('| biome | map | median sky:bird contrast | vs plain |\n|---|---|---|---|');
  for (const r of skyContrastRows())
    console.log(
      `| ${r.biome} | ${r.map} | ${r.contrast.toFixed(2)} | ${Math.round(r.ratio * 100)} % |`,
    );
}
