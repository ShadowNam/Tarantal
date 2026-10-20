// Where a bot's points come from (diagnostics for tuning): awards by behaviour and plane, bonuses,
// mean Frenzy and Stampede share. Usage: npx tsx tools/score-breakdown.ts --bot competent --seeds 20
import { createSim } from '../src/sim/Sim';
import type { InputKind } from '../src/sim/types';
import { BOT_KINDS, createBot, type BotKind } from './bots';
import { loadContent } from './testContent';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}
const botArg = arg('bot', 'competent');
const bot: BotKind | undefined = BOT_KINDS.find((b) => b === botArg);
if (bot === undefined) throw new Error(`--bot must be one of ${BOT_KINDS.join(', ')}`);
const seeds = Number(arg('seeds', '20'));
const inputKind: InputKind = arg('input', 'pointer') === 'touch' ? 'touch' : 'pointer';
const content = loadContent();

const sums = new Map<string, number>();
const add = (k: string, v: number): void => {
  sums.set(k, (sums.get(k) ?? 0) + v);
};
for (let seed = 1; seed <= seeds; seed++) {
  const sim = createSim({ seed, content, mode: { id: 'classic' }, inputKind });
  const b = createBot(bot, seed, content, inputKind);
  const bagInfo = new Map<number, string>();
  let stampede = false;
  const flockBirds = new Set<number>();
  while (!sim.isOver()) {
    sim.step(b.next(sim.snapshot()));
    for (const e of sim.drainEvents()) {
      if (e.type === 'stampedeStarted') stampede = true;
      if (e.type === 'birdSpawned' && e.motion === 'flock') flockBirds.add(e.birdId);
      if (e.type === 'targetBagged')
        bagInfo.set(
          e.birdId,
          `${flockBirds.has(e.birdId) ? 'flock' : 'loose'}:${e.plane}:${e.behaviour}`,
        );
      if (e.type === 'scoreAwarded') {
        add(`bag ${bagInfo.get(e.birdId) ?? '?'}`, e.award);
        add('ALL', e.award);
        add('frenzyMulSum', e.breakdown.find((x) => x.kind === 'frenzy')?.value ?? 1);
        add('bags', 1);
        if (stampede) add('stampede share', e.award);
      }
      if (e.type === 'bonusAwarded') {
        add(`bonus ${e.bonus}`, e.award);
        add('ALL', e.award);
        if (stampede) add('stampede share', e.award);
      }
      if (e.type === 'penaltyApplied') {
        add('penalties', e.points);
        add('ALL', e.points);
      }
    }
  }
}
const all = sums.get('ALL') ?? 1;
console.log(`${bot} ${inputKind}, ${seeds} seeds — mean score ${(all / seeds).toFixed(0)}`);
console.log(
  `  mean Frenzy mul per bag ${((sums.get('frenzyMulSum') ?? 0) / (sums.get('bags') ?? 1)).toFixed(2)}`,
);
for (const [k, v] of [...sums.entries()].sort((a, b) => b[1] - a[1])) {
  if (k === 'ALL' || k === 'frenzyMulSum' || k === 'bags') continue;
  console.log(
    `  ${k.padEnd(28)} ${(v / seeds).toFixed(0).padStart(7)}  ${((100 * v) / all).toFixed(1)} %`,
  );
}
