// Challenge links (GDD §12.4, Tech §12): `?c=<base64url(JSON {v, seed, mode, biome, weapon, score,
// by?, n?, h?})>` — friend challenges only (trivially editable; no leaderboard trust). The link
// holds the hunt setup, not a replay, so it stays ~150 characters and decodes synchronously
// (no deflate: D-024). Decoding never throws: anything malformed, oversized or naming content
// this build can't play is rejected with a reason. Pure.
import { z } from 'zod';
import {
  BonusMapIdSchema,
  WeekdayIdSchema,
  type ContentBundle,
  type DailyMeta,
} from '../content/schemas';
import { fromBase64Url, toBase64Url } from '../sim/replay/inputLog';
import type { ModeConfig } from '../sim/types';

export const CHALLENGE_VERSION = 1;
/** Prefix of contentHash kept in a link to warn when the game changed since it was made. */
export const CHALLENGE_HASH_CHARS = 8;

const contentId = z
  .string()
  .regex(/^[a-z][a-zA-Z0-9_-]*$/)
  .max(64);

export const ChallengeSchema = z.strictObject({
  v: z.literal(CHALLENGE_VERSION),
  seed: z.number().int().min(0).max(0xffffffff),
  mode: z.enum(['classic', 'daily']),
  biome: contentId,
  weapon: contentId,
  score: z.number().int().min(-10_000_000).max(10_000_000),
  /** Sender's name (optional; shown on the "beat this" card). */
  by: z.string().min(1).max(64).optional(),
  /** Daily number (#n) of a daily challenge, for the card. */
  n: z.number().int().min(1).max(1_000_000).optional(),
  /** v1.2 (D-033): the map — weekday layout and bonus map. Absent (links made before v1.2) =
   *  the plain biome, so an old link still plays the hunt it was made from. */
  l: WeekdayIdSchema.optional(),
  b: BonusMapIdSchema.optional(),
  /** contentHash prefix the hunt was played with. */
  h: z
    .string()
    .regex(/^[0-9a-f]+$/)
    .length(CHALLENGE_HASH_CHARS)
    .optional(),
});
export type Challenge = z.infer<typeof ChallengeSchema>;

export type ChallengeError =
  'tooLong' | 'notBase64' | 'notJson' | 'badShape' | 'unknownBiome' | 'unknownWeapon';

export type ChallengeDecode =
  | {
      readonly ok: true;
      readonly challenge: Challenge;
      /** The link was made with different content: the hunt may play out differently. */
      readonly contentChanged: boolean;
    }
  | { readonly ok: false; readonly reason: ChallengeError };

/** Drops control and bidi-override characters and trims; empty → undefined. */
export function cleanName(name: string | undefined, maxChars: number): string | undefined {
  if (name === undefined) return undefined;
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point
  const clean = name.replace(/[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g, '');
  const graphemes = Array.from(new Intl.Segmenter().segment(clean.trim()), (g) => g.segment);
  const cut = graphemes.slice(0, maxChars).join('').trim();
  return cut === '' ? undefined : cut;
}

export function encodeChallenge(c: Challenge): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(ChallengeSchema.parse(c))));
}

export interface ChallengeContext {
  readonly content: Pick<ContentBundle, 'weapons'>;
  /** Biomes this build can play and draw. */
  readonly playableBiomes: readonly string[];
  readonly contentHash: string;
  readonly limits: DailyMeta['challenge'];
}

export function decodeChallenge(param: string, ctx: ChallengeContext): ChallengeDecode {
  if (param.length > ctx.limits.maxLinkChars) return { ok: false, reason: 'tooLong' };
  let bytes: Uint8Array;
  try {
    bytes = fromBase64Url(param);
  } catch {
    return { ok: false, reason: 'notBase64' };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return { ok: false, reason: 'notJson' };
  }
  const parsed = ChallengeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'badShape' };
  const c = parsed.data;
  // v1.2: a bonus map rides only on a Classic layout.
  if (c.b !== undefined && (c.l === undefined || c.mode !== 'classic'))
    return { ok: false, reason: 'badShape' };
  if (!ctx.playableBiomes.includes(c.biome)) return { ok: false, reason: 'unknownBiome' };
  const w = ctx.content.weapons.weapons.find((x) => x.id === c.weapon);
  // A challenge lends its gun for that hunt (unlocks don't matter), but only a primary.
  if (w === undefined || w.kind !== 'primary') return { ok: false, reason: 'unknownWeapon' };
  const { by: rawBy, ...rest } = c;
  const by = cleanName(rawBy, ctx.limits.maxByChars);
  const challenge: Challenge = by === undefined ? rest : { ...rest, by };
  return {
    ok: true,
    challenge,
    contentChanged: c.h !== undefined && c.h !== ctx.contentHash.slice(0, CHALLENGE_HASH_CHARS),
  };
}

/** The hunt a challenge sets up: same seed, mode, biome and weapon as the sender's. */
export function challengeHunt(c: Challenge): { readonly seed: number; readonly mode: ModeConfig } {
  return {
    seed: c.seed,
    mode: {
      id: c.mode,
      biome: c.biome,
      weapon: c.weapon,
      ...(c.l === undefined ? {} : { layout: c.l }),
      ...(c.l === undefined || c.b === undefined ? {} : { bonus: c.b }),
    },
  };
}

/** A challenge for a finished hunt (the share link). */
export function challengeFor(
  hunt: {
    readonly seed: number;
    readonly mode: 'classic' | 'daily';
    readonly biome: string;
    readonly weapon: string;
    readonly score: number;
    readonly dailyNumber: number | null;
    /** v1.2: the map played (null = the plain biome). */
    readonly layout?: string | null;
    readonly bonus?: string | null;
  },
  contentHash: string,
  by?: string,
): Challenge {
  return {
    v: CHALLENGE_VERSION,
    seed: hunt.seed,
    mode: hunt.mode,
    biome: hunt.biome,
    weapon: hunt.weapon,
    score: hunt.score,
    ...(by === undefined ? {} : { by }),
    ...mapFields(hunt.layout ?? null, hunt.bonus ?? null),
    // A day before the content epoch has no #n (dailyNumber ≤ 0): leave it out, never throw.
    ...(hunt.dailyNumber === null || hunt.dailyNumber < 1 ? {} : { n: hunt.dailyNumber }),
    h: contentHash.slice(0, CHALLENGE_HASH_CHARS),
  };
}

/** `base?c=…` (the platform adapter may rewrite it for its portal: PlatformAdapter.shareUrl). */
export function challengeUrl(base: string, c: Challenge): string {
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}c=${encodeChallenge(c)}`;
}

export type ChallengeVerdict = 'win' | 'tie' | 'lose';

export function compareToChallenge(score: number, c: Challenge): ChallengeVerdict {
  return score > c.score ? 'win' : score === c.score ? 'tie' : 'lose';
}

/** The link's map fields; ids this version doesn't know are left out (never throws). */
function mapFields(layout: string | null, bonus: string | null): Pick<Challenge, 'l' | 'b'> {
  const l = WeekdayIdSchema.safeParse(layout);
  if (!l.success) return {};
  const b = BonusMapIdSchema.safeParse(bonus);
  return b.success ? { l: l.data, b: b.data } : { l: l.data };
}
