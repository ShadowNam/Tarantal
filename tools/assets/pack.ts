// The asset pipeline (M10, art bible §9, Tech §10): art-source/ → public/assets/ + asset-index.json.
// Layout of art-source/ and every rule checked here is in docs/06-ASSET-DELIVERY.md.
//   sprites/<key>.png (+ <key>.json {originX, originY})   any texture key (UI, FX, props, guns)
//   layers/<biome>/<layerId>.png (+ .json {top})         one parallax layer, full width incl. bleed
//   birds/<creature>/<clip>/<NN>.png (+ rig.json)         §3.4 clips; frames in the bird box
//   audio/sfx/<id>.wav · audio/music/<biome>/<stem>.wav · audio/ambience/<biome>.wav ·
//   audio/voice/<id>.wav                                  WAV masters, normalised here
// Output file names carry a content hash; the same sources always give the same bytes.
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { z } from 'zod';
import {
  ASSET_INDEX_PATH,
  assetIndexSchema,
  BIRD_CLIPS,
  COMMON_GROUP,
  type AssetIndex,
  type AudioKind,
  type BirdClip,
  type BirdPlaneEntry,
  type FileRef,
} from '../../src/game/assets/assetIndex';
import type { ContentBundle } from '../../src/content/schemas';
import type { PlaneId } from '../../src/sim/types';
import type { Catalog } from './catalog';
import { encodeMp3, encodeOgg } from './encode';
import { blank, blit, crop, encodePng, readPng, resize, type Rgba } from './image';
import { applyGain, integratedLufs, normaliseGainDb, truePeakDb } from './loudness';
import { shelfPackPages } from './shelfPack';
import {
  ATLAS_MAX,
  BIRD_BOX,
  CLIP_SPEC,
  LOUDNESS,
  TILE_WIDTH,
  TRUE_PEAK_CEILING_DB,
} from './targets';
import { readWav } from './wav';

export interface PackOptions {
  /** art-source/ (or a stand-in source folder). */
  readonly src: string;
  /** The public folder the index sits in (`public/`); files go under `<publicDir>/assets/`. */
  readonly publicDir: string;
  readonly content: ContentBundle;
  readonly catalog: Catalog;
}

export interface PackReport {
  readonly index: AssetIndex;
  readonly written: readonly string[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
}

const sidecarOrigin = z
  .strictObject({ originX: z.number().min(0).max(1), originY: z.number().min(0).max(1) })
  .partial();
const sidecarLayer = z.strictObject({ top: z.number() }).partial();
const rigSchema = z
  .strictObject({
    /** The bird's sim position in the frame (fractions); default = the bird box's origin. */
    originX: z.number().min(0).max(1),
    originY: z.number().min(0).max(1),
    /** Per-clip playback overrides. */
    clips: z.partialRecord(
      z.enum(BIRD_CLIPS),
      z.strictObject({ fps: z.number().positive().max(60), loop: z.boolean() }).partial(),
    ),
    /** Which clips go into each plane's atlas (default: all; near: NEAR_CLIPS). */
    planeClips: z.partialRecord(z.enum(['near', 'mid', 'far']), z.array(z.enum(BIRD_CLIPS))),
  })
  .partial();

const MUSIC_STEMS = ['calm', 'build', 'stampede'] as const;
/** Clips a near-plane bird (a pop-up) plays: the near atlas holds only these by default. */
export const NEAR_CLIPS: readonly BirdClip[] = ['peek', 'alert', 'hit_poof', 'tumble'];

function listPngs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? listPngs(p) : name.endsWith('.png') ? [p] : [];
    })
    .sort();
}

const posix = (p: string): string => p.split(sep).join('/');
const hash12 = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex').slice(0, 12);
const slug = (key: string): string => key.replace(/[^A-Za-z0-9_-]+/g, '_');

function readJson<T>(path: string, schema: z.ZodType<T>, errors: string[]): T | null {
  if (!existsSync(path)) return null;
  const r = schema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
  if (r.success) return r.data;
  errors.push(`${path}: ${z.prettifyError(r.error)}`);
  return null;
}

export async function packAssets(o: PackOptions): Promise<PackReport> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const written: string[] = [];
  const outRoot = join(o.publicDir, 'assets');
  const files = new Map<string, Uint8Array>();
  /** Queues a file `assets/<group>/<sub>/<name>.<hash>.<ext>`; returns its index reference. */
  const emit = (
    group: string,
    sub: string,
    name: string,
    ext: string,
    bytes: Uint8Array,
  ): FileRef => {
    const h = hash12(bytes);
    const path = `assets/${group}/${sub}/${name}.${h}.${ext}`;
    files.set(path, bytes);
    return { path, bytes: bytes.length, hash: h };
  };
  const index: AssetIndex = {
    version: 1,
    initialGroups: [COMMON_GROUP, o.catalog.homeBiome],
    images: {},
    layers: {},
    birds: {},
    audio: {},
  };

  // --- sprites -----------------------------------------------------------------------------
  const spriteDir = join(o.src, 'sprites');
  for (const path of listPngs(spriteDir)) {
    const key = posix(relative(spriteDir, path)).replace(/\.png$/, '');
    const cat = o.catalog.entries.get(key);
    if (cat?.kind !== 'texture') {
      errors.push(
        `sprites/${key}.png: no texture key "${key}" in the manifest (see the audit list)`,
      );
      continue;
    }
    const img = readPng(path);
    if (img.width !== cat.width || img.height !== cat.height)
      warnings.push(
        `sprites/${key}.png is ${img.width}×${img.height}, the placeholder is ${cat.width}×${cat.height}: views place it at its own size`,
      );
    const side = readJson(path.replace(/\.png$/, '.json'), sidecarOrigin, errors) ?? {};
    index.images[key] = {
      group: cat.group,
      file: emit(cat.group, 'img', slug(key), 'png', encodePng(img)),
      width: img.width,
      height: img.height,
      ...side,
    };
  }

  // --- parallax layers ---------------------------------------------------------------------
  const layerDir = join(o.src, 'layers');
  for (const path of listPngs(layerDir)) {
    const [biome, file] = posix(relative(layerDir, path)).split('/');
    const layerId = file?.replace(/\.png$/, '');
    const spec = [...o.catalog.layers.values()].find(
      (l) => l.biome === biome && l.layerId === layerId,
    );
    if (spec === undefined || biome === undefined || layerId === undefined) {
      errors.push(`layers/${biome}/${file}: no layer "${layerId}" in biome "${biome}"`);
      continue;
    }
    const img = readPng(path);
    if (img.width !== spec.width)
      errors.push(
        `layers/${biome}/${layerId}.png is ${img.width} px wide; it must be ${spec.width} (core + 2 × 300 bleed)`,
      );
    const side = readJson(path.replace(/\.png$/, '.json'), sidecarLayer, errors) ?? {};
    const tiles: FileRef[] = [];
    for (let x = 0, i = 0; x < img.width; x += TILE_WIDTH, i++) {
      const w = Math.min(TILE_WIDTH, img.width - x);
      tiles.push(
        emit(biome, 'layers', `${layerId}-${i}`, 'png', encodePng(crop(img, x, 0, w, img.height))),
      );
    }
    index.layers[spec.assetId] = {
      group: biome,
      tiles,
      tileWidth: TILE_WIDTH,
      left: spec.left,
      top: side.top ?? spec.top,
      height: img.height,
    };
  }

  // --- birds -------------------------------------------------------------------------------
  const birdDir = join(o.src, 'birds');
  const creatures = existsSync(birdDir)
    ? readdirSync(birdDir)
        .filter((n) => statSync(join(birdDir, n)).isDirectory())
        .sort()
    : [];
  for (const creature of creatures) {
    const planes = o.catalog.birds.get(creature);
    if (planes === undefined) {
      errors.push(`birds/${creature}: no creature "${creature}" with art in the manifest`);
      continue;
    }
    const rig = readJson(join(birdDir, creature, 'rig.json'), rigSchema, errors) ?? {};
    const clips = new Map<BirdClip, Rgba[]>();
    let master: { w: number; h: number } | null = null;
    for (const name of readdirSync(join(birdDir, creature)).sort()) {
      const dir = join(birdDir, creature, name);
      if (!statSync(dir).isDirectory()) continue;
      if (!(BIRD_CLIPS as readonly string[]).includes(name)) {
        errors.push(
          `birds/${creature}/${name}: not a clip (expected one of ${BIRD_CLIPS.join(', ')})`,
        );
        continue;
      }
      const frames = listPngs(dir).map(readPng);
      for (const f of frames) {
        master ??= { w: f.width, h: f.height };
        if (f.width !== master.w || f.height !== master.h)
          errors.push(
            `birds/${creature}/${name}: every frame must be ${master.w}×${master.h} (found ${f.width}×${f.height})`,
          );
      }
      if (frames.length > 0) clips.set(name as BirdClip, frames);
      const want = CLIP_SPEC[name as BirdClip].frames;
      if (frames.length !== want)
        warnings.push(
          `birds/${creature}/${name}: ${frames.length} frames (art bible §3.4 lists ${want})`,
        );
    }
    if (master === null) continue;
    if (Math.abs(master.w / master.h - BIRD_BOX.width / BIRD_BOX.height) > 0.01)
      errors.push(
        `birds/${creature}: frames are ${master.w}×${master.h}; they must have the bird box's ${BIRD_BOX.width}:${BIRD_BOX.height} aspect`,
      );
    for (const need of ['flap', 'forage_walk'] as const)
      if (!clips.has(need) && planes.length > 0)
        warnings.push(
          `birds/${creature}: no "${need}" clip — states that fall back to it use placeholder frames`,
        );
    const group =
      o.catalog.entries.get(`bird/${creature}/${planes[0] ?? 'mid'}`)?.group ?? COMMON_GROUP;
    const planeEntries: Partial<Record<PlaneId, BirdPlaneEntry>> = {};
    for (const plane of planes) {
      const s = o.content.scoring.planes[plane].scale;
      const w1 = Math.round(BIRD_BOX.width * s);
      const h1 = Math.round(BIRD_BOX.height * s);
      // Near birds are pop-ups: by default their atlas holds only the clips a pop-up plays.
      const keep = rig.planeClips?.[plane] ?? (plane === 'near' ? NEAR_CLIPS : BIRD_CLIPS);
      const planeClips = [...clips].filter(([clip]) => keep.includes(clip));
      const atlas = (k: 1 | 2): { pages: { image: FileRef; data: FileRef }[] } | null => {
        const w = w1 * k;
        const h = h1 * k;
        // Never upscale: a @2x set needs masters at least that big.
        if (master.h < h) return null;
        const cells = planeClips.flatMap(([clip, frames]) =>
          frames.map((f, i) => ({
            id: `${clip}/${String(i).padStart(2, '0')}`,
            width: w,
            height: h,
            img: f,
          })),
        );
        if (cells.length === 0) return null;
        let packed;
        try {
          packed = shelfPackPages(cells, k === 1 ? ATLAS_MAX.x1 : ATLAS_MAX.x2);
        } catch (e) {
          errors.push(`birds/${creature} ${plane} @${k}x: ${String(e)}`);
          return null;
        }
        const pages = packed.map((pk, pi) => {
          const page = blank(pk.width, pk.height);
          const frames: Record<string, unknown> = {};
          for (const p of pk.placed) {
            const cell = cells.find((c) => c.id === p.id);
            if (cell === undefined) continue;
            blit(page, resize(cell.img, w, h), p.x, p.y);
            frames[p.id] = {
              frame: { x: p.x, y: p.y, w, h },
              rotated: false,
              trimmed: false,
              spriteSourceSize: { x: 0, y: 0, w, h },
              sourceSize: { w, h },
            };
          }
          const name = `${slug(creature)}-${plane}@${k}x-${pi}`;
          const image = emit(group, 'birds', name, 'png', encodePng(page));
          const data = {
            frames,
            meta: {
              app: 'tools/pack-atlases.ts',
              image: image.path.split('/').pop(),
              size: { w: page.width, h: page.height },
              scale: '1',
            },
          };
          return {
            image,
            data: emit(
              group,
              'birds',
              name,
              'json',
              new TextEncoder().encode(JSON.stringify(data)),
            ),
          };
        });
        return { pages };
      };
      const x1 = atlas(1);
      if (x1 === null) continue;
      const x2 = atlas(2);
      const clipEntries: BirdPlaneEntry['clips'] = {};
      for (const [clip, frames] of planeClips) {
        clipEntries[clip] = {
          frames: frames.map((_, i) => `${clip}/${String(i).padStart(2, '0')}`),
          fps: rig.clips?.[clip]?.fps ?? CLIP_SPEC[clip].fps,
          loop: rig.clips?.[clip]?.loop ?? CLIP_SPEC[clip].loop,
        };
      }
      planeEntries[plane] = {
        group,
        x1,
        ...(x2 === null ? {} : { x2 }),
        scale: 1,
        originX: rig.originX ?? BIRD_BOX.originX / BIRD_BOX.width,
        originY: rig.originY ?? BIRD_BOX.originY / BIRD_BOX.height,
        clips: clipEntries,
      };
    }
    index.birds[creature] = planeEntries;
  }

  // --- audio -------------------------------------------------------------------------------
  const audioDir = join(o.src, 'audio');
  const wavs = existsSync(audioDir)
    ? readdirSync(audioDir, { recursive: true })
        .map((p) => posix(String(p)))
        .filter((p) => p.endsWith('.wav'))
        .sort()
    : [];
  const biomeIds = new Set(o.catalog.biomes);
  for (const rel of wavs) {
    const parts = rel.replace(/\.wav$/, '').split('/');
    let key: string | null = null;
    let kind: AudioKind = 'sfx';
    let group = COMMON_GROUP;
    if (parts[0] === 'sfx' && parts.length === 2) key = `sfx/${parts[1]}`;
    else if (parts[0] === 'voice' && parts.length === 2) {
      key = `voice/${parts[1]}`;
      kind = 'voice';
    } else if (
      parts[0] === 'music' &&
      parts.length === 3 &&
      biomeIds.has(parts[1] ?? '') &&
      (MUSIC_STEMS as readonly string[]).includes(parts[2] ?? '')
    ) {
      key = `music/${parts[1]}/${parts[2]}`;
      kind = 'music';
      group = parts[1] ?? group;
    } else if (parts[0] === 'ambience' && parts.length === 2 && biomeIds.has(parts[1] ?? '')) {
      key = `amb/${parts[1]}`;
      kind = 'ambience';
      group = parts[1] ?? group;
    }
    if (key === null) {
      errors.push(`audio/${rel}: unexpected path (see docs/06-ASSET-DELIVERY.md §Audio)`);
      continue;
    }
    if (o.catalog.entries.get(key)?.kind !== 'sound') {
      errors.push(`audio/${rel}: no sound "${key}" in the manifest`);
      continue;
    }
    let pcm;
    try {
      pcm = readWav(new Uint8Array(readFileSync(join(audioDir, rel))));
    } catch (e) {
      errors.push(`audio/${rel}: ${String(e)}`);
      continue;
    }
    const gain = normaliseGainDb(pcm, LOUDNESS[kind], TRUE_PEAK_CEILING_DB);
    const norm = applyGain(pcm, gain);
    const name = slug(parts.slice(1).join('-'));
    const sub = `audio/${parts[0] ?? 'sfx'}`;
    index.audio[key] = {
      group,
      kind,
      ogg: emit(group, sub, name, 'ogg', await encodeOgg(norm, kind)),
      mp3: emit(group, sub, name, 'mp3', await encodeMp3(norm, kind)),
      loop: kind === 'music' || kind === 'ambience',
      lufs: Math.round(integratedLufs(norm) * 10) / 10,
      peakDb: Math.round(truePeakDb(norm) * 10) / 10,
    };
  }

  // --- write -------------------------------------------------------------------------------
  if (errors.length > 0) return { index: assetIndexSchema.parse(index), written, warnings, errors };
  // The output folder is generated: wipe it so removed sources leave no stale files behind.
  rmSync(outRoot, { recursive: true, force: true });
  const checked = assetIndexSchema.parse(sortKeys(index));
  const total =
    Object.keys(checked.images).length +
    Object.keys(checked.layers).length +
    Object.keys(checked.birds).length +
    Object.keys(checked.audio).length;
  if (total === 0) return { index: checked, written, warnings, errors };
  for (const [path, bytes] of files) {
    const full = join(o.publicDir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, bytes);
    written.push(path);
  }
  const indexFile = join(o.publicDir, ASSET_INDEX_PATH);
  mkdirSync(dirname(indexFile), { recursive: true });
  writeFileSync(indexFile, `${JSON.stringify(checked, null, 2)}\n`);
  written.push(ASSET_INDEX_PATH);
  return { index: checked, written: written.sort(), warnings, errors };
}

/** Object keys sorted at every level (stable index diffs). */
function sortKeys<T>(v: T): T {
  if (Array.isArray(v)) return v.map(sortKeys) as T;
  if (v === null || typeof v !== 'object') return v;
  return Object.fromEntries(
    Object.entries(v as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, x]) => [k, sortKeys(x)]),
  ) as T;
}
