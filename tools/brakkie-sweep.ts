// v1.12 (D-069): Brakkie's balance cells, run in this one process (no workers: the box runs out of
// memory with many), 100-seed chunks merged into docs/balance/brakkie/<tag>.json, then printed as
// the tables of docs/balance/v1.12-brakkie.md.
//   npx tsx tools/brakkie-sweep.ts --tag t100 --seeds 100 [--from 1] [--only <cell id,…>]
//   npx tsx tools/brakkie-sweep.ts --tag t100 --table
// Cells (Classic, pointer, each area's Monday map, the competent bot): every area × gun, before
// (no Brakkie: `brakkie.areas=[]`, his stream only, so the difference is him) and after.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { playRows, type HuntRow, type Job } from './balance-sim';
import { loadContent } from './testContent';

const content = loadContent();
export const GUNS = ['dubbelloop', 'windbuks', 'kettie', 'pomp', 'twee_twee', 'langloop'] as const;

interface Cell {
  readonly id: string;
  readonly job: Omit<Job, 'seeds'>;
}

function cells(): Cell[] {
  const out: Cell[] = [];
  for (const a of content.brakkie.areas)
    for (const weapon of GUNS)
      for (const side of ['before', 'after'] as const)
        out.push({
          id: `${a.biome}.${weapon}.${side}`,
          job: {
            input: 'pointer',
            mode: 'classic',
            bot: 'competent',
            biome: a.biome,
            layout: 'mon',
            weapon,
            ...(side === 'before' ? { overrides: ['brakkie.areas=[]'] } : {}),
          },
        });
  // The near can fence (the Karoo's Wednesday) with the bot that shoots every can: the stray-hit
  // check for a player juggling cans near him.
  for (const side of ['before', 'after'] as const)
    out.push({
      id: `karoo-autumn.wed.canHappy.${side}`,
      job: {
        input: 'pointer',
        mode: 'classic',
        bot: 'canHappy',
        biome: 'karoo-autumn',
        layout: 'wed',
        weapon: 'dubbelloop',
        ...(side === 'before' ? { overrides: ['brakkie.areas=[]'] } : {}),
      },
    });
  return out;
}

/** Sums over a cell's hunts (merged across chunks). */
interface CellSums {
  readonly hunts: number;
  readonly score: number;
  readonly dogAimed: number;
  readonly dogStray: number;
  readonly dogBarks: number;
  readonly dogFlushes: number;
  readonly dogFetches: number;
  /** Seed ranges run ("1-100", …). */
  readonly chunks: readonly string[];
}

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const tag = arg('tag') ?? 't100';
const dir = join(import.meta.dirname, '..', 'docs', 'balance', 'brakkie');
const file = join(dir, `${tag}.json`);
const load = (): Record<string, CellSums> =>
  existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, CellSums>) : {};

if (process.argv.includes('--table')) {
  const all = load();
  const lines = [
    '| area | gun | hunts | before | after | change | stray hits / hunt | aimed / hunt | barks | flushes | fetches |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  const rows: [string, string, string][] = [];
  for (const a of content.brakkie.areas)
    for (const g of GUNS) rows.push([a.biome, g, `${a.biome}.${g}`]);
  rows.push(['karoo-autumn (wed, can-happy bot)', 'dubbelloop', 'karoo-autumn.wed.canHappy']);
  for (const [area, g, key] of rows) {
    const b = all[`${key}.before`];
    const f = all[`${key}.after`];
    if (b === undefined || f === undefined) continue;
    const mb = b.score / b.hunts;
    const mf = f.score / f.hunts;
    const per = (x: number): string => (x / f.hunts).toFixed(3);
    lines.push(
      `| ${area} | ${g} | ${String(f.hunts)} | ${mb.toFixed(0)} | ${mf.toFixed(0)} | ${(((mf - mb) / mb) * 100).toFixed(1)} % | ${per(f.dogStray)} | ${per(f.dogAimed)} | ${(f.dogBarks / f.hunts).toFixed(1)} | ${(f.dogFlushes / f.hunts).toFixed(1)} | ${(f.dogFetches / f.hunts).toFixed(1)} |`,
    );
  }
  console.log(lines.join('\n'));
} else {
  const seeds = Number(arg('seeds') ?? 100);
  const from = Number(arg('from') ?? 1);
  const only = arg('only')?.split(',');
  mkdirSync(dir, { recursive: true });
  for (const c of cells()) {
    if (only !== undefined && !only.some((o) => c.id.startsWith(o))) continue;
    const range = `${String(from)}-${String(from + seeds - 1)}`;
    const all = load();
    if (all[c.id]?.chunks.includes(range) === true) continue;
    const rows: HuntRow[] = playRows({
      ...c.job,
      seeds: Array.from({ length: seeds }, (_, i) => from + i),
    });
    const sum = (f: (r: HuntRow) => number): number => rows.reduce((t, r) => t + f(r), 0);
    const prev = all[c.id];
    all[c.id] = {
      hunts: (prev?.hunts ?? 0) + rows.length,
      score: (prev?.score ?? 0) + sum((r) => r.score),
      dogAimed: (prev?.dogAimed ?? 0) + sum((r) => r.dogAimed ?? 0),
      dogStray: (prev?.dogStray ?? 0) + sum((r) => r.dogStray ?? 0),
      dogBarks: (prev?.dogBarks ?? 0) + sum((r) => r.dogBarks ?? 0),
      dogFlushes: (prev?.dogFlushes ?? 0) + sum((r) => r.dogFlushes ?? 0),
      dogFetches: (prev?.dogFetches ?? 0) + sum((r) => r.dogFetches ?? 0),
      chunks: [...(prev?.chunks ?? []), range],
    };
    writeFileSync(file, `${JSON.stringify(all, null, 2)}\n`);
    console.log(c.id, range, (sum((r) => r.score) / rows.length).toFixed(0));
  }
}
