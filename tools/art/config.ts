// Interim art generator config (D-029): tools/art/config.json, validated here. Not in content/, so
// the content hash and golden replays are untouched by art changes.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { BIRD_CLIPS } from '../../src/game/assets/assetIndex';

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const perPlane = <T extends z.ZodType>(t: T) => z.object({ near: t, mid: t, far: t });

const birdPalette = z.object({
  plumage: hex,
  shadow: hex,
  highlight: hex,
  dots: hex,
  face: hex,
  faceHi: hex,
  wattle: hex,
  wattleShadow: hex,
  casque: hex,
  casqueHi: hex,
  beak: hex,
  legs: hex,
});
export type BirdPalette = z.infer<typeof birdPalette>;

export const BIRD_PARTS = [
  'sparkle',
  'crest',
  'eyeRing',
  'crown',
  'bandolier',
  'scowl',
  'eyePatch',
  'chippedCasque',
  'toothpick',
  'stubCasque',
] as const;
export type BirdPart = (typeof BIRD_PARTS)[number];

const variant = z.object({
  palette: birdPalette.partial(),
  dotScale: z.number().positive().optional(),
  parts: z.array(z.enum(BIRD_PARTS)),
});

const gunClips = z.object({
  fire: z.number().int().positive(),
  reload: z.number().int().positive().optional(),
  flash: z.number().int().positive(),
});

export const GUN_IDS = [
  'dubbelloop',
  'windbuks',
  'kettie',
  'pomp',
  'voorlaaier',
  'mielie_masjien',
] as const;
export type GunId = (typeof GUN_IDS)[number];

const configSchema = z.object({
  $comment: z.string().optional(),
  ink: hex,
  /** Masters are drawn at this multiple of the @1x frame (docs/06: @2x masters). */
  masterScale: z.number().int().positive(),
  birds: z.object({
    skyTint: z.object({ colour: hex, far: z.number().min(0).max(1) }),
    wobble: z.object({
      $comment: z.string().optional(),
      frequency: z.number().positive(),
      near: z.number().nonnegative(),
      mid: z.number().nonnegative(),
      far: z.number().nonnegative(),
    }),
    dots: z
      .object({ $comment: z.string().optional() })
      .and(perPlane(z.object({ r: z.number().positive(), spacing: z.number().positive() }))),
    dotVariety: z.object({
      $comment: z.string().optional(),
      minSize: z.number().positive(),
      maxSize: z.number().positive(),
      jitter: z.number().min(0).max(1),
      bellyThin: z.number().min(0).max(1),
      tailThin: z.number().min(0).max(1),
    }),
    /** Leg stroke width (bird units, before the ink outline). */
    legWidth: z.number().positive(),
    /** Inner detail lines as a fraction of the plane's ink weight. */
    innerLine: z.number().positive().max(1),
    eyeWhite: hex,
    star: hex,
    puff: hex,
    puffShadow: hex,
    base: birdPalette,
    variants: z.record(z.string(), variant),
    parts: z.object({
      crest: hex,
      eyeRing: hex,
      crownCap: hex,
      crownCapShadow: hex,
      crownRed: hex,
      crownRim: hex,
      potBlue: hex,
      potShadow: hex,
      potHi: hex,
      potRim: hex,
      potRust: hex,
      potChip: hex,
      bandolier: hex,
      bandolierShadow: hex,
      cob: hex,
      cobShadow: hex,
      husk: hex,
      eyePatch: hex,
      toothpick: hex,
      sparkle: hex,
    }),
    clipSets: z
      .object({ $comment: z.string().optional() })
      .catchall(z.array(z.enum(BIRD_CLIPS)).or(z.string())),
    creatures: z.record(z.string(), z.string()),
  }),
  guns: z
    .object({
      lineNear: z.number().positive(),
      /** Guns in the late download group (not needed to start the first hunt). */
      lateLoad: z.object({ $comment: z.string().optional(), ids: z.array(z.enum(GUN_IDS)) }),
      /** Per gun: how it sits in its frame (guns.ts poseFor). */
      poses: z
        .object({ $comment: z.string().optional() })
        .and(
          z.record(
            z.enum(GUN_IDS),
            z.object({ angle: z.number(), shift: z.number(), widen: z.number().positive() }),
          ),
        ),
      wobble: z.object({ frequency: z.number().positive(), scale: z.number().nonnegative() }),
      clips: z.object({ $comment: z.string().optional() }).and(z.record(z.enum(GUN_IDS), gunClips)),
    })
    .catchall(hex.or(z.number()).or(z.looseObject({}))),
  sheets: z.object({
    background: hex,
    checker: hex,
    cell: z.number().int().positive(),
    gap: z.number().int().nonnegative(),
  }),
});
export type ArtConfig = z.infer<typeof configSchema>;

export function loadArtConfig(): ArtConfig {
  const raw: unknown = JSON.parse(readFileSync(join(import.meta.dirname, 'config.json'), 'utf8'));
  return configSchema.parse(raw);
}

/** Every gun colour as a typed lookup (throws on a name missing from config.json). */
export function gunColour(c: ArtConfig, name: string): string {
  const v = (c.guns as Record<string, unknown>)[name];
  if (typeof v !== 'string') throw new Error(`tools/art/config.json guns.${name} is not a colour`);
  return v;
}

/** The clips drawn for a creature (config `birds.creatures` → `birds.clipSets`). */
export function clipsFor(c: ArtConfig, creature: string): readonly (typeof BIRD_CLIPS)[number][] {
  const set = c.birds.creatures[creature];
  const clips = set === undefined ? undefined : c.birds.clipSets[set];
  if (!Array.isArray(clips))
    throw new Error(`no clip set for ${creature} in tools/art/config.json`);
  return clips;
}

/** The variant's full palette (base + overrides). */
export function paletteFor(c: ArtConfig, creature: string): BirdPalette {
  const over = Object.entries(c.birds.variants[creature]?.palette ?? {}).filter(
    (e): e is [string, string] => e[1] !== undefined,
  );
  return { ...c.birds.base, ...Object.fromEntries(over) };
}
