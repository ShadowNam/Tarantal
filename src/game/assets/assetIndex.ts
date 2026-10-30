// The final-asset index (M10, docs/06-ASSET-DELIVERY.md): `public/assets/asset-index.json`,
// written by `tools/pack-atlases.ts` from `art-source/`. It lists every delivered file by manifest
// key. At boot the game fetches it; a key listed here loads its file and the procedural
// placeholder is skipped. A missing index, a bad entry or a file that fails to load leaves that
// key on its placeholder, so delivered art drops in without code changes and removing it falls
// back cleanly.
import { z } from 'zod';
import { hdGroupOf } from './hdPack';

/** Where the index lives, relative to the page (Vite `base: './'`). */
export const ASSET_INDEX_PATH = 'assets/asset-index.json';
/**
 * D-053: the HD pack's half of the index (each entry's `hd` part), apart so the first download's
 * index stays as small as before: fetched only when the Graphics card shows or HD is chosen, and
 * merged in (mergeHdIndex).
 */
export const HD_INDEX_PATH = 'assets/asset-index-hd.json';
/** Group of assets every hunt needs (UI, FX, shared birds and sounds). */
export const COMMON_GROUP = 'common';
/**
 * D-029: assets the first hunt doesn't need straight away (rare variants, bosses, guns that aren't
 * equipped). They download after the first download settles (while the title is up) and are installed
 * when first needed; until
 * then their keys show the placeholder. Not part of the first download.
 */
export const LATE_GROUP = 'late';
/**
 * v1.3 (D-036): the Ver plane's landscape strips (one per biome). Only maps that open the Ver
 * plane draw them, so they download in the background like the late group, in a chunk of their
 * own (each lazy chunk ≤ 1.5 MB). Until then the Ver strip shows its placeholder.
 */
export const VER_GROUP = 'ver';

/** Bird animation clips (art bible §3.4). */
export const BIRD_CLIPS = [
  'forage_walk',
  'peck',
  'alert',
  'run',
  'takeoff',
  'flap',
  'glide',
  'land',
  'hit_poof',
  'tumble',
  'peek',
] as const;
export type BirdClip = (typeof BIRD_CLIPS)[number];

const fileRef = z.object({
  /** Path relative to `public/` (and the built page), e.g. `assets/common/ui/shell.3f2a1b.png`. */
  path: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  /** First 12 hex chars of the file's SHA-256 (also in the file name, for cache-busting). */
  hash: z.string().regex(/^[0-9a-f]{12}$/),
});
export type FileRef = z.infer<typeof fileRef>;

/**
 * v1.7d (D-059): texture keys of a layer's tiles, `${prefix}/${i}`, where tiles with the same
 * file (hash) share the first one's key: one texture on the GPU, not one per copy (Namibië's HD
 * foreground had five identical empty tiles, 3.1 MB each).
 */
export function sharedTileKeys(prefix: string, tiles: readonly FileRef[]): string[] {
  const first = new Map<string, number>();
  return tiles.map((t, i) => {
    const j = first.get(t.hash) ?? i;
    if (j === i) first.set(t.hash, i);
    return `${prefix}/${String(j)}`;
  });
}

const group = z.string().min(1);
const fraction = z.number().min(0).max(1);

/**
 * Who made a delivered file (D-029). `interim` = code-drawn stand-in art from `npm run art:interim`
 * (tools/art/), replaced key by key by human art; absent = final. The audit lists both, and
 * `--strict` (the launch gate) fails while any interim key remains.
 */
export const ASSET_ORIGINS = ['final', 'interim'] as const;
export type AssetOrigin = (typeof ASSET_ORIGINS)[number];
const origin = z.enum(ASSET_ORIGINS).optional();

/** D-053: an image's HD file (in the group `<group>-hd`, src/game/assets/hdPack.ts). */
export const hdImage = z.object({
  file: fileRef,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** Design px per texture px (0.5 for 2× art). */
  scale: z.number().positive(),
});

/** D-054: a far-animal sheet's frames by name: [x, y, w, h, pivot x, pivot y (in the frame),
 *  pivot x, pivot y (from the animal's feet)], design px (src/game/view/faunaHerds.ts). */
export const faunaFrames = z.record(
  z.string(),
  z.tuple([
    z.number(),
    z.number(),
    z.number(),
    z.number(),
    z.number(),
    z.number(),
    z.number(),
    z.number(),
  ]),
);

const imageEntry = z.object({
  group,
  origin,
  file: fileRef,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** v1.4 B (D-039): design px per texture px (0.5 = a 2× image); absent = 1. */
  scale: z.number().positive().optional(),
  /** D-053: the same art at HD resolution (absent = Standard only). */
  hd: hdImage.optional(),
  /** Origin as fractions of the image; absent = the placeholder's origin. */
  originX: fraction.optional(),
  originY: fraction.optional(),
  /** D-054: a far-animal sheet's frames (absent on every other image). */
  frames: faunaFrames.optional(),
});

/** D-053: a layer's HD tiles (group `<group>-hd`): the same art at 2×, each tile ≤ 2048 px. */
export const hdLayer = z.object({
  tiles: z.array(fileRef).min(1),
  /** Width of one tile in design px (texture px × scale). */
  tileWidth: z.number().positive(),
  /** Design px per texture px (0.5 for 2× art). */
  scale: z.number().positive(),
});

const layerEntry = z.object({
  group,
  origin,
  /** Left to right, each ≤ 2048 px wide (art bible §4.1). */
  tiles: z.array(fileRef).min(1),
  /** Width of one tile in layer px (the last tile may be narrower). */
  tileWidth: z.number().positive(),
  /** Layer x of the first tile's left edge (−bleed) and the art's top edge, in design px. */
  left: z.number(),
  top: z.number(),
  height: z.number().int().positive(),
  /** v1.4 (#56): per `bucket` art px, the rows [from, to) fully opaque across it (from the art's
   *  top), or null — a zoomed view skips what they hide. Absent on older indexes. */
  solid: z
    .object({
      bucket: z.number().int().positive(),
      rows: z.array(z.tuple([z.number().int(), z.number().int()]).nullable()),
    })
    .optional(),
  /** D-053: the same layer at HD resolution (absent = Standard only). */
  hd: hdLayer.optional(),
});

const atlasPage = z.object({ image: fileRef, data: fileRef });
/** One or more pages (Phaser multi-atlas); frame names are unique across pages. */
export const atlasRef = z.object({ pages: z.array(atlasPage).min(1) });

const clipEntry = z.object({
  /** Frame names in the atlas, in play order. */
  frames: z.array(z.string().min(1)).min(1),
  fps: z.number().positive().max(60),
  loop: z.boolean(),
});

const birdPlaneEntry = z.object({
  group,
  origin,
  /** @1x atlas (low and medium tiers) and optional @2x (high tier, art bible §3.4). */
  x1: atlasRef,
  x2: atlasRef.optional(),
  /** D-053: the HD pack's @2x atlas (group `<group>-hd`; same frame names as x1). */
  hd: atlasRef.optional(),
  /** Design px per @1x texture px at this plane (the plane's scale is already applied). */
  scale: z.number().positive(),
  /** D-049: the plane scale (content/scoring.json) the frames were packed at. */
  planeScale: z.number().positive().optional(),
  /** The bird's sim position inside a frame, as fractions (matches content/birds.json hitboxes). */
  originX: fraction,
  originY: fraction,
  /**
   * D-029: frames are cropped per clip and carry their own pivot (the sim position inside the
   * crop); views then must not override the origin. Absent = full-box frames at originX/Y.
   */
  pivots: z.boolean().optional(),
  clips: z.partialRecord(z.enum(BIRD_CLIPS), clipEntry),
});

/**
 * First-person gun clips (D-029): `idle` (1 frame), `fire` (recoil), `reload` (break-open, pump,
 * ramrod: stretched to the weapon's reloadMs) and `flash` (the gun's own small muzzle flash).
 */
export const GUN_CLIPS = ['idle', 'fire', 'reload', 'flash'] as const;
export type GunClip = (typeof GUN_CLIPS)[number];

const gunEntry = z.object({
  group,
  origin,
  x1: atlasRef,
  x2: atlasRef.optional(),
  /** D-053: the HD pack's @2x atlas (group `<group>-hd`; same frame names as x1). */
  hd: atlasRef.optional(),
  /** D-029: frames carry their own pivot (grip, or the flash centre); see birdPlaneEntry. */
  pivots: z.boolean().optional(),
  /** Grip point (the gun's screen anchor) in the 420 × 520 gun frame, as fractions. */
  originX: fraction,
  originY: fraction,
  /** Muzzle (barrel tip) in the same frame, as fractions: where the flash and smoke appear. */
  tipX: fraction,
  tipY: fraction,
  clips: z.partialRecord(z.enum(GUN_CLIPS), clipEntry),
});

export const AUDIO_KINDS = ['sfx', 'music', 'ambience', 'voice'] as const;
export type AudioKind = (typeof AUDIO_KINDS)[number];

export const audioEntry = z.object({
  group,
  origin,
  kind: z.enum(AUDIO_KINDS),
  /** Ogg Vorbis (Chrome, Firefox, Android) and MP3 (Safari) of the same master. */
  ogg: fileRef,
  mp3: fileRef,
  loop: z.boolean(),
  /** Measured on the master after normalising (art bible §10): integrated LUFS, true peak dBTP. */
  lufs: z.number(),
  peakDb: z.number(),
});

export const assetIndexSchema = z.object({
  version: z.literal(1),
  /** Groups in the first download (common + the home biome); the rest load with their biome. */
  initialGroups: z.array(group).min(1),
  images: z.record(z.string(), imageEntry),
  layers: z.record(z.string(), layerEntry),
  /** creature id → plane → atlas and clips. */
  birds: z.record(z.string(), z.partialRecord(z.enum(['near', 'mid', 'far']), birdPlaneEntry)),
  audio: z.record(z.string(), audioEntry),
  /** D-029: weapon id → animated gun atlas (absent in older indexes). */
  guns: z.record(z.string(), gunEntry).default({}),
});

export type AssetIndex = z.infer<typeof assetIndexSchema>;

export type ImageEntry = z.infer<typeof imageEntry>;
export type LayerEntry = z.infer<typeof layerEntry>;
export type BirdPlaneEntry = z.infer<typeof birdPlaneEntry>;
export type ClipEntry = z.infer<typeof clipEntry>;
export type AudioEntry = z.infer<typeof audioEntry>;
export type GunEntry = z.infer<typeof gunEntry>;
export type AtlasRef = z.infer<typeof atlasRef>;
export type HdImage = z.infer<typeof hdImage>;
export type HdLayer = z.infer<typeof hdLayer>;

export const EMPTY_INDEX: AssetIndex = {
  version: 1,
  initialGroups: [COMMON_GROUP],
  images: {},
  layers: {},
  birds: {},
  audio: {},
  guns: {},
};

/** Parses an index; anything invalid is reported and treated as "no final assets". */
export function parseAssetIndex(raw: unknown): { index: AssetIndex; error: string | null } {
  const r = assetIndexSchema.safeParse(raw);
  if (r.success) return { index: r.data, error: null };
  return { index: EMPTY_INDEX, error: z.prettifyError(r.error) };
}

/** Every file the index references, with its group (size check, service worker, audit). */
export function indexFiles(index: AssetIndex): { path: string; group: string; bytes: number }[] {
  const out: { path: string; group: string; bytes: number }[] = [];
  const add = (g: string, f: FileRef): void => {
    out.push({ path: f.path, group: g, bytes: f.bytes });
  };
  const pages = (g: string, a: AtlasRef | undefined): void => {
    for (const page of a?.pages ?? []) {
      add(g, page.image);
      add(g, page.data);
    }
  };
  // D-053: HD files belong to the entry's HD group.
  for (const e of Object.values(index.images)) {
    add(e.group, e.file);
    if (e.hd !== undefined) add(hdGroupOf(e.group), e.hd.file);
  }
  for (const e of Object.values(index.layers)) {
    for (const t of e.tiles) add(e.group, t);
    for (const t of e.hd?.tiles ?? []) add(hdGroupOf(e.group), t);
  }
  for (const planes of Object.values(index.birds))
    for (const e of Object.values(planes)) {
      pages(e.group, e.x1);
      pages(e.group, e.x2);
      pages(hdGroupOf(e.group), e.hd);
    }
  for (const e of Object.values(index.guns)) {
    pages(e.group, e.x1);
    pages(e.group, e.x2);
    pages(hdGroupOf(e.group), e.hd);
  }
  for (const e of Object.values(index.audio)) {
    add(e.group, e.ogg);
    add(e.group, e.mp3);
  }
  // Planes may share one atlas: list each path once.
  const seen = new Set<string>();
  return out.filter((f) => !seen.has(f.path) && seen.add(f.path));
}
