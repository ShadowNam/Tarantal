// Inventory the actual delivered animal art, including intentional Standard-in-HD exceptions.
// A missing HD twin is not necessarily low resolution: several sheets already keep their master.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readFullIndex } from './assets/fullIndex';
import { STANDARD_IN_HD_KEYS, hdBird } from '../src/game/assets/hdPack';

const root = join(import.meta.dirname, '..');
const result = readFullIndex(join(root, 'public'));
if (result.error !== null) throw new Error(result.error);
const index = result.index;
if (index === null) throw new Error('Animal audit requires a valid delivered asset index');
const rows: string[] = [];
const gaps: string[] = [];
function checkPixels(path: string, width: number, height: number): void {
  const png = readFileSync(join(root, 'public', path));
  if (
    png.length < 24 ||
    png.toString('hex', 0, 8) !== '89504e470d0a1a0a' ||
    png.readUInt32BE(16) !== width ||
    png.readUInt32BE(20) !== height
  )
    gaps.push(`${path}: PNG dimensions disagree with the index`);
}
const animalSheet =
  /^(fauna\/|cameos\/|baboons\/|brakkie\/|tells\/|helper\/meerkat$|desert\/(meerkats|colony)$|namibie\/ostriches$|okavango\/(hippo|lily_frog)$|fx\/weaver_(up|down)$|feesdae\/halloween$|bushveld\/(baobab_life|dassie_koppie)$|oes\/harvest2?$)/;
for (const [key, entry] of Object.entries(index.images)) {
  if (!animalSheet.test(key)) continue;
  checkPixels(entry.file.path, entry.width, entry.height);
  let status: string;
  if (entry.hd !== undefined) {
    checkPixels(entry.hd.file.path, entry.hd.width, entry.hd.height);
    status = `HD twin: ${entry.hd.width} × ${entry.hd.height}`;
  } else if ((entry.scale ?? 1) <= 0.5) {
    status = 'Native ≥2× in both modes';
  } else if (key === 'desert/colony') {
    status = 'Native 3× bird drawings inside the shared sheet';
  } else if (STANDARD_IN_HD_KEYS.some((prefix) => key.startsWith(prefix))) {
    status = key.startsWith('fauna/')
      ? 'Standard in HD: distant herd, mobile texture budget'
      : 'Standard in HD: mobile texture budget';
  } else {
    status = 'REVIEW: no HD twin or native high-resolution delivery';
    gaps.push(key);
  }
  rows.push(`| ${key} | ${entry.width} × ${entry.height} | ${status} |`);
}
for (const [species, planes] of Object.entries(index.birds)) {
  for (const [plane, entry] of Object.entries(planes)) {
    const dims = entry.x1.pages
      .map((page) => {
        const data = JSON.parse(readFileSync(join(root, 'public', page.data.path), 'utf8')) as {
          meta: { size: { w: number; h: number } };
        };
        checkPixels(page.image.path, data.meta.size.w, data.meta.size.h);
        return `${data.meta.size.w} × ${data.meta.size.h}`;
      })
      .join(', ');
    for (const page of entry.hd?.pages ?? []) {
      const data = JSON.parse(readFileSync(join(root, 'public', page.data.path), 'utf8')) as {
        meta: { size: { w: number; h: number } };
      };
      checkPixels(page.image.path, data.meta.size.w, data.meta.size.h);
    }
    const status =
      entry.hd !== undefined
        ? 'HD animation atlas supplied'
        : !hdBird(plane, entry.group, species)
          ? 'Standard in HD: near/rare bird atlas, mobile texture budget'
          : 'REVIEW: eligible HD atlas missing';
    if (status.startsWith('REVIEW')) gaps.push(`${species}/${plane}`);
    rows.push(`| bird/${species}/${plane} | ${dims} | ${status} |`);
  }
}
const report = `# Delivered animal artwork audit\n\nGenerated with \`npm run assets:animals\`. This checks delivered resolution and HD coverage, not artistic quality. Sheet dimensions include multiple frames; they are not an individual animal's screen size. Native masters do not need duplicate HD files. Covers gameplay animal sheets and sprites, including Halloween bats and owls, hippos, frogs and weavers; excludes UI icons, toys and scenery illustrations.\n\n${rows.length} animal sheet/plane entries; ${gaps.length} unexplained resolution or image-dimension gaps.\n\n| Asset | Standard texture pixels | Delivery |\n| --- | --- | --- |\n${rows.join('\n')}\n${gaps.length === 0 ? '' : `\nProblems:\n${gaps.map((gap) => `- ${gap}`).join('\n')}\n`}\nThe rare birds still without HD atlases are Generaal, Kuifkop, Kuifkop Koning, Ou Grys, Stormvoël, white and lavender guineafowl. The common guineafowl's near-plane atlas also remains Standard. Distant herds and Harvest phase 2 share Standard art between modes. These are explicit memory-budget exclusions, not missing files. See \`src/game/assets/hdPack.ts\` and \`src/game/assets/animalDensity.test.ts\`.\n\nAll delivered art remains marked interim by the existing asset pipeline. Higher resolution alone does not make it final production artwork.\n`;
const out = process.argv.indexOf('--out');
if (out >= 0) {
  const path = process.argv[out + 1];
  if (path === undefined) throw new Error('--out requires a path');
  writeFileSync(path, report);
} else console.log(report);
if (gaps.length > 0) process.exitCode = 1;
