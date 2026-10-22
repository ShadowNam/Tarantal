// `npm run art:interim` (D-029): draws the interim (code-drawn) guns and birds and writes them into
// art-source/ exactly like a human delivery (docs/06), marked `"origin": "interim"` in each rig.json.
// Then run `npm run assets:pack`. A folder whose rig.json is not marked interim is a human delivery
// and is never touched.
//   --only birds|guns     one half (none: sheets only)
//   --creature <id>       one bird
//   --gun <id>            one gun
//   --sheets              also write the contact sheets to docs/art-preview/
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { BirdClip } from '../../src/game/assets/assetIndex';
import type { PlaneId } from '../../src/sim/types';
import { encodePng8 } from '../assets/image';
import { NEAR_CLIPS } from '../assets/pack';
import { CLIP_SPEC } from '../assets/targets';
import { loadContent } from '../testContent';
import { renderBirdFrame } from './birdFrames';
import { birdSheets, gunSheets } from './previews';
import { renderGunFrame } from './gunFrames';
import { gunClipNames, gunFrameCount, tipFor } from './guns';
import { clipsFor, GUN_IDS, loadArtConfig } from './config';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const root = join(import.meta.dirname, '..', '..');
const src = join(root, 'art-source');
const cfg = loadArtConfig();
const content = loadContent();
const only = arg('--only');
const oneCreature = arg('--creature');
const oneGun = arg('--gun');

/** True when `dir` may be (re)written: absent, or an earlier interim delivery. */
function ours(dir: string): boolean {
  const rig = join(dir, 'rig.json');
  if (!existsSync(dir)) return true;
  if (!existsSync(rig)) return false;
  try {
    return (JSON.parse(readFileSync(rig, 'utf8')) as { origin?: string }).origin === 'interim';
  } catch {
    return false;
  }
}

function put(path: string, bytes: Uint8Array | string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}

const planesOf = (creature: string): PlaneId[] => {
  const c = content.birds.creatures.find((x) => x.id === creature);
  return c === undefined ? [] : [...c.planes];
};

let frames = 0;
const t0 = Date.now();
if (only === undefined || only === 'birds') {
  for (const creature of Object.keys(cfg.birds.creatures)) {
    if (oneCreature !== undefined && creature !== oneCreature) continue;
    const dir = join(src, 'birds', creature);
    if (!ours(dir)) {
      console.warn(`skip birds/${creature}: a human delivery is there (rig.json not interim)`);
      continue;
    }
    rmSync(dir, { recursive: true, force: true });
    const clips = clipsFor(cfg, creature);
    for (const plane of planesOf(creature)) {
      const want: readonly BirdClip[] =
        plane === 'near' ? clips.filter((c) => NEAR_CLIPS.includes(c)) : clips;
      for (const clip of want) {
        for (let k = 0; k < CLIP_SPEC[clip].frames; k++) {
          const img = renderBirdFrame(cfg, content, creature, plane, clip, k);
          put(
            join(dir, 'planes', plane, clip, `${String(k).padStart(2, '0')}.png`),
            encodePng8(img),
          );
          frames++;
        }
      }
    }
    put(
      join(dir, 'rig.json'),
      `${JSON.stringify({ origin: 'interim', x2: false, encode: 'png8' }, null, 2)}\n`,
    );
    console.log(`birds/${creature}: ${planesOf(creature).join(', ')} (${clips.length} clips)`);
  }
}
if (only === undefined || only === 'guns') {
  for (const id of GUN_IDS) {
    if (oneGun !== undefined && id !== oneGun) continue;
    const dir = join(src, 'guns', id);
    if (!ours(dir)) {
      console.warn(`skip guns/${id}: a human delivery is there (rig.json not interim)`);
      continue;
    }
    rmSync(dir, { recursive: true, force: true });
    for (const clip of gunClipNames(cfg, id)) {
      for (let k = 0; k < gunFrameCount(cfg, id, clip); k++) {
        put(
          join(dir, clip, `${String(k).padStart(2, '0')}.png`),
          encodePng8(renderGunFrame(cfg, id, clip, k)),
        );
        frames++;
      }
    }
    put(
      join(dir, 'rig.json'),
      `${JSON.stringify({ origin: 'interim', x2: false, encode: 'png8', ...tipFor(id) }, null, 2)}\n`,
    );
    console.log(`guns/${id}: ${gunClipNames(cfg, id).join(', ')}`);
  }
}
if (process.argv.includes('--sheets')) {
  if (only === undefined || only === 'guns' || only === 'none')
    for (const [name, bytes] of gunSheets(cfg, oneGun)) {
      put(join(root, 'docs', 'art-preview', name), bytes);
      console.log(`docs/art-preview/${name}`);
    }
  const out = join(root, 'docs', 'art-preview');
  if (only !== 'guns')
    for (const [name, bytes] of birdSheets(cfg, content, oneCreature)) {
      put(join(out, name), bytes);
      console.log(`docs/art-preview/${name}`);
    }
}
console.log(`art:interim — ${frames} frames in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
