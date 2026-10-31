// v1.9 (D-066): the schema of content/client/soundscape.json (the veld soundscape, Tech §7.1, art
// bible §10.2: one-shot calls over each area's ambience bed; presentation only, never in the sim
// bundle or its hash), its parser and its cross-reference checks. It lives here rather than in
// schemas.ts because only the lazy soundscape chunk and the tools use it: importing schemas.ts
// from that chunk split schemas.ts's chunk and grew the first download (~1 KB gzip). schemas.ts
// re-exports the type. Same conventions as schemas.ts (strict objects, `$comment` allowed).
import { z } from 'zod';

function obj<T extends z.ZodRawShape>(shape: T) {
  return z.strictObject({ $comment: z.string().optional(), ...shape });
}
const id = z.string().regex(/^[a-z][a-zA-Z0-9_-]*$/, 'ids are lower-case ascii');
const nonNegInt = z.number().int().nonnegative();
const posInt = z.number().int().positive();
const nonNeg = z.number().nonnegative();
const pos = z.number().positive();
const fraction = z.number().min(0).max(1);
const version = z.literal(1);

const soundscapeDistance = z.enum(['near', 'mid', 'far']);
export const SoundscapeSchema = obj({
    version,
    /** Soundscape voices at once (they never take one of the game's). */
    maxVoices: posInt.max(4),
    /** Voices of the AudioDirector's 16 a call must leave free for shots, bags and warnings. */
    reserveVoices: posInt.max(12),
    /** ± fraction of a call's mean gap drawn per call (0.45 = 55 %…145 %). */
    jitter: fraction,
    /** Ms between any two call starts (by construction in the scheduler). */
    minGapMs: nonNeg,
    /** A call more than this late (a slow frame, a held hunt) is skipped, not played late. */
    lateMs: pos,
    /** The title's rate factor (calmer than a hunt). */
    titleRateMul: fraction,
    /** No call of a warned creature from this long before its world event… */
    quietBeforeEventMs: nonNeg,
    /** …until this long after the creature has left. */
    quietAfterEventMs: nonNeg,
    /** The title's schedule seed (no hunt seed there). */
    titleSeed: nonNegInt,
    /** On the title, the soundscape's files load this long after the first gesture if no hunt
     *  has started (a hunt start loads them at once; never before START). */
    titleLoadDelayMs: nonNeg,
    /** Light whose factors apply when neither a layout light nor a special day's map has one. */
    defaultLight: id,
    /** dB added under a bonus map's haze light (further back sounds further away). */
    hazeDb: z.record(id, z.number().max(0)),
    distances: z.record(
      soundscapeDistance,
      obj({ levelDb: z.number().max(0), lowpassHz: nonNeg }),
    ),
    /** Time-of-day factor per layout light, by profile name. */
    profiles: z.record(id, z.record(id, nonNeg)),
    calls: z.record(
      id,
      obj({
        /** The sound key (sfx/amb_<id>), interim from tools/audio/soundscape.ts. */
        sound: z.string().regex(/^sfx\/amb_[a-z0-9_]+$/, 'soundscape sounds are sfx/amb_<id>'),
        /** How long a voice is held (sim ms), ≥ the sound's length. */
        lengthMs: posInt,
        /** A penalty creature this call sounds like (birds.json id): far only, quiet around it. */
        warns: id.optional(),
      }),
    ),
    /** v1.10 (D-067): Reënbui makes room — every call is quiet from quietBeforeMs before its
     *  build-up until quietAfterMs after the rain has eased — and plays its own cues (calls
     *  above), timed from each phase's start on sim time. */
    reenbui: obj({
      quietBeforeMs: nonNeg,
      quietAfterMs: nonNeg,
      /** Its voices at once (the soundscape's are quiet then). */
      maxVoices: posInt.max(4),
      /** A cue more than this late (a slow frame, a held hunt) is skipped. */
      lateMs: pos,
      cues: z
        .array(
          obj({
            call: id,
            phase: z.enum(['buildup', 'drops', 'swarm', 'easing']),
            /** First play, from the phase's start; then every everyMs (0 = once) in the phase. */
            atMs: nonNeg,
            everyMs: nonNeg,
            levelDb: z.number().max(0),
            distance: soundscapeDistance,
            /** Plays when the swarm rose with the Kalahari storm too (its own thunder and rain
             *  don't: the storm has them). */
            withStorm: z.boolean(),
          }),
        )
        .min(1),
    }),
    areas: z.record(
      id,
      z
        .array(
          obj({
            call: id,
            weight: pos,
            perMinute: pos.max(20),
            levelDb: z.number().max(0),
            distance: soundscapeDistance,
            profile: id,
          }),
        )
        .min(1),
    ),
  });
export type Soundscape = z.infer<typeof SoundscapeSchema>;


export type SoundscapeResult =
  | { readonly ok: true; readonly soundscape: Soundscape }
  | { readonly ok: false; readonly errors: readonly string[] };

export function parseSoundscape(raw: unknown): SoundscapeResult {
  const r = SoundscapeSchema.safeParse(raw);
  if (r.success) return { ok: true, soundscape: r.data };
  return {
    ok: false,
    errors: r.error.issues.map(
      (i) => `${i.path.length > 0 ? i.path.join('.') : '(root)'}: ${i.message}`,
    ),
  };
}

export interface SoundscapeRefs {
  /** Every biome id (content/biomes, the Harvest's `oes` too). */
  readonly biomes: readonly string[];
  /** Every light preset (feel.json lights). */
  readonly lights: readonly string[];
  /** The layout lights the biomes' maps use (each needs a factor in every profile). */
  readonly layoutLights: readonly string[];
  /** Bonus maps' lights (each needs a hazeDb unless it is a layout light). */
  readonly bonusLights: readonly string[];
  /** Creature id → its kind (birds.json). */
  readonly creatures: ReadonlyMap<string, string>;
  /** Sound keys that have a sound (the interim renders, or a delivery). */
  readonly sounds: ReadonlySet<string>;
}

/** Cross-reference errors (empty = fine). */
export function checkSoundscape(sc: Soundscape, refs: SoundscapeRefs): string[] {
  const errors: string[] = [];
  const lights = new Set(refs.lights);
  const layout = new Set(refs.layoutLights);
  for (const b of refs.biomes)
    if (sc.areas[b] === undefined) errors.push(`areas: biome ${b} has no soundscape`);
  for (const a of Object.keys(sc.areas))
    if (!refs.biomes.includes(a)) errors.push(`areas.${a}: no such biome`);
  if (!lights.has(sc.defaultLight)) errors.push(`defaultLight ${sc.defaultLight}: no such light`);
  if (!layout.has(sc.defaultLight))
    errors.push(`defaultLight ${sc.defaultLight}: not a layout light (profiles have no factor)`);
  for (const h of Object.keys(sc.hazeDb))
    if (!lights.has(h)) errors.push(`hazeDb.${h}: no such light`);
  for (const l of refs.bonusLights)
    if (!layout.has(l) && sc.hazeDb[l] === undefined)
      errors.push(`hazeDb: bonus light ${l} has no entry`);
  for (const [name, p] of Object.entries(sc.profiles)) {
    for (const l of Object.keys(p))
      if (!lights.has(l)) errors.push(`profiles.${name}.${l}: no such light`);
    for (const l of layout)
      if (p[l] === undefined) errors.push(`profiles.${name}: no factor for layout light ${l}`);
  }
  for (const [id, c] of Object.entries(sc.calls)) {
    if (!refs.sounds.has(c.sound)) errors.push(`calls.${id}: sound ${c.sound} has no sound`);
    if (c.warns !== undefined) {
      const kind = refs.creatures.get(c.warns);
      if (kind === undefined) errors.push(`calls.${id}.warns: no creature ${c.warns}`);
      else if (kind !== 'nonTarget')
        errors.push(`calls.${id}.warns: ${c.warns} is not a penalty creature (${kind})`);
    }
  }
  const used = new Set<string>();
  for (const [area, list] of Object.entries(sc.areas))
    list.forEach((e, i) => {
      const at = `areas.${area}[${i}]`;
      const c = sc.calls[e.call];
      used.add(e.call);
      if (c === undefined) errors.push(`${at}: no call ${e.call}`);
      else if (c.warns !== undefined && e.distance !== 'far')
        errors.push(`${at}: ${e.call} sounds like a penalty creature: far only`);
      if (sc.profiles[e.profile] === undefined) errors.push(`${at}: no profile ${e.profile}`);
    });
  sc.reenbui.cues.forEach((c, i) => {
    used.add(c.call);
    if (sc.calls[c.call] === undefined) errors.push(`reenbui.cues[${i}]: no call ${c.call}`);
  });
  for (const id of Object.keys(sc.calls))
    if (!used.has(id)) errors.push(`calls.${id}: no area plays it`);
  return errors;
}
