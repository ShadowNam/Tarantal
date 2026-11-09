// v1.17 (D-079): Brakkie the companion's balance gate, run in this one process (no workers: the box
// runs out of memory with many), seed chunks merged into docs/balance/companion/<tag>.json, then
// printed as the table of docs/balance/v1.17-companion.md.
//   npx tsx tools/companion-sweep.ts --tag t200 --seeds 100 [--from 1] [--only <cell id,…>]
//   npx tsx tools/companion-sweep.ts --tag t200 --table
// Cells (Classic, pointer, the area's plain map, the Dubbelloop) per area: `none` (no Brakkie:
// `brakkie.areas=[]`), `ignore` (the competent bot, which never minds him) and `companion` (the
// companion bot: holds fire near him while he carries, whistles his point up when its gun is full).
// Gates: companion vs none +3 … +7 % mean; ignore vs none ≤ +2 %; accidental hits < 0.1 a hunt.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { playRows, type HuntRow, type Job } from './balance-sim';
import { loadContent } from './testContent';

const content = loadContent();
const SIDES = ['none', 'ignore', 'companion'] as const;
type Side = (typeof SIDES)[number];

interface Cell {
  readonly id: string;
  readonly area: string;
  readonly side: Side;
  readonly job: Omit<Job, 'seeds'>;
}

function cells(): Cell[] {
  const out: Cell[] = [];
  for (const a of content.brakkie.areas)
    for (const side of SIDES)
      out.push({
        id: `${a.biome}.${side}`,
        area: a.biome,
        side,
        job: {
          input: 'pointer',
          mode: 'classic',
          bot: side === 'companion' ? 'companion' : 'competent',
          biome: a.biome,
          weapon: 'dubbelloop',
          ...(side === 'none' ? { overrides: ['brakkie.areas=[]'] } : {}),
        },
      });
  return out;
}

interface Sums {
  hunts: number;
  score: number;
  dogStray: number;
  dogAimed: number;
  dogFetches: number;
  dogPoints: number;
  dogBestStreak: number;
  dogGoodPoints: number;
  dogWhistles: number;
  dogFlushes: number;
  wholeFlocks: number;
  seeds: number[];
}

const empty = (): Sums => ({
  hunts: 0,
  score: 0,
  dogStray: 0,
  dogAimed: 0,
  dogFetches: 0,
  dogPoints: 0,
  dogBestStreak: 0,
  dogGoodPoints: 0,
  dogWhistles: 0,
  dogFlushes: 0,
  wholeFlocks: 0,
  seeds: [],
});

function add(s: Sums, rows: readonly HuntRow[]): void {
  for (const r of rows) {
    if (s.seeds.includes(r.seed)) continue;
    s.seeds.push(r.seed);
    s.hunts++;
    s.score += r.score;
    s.dogStray += r.dogStray ?? 0;
    s.dogAimed += r.dogAimed ?? 0;
    s.dogFetches += r.dogFetches ?? 0;
    s.dogPoints += r.dogPoints ?? 0;
    s.dogBestStreak += r.dogBestStreak ?? 0;
    s.dogGoodPoints += r.dogGoodPoints ?? 0;
    s.dogWhistles += r.dogWhistles ?? 0;
    s.dogFlushes += r.dogFlushes ?? 0;
    s.wholeFlocks += r.wholeFlocks;
  }
}

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const tag = arg('tag') ?? 'dev';
const dir = join(import.meta.dirname, '..', 'docs', 'balance', 'companion');
const file = join(dir, `${tag}.json`);
const load = (): Record<string, Sums> =>
  existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, Sums>) : {};

const pct = (a: number, b: number): string =>
  b === 0 ? '—' : `${a >= b ? '+' : ''}${(((a - b) / b) * 100).toFixed(1)} %`;
const per = (s: Sums | undefined, k: keyof Omit<Sums, 'seeds'>): number =>
  s === undefined || s.hunts === 0 ? 0 : s[k] / s.hunts;

if (process.argv.includes('--table')) {
  const all = load();
  const lines = [
    '| area | none | ignore (Δ) | companion (Δ) | hunts | stray hits/hunt (ignore · companion) | Bring pts/hunt (ignore · companion) | best streak (ignore · companion) | Mooi punt/hunt (companion) | whistles/hunt |',
    '|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const a of content.brakkie.areas) {
    const n = all[`${a.biome}.none`];
    const i = all[`${a.biome}.ignore`];
    const c = all[`${a.biome}.companion`];
    const m = (s: Sums | undefined): number => per(s, 'score');
    lines.push(
      `| ${a.biome} | ${m(n).toFixed(0)} | ${m(i).toFixed(0)} (${pct(m(i), m(n))}) | ${m(c).toFixed(0)} (${pct(m(c), m(n))}) | ${n?.hunts ?? 0} | ${per(i, 'dogStray').toFixed(3)} · ${per(c, 'dogStray').toFixed(3)} | ${per(i, 'dogPoints').toFixed(0)} · ${per(c, 'dogPoints').toFixed(0)} | ${per(i, 'dogBestStreak').toFixed(2)} · ${per(c, 'dogBestStreak').toFixed(2)} | ${per(c, 'dogGoodPoints').toFixed(2)} | ${per(c, 'dogWhistles').toFixed(1)} |`,
    );
  }
  console.log(lines.join('\n'));
} else {
  const seeds = Number(arg('seeds') ?? '100');
  const from = Number(arg('from') ?? '1');
  const only = arg('only')?.split(',');
  mkdirSync(dir, { recursive: true });
  for (const c of cells()) {
    if (only !== undefined && !only.includes(c.id)) continue;
    const rows = playRows({ ...c.job, seeds: Array.from({ length: seeds }, (_, k) => from + k) });
    const all = load();
    const s = all[c.id] ?? empty();
    add(s, rows);
    all[c.id] = s;
    writeFileSync(file, JSON.stringify(all) + '\n');
    console.log(`${c.id}: ${s.hunts} hunts, mean ${(s.score / s.hunts).toFixed(0)}`);
  }
}
