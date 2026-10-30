// Balance simulator v1 (GDD §13.8, build plan M3): plays many seeded Classic hunts per bot and
// reports the score distribution, wing-shot share and whole-flock rate, plus the M3 gates.
// Hunts run in parallel worker processes (one per core) so 500 seeds × 3 bots stays short.
//
// Usage: npx tsx tools/balance-sim.ts [--seeds 500] [--bots random,plinker,competent]
//          [--input pointer|touch] [--mode classic|daily|harvest] [--omen on|off] [--workers N]
//          [--biome <id>]  (M8: any biome; default the mode's)
//          [--layout mon..sun] [--bonus verder|nogVerder|dieVerste]  (v1.2/v1.3 maps)
//          [--feesdag halloween]  (D-048 special day; with --mode daily)
//          [--weapon <id>] [--sight iron|peep|scope_small]  (v1.3: e.g. the Twee-Twee)
//          [--out tmp/x.json] [--json]
//        npm run balance -- --run …   Season Runs per charm policy (see tools/season-sim.ts)
// --omen overrides the mode's omen (modes.json: Classic off, Daily on).
import { fork } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSim } from '../src/sim/Sim';
import type { InputKind, ModeId } from '../src/sim/types';
import { BOT_KINDS, createBot, type BotKind } from './bots';
import { withOverrides } from './contentOverrides';
import { loadContent } from './testContent';

export interface Job {
  readonly bot: BotKind;
  readonly seeds: readonly number[];
  readonly input: InputKind;
  readonly mode: ModeId;
  /** Overrides the mode's omen (biome weather). */
  readonly omen?: boolean | undefined;
  /** Overrides the mode's biome (M8: each biome's own Classic report). */
  readonly biome?: string | undefined;
  /** v1.2: weekday layout and bonus map (tools/map-report.ts: one report per map). */
  readonly layout?: string | undefined;
  readonly bonus?: string | undefined;
  /** D-049: a special day (feesdae.json id), e.g. the Halloween Spookjag. */
  readonly feesdag?: string | undefined;
  /** v1.3: the gun (default: the mode's) and a rifle's sight (default: the gun's). */
  readonly weapon?: string | undefined;
  readonly sight?: string | undefined;
  /** Exploratory overrides (`--set path=json`), applied to a copy of the content. */
  readonly overrides?: readonly string[];
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
  readonly secrets: number;
  readonly crates: number;
  readonly penalties: number;
  /** v1.3: birds bagged on the Ver plane. */
  readonly baggedVer: number;
  /** v1.8 (D-050): what the tin cans paid, knock-offs, air hits, Weg!s and the longest chain
   *  (0 on maps without a fence). */
  readonly canPoints: number;
  readonly canKnocks: number;
  readonly canAirHits: number;
  readonly canWeg: number;
  readonly canBestChain: number;
  /** 1.9.3 (D-056): what the makalani nuts paid, knock-offs, air hits and pops (0 without palms). */
  readonly nutPoints: number;
  readonly nutKnocks: number;
  readonly nutAirHits: number;
  readonly nutPops: number;
  /** v1.8c (D-063), the Harvest only: crop saved (%), warthogs and raiders bagged, the crop bonus,
   *  and shots aimed (by accident: no bot aims at them) at a worker or a piglet that cost points. */
  readonly crop?: number;
  readonly warthogs?: number;
  readonly raiders?: number;
  readonly cropBonus?: number;
  readonly workerHits?: number;
  readonly pigletHits?: number;
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
  readonly secretsPerHunt: number;
  readonly cratesPerHunt: number;
  readonly penaltiesPerHunt: number;
  readonly verPerHunt: number;
}

export function playRows(job: Job): HuntRow[] {
  const content = withOverrides(loadContent(), job.overrides ?? []);
  return job.seeds.map((seed) => {
    const sim = createSim({
      seed,
      content,
      mode: {
        id: job.mode,
        ...(job.omen === undefined ? {} : { omen: job.omen }),
        ...(job.biome === undefined ? {} : { biome: job.biome }),
        ...(job.layout === undefined ? {} : { layout: job.layout }),
        ...(job.bonus === undefined ? {} : { bonus: job.bonus }),
        ...(job.feesdag === undefined ? {} : { feesdag: job.feesdag }),
        ...(job.weapon === undefined ? {} : { weapon: job.weapon }),
        ...(job.sight === undefined ? {} : { sight: job.sight }),
      },
      inputKind: job.input,
    });
    const bot = createBot(job.bot, seed, content, job.input);
    let workerHits = 0;
    let pigletHits = 0;
    let raiders = 0;
    while (!sim.isOver()) {
      sim.step(bot.next(sim.snapshot()));
      for (const e of sim.drainEvents()) {
        if (e.type === 'harvestBystanderHit' && e.points < 0) {
          if (e.who === 'worker') workerHits++;
          else pigletHits++;
        } else if (e.type === 'baboonBagged') raiders++;
      }
    }
    const r = sim.result();
    const hv = sim.snapshot().harvest;
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
      secrets: r.secrets,
      crates: r.crates,
      penalties: r.penalties,
      baggedVer: r.baggedByPlane.ver,
      canPoints: r.cans?.points ?? 0,
      canKnocks: r.cans?.knocks ?? 0,
      canAirHits: r.cans?.airHits ?? 0,
      canWeg: r.cans?.weg ?? 0,
      canBestChain: r.cans?.bestChain ?? 0,
      nutPoints: r.nuts?.points ?? 0,
      nutKnocks: r.nuts?.knocks ?? 0,
      nutAirHits: r.nuts?.airHits ?? 0,
      nutPops: r.nuts?.pops ?? 0,
      ...(hv === null
        ? {}
        : {
            crop: hv.crop,
            warthogs: hv.warthogsBagged,
            raiders,
            cropBonus: hv.cropBonus,
            workerHits,
            pigletHits,
          }),
    };
  });
}

/** v1.8c (D-063): the Harvest's own columns per bot (means per hunt). */
export function harvestTable(bots: readonly BotKind[], rows: readonly HuntRow[]): string {
  const head =
    '| bot | hunts | score mean | crop saved mean | crop p25 | crop p75 | crop bonus | warthogs | raiders | birds | worker hits (aimed) | piglet hits |';
  const sep = '|' + '---|'.repeat(12);
  const lines = bots.map((b) => {
    const rs = rows.filter((r) => r.bot === b);
    const n = Math.max(1, rs.length);
    const mean = (f: (r: HuntRow) => number): number => rs.reduce((t, r) => t + f(r), 0) / n;
    const crops = rs.map((r) => r.crop ?? 0).sort((a, c) => a - c);
    return `| ${b} | ${rs.length} | ${mean((r) => r.score).toFixed(0)} | ${mean((r) => r.crop ?? 0).toFixed(1)} % | ${quantile(crops, 0.25).toFixed(1)} % | ${quantile(crops, 0.75).toFixed(1)} % | ${mean((r) => r.cropBonus ?? 0).toFixed(0)} | ${mean((r) => r.warthogs ?? 0).toFixed(2)} | ${mean((r) => r.raiders ?? 0).toFixed(2)} | ${mean((r) => r.bagged).toFixed(1)} | ${mean((r) => r.workerHits ?? 0).toFixed(3)} | ${mean((r) => r.pigletHits ?? 0).toFixed(3)} |`;
  });
  return [head, sep, ...lines].join('\n');
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
    secretsPerHunt: sum((r) => r.secrets) / n,
    cratesPerHunt: sum((r) => r.crates) / n,
    penaltiesPerHunt: sum((r) => r.penalties) / n,
    verPerHunt: sum((r) => r.baggedVer) / n,
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
    '| bot | hunts | mean | p15 | p25 | p50 | p75 | p85 | wing-shot share | whole flocks / hunt | hunts with ≥1 | flushes / hunt | Twee Vlieë / hunt | accuracy | secrets / hunt | crates / hunt | penalties / hunt | Ver birds / hunt |';
  const sep = '|' + '---|'.repeat(18);
  const lines = rows.map(
    (s) =>
      `| ${s.bot} | ${s.hunts} | ${fmt(s.mean)} | ${fmt(s.p15)} | ${fmt(s.p25)} | ${fmt(s.p50)} | ${fmt(s.p75)} | ${fmt(s.p85)} | ${(s.wingShotShare * 100).toFixed(1)} % | ${s.wholeFlocksPerHunt.toFixed(2)} | ${(s.wholeFlockHuntRate * 100).toFixed(0)} % | ${s.flushesPerHunt.toFixed(1)} | ${s.twoFliesPerHunt.toFixed(1)} | ${(s.accuracy * 100).toFixed(0)} % | ${s.secretsPerHunt.toFixed(2)} | ${s.cratesPerHunt.toFixed(2)} | ${s.penaltiesPerHunt.toFixed(2)} | ${s.verPerHunt.toFixed(2)} |`,
  );
  return [head, sep, ...lines].join('\n');
}

// --- CLI ---------------------------------------------------------------------------------------

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}

export function runWorker(job: Job): Promise<HuntRow[]> {
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
  const modeArg = arg('mode', 'classic');
  // v1.8c (D-063): --mode harvest (Die Oes, its own map; the Harvest table, no M3 gates).
  const mode: ModeId =
    modeArg === 'daily' ? 'daily' : modeArg === 'harvest' ? 'harvest' : 'classic';
  const omenArg = arg('omen', '');
  const omen = omenArg === 'on' ? true : omenArg === 'off' ? false : undefined;
  const biomeArg = arg('biome', '');
  const biome = biomeArg === '' ? undefined : biomeArg;
  const layout = arg('layout', '') || undefined;
  const bonus = arg('bonus', '') || undefined;
  const feesdag = arg('feesdag', '') || undefined;
  const weapon = arg('weapon', '') || undefined;
  const sight = arg('sight', '') || undefined;
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
      jobs.push({
        bot,
        seeds: all.slice(i, i + chunk),
        input,
        mode,
        omen,
        biome,
        weapon,
        sight,
        layout,
        bonus,
        feesdag,
        overrides,
      });
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
  const gates = mode === 'harvest' ? [] : m3Gates(new Map(summaries.map((s) => [s.bot, s])));
  const seconds = (performance.now() - started) / 1000;
  const report = { seeds, mode, biome, omen, input, bots, overrides, summaries, gates, seconds };

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
    `Balance sim — ${mode}${biome === undefined ? '' : ` ${biome}`}${layout === undefined ? '' : ` ${layout}`}${bonus === undefined ? '' : `+${bonus}`}${omen === undefined ? '' : `, omen ${omen ? 'on' : 'off'}`}, ${input}, ${seeds} seeds per bot, ${workers} workers, ${seconds.toFixed(0)} s`,
  );
  if (overrides.length > 0) console.log(`overrides: ${overrides.join('  ')}`);
  console.log(formatTable(summaries));
  if (mode === 'harvest') console.log(harvestTable(bots, results));
  for (const g of gates) console.log(`${g.pass ? 'PASS' : 'FAIL'}  ${g.name}: ${g.detail}`);
  if (gates.some((g) => !g.pass)) process.exitCode = 1;
}

if (process.argv.includes('--worker')) {
  process.once('message', (job: Job) => {
    process.send?.(playRows(job));
  });
} else if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  // --run: whole Season Runs with charm policies (tools/season-sim.ts, M6).
  if (process.argv.includes('--run')) void import('./season-sim').then((m) => m.seasonMain());
  else void main();
}
