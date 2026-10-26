// `npm run art:interim` (D-029): draws the interim (code-drawn) guns and birds and writes them into
// art-source/ exactly like a human delivery (docs/06), marked `"origin": "interim"` in each rig.json.
// Then run `npm run assets:pack`. A folder whose rig.json is not marked interim is a human delivery
// and is never touched.
//   --only birds|guns|scenery|sprites|flyers|range|meerkats
//                         one part (none: sheets only). scenery = parallax layers + props (D-031),
//                         sprites = shared FX/UI/crate sprites, flyers = non-target birds,
//                         range = the Skietbaan's steel plate (24 Oct update),
//                         meerkats = the desert colonies' sheet (v1.7, D-044)
//   --biome <id>          scenery for one biome
//   --creature <id>       one bird
//   --gun <id>            one gun
//   --sheets              also write the contact sheets to docs/art-preview/
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { format } from 'prettier';
import { LATE_GROUP, VER_GROUP, type BirdClip } from '../../src/game/assets/assetIndex';
import { fruitSheetKey } from '../../src/game/view/fruit/fruitTypes';
import { collectFruit } from './fruitSink';
import { fruitSheet, type FruitOwner } from './fruitArt';

/** v1.7c (D-047): palette size of the fruit sheets. */
const FRUIT_COLOURS = 64;
import { isArtPlane, type ArtPlaneId as PlaneId } from '../../src/game/assets/artPlane';
import { encodePng, encodePng8 } from '../assets/image';
import { NEAR_CLIPS } from '../assets/pack';
import { CLIP_SPEC } from '../assets/targets';
import { loadContent, loadFeel } from '../testContent';
import { renderBirdFrame } from './birdFrames';
import { birdSheets, contrastSheet, gunSheets } from './previews';
import { renderGunFrame } from './gunFrames';
import { gunClipNames, gunFrameCount, tipFor } from './guns';
import { POT_SEAT_Y, POT_SIZE, renderPot } from './pot';
import { clipsFor, GUN_IDS, loadArtConfig } from './config';
import {
  createPlaceholderManifest,
  loadBiomeArt,
} from '../../src/game/placeholder/ProceduralAssetFactory';
import { BIOME_PLANS } from './biomes';
import { renderLayer, renderLoose, renderProp } from './landscape';
import { FAUNA_DRAW } from './faunaSheets';
import { renderMeerkatSheet } from './meerkats';
import { MEERKAT_SHEET, SHEET_MASTER } from '../../src/game/assets/desertAssets';

/** v1.7 (D-044): palette size of the meerkat sheet (look round: 48 keeps the shading and lets
 *  the Kalahari chunk plus the desert chunk fit 1.5 MB). */
const MEERKAT_COLOURS = 32;
import { FAUNA_FOOT, FAUNA_RES, FAUNA_SPRITES } from '../../src/game/view/faunaSprites';
import { renderSprite, SPRITES } from './sprites';
import { AMMO_SPRITES } from './ammo';
import { SIGHT_SPRITES } from './sights';
import { RANGE_SPRITES } from './rangeArt';
import { biomeSheets, flyerSheet, spriteSheet } from './scenerySheets';
import { FLYER_FRAMES, FLYER_GROUPS, FLYERS, renderFlyerFrame } from './flyers';

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
const oneBiome = arg('--biome');
const wants = (part: string): boolean => only === undefined || only === part;

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

/** True when a sprite or layer PNG may be (re)written: absent, or an earlier interim delivery. */
function oursFile(png: string): boolean {
  const side = png.replace(/\.png$/, '.json');
  if (!existsSync(png)) return true;
  if (!existsSync(side)) return false;
  try {
    return (JSON.parse(readFileSync(side, 'utf8')) as { origin?: string }).origin === 'interim';
  } catch {
    return false; // unreadable sidecar: treat as a human delivery, never overwrite
  }
}

/** JSON as the repo's Prettier prints it (`npm run lint` checks art-source/ too). */
async function json(value: unknown): Promise<string> {
  return format(JSON.stringify(value), { parser: 'json' });
}

const planesOf = (creature: string): PlaneId[] => {
  const c = content.birds.creatures.find((x) => x.id === creature);
  // Ver birds are drawn from the far/mid art (D-036): no art of their own.
  return c === undefined ? [] : c.planes.filter(isArtPlane);
};

const groupOf = (creature: string): { group?: string } => {
  const g = cfg.birds.loadGroups[creature];
  return typeof g === 'string' ? { group: g } : {};
};

/** v1.7c (D-047): layers whose fruit, pods and flowers are sprites (see fruitSink.ts). */
const FRUIT_LAYERS = new Set(['mid', 'near', 'foreground']);

/**
 * v1.7c (D-047): fruit sheets that load with the late group: the Karoo's (the first download is
 * full) and the Kalahari's (the Kalahari and desert chunks are within 2 KB of 1.5 MB together).
 */
const FRUIT_LATE = new Set(['karoo-autumn', 'kalahari-summer']);

async function writeFruit(biome: string, owners: readonly FruitOwner[]): Promise<void> {
  const key = fruitSheetKey(biome);
  const png = join(src, 'sprites', `${key}.png`);
  const spotsPath = join(root, 'src', 'game', 'view', 'fruit', 'spots', `fruit-${biome}.json`);
  if (!oursFile(png)) {
    console.warn(`skip sprites/${key}: a human delivery is there`);
    return;
  }
  const sheet = fruitSheet(owners, cfg.masterScale);
  put(png, encodePng8(sheet.img, FRUIT_COLOURS));
  put(
    png.replace(/\.png$/, '.json'),
    await json({
      origin: 'interim',
      encode: 'png8',
      originX: 0,
      originY: 0,
      ...(FRUIT_LATE.has(biome) ? { group: LATE_GROUP } : {}),
    }),
  );
  put(spotsPath, await json(sheet.spots));
  console.log(`sprites/${key}: ${sheet.spots.length} fruit`);
}

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
      await json({
        origin: 'interim',
        x2: false,
        encode: 'png8',
        ...groupOf(creature),
        planeClips: {
          near: cfg.birds.planeClips.near,
          mid: cfg.birds.planeClips.mid,
          far: cfg.birds.planeClips.far,
        },
      }),
    );
    console.log(`birds/${creature}: ${planesOf(creature).join(', ')} (${clips.length} clips)`);
  }
}
if (only === undefined || only === 'birds') {
  // The Generaal's pot helmet: a sprite key (fx/pot), not part of his atlas (it flies off).
  const potPath = join(src, 'sprites', 'fx', 'pot');
  const side = `${potPath}.json`;
  const sideOrigin = (): string | undefined => {
    try {
      return (JSON.parse(readFileSync(side, 'utf8')) as { origin?: string }).origin;
    } catch {
      return undefined; // unreadable sidecar: treat as a human delivery, never overwrite
    }
  };
  const human = existsSync(`${potPath}.png`) && (!existsSync(side) || sideOrigin() !== 'interim');
  if (human) console.warn('skip sprites/fx/pot: a human delivery is there');
  else {
    put(`${potPath}.png`, encodePng8(renderPot(cfg)));
    put(
      side,
      await json({
        origin: 'interim',
        encode: 'png8',
        originX: POT_SIZE.originX / POT_SIZE.width,
        originY: POT_SEAT_Y / POT_SIZE.height,
      }),
    );
    console.log('sprites/fx/pot');
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
      await json({
        origin: 'interim',
        x2: false,
        encode: 'png8',
        ...tipFor(cfg, id),
        ...(cfg.guns.lateLoad.ids.includes(id) ? { group: 'late' } : {}),
        // v1.3 (D-036): the .22 lives in the long-range chunk (the late one is nearly full).
        // v1.4 (D-038): so does the Langloop.
        ...(id === 'twee_twee' || id === 'langloop' ? { group: VER_GROUP } : {}),
      }),
    );
    console.log(`guns/${id}: ${gunClipNames(cfg, id).join(', ')}`);
  }
}
if (wants('scenery')) {
  for (const plan of BIOME_PLANS) {
    if (oneBiome !== undefined && plan.biome !== oneBiome) continue;
    const biome = content.biomes.find((b) => b.id === plan.biome);
    if (biome === undefined || !(await loadBiomeArt(biome.id))) {
      console.warn(`skip scenery ${plan.biome}: no such playable biome`);
      continue;
    }
    const fruitOwners: FruitOwner[] = [];
    for (const layer of biome.layers) {
      const png = join(src, 'layers', biome.id, `${layer.id}.png`);
      if (!oursFile(png)) {
        console.warn(`skip layers/${biome.id}/${layer.id}: a human delivery is there`);
        continue;
      }
      const lp = plan.layers[layer.id];
      const enc = lp?.encode ?? 'png8';
      // v1.7c (D-047): fruit on the mid and near planes become sprites (the far stays baked).
      const { value: img, fruit } = FRUIT_LAYERS.has(layer.id)
        ? collectFruit(() => renderLayer(cfg, plan, layer))
        : { value: renderLayer(cfg, plan, layer), fruit: [] };
      if (fruit.length > 0) fruitOwners.push({ on: layer.id, prop: false, fruit });
      put(png, enc === 'png8' ? encodePng8(img, lp?.colours) : encodePng(img));
      put(
        png.replace(/\.png$/, '.json'),
        await json({
          origin: 'interim',
          ...(enc === 'png8' ? { encode: 'png8' } : {}),
          top: lp?.top,
          // v1.3: the Ver strips load in their own chunk (D-036).
          ...(layer.plane === 'ver' ? { group: VER_GROUP } : {}),
        }),
      );
      console.log(`layers/${biome.id}/${layer.id}`);
    }
    // Props keep the placeholder's texture size and origin (content geometry is unchanged).
    const m = createPlaceholderManifest(content, biome);
    for (const prop of biome.props) {
      const png = join(src, 'sprites', `${prop.asset}.png`);
      if (!oursFile(png)) {
        console.warn(`skip sprites/${prop.asset}: a human delivery is there`);
        continue;
      }
      const size = m.size(prop.asset);
      if (size === null) throw new Error(`${prop.asset}: no placeholder size`);
      const { value: r, fruit } = collectFruit(() =>
        renderProp(cfg, plan, biome, prop, size, m.origin(prop.asset)),
      );
      if (fruit.length > 0 && !fruitOwners.some((o) => o.on === prop.asset))
        fruitOwners.push({ on: prop.asset, prop: true, fruit });
      put(png, encodePng8(r.img, plan.props[prop.asset]?.colours));
      const moved = plan.props[prop.asset]?.frame !== undefined;
      put(
        png.replace(/\.png$/, '.json'),
        await json({
          origin: 'interim',
          encode: 'png8',
          ...(moved ? { originX: r.originX, originY: r.originY } : {}),
          ...(r.master === 1 ? {} : { master: r.master }),
        }),
      );
      console.log(`sprites/${prop.asset}`);
    }
    // v1.7c (D-047): the biome's fruit sheet and where each fruit sits (FRUIT_LATE: late group).
    await writeFruit(biome.id, fruitOwners);
    // v1.6 (D-042): the far animals' sprites, drawn at 3× (src/game/view/faunaSprites.ts).
    for (const f of FAUNA_SPRITES[biome.id] ?? []) {
      const png = join(src, 'sprites', `${f.key}.png`);
      if (!oursFile(png)) {
        console.warn(`skip sprites/${f.key}: a human delivery is there`);
        continue;
      }
      const draw = FAUNA_DRAW[f.key];
      if (draw === undefined) throw new Error(`${f.key}: no drawing in tools/art/faunaSheets.ts`);
      const img = renderLoose(
        cfg,
        biome.id,
        f.layer,
        f.key,
        { w: f.w, h: f.h, ox: f.w / 2, oy: f.h - FAUNA_FOOT },
        FAUNA_RES,
        draw,
      );
      put(png, encodePng8(img, 128));
      put(
        png.replace(/\.png$/, '.json'),
        await json({
          origin: 'interim',
          encode: 'png8',
          master: FAUNA_RES,
          ...(f.layer === 'ver_veld' ? { group: VER_GROUP } : {}),
        }),
      );
      console.log(`sprites/${f.key}`);
    }
  }
}
if (wants('sprites')) {
  // Shared sprites: placeholder size and origin from the home biome's placeholder manifest.
  const home = content.biomes.find((b) => b.id === content.modes.modes.classic.biome);
  if (home === undefined) throw new Error('no home biome');
  const m = createPlaceholderManifest(content, home, loadFeel().guns.ammo);
  for (const spec of [...SPRITES, ...AMMO_SPRITES, ...SIGHT_SPRITES]) {
    const png = join(src, 'sprites', `${spec.key}.png`);
    if (!oursFile(png)) {
      console.warn(`skip sprites/${spec.key}: a human delivery is there`);
      continue;
    }
    const size = m.size(spec.key);
    if (size === null) throw new Error(`${spec.key}: no placeholder texture`);
    // v1.1 (D-032): HUD ammo is small, realistic and smoothly shaded: drawn at 4× and kept in
    // full colour (a palette PNG would band its gradients).
    const ammo = spec.key.startsWith('ui/ammo/');
    // v1.3 (D-036): sight pictures are smooth gradients (full colour) in the long-range chunk.
    const sight = spec.key.startsWith('sight/');
    const art = ammo ? { ...cfg, masterScale: 4 } : cfg;
    const img = renderSprite(art, spec, size, m.origin(spec.key));
    put(png, ammo || sight ? encodePng(img) : encodePng8(img));
    put(
      png.replace(/\.png$/, '.json'),
      await json(
        sight
          ? { origin: 'interim', group: VER_GROUP }
          : ammo
            ? { origin: 'interim' }
            : spec.key.startsWith('ui/pu_')
              ? // v1.7b (D-046): power-up icons load with the late group (the first crate drops at
                // 22 % of a hunt at the earliest; placeholders stand in until then).
                { origin: 'interim', encode: 'png8', group: LATE_GROUP }
              : { origin: 'interim', encode: 'png8' },
      ),
    );
    console.log(`sprites/${spec.key}`);
  }
}
if (wants('range')) {
  // 24 Oct update (D-037): the Skietbaan's steel plate and its frame (D-040; group "range" from the catalog: lazy).
  for (const spec of RANGE_SPRITES) {
    const png = join(src, 'sprites', `${spec.key}.png`);
    if (!oursFile(png)) {
      console.warn(`skip sprites/${spec.key}: a human delivery is there`);
      continue;
    }
    put(png, encodePng(renderSprite(cfg, spec, spec.size, spec.origin)));
    put(
      png.replace(/\.png$/, '.json'),
      await json({ origin: 'interim', originX: spec.origin.x, originY: spec.origin.y }),
    );
    console.log(`sprites/${spec.key}`);
  }
}
if (wants('meerkats')) {
  // v1.7 (D-044): the meerkat colonies' sheet, drawn at 2× (layout: desertAssets.ts). Its group
  // ("desert", lazy, loaded with either desert map) comes from the catalog.
  const png = join(src, 'sprites', `${MEERKAT_SHEET}.png`);
  if (!oursFile(png)) console.warn(`skip sprites/${MEERKAT_SHEET}: a human delivery is there`);
  else {
    put(png, encodePng8(renderMeerkatSheet(), MEERKAT_COLOURS));
    put(
      png.replace(/\.png$/, '.json'),
      await json({
        origin: 'interim',
        encode: 'png8',
        master: SHEET_MASTER,
        originX: 0,
        originY: 0,
      }),
    );
    console.log(`sprites/${MEERKAT_SHEET}`);
  }
}
if (wants('flyers')) {
  for (const [creature, planes] of Object.entries(FLYERS)) {
    if (oneCreature !== undefined && creature !== oneCreature) continue;
    const dir = join(src, 'birds', creature);
    if (!ours(dir)) {
      console.warn(`skip birds/${creature}: a human delivery is there (rig.json not interim)`);
      continue;
    }
    rmSync(dir, { recursive: true, force: true });
    for (const [plane, clips] of Object.entries(planes) as [PlaneId, readonly BirdClip[]][]) {
      for (const clip of clips) {
        for (let k = 0; k < (FLYER_FRAMES[clip] ?? CLIP_SPEC[clip].frames); k++) {
          const img = renderFlyerFrame(cfg, content, creature, plane, clip, k);
          put(
            join(dir, 'planes', plane, clip, `${String(k).padStart(2, '0')}.png`),
            encodePng8(img),
          );
          frames++;
        }
      }
    }
    const group = FLYER_GROUPS[creature];
    put(
      join(dir, 'rig.json'),
      await json({
        origin: 'interim',
        x2: false,
        encode: 'png8',
        ...(group === undefined ? {} : { group }),
        planeClips: planes,
      }),
    );
    console.log(`birds/${creature}: ${Object.keys(planes).join(', ')}`);
  }
}
if (process.argv.includes('--sheets')) {
  if (
    only === undefined ||
    only === 'guns' ||
    (only === 'none' && process.argv.includes('--gun-sheets'))
  )
    for (const [name, bytes] of gunSheets(cfg, oneGun)) {
      put(join(root, 'docs', 'art-preview', name), bytes);
      console.log(`docs/art-preview/${name}`);
    }
  const out = join(root, 'docs', 'art-preview');
  if (only !== 'guns')
    for (const [name, bytes] of contrastSheet(cfg, content)) {
      put(join(root, 'docs', 'art-preview', name), bytes);
      console.log(`docs/art-preview/${name}`);
    }
  // Graphics pass 2 (D-031): shared sprites, flyers, and each biome's props, layers and pans.
  const sheets: [string, Uint8Array][] = [
    ...(wants('sprites') ? [spriteSheet(cfg)] : []),
    ...(wants('flyers') ? [flyerSheet(cfg)] : []),
  ];
  for (const [name, bytes] of sheets) {
    put(join(out, name), bytes);
    console.log(`docs/art-preview/${name}`);
  }
  if (wants('scenery'))
    for (const plan of BIOME_PLANS) {
      const biome = content.biomes.find((b) => b.id === plan.biome);
      if (biome === undefined || (oneBiome !== undefined && plan.biome !== oneBiome)) continue;
      if (!(await loadBiomeArt(biome.id))) continue;
      const m = createPlaceholderManifest(content, biome);
      for (const [name, bytes] of biomeSheets(cfg, biome, (k) => m.origin(k))) {
        put(join(out, name), bytes);
        console.log(`docs/art-preview/${name}`);
      }
    }
  if (only === undefined || only === 'birds' || only === 'none')
    for (const [name, bytes] of birdSheets(cfg, content, oneCreature)) {
      put(join(out, name), bytes);
      console.log(`docs/art-preview/${name}`);
    }
}
console.log(`art:interim — ${frames} frames in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
