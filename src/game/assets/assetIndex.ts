// The final-asset index (M10, docs/06-ASSET-DELIVERY.md): `public/assets/asset-index.json`,
// written by `tools/pack-atlases.ts` from `art-source/`. It lists every delivered file by manifest
// key. At boot the game fetches it; a key listed here loads its file and the procedural
// placeholder is skipped. A missing index, a bad entry or a file that fails to load leaves that
// key on its placeholder, so delivered art drops in without code changes and removing it falls
// back cleanly.
import { z } from 'zod';

/** Where the index lives, relative to the page (Vite `base: './'`). */
export const ASSET_INDEX_PATH = 'assets/asset-index.json';
/** Group of assets every hunt needs (UI, FX, shared birds and sounds). */
export const COMMON_GROUP = 'common';
/**
 * D-029: assets the first hunt doesn't need straight away (rare variants, bosses, guns that aren't
 * equipped). They download after the hunt view is up and are installed when they arrive; until
 * then their keys show the placeholder. Not part of the first download.
 */
export const LATE_GROUP = 'late';

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

const imageEntry = z.object({
  group,
  origin,
  file: fileRef,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** Origin as fractions of the image; absent = the placeholder's origin. */
  originX: fraction.optional(),
  originY: fraction.optional(),
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
});

const atlasPage = z.object({ image: fileRef, data: fileRef });
/** One or more pages (Phaser multi-atlas); frame names are unique across pages. */
const atlasRef = z.object({ pages: z.array(atlasPage).min(1) });

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
  /** Design px per @1x texture px at this plane (the plane's scale is already applied). */
  scale: z.number().positive(),
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

const audioEntry = z.object({
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
  for (const e of Object.values(index.images)) add(e.group, e.file);
  for (const e of Object.values(index.layers)) for (const t of e.tiles) add(e.group, t);
  for (const planes of Object.values(index.birds))
    for (const e of Object.values(planes)) {
      for (const a of [e.x1, e.x2]) {
        for (const page of a?.pages ?? []) {
          add(e.group, page.image);
          add(e.group, page.data);
        }
      }
    }
  for (const e of Object.values(index.guns))
    for (const a of [e.x1, e.x2])
      for (const page of a?.pages ?? []) {
        add(e.group, page.image);
        add(e.group, page.data);
      }
  for (const e of Object.values(index.audio)) {
    add(e.group, e.ogg);
    add(e.group, e.mp3);
  }
  // Planes may share one atlas: list each path once.
  const seen = new Set<string>();
  return out.filter((f) => !seen.has(f.path) && seen.add(f.path));
}
