// D-051 (Karoo polish) close-ups straight from the art code (no browser): before | after of the
// aloe clumps and the potjie, at 1:1 with the 2× textures (the old 1× art scaled up 2×), on a
// sky-and-veld backdrop, after the png8 palette the pack applies. Prints each texture's bytes.
// Writes docs/art-preview/compare/karoo-polish-*.png. Run: npx tsx tools/art/karooPolishPreview.ts
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { blank, decodePng, encodePng, encodePng8, resize, type Rgba } from '../assets/image';
import { loadContent, loadFeel } from '../testContent';
import {
  createPlaceholderManifest,
  loadBiomeArt,
} from '../../src/game/placeholder/ProceduralAssetFactory';
import { BIOME_PLANS } from './biomes';
import { loadArtConfig } from './config';
import { renderProp } from './landscape';
import { over } from './scenePreview';
import { mix } from './scenery';
import { HD_PARTS, hdKeyOf, POTJIE_LID } from '../../src/game/assets/hdProps';
import { POT_RIM } from './potjie';

const OUT = join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'compare');
const BEFORE_REF = process.env.BEFORE_REF ?? 'fc39e3a3';
const cfg = loadArtConfig();
const content = loadContent();

function backdrop(w: number, h: number, ground: number): Rgba {
  const img = blank(w, h);
  const hex = (s: string): number[] => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  for (let y = 0; y < h; y++) {
    const c =
      y >= ground
        ? hex(mix('#C9A86A', '#A8844E', (y - ground) / Math.max(1, h - ground)))
        : hex(mix('#9CC3E0', '#EAD9B8', y / Math.max(1, ground)));
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      img.data.set([c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, 255], i);
    }
  }
  return img;
}

function save(name: string, img: Rgba): void {
  mkdirSync(OUT, { recursive: true });
  const path = join(OUT, `karoo-polish-${name}.png`);
  writeFileSync(path, encodePng(img));
  console.log(`${path} (${img.width}×${img.height})`);
}

/** The shipped (png8) pixels of an image at `colours`. */
const shipped = (img: Rgba, colours: number): { img: Rgba; readonly bytes: number } => {
  const png = encodePng8(img, colours);
  return { img: decodePng(png), bytes: png.length };
};

const midday: Readonly<Record<string, string>> = loadFeel().lights['midday']?.tint ?? {};

/** A 2× image as the game shows it: at 1× (then back to 2× to compare), under the layer's light. */
function asInPlay(img: Rgba, layer: string): Rgba {
  const out = resize(resize(img, img.width / 2, img.height / 2), img.width, img.height);
  const hex = midday[layer];
  if (hex === undefined) return out;
  const t = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  for (let i = 0; i < out.data.length; i += 4)
    for (let c = 0; c < 3; c++) out.data[i + c] = Math.round((out.data[i + c] ?? 0) * (t[c] ?? 1));
  return out;
}

const only = process.argv[2];
for (const biomeId of ['karoo-autumn', 'bushveld-winter']) {
  const biome = content.biomes.find((b) => b.id === biomeId);
  const plan = BIOME_PLANS.find((p) => p.biome === biomeId);
  if (biome === undefined || plan === undefined) throw new Error(biomeId);
  await loadBiomeArt(biome.id);
  const m = createPlaceholderManifest(content, biome);
  for (const prop of biome.props) {
    if (!/aloe|potjie/.test(prop.asset)) continue;
    if (only !== undefined && !prop.asset.includes(only)) continue;
    const size = m.size(prop.asset);
    if (size === null) continue;
    // "After" is the HD key when the prop has one (the potjie with its lid laid on), else the
    // prop's own (redrawn in place) art.
    const key = hdKeyOf(prop.asset) ?? prop.asset;
    const pp = plan.props[key];
    const keySize = m.size(key) ?? size;
    const r = renderProp(cfg, plan, biome, { ...prop, asset: key }, keySize, m.origin(key));
    const after = shipped(r.img, Number(process.env.COLOURS ?? pp?.colours ?? 256));
    let bytes = after.bytes;
    if ((HD_PARTS[prop.asset] ?? []).includes(POTJIE_LID)) {
      const ls = m.size(POTJIE_LID);
      const lp = plan.props[POTJIE_LID];
      if (ls !== null && lp !== undefined) {
        const lo = m.origin(POTJIE_LID);
        const l = renderProp(cfg, plan, biome, { ...prop, asset: POTJIE_LID }, ls, lo);
        const lid = shipped(l.img, lp.colours ?? 256);
        bytes += lid.bytes;
        const k = r.master;
        over(
          after.img,
          lid.img,
          Math.round(r.originX * after.img.width + POT_RIM.x * k - lo.x * lid.img.width),
          Math.round(r.originY * after.img.height + POT_RIM.y * k - lo.y * lid.img.height),
        );
      }
    }
    const file = `art-source/sprites/${prop.asset}.png`;
    let before: Rgba;
    try {
      before = decodePng(execFileSync('git', ['show', `${BEFORE_REF}:${file}`]));
    } catch {
      before = blank(size.width, size.height);
    }
    const b2 = resize(before, before.width * 2, before.height * 2);
    // A 1× "after" (redrawn in place) is shown at 2× as well.
    if (r.master === 1) after.img = resize(after.img, after.img.width * 2, after.img.height * 2);
    // Third panel, "as in play": the 2× view brought down to the size it is shown at (1×) and back
    // up, under the midday light's multiply tint on the prop's layer (feel.json lights.midday).
    const play = asInPlay(after.img, prop.layer);
    const W = b2.width + after.img.width + play.width + 80;
    const H = Math.max(b2.height, after.img.height) + 40;
    const bg = backdrop(W, H, Math.round(H * 0.72));
    over(bg, b2, 20, 20 + H - 40 - b2.height);
    over(bg, after.img, 40 + b2.width, 20 + H - 40 - after.img.height);
    over(bg, play, 60 + b2.width + after.img.width, 20 + H - 40 - play.height);
    console.log(`${key}: ${(bytes / 1024).toFixed(1)} KB png8 (${r.img.width}×${r.img.height})`);
    save(prop.asset.replace('/', '-'), bg);
  }
}
