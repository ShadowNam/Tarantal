// v1.2x (D-034) playtest admin page (`?admin=1`, web builds only): the list of every playable map,
// the tester's options, and their review of each map (status, 1–5 rating, notes). It lives in its
// own save (`tm.admin.*`, see main.ts), so admin hunts never touch the player's bests, unlocks or
// progress. Feedback leaves as a markdown report or a prefilled GitHub new-issue link. Pure apart
// from the storage door (storage.ts).
import { z } from 'zod';
import type { ContentBundle } from '../content/schemas';
import { readValue, writeValue } from './storage';

/** Storage key of the admin save (under the admin namespace, so `tm.admin.review`). */
export const ADMIN_SAVE_KEY = 'review';
/** Storage namespace of admin pages (`e2e.` pages get `e2e.admin.`). */
export const ADMIN_NAMESPACE = 'admin.';
/** Where "Send to GitHub" opens a new issue. */
export const ISSUE_REPO = 'ShadowNam/Tarantal';
/** GitHub answers 414 above ~8 KB of URL; keep a margin (the PO attaches screenshots there). */
export const ISSUE_URL_MAX = 7000;
const NOTES_MAX = 4000;

export type AdminKind = 'classic' | 'daily' | 'season';

/** One playable map in the admin list. */
export interface AdminEntry {
  /** Stable id, the review's key: `classic:<biome>:plain|<day>|<bonus>`, `daily`,
   *  `season:<season>:<n>` (n = hunt in the season, 1-based). */
  readonly id: string;
  readonly kind: AdminKind;
  /** Classic: the biome; season: the season's biome. */
  readonly biome: string | null;
  /** Classic: 'none' (plain biome), a weekday id, or null for a bonus map (today's layout). */
  readonly layout: string | null;
  readonly bonus: string | null;
  /** Season: the season id and the run's hunt index (season × pattern + hunt). */
  readonly season: string | null;
  readonly huntIndex: number | null;
  /** Season: the hunt kind of the pattern ('plain' | 'omen' | 'boss'). */
  readonly stage: string | null;
}

const entry = (
  id: string,
  kind: AdminKind,
  rest: Partial<Omit<AdminEntry, 'id' | 'kind'>>,
): AdminEntry => ({
  id,
  kind,
  biome: rest.biome ?? null,
  layout: rest.layout ?? null,
  bonus: rest.bonus ?? null,
  season: rest.season ?? null,
  huntIndex: rest.huntIndex ?? null,
  stage: rest.stage ?? null,
});

/**
 * Every playable map, read from content (later layouts and bonus maps appear on their own):
 * each biome plain, its weekday layouts and its bonus maps; the Daily; each Season Run hunt.
 */
export function adminEntries(
  content: ContentBundle,
  playableBiomes: readonly string[],
): AdminEntry[] {
  const out: AdminEntry[] = [];
  for (const b of content.biomes) {
    if (!playableBiomes.includes(b.id)) continue;
    out.push(entry(`classic:${b.id}:plain`, 'classic', { biome: b.id, layout: 'none' }));
    for (const l of b.layouts)
      out.push(entry(`classic:${b.id}:${l.id}`, 'classic', { biome: b.id, layout: l.id }));
    for (const m of b.bonusMaps)
      out.push(entry(`classic:${b.id}:${m.id}`, 'classic', { biome: b.id, bonus: m.id }));
  }
  out.push(entry('daily', 'daily', {}));
  const pattern = content.run.huntPattern;
  content.run.seasons.forEach((s, si) => {
    if (!playableBiomes.includes(s.biome)) return;
    pattern.forEach((stage, hi) => {
      out.push(
        entry(`season:${s.id}:${hi + 1}`, 'season', {
          biome: s.biome,
          season: s.id,
          huntIndex: si * pattern.length + hi,
          stage,
        }),
      );
    });
  });
  return out;
}

// --- save -------------------------------------------------------------------------------------

export const ReviewStatusSchema = z.enum(['none', 'ok', 'work']);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

const ReviewSchema = z.object({
  status: ReviewStatusSchema,
  /** 0 = not rated, else 1–5. */
  rating: z.number().int().min(0).max(5),
  notes: z.string().max(NOTES_MAX),
});
export type AdminReview = z.infer<typeof ReviewSchema>;

export const OmenChoiceSchema = z.enum(['default', 'on', 'off']);

export const AdminOptionsSchema = z.object({
  /** null = the mode's gun. */
  weapon: z.string().max(40).nullable(),
  /** v1.3: a rifle's sight (null = the one fitted in the Skiet-Skuur; older saves: null). */
  sight: z.string().max(40).nullable().default(null),
  /** null = a fresh seed every hunt. */
  seed: z.number().int().min(0).max(0xffffffff).nullable(),
  /** null = the mode's length; else seconds (a positive multiple of 0.5). */
  huntSeconds: z
    .number()
    .positive()
    .max(600)
    .refine((v) => Number.isInteger(v * 2))
    .nullable(),
  omen: OmenChoiceSchema,
  /** A world event forced into the hunt (null = as content schedules them). */
  event: z.string().max(40).nullable(),
  /** Season Run quotas × this (1 = as content). */
  quotaMul: z.number().min(0).max(10),
  /** The Daily's date (YYYY-MM-DD) or null = today. */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
});
export type AdminOptions = z.infer<typeof AdminOptionsSchema>;

export const AdminSaveSchema = z.object({
  v: z.literal(1),
  reviews: z.record(z.string().max(80), ReviewSchema),
  options: AdminOptionsSchema,
  /** The entry selected in the list. */
  selected: z.string().max(80).nullable(),
  /** The hunt [Play] asked for: the page reloads into it (main.ts reads it at boot). */
  play: z.object({ entry: z.string().max(80), options: AdminOptionsSchema }).nullable(),
  /** The last admin hunt of each entry: its seed and gun (for the report and the issue). */
  played: z.record(
    z.string().max(80),
    z.object({ seed: z.number().int().min(0).max(0xffffffff), gun: z.string().max(40) }),
  ),
});
export type AdminSave = z.infer<typeof AdminSaveSchema>;

export const DEFAULT_OPTIONS: AdminOptions = {
  weapon: null,
  sight: null,
  seed: null,
  huntSeconds: null,
  omen: 'default',
  event: null,
  quotaMul: 1,
  date: null,
};
export const EMPTY_REVIEW: AdminReview = { status: 'none', rating: 0, notes: '' };

export function emptyAdminSave(): AdminSave {
  return { v: 1, reviews: {}, options: DEFAULT_OPTIONS, selected: null, play: null, played: {} };
}

const isAdminSave = (v: unknown): v is AdminSave => AdminSaveSchema.safeParse(v).success;

/** The admin save, or an empty one (missing or damaged). */
export function loadAdminSave(): AdminSave {
  return readValue(ADMIN_SAVE_KEY, emptyAdminSave(), isAdminSave);
}

export function storeAdminSave(s: AdminSave): void {
  writeValue(ADMIN_SAVE_KEY, s);
}

export function reviewOf(s: AdminSave, id: string): AdminReview {
  return s.reviews[id] ?? EMPTY_REVIEW;
}

/** A review changed; an untouched review (none, 0, no notes) is dropped from the save. */
export function withReview(s: AdminSave, id: string, patch: Partial<AdminReview>): AdminSave {
  const r = { ...reviewOf(s, id), ...patch };
  r.notes = r.notes.slice(0, NOTES_MAX);
  const others = Object.entries(s.reviews).filter(([k]) => k !== id);
  const untouched = r.status === 'none' && r.rating === 0 && r.notes === '';
  return { ...s, reviews: Object.fromEntries(untouched ? others : [...others, [id, r]]) };
}

// --- feedback out -----------------------------------------------------------------------------

/** What a report or issue says about where the hunt ran. */
export interface ReportContext {
  readonly build: string;
  readonly device: string;
  readonly viewport: string;
}

/** The facts of one entry for a report or issue (labels already translated). */
export interface EntryFacts {
  readonly id: string;
  readonly label: string;
  readonly mode: string;
  readonly gun: string;
  readonly seed: string;
}

const STATUS_TEXT: Record<ReviewStatus, string> = {
  none: 'not reviewed',
  ok: 'OK',
  work: 'needs work',
};

const stars = (n: number): string => (n === 0 ? '–' : `${'★'.repeat(n)}${'☆'.repeat(5 - n)}`);

/** Markdown report of every reviewed entry (status, rating or notes set), in list order. */
export function adminReport(
  save: AdminSave,
  entries: readonly EntryFacts[],
  ctx: ReportContext,
): string {
  const lines = [
    '# Tarantal Madness playtest report',
    '',
    `Build \`${ctx.build}\` · ${ctx.viewport} · ${ctx.device}`,
    '',
  ];
  let n = 0;
  for (const e of entries) {
    const r = save.reviews[e.id];
    if (r === undefined) continue;
    n++;
    lines.push(
      `## ${e.label} (\`${e.id}\`)`,
      '',
      `- Status: **${STATUS_TEXT[r.status]}** · rating ${stars(r.rating)}`,
      `- Mode ${e.mode} · gun ${e.gun} · seed ${e.seed}`,
    );
    if (r.notes.trim() !== '')
      lines.push(
        '',
        ...r.notes
          .trim()
          .split('\n')
          .map((l) => `> ${l}`),
      );
    lines.push('');
  }
  const done = entries.filter((e) => (save.reviews[e.id]?.status ?? 'none') !== 'none').length;
  lines.splice(4, 0, `${String(done)} of ${String(entries.length)} maps reviewed.`, '');
  if (n === 0) lines.push('_No notes yet._', '');
  return lines.join('\n');
}

function issueBody(e: EntryFacts, r: AdminReview, ctx: ReportContext, notes: string): string {
  return [
    `**Map:** ${e.label} (\`${e.id}\`)`,
    `**Mode:** ${e.mode} · **Gun:** ${e.gun} · **Seed:** ${e.seed}`,
    `**Status:** ${STATUS_TEXT[r.status]} · **Rating:** ${stars(r.rating)}`,
    `**Build:** \`${ctx.build}\``,
    `**Device:** ${ctx.device}`,
    `**Viewport:** ${ctx.viewport}`,
    '',
    '### Notes',
    '',
    notes.trim() === '' ? '_(none)_' : notes.trim(),
    '',
    '### Screenshots',
    '',
    '_Drag screenshots here._',
    '',
  ].join('\n');
}

/**
 * A prefilled GitHub new-issue link for one entry (label `playtest`). Notes are cut (with a
 * marker) so the whole URL stays under `max` characters.
 */
export function issueUrl(
  e: EntryFacts,
  r: AdminReview,
  ctx: ReportContext,
  max = ISSUE_URL_MAX,
): string {
  const title = `[playtest] ${e.label} — ${STATUS_TEXT[r.status]}${
    r.rating > 0 ? ` (${String(r.rating)}/5)` : ''
  }`;
  const make = (notes: string): string =>
    `https://github.com/${ISSUE_REPO}/issues/new?labels=playtest` +
    `&title=${encodeURIComponent(title)}&body=${encodeURIComponent(issueBody(e, r, ctx, notes))}`;
  let url = make(r.notes);
  if (url.length <= max) return url;
  // Shorten the notes until it fits (binary search over the cut length).
  const cut = (n: number): string => `${r.notes.slice(0, n).trimEnd()}\n\n… (cut, see the report)`;
  let lo = 0;
  let hi = r.notes.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (make(cut(mid)).length <= max) lo = mid;
    else hi = mid - 1;
  }
  url = make(cut(lo));
  return url;
}
