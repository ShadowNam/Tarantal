// D-045: the admin page's Project overview reads one JSON file, the project log, that the
// supervisor publishes on the git branch `project-log` (no CI there; it changes many times a day
// without a deploy). This module is its Zod schema and every pure helper the page uses: URL
// allowlist, Namibia-time formatting, grouping and sort orders, the offline copy. It is imported
// only by the Project overview's lazy chunk. Format and how to update it: docs/project/README.md.
import { z } from 'zod';

/** Where the project log lives (raw file on the `project-log` branch; CORS *, CDN cache 5 min). */
export const PROJECT_LOG_URL =
  'https://raw.githubusercontent.com/ShadowNam/Tarantal/project-log/project.json';
/** `?projectData=<url>` loads another copy (tests, previews), only from an allowed host. */
export const PROJECT_DATA_PARAM = 'projectData';
/** The only hosts a link, an image or `?projectData=` may point to (https only). */
export const ALLOWED_HOSTS: readonly string[] = [
  'github.com',
  'raw.githubusercontent.com',
  'shadownam.github.io',
  'claude.ai',
];
/** Pull requests are numbers in the log; this makes them links. */
export const PR_BASE = 'https://github.com/ShadowNam/Tarantal/pull/';
/** The product owner's time zone (Namibia, UTC+2 all year). */
export const NAMIBIA_TZ = 'Africa/Windhoek';

// --- schema ---------------------------------------------------------------------------------

/** UTC (or offset) time like 2026-10-25T16:56:00Z; seconds optional, a zone required. */
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;
const Iso = z.string().refine((s) => ISO_RE.test(s) && !Number.isNaN(Date.parse(s)), {
  message: 'expected a UTC time like 2026-10-25T16:56:00Z',
});
const Name = z.string().min(1);

export const LinkSchema = z.object({ label: Name, url: z.string() });
export const ImgSchema = z.object({
  src: z.string(),
  caption: z.string(),
  full: z.string().optional(),
});

export const NEED_KINDS = ['decision', 'feedback', 'question', 'check'] as const;
export const NeedsYouSchema = z.object({
  id: Name,
  kind: z.enum(NEED_KINDS),
  title: Name,
  detail: z.string(),
  asked: Iso,
  status: z.enum(['open', 'answered', 'dropped']),
  options: z.array(z.string()).optional(),
  answer: z.string().optional(),
  answered: Iso.optional(),
  /** The job that waits on it (a job id, or free text). */
  blocks: z.string().optional(),
  links: z.array(LinkSchema).optional(),
  images: z.array(ImgSchema).optional(),
});

export const JOB_STATUSES = ['done', 'review', 'running', 'blocked', 'next', 'later'] as const;
export const JobSchema = z.object({
  /** e.g. "v1.7". */
  id: Name,
  /** The build it lands in, e.g. "1.7.0". */
  version: z.string().optional(),
  title: Name,
  phase: z.string().optional(),
  status: z.enum(JOB_STATUSES),
  /** Done: the real start and merge; the others: the estimate. */
  start: Iso.optional(),
  end: Iso.optional(),
  estimate: z.boolean().optional(),
  owner: z.string().optional(),
  prs: z.array(z.number().int().positive()).optional(),
  summary: z.string().optional(),
  requestedBy: z.string().optional(),
  checklist: z
    .array(z.object({ text: z.string(), done: z.boolean(), at: Iso.optional() }))
    .optional(),
  tests: z.string().optional(),
  images: z.array(ImgSchema).optional(),
  links: z.array(LinkSchema).optional(),
});

export const SUGGESTION_STATUSES = ['idea', 'queued', 'done', 'declined'] as const;
export const SuggestionSchema = z.object({
  id: Name,
  title: Name,
  detail: z.string(),
  from: z.string(),
  date: Iso,
  status: z.enum(SUGGESTION_STATUSES),
  job: z.string().optional(),
});

export const ACTIVITY_KINDS = [
  'merge',
  'screenshots',
  'tests',
  'request',
  'decision',
  'note',
] as const;

// Lists other than the jobs and needs-you items may be left out (read as empty): the file is
// written by hand many times a day, and a missing glossary should not hide the status.
export const ProjectLogSchema = z.object({
  schema: z.literal(1),
  updated: Iso,
  by: z.string(),
  summary: z.string(),
  current: z.object({ version: z.string(), commit: z.string(), deployed: Iso.optional() }),
  links: z.array(LinkSchema).default([]),
  numbers: z
    .array(z.object({ label: z.string(), value: z.string(), note: z.string().optional() }))
    .default([]),
  needsYou: z.array(NeedsYouSchema),
  jobs: z.array(JobSchema),
  suggestions: z.array(SuggestionSchema).default([]),
  /** Oldest first in the file (the page shows them newest first); `date` is display text. */
  requests: z
    .array(
      z.object({
        date: z.string(),
        text: z.string(),
        outcome: z.string(),
        job: z.string().optional(),
      }),
    )
    .default([]),
  activity: z
    .array(
      z.object({
        at: Iso,
        kind: z.enum(ACTIVITY_KINDS),
        text: z.string(),
        links: z.array(LinkSchema).optional(),
        images: z.array(ImgSchema).optional(),
      }),
    )
    .default([]),
  /** Oldest first in the file (the page shows them newest first). */
  history: z
    .array(
      z.object({
        title: Name,
        when: z.string(),
        prs: z.string().optional(),
        decision: z.string().optional(),
        intro: z.string(),
        bullets: z.array(z.string()),
        feedbackLabel: z.string().optional(),
        feedback: z.array(z.string()).optional(),
        images: z.array(ImgSchema),
      }),
    )
    .default([]),
  evolution: z.array(ImgSchema).default([]),
  decisions: z.array(z.object({ id: z.string(), text: z.string() })).default([]),
  glossary: z.array(z.object({ term: z.string(), meaning: z.string() })).default([]),
});

export type ProjectLog = z.infer<typeof ProjectLogSchema>;
export type Link = z.infer<typeof LinkSchema>;
export type Img = z.infer<typeof ImgSchema>;
export type NeedsYou = z.infer<typeof NeedsYouSchema>;
export type NeedKind = NeedsYou['kind'];
export type Job = z.infer<typeof JobSchema>;
export type JobStatus = Job['status'];
export type Suggestion = z.infer<typeof SuggestionSchema>;
export type SuggestionStatus = Suggestion['status'];
export type Activity = ProjectLog['activity'][number];
export type ActivityKind = Activity['kind'];
export type HistoryStage = ProjectLog['history'][number];
export type ProjectRequest = ProjectLog['requests'][number];

// --- URL safety -----------------------------------------------------------------------------

/**
 * The URL if it is https on an allowed host (no credentials, no other port), else null. Links
 * and images from the log go through this; anything else is dropped silently.
 */
export function safeUrl(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username !== '' || u.password !== '' || u.port !== '')
    return null;
  return ALLOWED_HOSTS.includes(u.hostname) ? u.href : null;
}

function safeLinks(links: readonly Link[]): Link[] {
  return links.flatMap((l) => {
    const url = safeUrl(l.url);
    return url === null ? [] : [{ ...l, url }];
  });
}

function safeImages(images: readonly Img[]): Img[] {
  return images.flatMap((i) => {
    const src = safeUrl(i.src);
    if (src === null) return [];
    const full = i.full === undefined ? null : safeUrl(i.full);
    return [full === null ? { src, caption: i.caption } : { src, caption: i.caption, full }];
  });
}

/** An item's optional link and image lists, filtered (an absent list stays absent). */
function withLists<T extends { links?: Link[] | undefined; images?: Img[] | undefined }>(x: T): T {
  return {
    ...x,
    ...(x.links === undefined ? {} : { links: safeLinks(x.links) }),
    ...(x.images === undefined ? {} : { images: safeImages(x.images) }),
  };
}

/** A copy of the log with every link and image not on an allowed https host dropped. */
export function sanitizeLog(log: ProjectLog): ProjectLog {
  return {
    ...log,
    links: safeLinks(log.links),
    needsYou: log.needsYou.map(withLists),
    jobs: log.jobs.map(withLists),
    activity: log.activity.map(withLists),
    history: log.history.map((h) => ({ ...h, images: safeImages(h.images) })),
    evolution: safeImages(log.evolution),
  };
}

/** raw.githubusercontent.com serves every account's files: `?projectData=` takes only ours. */
const DATA_OWNER_PATH = '/shadownam/';

/**
 * Where to load the log from: `?projectData=<url>` when that URL is https on an allowed host
 * (on raw.githubusercontent.com: one of the ShadowNam account's files, so a crafted link cannot
 * show the product owner someone else's "needs you"), otherwise the published file.
 */
export function projectDataUrl(search: string): string {
  const v = new URLSearchParams(search).get(PROJECT_DATA_PARAM);
  const url = v === null ? null : safeUrl(v);
  if (url === null) return PROJECT_LOG_URL;
  const u = new URL(url);
  const ours =
    u.hostname !== 'raw.githubusercontent.com' ||
    u.pathname.toLowerCase().startsWith(DATA_OWNER_PATH);
  return ours ? url : PROJECT_LOG_URL;
}

/** The URL with `t=<now>` set, so neither the browser nor the CDN answers with an old copy. */
export function withCacheBuster(url: string, now: number): string {
  const u = new URL(url);
  u.searchParams.set('t', String(Math.floor(now)));
  return u.href;
}

export const pullUrl = (n: number): string => `${PR_BASE}${String(n)}`;

// --- reading --------------------------------------------------------------------------------

export type ParseResult =
  { readonly ok: true; readonly log: ProjectLog } | { readonly ok: false; readonly issue: string };

/** The first schema problem as "path: message" (shown small, for whoever fixes the file). */
export function firstIssue(error: z.ZodError): string {
  const i = error.issues[0];
  if (i === undefined) return 'invalid';
  const path = i.path.map((p) => (typeof p === 'number' ? `[${String(p)}]` : `.${String(p)}`));
  const where = path.join('').replace(/^\./, '');
  return where === '' ? i.message : `${where}: ${i.message}`;
}

/** Checks parsed JSON against the schema and drops unsafe links and images. */
export function readProjectLog(data: unknown): ParseResult {
  const r = ProjectLogSchema.safeParse(data);
  return r.success
    ? { ok: true, log: sanitizeLog(r.data) }
    : { ok: false, issue: firstIssue(r.error) };
}

/** Text from the network → a checked log, or the reason it could not be read. */
export function parseProjectLog(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, issue: `not JSON (${e instanceof Error ? e.message : String(e)})` };
  }
  return readProjectLog(data);
}

// --- the offline copy (the last log that loaded on this device) ------------------------------

/** Storage key (through src/meta/storage.ts) of the last good log. */
export const CACHE_KEY = 'project.lastGood';

export function encodeCache(savedAt: string, data: unknown): string {
  return JSON.stringify({ v: 1, savedAt, data });
}

/** The stored copy, if it is still readable with today's schema; else null. */
export function decodeCache(
  text: string | null,
): { readonly savedAt: string; readonly log: ProjectLog } | null {
  if (text === null) return null;
  try {
    const o: unknown = JSON.parse(text);
    if (typeof o !== 'object' || o === null) return null;
    const { v, savedAt, data } = o as { v?: unknown; savedAt?: unknown; data?: unknown };
    if (v !== 1 || typeof savedAt !== 'string' || Number.isNaN(Date.parse(savedAt))) return null;
    const r = readProjectLog(data);
    return r.ok ? { savedAt, log: r.log } : null;
  } catch {
    return null;
  }
}

// --- Namibia time ---------------------------------------------------------------------------

let formatter: Intl.DateTimeFormat | null = null;
function namibiaFormat(): Intl.DateTimeFormat {
  formatter ??= new Intl.DateTimeFormat('en-GB', {
    timeZone: NAMIBIA_TZ,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return formatter;
}

/** "25 Oct" and "18:56" of a UTC time in Namibia, or null for a time that does not parse. */
export function namibiaParts(iso: string): { readonly day: string; readonly time: string } | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const parts = namibiaFormat().formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '';
  return { day: `${get('day')} ${get('month')}`, time: `${get('hour')}:${get('minute')}` };
}

/** "25 Oct, 18:56" in Namibia time (the text itself if it is not a time). */
export function formatNamibia(iso: string): string {
  const p = namibiaParts(iso);
  return p === null ? iso : `${p.day}, ${p.time}`;
}

/** "25 Oct, ~21:00": an estimated time. */
export function formatApprox(iso: string): string {
  const p = namibiaParts(iso);
  return p === null ? iso : `${p.day}, ~${p.time}`;
}

/** "26 Oct, 02:30–06:00", or "26 Oct, 22:00 – 27 Oct, 02:00" across midnight. */
export function formatWindow(start: string, end: string): string {
  const a = namibiaParts(start);
  const b = namibiaParts(end);
  if (a === null || b === null) return `${formatNamibia(start)} – ${formatNamibia(end)}`;
  return a.day === b.day
    ? `${a.day}, ${a.time}–${b.time}`
    : `${a.day}, ${a.time} – ${b.day}, ${b.time}`;
}

/** A job's dates as the page words them: `key` picks the sentence, `when` fills it. */
export interface JobTime {
  readonly key: 'merged' | 'started' | 'eta' | 'expected' | 'expected_from';
  readonly when: string;
}

export function jobTimes(job: Job): JobTime[] {
  const { start, end } = job;
  switch (job.status) {
    case 'done':
      if (end !== undefined) return [{ key: 'merged', when: formatNamibia(end) }];
      return start === undefined ? [] : [{ key: 'started', when: formatNamibia(start) }];
    case 'running':
    case 'review':
    case 'blocked':
      return [
        ...(start === undefined ? [] : [{ key: 'started' as const, when: formatNamibia(start) }]),
        ...(end === undefined ? [] : [{ key: 'eta' as const, when: formatApprox(end) }]),
      ];
    case 'next':
    case 'later':
      if (start !== undefined && end !== undefined)
        return [{ key: 'expected', when: formatWindow(start, end) }];
      if (end !== undefined) return [{ key: 'expected', when: formatNamibia(end) }];
      return start === undefined ? [] : [{ key: 'expected_from', when: formatNamibia(start) }];
  }
}

// --- selections and orders ------------------------------------------------------------------

const time = (iso: string | undefined): number => {
  const ms = iso === undefined ? NaN : Date.parse(iso);
  return Number.isNaN(ms) ? -Infinity : ms;
};

/** Sorts newest first by a time; equal (or missing) times keep the file's order. */
function byTimeDesc<T>(items: readonly T[], at: (x: T) => string | undefined): T[] {
  return items
    .map((x, i) => ({ x, i, t: time(at(x)) }))
    .sort((a, b) => b.t - a.t || a.i - b.i)
    .map((e) => e.x);
}

/** Open needs-you items, newest question first. */
export function openNeeds(log: Pick<ProjectLog, 'needsYou'>): NeedsYou[] {
  return byTimeDesc(
    log.needsYou.filter((n) => n.status === 'open'),
    (n) => n.asked,
  );
}

/** Answered or dropped items, the most recently settled first. */
export function settledNeeds(log: Pick<ProjectLog, 'needsYou'>): NeedsYou[] {
  return byTimeDesc(
    log.needsYou.filter((n) => n.status !== 'open'),
    (n) => n.answered ?? n.asked,
  );
}

export type JobGroup = 'done' | 'active' | 'planned';
export function jobGroup(status: JobStatus): JobGroup {
  if (status === 'done') return 'done';
  return status === 'next' || status === 'later' ? 'planned' : 'active';
}

/** Jobs split into done, in progress (running, review, blocked) and planned, in file order. */
export function groupJobs(jobs: readonly Job[]): Record<JobGroup, Job[]> {
  const out: Record<JobGroup, Job[]> = { done: [], active: [], planned: [] };
  for (const j of jobs) out[jobGroup(j.status)].push(j);
  return out;
}

/** Ticked and total checklist items, or null without a checklist. */
export function checklistProgress(
  job: Pick<Job, 'checklist'>,
): { readonly done: number; readonly total: number } | null {
  const list = job.checklist;
  if (list === undefined || list.length === 0) return null;
  return { done: list.filter((c) => c.done).length, total: list.length };
}

/** The next `n` planned jobs: the `next` ones first, then `later`, each in file order. */
export function nextUp(jobs: readonly Job[], n = 3): Job[] {
  return [
    ...jobs.filter((j) => j.status === 'next'),
    ...jobs.filter((j) => j.status === 'later'),
  ].slice(0, n);
}

/** The last `n` done jobs, the most recent merge first (no merge time: the file's last first). */
export function recentlyDone(jobs: readonly Job[], n = 5): Job[] {
  const done = jobs.filter((j) => j.status === 'done');
  return byTimeDesc([...done].reverse(), (j) => j.end).slice(0, n);
}

/** The newest `n` activity entries. */
export function latestActivity(log: Pick<ProjectLog, 'activity'>, n = 10): Activity[] {
  return byTimeDesc(log.activity, (a) => a.at).slice(0, n);
}

/** Lists the file keeps oldest first (requests, history), shown newest first. */
export function newestFirst<T>(items: readonly T[]): T[] {
  return [...items].reverse();
}

/** Suggestions by status (ideas, queued, done, declined), newest first in each; empty ones left out. */
export function suggestionGroups(
  list: readonly Suggestion[],
): { readonly status: SuggestionStatus; readonly items: Suggestion[] }[] {
  return SUGGESTION_STATUSES.map((status) => ({
    status,
    items: byTimeDesc(
      list.filter((s) => s.status === status),
      (s) => s.date,
    ),
  })).filter((g) => g.items.length > 0);
}

export function findJob(log: Pick<ProjectLog, 'jobs'>, id: string | undefined): Job | undefined {
  return id === undefined ? undefined : log.jobs.find((j) => j.id === id);
}
