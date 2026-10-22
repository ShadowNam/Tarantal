// `npm run assets:pack` (M10, art bible §9 step 4): packs art-source/ into public/assets/ and
// writes public/assets/asset-index.json, which the game reads at boot (AssetManifest). Delivery
// rules: docs/06-ASSET-DELIVERY.md.
//   --src <dir>     source folder (default art-source/)
//   --public <dir>  public folder to write assets/ into (default public/)
import { join } from 'node:path';
import { buildCatalog } from './assets/catalog';
import { packAssets } from './assets/pack';
import { loadContent } from './testContent';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}

const root = join(import.meta.dirname, '..');
const src = join(root, arg('--src', 'art-source'));
const publicDir = join(root, arg('--public', 'public'));
const content = loadContent();
const report = await packAssets({ src, publicDir, content, catalog: await buildCatalog(content) });
for (const w of report.warnings) console.warn(`warning: ${w}`);
for (const e of report.errors) console.error(`error: ${e}`);
const n = (o: object): number => Object.keys(o).length;
const { images, layers, birds, audio } = report.index;
console.log(
  `assets:pack — ${n(images)} images, ${n(layers)} layers, ${n(birds)} birds, ${n(audio)} sounds; ` +
    `${report.written.length} files written to ${arg('--public', 'public')}/assets/`,
);
if (report.errors.length > 0) {
  console.error(`assets:pack: ${report.errors.length} error(s), nothing written`);
  process.exit(1);
}
