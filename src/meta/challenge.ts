// Challenge links (GDD §12.4, Tech §12): `?c=<base64url(JSON {v, seed, mode, biome, weapon, score,
// by?, n?, h?})>` — friend challenges only (trivially editable; no leaderboard trust). The link
// holds the hunt setup, not a replay, so it stays ~150 characters and decodes synchronously
// (no deflate: D-024). Decoding never throws: anything malformed, oversized or naming content
// this build can't play is rejected with a reason. Pure.
import { z } from 'zod';
import type { ContentBundle, DailyMeta } from '../content/schemas';
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
  if (!ctx.playableBiomes.includes(c.biome)) return { ok: false, reason: 'unknownBiome' };
  const w = ctx.content.weapons.weapons.find((x) => x.id === c.weapon);
  // A challenge lends its gun for that hunt (unlocks don't matter), but only a primary.
  if (w === undefined || w.kind !== 'primary')
    return { ok: false, reason: 'unknownWeapon' };
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
  return { seed: c.seed, mode: { id: c.mode, biome: c.biome, weapon: c.weapon } };
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
