// The asset pipeline (M10, art bible §9, Tech §10): art-source/ → public/assets/ + asset-index.json.
// Layout of art-source/ and every rule checked here is in docs/06-ASSET-DELIVERY.md.
//   sprites/<key>.png (+ <key>.json {originX, originY})   any texture key (UI, FX, props, guns)
//   layers/<biome>/<layerId>.png (+ .json {top, origin, encode})  one parallax layer, full width + bleed
//   birds/<creature>/<clip>/<NN>.png (+ rig.json)         §3.4 clips; frames in the bird box
//   birds/<creature>/planes/<plane>/<clip>/<NN>.png       optional per-plane masters (D-029)
//   guns/<weaponId>/<clip>/<NN>.png (+ rig.json)          idle/fire/reload/flash (D-029)
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
  ASSET_ORIGINS,
  assetIndexSchema,
  BIRD_CLIPS,
  COMMON_GROUP,
  GUN_CLIPS,
  LATE_GROUP,
  VER_GROUP,
  type AssetIndex,
  type AudioKind,
  type BirdClip,
  type BirdPlaneEntry,
  type FileRef,
  type GunEntry,
} from '../../src/game/assets/assetIndex';
import { RANGE_GROUP } from '../../src/game/range/rangeAssets';
import type { ContentBundle } from '../../src/content/schemas';
import type { ArtPlaneId as PlaneId } from '../../src/game/assets/artPlane';
import type { Catalog } from './catalog';
import { encodeMp3, encodeOgg } from './encode';
import {
  blank,
  blit,
  crop,
  decodePng,
  encodePng,
  encodePng8,
  opaqueBounds,
  readPng,
  resize,
  type Rgba,
} from './image';
import { applyGain, integratedLufs, normaliseGainDb, truePeakDb } from './loudness';
import { shelfPackPages } from './shelfPack';
import {
  ATLAS_MAX,
  BIRD_BOX,
  CLIP_SPEC,
  GUN_BOX,
  GUN_CLIP_SPEC,
  GUN_FLASH_BOX,
  LOUDNESS,
  TILE_WIDTH,
  TRUE_PEAK_CEILING_DB,
} from './targets';
import { readWav } from './wav';
import { FAUNA_RES } from '../../src/game/view/faunaSprites';

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

const provenance = z.enum(ASSET_ORIGINS);
const encoding = z.enum(['png', 'png8']);
const sidecarOrigin = z
  .strictObject({
    originX: z.number().min(0).max(1),
    originY: z.number().min(0).max(1),
    /** D-029: "interim" marks code-drawn stand-in art (absent = final). */
    origin: provenance,
    /** D-029: "png8" writes a palette PNG (smaller; fine for flat-fill art). */
    encode: encoding,
    /** v1.4 B (D-039): the image is drawn at this many texture px per design px (2 = a 2×
     *  master). Packed per plane (PROP_PLANE_RES) and shown scaled by 1 / that resolution. */
    master: z.number().int().min(1).max(4),
    /** v1.3: the long-range chunk (sight pictures, D-036) instead of the key's own group. */
    group: z.literal(VER_GROUP),
  })
  .partial();
/** v1.1 (D-032): `audio/<…>.json` next to a WAV: "interim" = code-made stand-in sound. */
const sidecarAudio = z
  .strictObject({
    origin: provenance,
    /** v1.5 (D-041): how an interim file was made (TTS engine, model, licence); not shipped. */
    source: z.string().max(300),
  })
  .partial();
const sidecarLayer = z
  .strictObject({
    top: z.number(),
    /** v1.3: the layer's asset group (default its biome). The Ver strips use "ver" (D-036). */
    group: z.literal(VER_GROUP),
    /** D-031: provenance and palette tiles, as for sprites (D-029). */
    origin: provenance,
    encode: encoding,
  })
  .partial();
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
    /** D-029: provenance ("interim" = code-drawn stand-in), atlas encoding, and false = no @2x set. */
    origin: provenance,
    encode: encoding,
    x2: z.boolean(),
    /** Pack resolution per plane (≤ 1): drawn scaled up by 1/res (saves memory on small planes). */
    planeRes: z.partialRecord(z.enum(['near', 'mid', 'far']), z.number().min(0.25).max(1)),
    /** Load group override: "late" (after the first download settles), "common" or a biome id. */
    group: z.string(),
  })
  .partial();
const gunRigSchema = z
  .strictObject({
    /** Grip and muzzle in the gun frame (fractions); defaults = GUN_BOX. */
    originX: z.number().min(0).max(1),
    originY: z.number().min(0).max(1),
    tipX: z.number().min(0).max(1),
    tipY: z.number().min(0).max(1),
    clips: z.partialRecord(
      z.enum(GUN_CLIPS),
      z.strictObject({ fps: z.number().positive().max(60), loop: z.boolean() }).partial(),
    ),
    origin: provenance,
    encode: encoding,
    x2: z.boolean(),
    group: z.string(),
  })
  .partial();

/** One frame to pack: its master image, its box size at @1x and the origin in that box (px). */
interface Cell {
  readonly id: string;
  readonly clip: string;
  readonly img: Rgba;
  readonly w: number;
  readonly h: number;
  readonly ox: number;
  readonly oy: number;
}

/** Transparent px kept around each clip's crop (filtering never samples a neighbour). */
const CROP_PAD = 2;
/**
 * Two frames of a clip merge only when every channel of every pixel is within this distance
 * (D-029 final review: a looser test merged visibly different frames — a ramrod stroke, a pupil
 * glance). Exact repeats such as an alert hold still pack once; ±2 absorbs rounding only.
 */
const FRAME_MERGE_TOLERANCE = 2;
const round4 = (v: number): number => Math.round(v * 10000) / 10000;

/** True when two same-size images match within `tolerance` per channel, with no outliers. */
export function nearlySame(a: Rgba, b: Rgba, tolerance: number): boolean {
  if (a.width !== b.width || a.height !== b.height) return false;
  for (let i = 0; i < a.data.length; i++)
    if (Math.abs((a.data[i] ?? 0) - (b.data[i] ?? 0)) > tolerance) return false;
  return true;
}

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
  /** A rig's `group` override (D-029: "late" loads after the first download settles), checked. */
  const groupFor = (want: string | undefined, fallback: string, label: string): string => {
    if (want === undefined) return fallback;
    if (
      want === COMMON_GROUP ||
      want === LATE_GROUP ||
      want === VER_GROUP ||
      o.catalog.biomes.includes(want)
    )
      return want;
    errors.push(`${label}/rig.json: group "${want}" is not common, late, ver or a biome id`);
    return fallback;
  };
  const index: AssetIndex = {
    version: 1,
    initialGroups: [COMMON_GROUP, o.catalog.homeBiome],
    images: {},
    layers: {},
    birds: {},
    audio: {},
    guns: {},
  };

  /**
   * Packs frames into Phaser multi-atlas pages at `k` × `res` × their box size (never upscaling).
   * D-029: frames are never *trimmed* (Phaser 4.2.1 draws trimmed frames played through an
   * animation with the neighbouring frames' pixels). Instead every frame of a clip is cropped to
   * the clip's common opaque bounds and carries a `pivot` (the bird's sim position or the gun's
   * grip inside the crop), which Phaser applies on every frame change. Frames of a clip that are
   * near-identical to an earlier one are packed once (`alias` maps the dropped frame to it).
   */
  const packAtlas = (
    cells: readonly Cell[],
    k: 1 | 2,
    base: string,
    group: string,
    sub: string,
    rig: { encode?: 'png' | 'png8' | undefined },
    res = 1,
    /** Reuse the @1x set's merges for the @2x set, so both name the same frames. */
    given?: ReadonlyMap<string, string>,
  ): { pages: { image: FileRef; data: FileRef }[]; alias: Map<string, string> } | null => {
    if (cells.length === 0) return null;
    // Never upscale: a @k set needs every master at least that big.
    if (cells.some((c) => c.img.height < c.h * k * res)) return null;
    const scaled = cells.map((c) => {
      const w = Math.round(c.w * k * res);
      const h = Math.round(c.h * k * res);
      const img = c.img.width === w && c.img.height === h ? c.img : resize(c.img, w, h);
      return { ...c, w, h, img, ox: (c.ox * w) / c.w, oy: (c.oy * h) / c.h };
    });
    // One crop per clip: the union of its frames' opaque pixels, padded for filtering.
    const crops = new Map<string, { x: number; y: number; w: number; h: number }>();
    for (const c of scaled) {
      const b = opaqueBounds(c.img);
      if (b === null) continue;
      const prev = crops.get(c.clip);
      const x0 = Math.min(prev?.x ?? b.x, b.x);
      const y0 = Math.min(prev?.y ?? b.y, b.y);
      const x1 = Math.max(prev === undefined ? b.x + b.w : prev.x + prev.w, b.x + b.w);
      const y1 = Math.max(prev === undefined ? b.y + b.h : prev.y + prev.h, b.y + b.h);
      crops.set(c.clip, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
    const alias = new Map<string, string>();
    const sized: {
      id: string;
      box: { x: number; y: number; w: number; h: number };
      img: Rgba;
      px: number;
      py: number;
    }[] = [];
    for (const c of scaled) {
      const raw = crops.get(c.clip) ?? { x: 0, y: 0, w: 1, h: 1 };
      const x = Math.max(0, raw.x - CROP_PAD);
      const y = Math.max(0, raw.y - CROP_PAD);
      const box = {
        x,
        y,
        w: Math.min(c.w, raw.x + raw.w + CROP_PAD) - x,
        h: Math.min(c.h, raw.y + raw.h + CROP_PAD) - y,
      };
      const img = crop(c.img, box.x, box.y, box.w, box.h);
      const twinId =
        given !== undefined
          ? given.get(c.id)
          : sized.find(
              (o) => o.id.startsWith(`${c.clip}/`) && nearlySame(o.img, img, FRAME_MERGE_TOLERANCE),
            )?.id;
      if (twinId !== undefined) {
        alias.set(c.id, twinId);
        continue;
      }
      sized.push({ id: c.id, box, img, px: (c.ox - box.x) / box.w, py: (c.oy - box.y) / box.h });
    }
    let packed;
    try {
      packed = shelfPackPages(
        sized.map((c) => ({ id: c.id, width: c.box.w, height: c.box.h })),
        k === 1 ? ATLAS_MAX.x1 : ATLAS_MAX.x2,
      );
    } catch (e) {
      errors.push(`${sub}/${base} @${k}x: ${String(e)}`);
      return null;
    }
    const pages = packed.map((pk, pi) => {
      const page = blank(pk.width, pk.height);
      const frames: Record<string, unknown> = {};
      for (const p of pk.placed) {
        const cell = sized.find((c) => c.id === p.id);
        if (cell === undefined) continue;
        blit(page, cell.img, p.x, p.y);
        const { w, h } = cell.box;
        frames[p.id] = {
          frame: { x: p.x, y: p.y, w, h },
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w, h },
          sourceSize: { w, h },
          pivot: { x: round4(cell.px), y: round4(cell.py) },
        };
      }
      const name = `${base}@${k}x-${pi}`;
      const bytes = rig.encode === 'png8' ? encodePng8(page) : encodePng(page);
      const image = emit(group, sub, name, 'png', bytes);
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
        data: emit(group, sub, name, 'json', new TextEncoder().encode(JSON.stringify(data))),
      };
    });
    return { pages, alias };
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
    const side = readJson(path.replace(/\.png$/, '.json'), sidecarOrigin, errors) ?? {};
    const { origin: made, encode, group: own, master = 1, ...place } = side;
    const master0 = readPng(path);
    // A 2× master is packed at the resolution its planes need (never above the master).
    const res = Math.min(master, propPlaneRes(o.content, key));
    const img =
      res === master
        ? master0
        : resize(
            master0,
            Math.round((master0.width * res) / master),
            Math.round((master0.height * res) / master),
          );
    const designW = Math.round(img.width / res);
    const designH = Math.round(img.height / res);
    if (master === 1 && (img.width !== cat.width || img.height !== cat.height))
      warnings.push(
        `sprites/${key}.png is ${img.width}×${img.height}, the placeholder is ${cat.width}×${cat.height}: views place it at its own size`,
      );
    else if (
      master > 1 &&
      place.originX === undefined &&
      (designW !== cat.width || designH !== cat.height)
    )
      warnings.push(
        `sprites/${key}.png is ${master0.width}×${master0.height} at ${master}×, the placeholder is ${cat.width}×${cat.height}: views place it at its own size`,
      );
    const imageGroup = own ?? cat.group;
    index.images[key] = {
      group: imageGroup,
      ...(made === undefined ? {} : { origin: made }),
      file: emit(
        imageGroup,
        'img',
        slug(key),
        'png',
        encode === 'png8' ? encodePng8(img) : encodePng(img),
      ),
      width: img.width,
      height: img.height,
      ...(res === 1 ? {} : { scale: 1 / res }),
      ...place,
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
    const layerGroup = side.group ?? biome;
    const solidOf: ([number, number] | null)[] = [];
    for (let x = 0, i = 0; x < img.width; x += TILE_WIDTH, i++) {
      const w = Math.min(TILE_WIDTH, img.width - x);
      const bytes = (side.encode === 'png8' ? encodePng8 : encodePng)(
        crop(img, x, 0, w, img.height),
      );
      // v1.4 (#56): measured on the tile as shipped (png8 quantises some alpha).
      solidOf.push(...solidRows(decodePng(bytes), SOLID_BUCKET_PX).rows);
      tiles.push(
        emit(
          layerGroup,
          'layers',
          layerGroup === biome ? `${layerId}-${i}` : `${biome}-${layerId}-${i}`,
          'png',
          bytes,
        ),
      );
    }
    index.layers[spec.assetId] = {
      group: layerGroup,
      ...(side.origin === undefined ? {} : { origin: side.origin }),
      tiles,
      tileWidth: TILE_WIDTH,
      left: spec.left,
      top: side.top ?? spec.top,
      height: img.height,
      // v1.4 (#56): rows that hide what is behind them, for the zoomed view's culling.
      solid: { bucket: SOLID_BUCKET_PX, rows: solidOf },
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
    // Shared masters, then per-plane masters (`planes/<plane>/<clip>/`) that replace them on that
    // plane (D-029: line weight and dot size by depth are drawn, not scaled).
    const readClips = (dir: string, label: string): Map<BirdClip, Rgba[]> => {
      const clips = new Map<BirdClip, Rgba[]>();
      if (!existsSync(dir)) return clips;
      let master: { w: number; h: number } | null = null;
      for (const name of readdirSync(dir).sort()) {
        const sub = join(dir, name);
        if (!statSync(sub).isDirectory() || (label === creature && name === 'planes')) continue;
        if (!(BIRD_CLIPS as readonly string[]).includes(name)) {
          errors.push(
            `birds/${label}/${name}: not a clip (expected one of ${BIRD_CLIPS.join(', ')})`,
          );
          continue;
        }
        const frames = listPngs(sub).map(readPng);
        for (const f of frames) {
          master ??= { w: f.width, h: f.height };
          if (f.width !== master.w || f.height !== master.h)
            errors.push(
              `birds/${label}/${name}: every frame must be ${master.w}×${master.h} (found ${f.width}×${f.height})`,
            );
        }
        if (frames.length > 0) clips.set(name as BirdClip, frames);
        const want = CLIP_SPEC[name as BirdClip].frames;
        if (frames.length !== want)
          warnings.push(
            `birds/${label}/${name}: ${frames.length} frames (art bible §3.4 lists ${want})`,
          );
      }
      if (
        master !== null &&
        Math.abs(master.w / master.h - BIRD_BOX.width / BIRD_BOX.height) > 0.01
      )
        errors.push(
          `birds/${label}: frames are ${master.w}×${master.h}; they must have the bird box's ${BIRD_BOX.width}:${BIRD_BOX.height} aspect`,
        );
      return clips;
    };
    const shared = readClips(join(birdDir, creature), creature);
    const perPlane = new Map<PlaneId, Map<BirdClip, Rgba[]>>();
    for (const plane of ['near', 'mid', 'far'] as const) {
      const dir = join(birdDir, creature, 'planes', plane);
      if (!existsSync(dir)) continue;
      if (!planes.includes(plane))
        warnings.push(`birds/${creature}/planes/${plane}: ${creature} never appears on ${plane}`);
      perPlane.set(plane, readClips(dir, `${creature}/planes/${plane}`));
    }
    const any = new Set([
      ...shared.keys(),
      ...[...perPlane.values()].flatMap((m) => [...m.keys()]),
    ]);
    if (any.size === 0) continue;
    for (const need of ['flap', 'forage_walk'] as const)
      if (!any.has(need) && planes.length > 0)
        warnings.push(
          `birds/${creature}: no "${need}" clip — states that fall back to it use placeholder frames`,
        );
    const group = groupFor(
      rig.group,
      o.catalog.entries.get(`bird/${creature}/${planes[0] ?? 'mid'}`)?.group ?? COMMON_GROUP,
      `birds/${creature}`,
    );
    const planeEntries: Partial<Record<PlaneId, BirdPlaneEntry>> = {};
    for (const plane of planes) {
      const s = o.content.scoring.planes[plane].scale;
      const w1 = Math.round(BIRD_BOX.width * s);
      const h1 = Math.round(BIRD_BOX.height * s);
      // Near birds are pop-ups: by default their atlas holds only the clips a pop-up plays.
      const keep = rig.planeClips?.[plane] ?? (plane === 'near' ? NEAR_CLIPS : BIRD_CLIPS);
      const merged = new Map([...shared, ...(perPlane.get(plane) ?? [])]);
      const planeClips = [...merged]
        .filter(([clip]) => keep.includes(clip))
        .sort(([a], [b]) => BIRD_CLIPS.indexOf(a) - BIRD_CLIPS.indexOf(b));
      const ox = (rig.originX ?? BIRD_BOX.originX / BIRD_BOX.width) * w1;
      const oy = (rig.originY ?? BIRD_BOX.originY / BIRD_BOX.height) * h1;
      const cells = planeClips.flatMap(([clip, frames]) =>
        frames.map((img, i) => ({
          id: `${clip}/${String(i).padStart(2, '0')}`,
          clip,
          img,
          w: w1,
          h: h1,
          ox,
          oy,
        })),
      );
      // D-029: a plane may be packed below its display size (rig planeRes) and drawn scaled up.
      const res = rig.planeRes?.[plane] ?? 1;
      const x1 = packAtlas(cells, 1, `${slug(creature)}-${plane}`, group, 'birds', rig, res);
      if (x1 === null) continue;
      const x2 =
        rig.x2 === false
          ? null
          : packAtlas(cells, 2, `${slug(creature)}-${plane}`, group, 'birds', rig, res, x1.alias);
      const clipEntries: BirdPlaneEntry['clips'] = {};
      for (const [clip, frames] of planeClips) {
        clipEntries[clip] = {
          frames: frames.map((_, i) => {
            const id = `${clip}/${String(i).padStart(2, '0')}`;
            return x1.alias.get(id) ?? id;
          }),
          fps: rig.clips?.[clip]?.fps ?? CLIP_SPEC[clip].fps,
          loop: rig.clips?.[clip]?.loop ?? CLIP_SPEC[clip].loop,
        };
      }
      planeEntries[plane] = {
        group,
        ...(rig.origin === undefined ? {} : { origin: rig.origin }),
        x1: { pages: x1.pages },
        ...(x2 === null ? {} : { x2: { pages: x2.pages } }),
        scale: 1 / res,
        pivots: true,
        originX: rig.originX ?? BIRD_BOX.originX / BIRD_BOX.width,
        originY: rig.originY ?? BIRD_BOX.originY / BIRD_BOX.height,
        clips: clipEntries,
      };
    }
    index.birds[creature] = planeEntries;
  }

  // --- guns (D-029) ------------------------------------------------------------------------
  const gunDir = join(o.src, 'guns');
  const gunIds = existsSync(gunDir)
    ? readdirSync(gunDir)
        .filter((n) => statSync(join(gunDir, n)).isDirectory())
        .sort()
    : [];
  for (const id of gunIds) {
    const cat = o.catalog.entries.get(`gun/${id}`);
    if (cat?.kind !== 'texture') {
      errors.push(`guns/${id}: no gun "gun/${id}" in the manifest`);
      continue;
    }
    const rig = readJson(join(gunDir, id, 'rig.json'), gunRigSchema, errors) ?? {};
    const cells: Cell[] = [];
    const clipEntries: GunEntry['clips'] = {};
    for (const clip of GUN_CLIPS) {
      const dir = join(gunDir, id, clip);
      const frames = listPngs(dir).map(readPng);
      if (frames.length === 0) continue;
      const box = clip === 'flash' ? GUN_FLASH_BOX : GUN_BOX;
      for (const [i, f] of frames.entries()) {
        if (Math.abs(f.width / f.height - box.width / box.height) > 0.01)
          errors.push(
            `guns/${id}/${clip}/${String(i).padStart(2, '0')}.png is ${f.width}×${f.height}; it must have the ${box.width}:${box.height} aspect`,
          );
        cells.push({
          id: `${clip}/${String(i).padStart(2, '0')}`,
          clip,
          img: f,
          w: box.width,
          h: box.height,
          // The gun's grip, or the flash's centre (it is drawn centred on the muzzle).
          ox:
            clip === 'flash'
              ? box.width / 2
              : (rig.originX ?? GUN_BOX.originX / GUN_BOX.width) * box.width,
          oy:
            clip === 'flash'
              ? box.height / 2
              : (rig.originY ?? GUN_BOX.originY / GUN_BOX.height) * box.height,
        });
      }
      clipEntries[clip] = {
        frames: frames.map((_, i) => `${clip}/${String(i).padStart(2, '0')}`),
        fps: rig.clips?.[clip]?.fps ?? GUN_CLIP_SPEC[clip].fps,
        loop: rig.clips?.[clip]?.loop ?? GUN_CLIP_SPEC[clip].loop,
      };
    }
    for (const dir of readdirSync(join(gunDir, id)))
      if (
        statSync(join(gunDir, id, dir)).isDirectory() &&
        !(GUN_CLIPS as readonly string[]).includes(dir)
      )
        errors.push(`guns/${id}/${dir}: not a gun clip (expected one of ${GUN_CLIPS.join(', ')})`);
    if (clipEntries.idle === undefined) {
      errors.push(`guns/${id}: an "idle" clip (one frame) is required`);
      continue;
    }
    const group = groupFor(rig.group, cat.group, `guns/${id}`);
    const x1 = packAtlas(cells, 1, `gun-${slug(id)}`, group, 'guns', rig);
    if (x1 === null) {
      errors.push(
        `guns/${id}: masters must be at least the ${GUN_BOX.width}×${GUN_BOX.height} box`,
      );
      continue;
    }
    const x2 =
      rig.x2 === false
        ? null
        : packAtlas(cells, 2, `gun-${slug(id)}`, group, 'guns', rig, 1, x1.alias);
    for (const c of Object.values(clipEntries))
      c.frames = c.frames.map((f) => x1.alias.get(f) ?? f);
    index.guns[id] = {
      group,
      ...(rig.origin === undefined ? {} : { origin: rig.origin }),
      x1: { pages: x1.pages },
      ...(x2 === null ? {} : { x2: { pages: x2.pages } }),
      pivots: true,
      originX: rig.originX ?? GUN_BOX.originX / GUN_BOX.width,
      originY: rig.originY ?? GUN_BOX.originY / GUN_BOX.height,
      tipX: rig.tipX ?? GUN_BOX.tipX / GUN_BOX.width,
      tipY: rig.tipY ?? GUN_BOX.tipY / GUN_BOX.height,
      clips: clipEntries,
    };
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
    if (parts[0] === 'sfx' && parts.length === 2) {
      key = `sfx/${parts[1]}`;
      // 24 Oct update (D-037): the Skietbaan's sounds load with its lazy "range" group.
      if (o.catalog.entries.get(key)?.group === RANGE_GROUP) group = RANGE_GROUP;
    } else if (parts[0] === 'voice' && parts.length === 3) {
      // v1.5 (D-041): audio/voice/<lang>/<bark key>.wav, one lazy pack per voice language.
      key = `voice/${parts[1]}/${parts[2]}`;
      kind = 'voice';
      group = o.catalog.entries.get(key)?.group ?? group;
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
    const side =
      readJson(join(audioDir, rel.replace(/\.wav$/, '.json')), sidecarAudio, errors) ?? {};
    index.audio[key] = {
      group,
      ...(side.origin === undefined ? {} : { origin: side.origin }),
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
    Object.keys(checked.audio).length +
    Object.keys(checked.guns).length;
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

/** v1.4 (#56): bucket width (art px) of a layer's opaque-row profile; divides TILE_WIDTH. */
export const SOLID_BUCKET_PX = 256;

/**
 * v1.4 (#56, D-038): per `bucket`-px column strip of a layer's art, the longest run of rows that
 * are fully opaque (alpha 255) across the whole strip, as [first, end) rows from the art's top,
 * or null. A zoomed view skips what such rows of a nearer layer hide (src/game/view/scopeCull.ts).
 */
export function solidRows(
  img: Rgba,
  bucket: number,
): { bucket: number; rows: ([number, number] | null)[] } {
  const rows: ([number, number] | null)[] = [];
  for (let bx = 0; bx < img.width; bx += bucket) {
    const x1 = Math.min(img.width, bx + bucket);
    let best: [number, number] | null = null;
    let start = -1;
    for (let y = 0; y <= img.height; y++) {
      let opaque = y < img.height;
      for (let x = bx; opaque && x < x1; x++)
        opaque = img.data[(y * img.width + x) * 4 + 3] === 255;
      if (opaque) {
        if (start < 0) start = y;
      } else if (start >= 0) {
        if (best === null || y - start > best[1] - best[0]) best = [start, y];
        start = -1;
      }
    }
    rows.push(best);
  }
  return { bucket, rows };
}

/**
 * v1.4 B (D-039): texture px per design px a prop is packed at on each plane. Near and mid props
 * are looked at closely (and through the Langloop's 3× sight), so they keep a 2× master; far and
 * Ver props are small on screen and pack at 1×.
 */
export const PROP_PLANE_RES: Readonly<Record<string, number>> = {
  near: 2,
  mid: 2,
  far: 1,
  ver: 1,
};

/** The highest resolution any placement of texture `key` needs (1 when it is no prop). */
export function propPlaneRes(content: ContentBundle, key: string): number {
  // v1.6 (D-042): far animals stay at their 3× master (they are seen through scopes).
  if (key.startsWith('fauna/')) return FAUNA_RES;
  let res = 0;
  for (const b of content.biomes)
    for (const p of b.props) {
      if (p.asset !== key) continue;
      const layer = b.layers.find((l) => l.id === p.layer);
      res = Math.max(res, PROP_PLANE_RES[layer?.plane ?? 'near'] ?? 1);
    }
  return res === 0 ? 1 : res;
}
