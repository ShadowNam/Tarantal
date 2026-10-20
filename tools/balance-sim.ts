// Balance simulator v1 (GDD §13.8, build plan M3): plays many seeded Classic hunts per bot and
// reports the score distribution, wing-shot share and whole-flock rate, plus the M3 gates.
// Hunts run in parallel worker processes (one per core) so 500 seeds × 3 bots stays short.
//
// Usage: npx tsx tools/balance-sim.ts [--seeds 500] [--bots random,plinker,competent]
//          [--input pointer|touch] [--mode classic|daily] [--workers N] [--out tmp/x.json] [--json]
import { fork } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSim } from '../src/sim/Sim';
import type { InputKind, ModeId } from '../src/sim/types';
import { BOT_KINDS, createBot, type BotKind } from './bots';
import type { ContentBundle } from '../src/content/schemas';
import { loadContent } from './testContent';

interface Job {
  readonly bot: BotKind;
  readonly seeds: readonly number[];
  readonly input: InputKind;
  readonly mode: ModeId;
  /** Exploratory overrides (`--set path=json`), applied to a copy of the content. */
  readonly overrides?: readonly string[];
}

/**
 * Applies `path=json` overrides to a content copy, e.g. `birds.flockDefaults.spawnSpreadPx=320`
 * or `biomes.0.pacing.keyframes.*.flyoversPerMin=8` (`*` = every array element). For exploring
 * only: values are not re-validated, and final values belong in content/ (tune skill).
 */
export function withOverrides(content: ContentBundle, overrides: readonly string[]): ContentBundle {
  if (overrides.length === 0) return content;
  const copy: unknown = structuredClone(content);
  for (const o of overrides) {
    const eq = o.indexOf('=');
    if (eq < 0) throw new Error(`--set ${o}: expected path=value`);
    const value: unknown = JSON.parse(o.slice(eq + 1));
    setPath(copy, o.slice(0, eq).split('.'), value, o);
  }
  // Same shape as the validated input with plain values swapped in (not re-validated).
  return copy as ContentBundle;
}

function setPath(node: unknown, keys: readonly string[], value: unknown, where: string): void {
  const [k, ...rest] = keys;
  if (k === undefined || typeof node !== 'object' || node === null)
    throw new Error(`--set ${where}: bad path`);
  const rec = node as Record<string, unknown>;
  const targets = k === '*' && Array.isArray(node) ? node.map((_, i) => String(i)) : [k];
  for (const t of targets) {
    if (!(t in rec)) throw new Error(`--set ${where}: no key "${t}"`);
    if (rest.length === 0) rec[t] = value;
    else setPath(rec[t], rest, value, where);
  }
}

/** One hunt, reduced to what the report needs. */
export interface HuntRow {
  readonly bot: BotKind;
  readonly seed: number;
  readonly score: number;
  readonly bagged: number;
  readonly wingShots: number;
  readonly wholeFlocks: number;
  readonly flushes: number;
  readonly twoFlies: number;
  readonly shots: number;
  readonly accuracy: number;
}

export interface BotSummary {
  readonly bot: BotKind;
  readonly hunts: number;
  readonly mean: number;
  readonly p15: number;
  readonly p25: number;
  readonly p50: number;
  readonly p75: number;
  readonly p85: number;
  /** Wing shots / bagged birds. */
  readonly wingShotShare: number;
  /** Whole-Flock bonuses per hunt, and the share of hunts with at least one. */
  readonly wholeFlocksPerHunt: number;
  readonly wholeFlockHuntRate: number;
  readonly flushesPerHunt: number;
  readonly twoFliesPerHunt: number;
  readonly accuracy: number;
}

export function playRows(job: Job): HuntRow[] {
  const content = withOverrides(loadContent(), job.overrides ?? []);
  return job.seeds.map((seed) => {
    const sim = createSim({ seed, content, mode: { id: job.mode }, inputKind: job.input });
    const bot = createBot(job.bot, seed, content, job.input);
    while (!sim.isOver()) {
      sim.step(bot.next(sim.snapshot()));
      sim.drainEvents();
    }
    const r = sim.result();
    return {
      bot: job.bot,
      seed,
      score: r.score,
      bagged: r.bagged,
      wingShots: r.wingShots,
      wholeFlocks: r.wholeFlocks,
      flushes: r.flushes,
      twoFlies: r.twoFlies,
      shots: r.shots,
      accuracy: r.accuracy,
    };
  });
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[i] ?? 0;
}

export function summarise(bot: BotKind, rows: readonly HuntRow[]): BotSummary {
  const n = Math.max(1, rows.length);
  const scores = rows.map((r) => r.score).sort((a, b) => a - b);
  const sum = (f: (r: HuntRow) => number): number => rows.reduce((t, r) => t + f(r), 0);
  const bagged = sum((r) => r.bagged);
  return {
    bot,
    hunts: rows.length,
    mean: sum((r) => r.score) / n,
    p15: quantile(scores, 0.15),
    p25: quantile(scores, 0.25),
    p50: quantile(scores, 0.5),
    p75: quantile(scores, 0.75),
    p85: quantile(scores, 0.85),
    wingShotShare: bagged === 0 ? 0 : sum((r) => r.wingShots) / bagged,
    wholeFlocksPerHunt: sum((r) => r.wholeFlocks) / n,
    wholeFlockHuntRate: rows.filter((r) => r.wholeFlocks > 0).length / n,
    flushesPerHunt: sum((r) => r.flushes) / n,
    twoFliesPerHunt: sum((r) => r.twoFlies) / n,
    accuracy: sum((r) => r.accuracy) / n,
  };
}

export interface Gate {
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}

/** M3 "Done when" (build plan): competent in 2 500–4 500; plinker ≥ 25 % below it, above random. */
export function m3Gates(by: ReadonlyMap<BotKind, BotSummary>): Gate[] {
  const gates: Gate[] = [];
  const c = by.get('competent');
  const p = by.get('plinker');
  const r = by.get('random');
  if (c) {
    gates.push({
      name: 'competent mean in 2 500–4 500 (Bosveldjagter)',
      pass: c.mean >= 2500 && c.mean <= 4500,
      detail: c.mean.toFixed(0),
    });
  }
  if (c && p) {
    const gap = 1 - p.mean / c.mean;
    gates.push({
      name: 'plinker ≥ 25 % below competent',
      pass: gap >= 0.25,
      detail: `${(gap * 100).toFixed(1)} % below`,
    });
  }
  if (p && r) {
    gates.push({
      name: 'plinker above random',
      pass: p.mean > r.mean,
      detail: `${p.mean.toFixed(0)} vs ${r.mean.toFixed(0)}`,
    });
  }
  return gates;
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US').replace(/,/g, ' ');
}

export function formatTable(rows: readonly BotSummary[]): string {
  const head =
    '| bot | hunts | mean | p15 | p25 | p50 | p75 | p85 | wing-shot share | whole flocks / hunt | hunts with ≥1 | flushes / hunt | Twee Vlieë / hunt | accuracy |';
  const sep = '|' + '---|'.repeat(14);
  const lines = rows.map(
    (s) =>
      `| ${s.bot} | ${s.hunts} | ${fmt(s.mean)} | ${fmt(s.p15)} | ${fmt(s.p25)} | ${fmt(s.p50)} | ${fmt(s.p75)} | ${fmt(s.p85)} | ${(s.wingShotShare * 100).toFixed(1)} % | ${s.wholeFlocksPerHunt.toFixed(2)} | ${(s.wholeFlockHuntRate * 100).toFixed(0)} % | ${s.flushesPerHunt.toFixed(1)} | ${s.twoFliesPerHunt.toFixed(1)} | ${(s.accuracy * 100).toFixed(0)} % |`,
  );
  return [head, sep, ...lines].join('\n');
}

// --- CLI ---------------------------------------------------------------------------------------

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}

function runWorker(job: Job): Promise<HuntRow[]> {
  return new Promise((resolve, reject) => {
    const child = fork(fileURLToPath(import.meta.url), ['--worker'], {
      execArgv: ['--import', 'tsx'],
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    child.once('message', (msg) => {
      resolve(msg as HuntRow[]);
      child.disconnect();
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code !== 0) reject(new Error(`worker exited with ${String(code)}`));
    });
    child.send(job);
  });
}

async function main(): Promise<void> {
  const seeds = Number(arg('seeds', '500'));
  const bots = arg('bots', 'random,plinker,competent')
    .split(',')
    .map((b) => {
      const found = BOT_KINDS.find((k) => k === b);
      if (found === undefined) throw new Error(`unknown bot ${b} (${BOT_KINDS.join(', ')})`);
      return found;
    });
  const input: InputKind = arg('input', 'pointer') === 'touch' ? 'touch' : 'pointer';
  const mode: ModeId = arg('mode', 'classic') === 'daily' ? 'daily' : 'classic';
  const workers = Math.max(1, Number(arg('workers', String(availableParallelism()))));
  const overrides = process.argv.flatMap((a, i) =>
    a === '--set' ? [process.argv[i + 1] ?? ''] : [],
  );
  const started = performance.now();

  const all = Array.from({ length: seeds }, (_, i) => i + 1);
  const jobs: Job[] = [];
  for (const bot of bots) {
    const chunk = Math.ceil(seeds / workers);
    for (let i = 0; i < all.length; i += chunk)
      jobs.push({ bot, seeds: all.slice(i, i + chunk), input, mode, overrides });
  }
  // Run at most `workers` processes at a time.
  const results: HuntRow[] = [];
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

  const summaries = bots.map((b) =>
    summarise(
      b,
      results.filter((r) => r.bot === b),
    ),
  );
  const gates = m3Gates(new Map(summaries.map((s) => [s.bot, s])));
  const seconds = (performance.now() - started) / 1000;
  const report = { seeds, mode, input, bots, overrides, summaries, gates, seconds };

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
    `Balance sim — ${mode}, ${input}, ${seeds} seeds per bot, ${workers} workers, ${seconds.toFixed(0)} s`,
  );
  if (overrides.length > 0) console.log(`overrides: ${overrides.join('  ')}`);
  console.log(formatTable(summaries));
  for (const g of gates) console.log(`${g.pass ? 'PASS' : 'FAIL'}  ${g.name}: ${g.detail}`);
  if (gates.some((g) => !g.pass)) process.exitCode = 1;
}

if (process.argv.includes('--worker')) {
  process.once('message', (job: Job) => {
    process.send?.(playRows(job));
  });
} else if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  void main();
}
