// Season Run balance sim (GDD §13.8, build plan M6): plays many seeded runs per charm policy
// with the competent bot and reports, per season, the pass rate — of the runs that reach a
// season, the share that clear all of its hunts (D-023) — next to the GDD targets, plus each
// hunt's score spread for tuning quotas. Runs go to worker processes (one per core).
//
// Usage: npm run balance -- --run [--seeds 500] [--policies none,synergy] [--hunts 6]
//          [--bot competent] [--workers N] [--set path=json] [--out tmp/x.json] [--json]
import { fork } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContentBundle } from '../src/content/schemas';
import { charmPool } from '../src/sim/run/run';
import { withOverrides } from './contentOverrides';
import { BOT_KINDS, type BotKind } from './bots';
import { CHARM_POLICIES, playRun, type CharmPolicy, type HuntRow } from './seasonRun';
import { loadContent, loadNotaboek } from './testContent';

/** GDD §13.8 pass-rate targets (competent bot), per season and policy. */
export const PASS_TARGETS: Readonly<Record<string, Readonly<Record<CharmPolicy, number>>>> = {
  herfs: { none: 0.85, synergy: 0.95 },
  winter: { none: 0.5, synergy: 0.8 },
  lente: { none: 0.1, synergy: 0.6 },
  somer: { none: 0, synergy: 0.35 },
};
/** M6 gate: within ±10 points (Herfs and Winter; Lente/Somer are checked in M8). */
export const PASS_TOLERANCE = 0.1;

interface Job {
  readonly policy: CharmPolicy;
  readonly bot: BotKind;
  readonly seeds: readonly number[];
  readonly hunts: number;
  readonly overrides: readonly string[];
}

export interface RunRow {
  readonly policy: CharmPolicy;
  readonly seed: number;
  readonly hunts: readonly HuntRow[];
}

/** Charms a new player can be offered: the Notaboek's charm rewards start locked (GDD §13.6). */
export function starterPool(content: ContentBundle): string[] {
  const locked = loadNotaboek().challenges.flatMap((c) =>
    c.reward.type === 'charm' ? [c.reward.id] : [],
  );
  return charmPool(content, locked);
}

export function playRuns(job: Job): RunRow[] {
  const content = withOverrides(loadContent(), job.overrides);
  const pool = starterPool(content);
  return job.seeds.map((seed) => ({
    policy: job.policy,
    seed,
    hunts: playRun({
      content,
      seed,
      bot: job.bot,
      policy: job.policy,
      pool,
      maxHunts: job.hunts,
    }).hunts,
  }));
}

export interface SeasonSummary {
  readonly season: string;
  readonly policy: CharmPolicy;
  readonly reached: number;
  readonly passRate: number;
  readonly target: number | null;
  readonly pass: boolean | null;
}

export interface HuntSummary {
  readonly policy: CharmPolicy;
  readonly huntIndex: number;
  readonly quota: number;
  readonly played: number;
  readonly passRate: number;
  readonly p15: number;
  readonly p50: number;
  readonly p85: number;
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[i] ?? 0;
}

export function summariseSeasons(
  content: ContentBundle,
  rows: readonly RunRow[],
  policies: readonly CharmPolicy[],
  hunts: number,
): SeasonSummary[] {
  const per = content.run.huntPattern.length;
  const out: SeasonSummary[] = [];
  content.run.seasons.forEach((s, si) => {
    if (si * per >= hunts) return;
    for (const policy of policies) {
      const mine = rows.filter((r) => r.policy === policy);
      const reached = mine.filter((r) => r.hunts.some((h) => h.huntIndex === si * per));
      const cleared = reached.filter((r) =>
        Array.from({ length: per }, (_, k) => si * per + k).every(
          (idx) => r.hunts.find((h) => h.huntIndex === idx)?.passed === true,
        ),
      );
      const rate = reached.length === 0 ? 0 : cleared.length / reached.length;
      const target = PASS_TARGETS[s.id]?.[policy] ?? null;
      const gated = (s.id === 'herfs' || s.id === 'winter') && target !== null;
      out.push({
        season: s.id,
        policy,
        reached: reached.length,
        passRate: rate,
        target,
        pass: gated ? Math.abs(rate - target) <= PASS_TOLERANCE + 1e-9 : null,
      });
    }
  });
  return out;
}

export function summariseHunts(
  rows: readonly RunRow[],
  policies: readonly CharmPolicy[],
): HuntSummary[] {
  const out: HuntSummary[] = [];
  for (const policy of policies) {
    const hunts = rows.filter((r) => r.policy === policy).flatMap((r) => r.hunts);
    const idx = [...new Set(hunts.map((h) => h.huntIndex))].sort((a, b) => a - b);
    for (const i of idx) {
      const hs = hunts.filter((h) => h.huntIndex === i);
      const scores = hs.map((h) => h.score).sort((a, b) => a - b);
      out.push({
        policy,
        huntIndex: i,
        quota: hs[0]?.quota ?? 0,
        played: hs.length,
        passRate: hs.filter((h) => h.passed).length / Math.max(1, hs.length),
        p15: quantile(scores, 0.15),
        p50: quantile(scores, 0.5),
        p85: quantile(scores, 0.85),
      });
    }
  }
  return out;
}

const pct = (x: number): string => `${(x * 100).toFixed(1)} %`;

export function formatSeasons(rows: readonly SeasonSummary[]): string {
  const lines = rows.map(
    (s) =>
      `| ${s.season} | ${s.policy} | ${s.reached} | ${pct(s.passRate)} | ${s.target === null ? '–' : `~${pct(s.target)}`} | ${s.pass === null ? 'M8' : s.pass ? 'PASS' : 'FAIL'} |`,
  );
  return [
    '| season | policy | runs reaching it | pass rate | target | ±10 |',
    '|---|---|---|---|---|---|',
    ...lines,
  ].join('\n');
}

export function formatHunts(rows: readonly HuntSummary[]): string {
  const lines = rows.map(
    (h) =>
      `| ${h.policy} | ${h.huntIndex + 1} | ${h.quota} | ${h.played} | ${pct(h.passRate)} | ${h.p15} | ${h.p50} | ${h.p85} |`,
  );
  return [
    '| policy | hunt | quota | played | passed | p15 | p50 | p85 |',
    '|---|---|---|---|---|---|---|---|',
    ...lines,
  ].join('\n');
}

// --- CLI ---------------------------------------------------------------------------------------

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}

function runWorker(job: Job): Promise<RunRow[]> {
  return new Promise((resolve, reject) => {
    const child = fork(fileURLToPath(import.meta.url), ['--worker'], {
      execArgv: ['--import', 'tsx'],
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    child.once('message', (msg) => {
      resolve(msg as RunRow[]);
      child.disconnect();
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code !== 0) reject(new Error(`worker exited with ${String(code)}`));
    });
    child.send(job);
  });
}

export async function seasonMain(): Promise<void> {
  const seeds = Number(arg('seeds', '500'));
  const hunts = Number(arg('hunts', '6'));
  const firstSeed = Number(arg('first-seed', '1'));
  const botArg = arg('bot', 'competent');
  const bot = BOT_KINDS.find((k) => k === botArg);
  if (bot === undefined) throw new Error(`unknown bot ${botArg}`);
  const policies = arg('policies', 'none,synergy')
    .split(',')
    .map((p) => {
      const found = CHARM_POLICIES.find((k) => k === p);
      if (found === undefined) throw new Error(`unknown policy ${p}`);
      return found;
    });
  const workers = Math.max(1, Number(arg('workers', String(availableParallelism()))));
  const overrides = process.argv.flatMap((a, i) =>
    a === '--set' ? [process.argv[i + 1] ?? ''] : [],
  );
  const started = performance.now();

  const all = Array.from({ length: seeds }, (_, i) => firstSeed + i);
  const jobs: Job[] = [];
  const chunk = Math.max(1, Math.ceil(seeds / (workers * 2)));
  for (const policy of policies) {
    for (let i = 0; i < all.length; i += chunk)
      jobs.push({ policy, bot, seeds: all.slice(i, i + chunk), hunts, overrides });
  }
  const results: RunRow[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(workers, jobs.length) }, async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        if (job === undefined) break;
        results.push(...(await runWorker(job)));
      }
    }),
  );
  const content = withOverrides(loadContent(), overrides);
  const seasons = summariseSeasons(content, results, policies, hunts);
  const huntRows = summariseHunts(results, policies);
  const seconds = (performance.now() - started) / 1000;
  const report = {
    seeds,
    firstSeed,
    hunts,
    bot,
    policies,
    overrides,
    seasons,
    huntRows,
    seconds,
  };
  const out = arg('out', '');
  if (out !== '') {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify({ ...report, rows: results }, null, 2));
  }
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report));
    return;
  }
  console.log(
    `Season Run balance — ${bot} bot, ${seeds} runs per policy (seeds ${firstSeed}…), first ${hunts} hunts, ${workers} workers, ${seconds.toFixed(0)} s`,
  );
  if (overrides.length > 0) console.log(`overrides: ${overrides.join('  ')}`);
  console.log(formatSeasons(seasons));
  console.log('');
  console.log(formatHunts(huntRows));
  if (seasons.some((s) => s.pass === false)) process.exitCode = 1;
}

if (process.argv.includes('--worker')) {
  process.once('message', (job: Job) => {
    process.send?.(playRuns(job));
  });
} else if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  void seasonMain();
}
