// v1.7d (D-059) balance: what the bots' penalties on a Namibië map are (per hunt): ostrich and
// nest hits, balloon hits, meerkats, the other non-targets and secrets, so the balance report can
// say whether a normal shot at the birds hits a balloon or an ostrich by accident.
// Run: npx tsx tools/namibie-life-penalties.ts <layout> <seeds> [bot] [weapon] [sight]
import { createSim } from '../src/sim/Sim';
import { createBot, type BotKind } from './bots';
import { loadContent } from './testContent';

const [layout = 'mon', seedsArg = '100', bot = 'competent', weapon, sight] = process.argv.slice(2);
const content = loadContent();
const seeds = Number(seedsArg);
const counts = new Map<string, { n: number; points: number }>();
const add = (k: string, p: number): void => {
  const c = counts.get(k) ?? { n: 0, points: 0 };
  c.n++;
  c.points += p;
  counts.set(k, c);
};
for (let seed = 1; seed <= seeds; seed++) {
  const sim = createSim({
    seed,
    content,
    mode: {
      id: 'classic',
      biome: 'namibie',
      layout,
      ...(weapon === undefined ? {} : { weapon }),
      ...(sight === undefined ? {} : { sight }),
    },
    inputKind: 'pointer',
  });
  const b = createBot(bot as BotKind, seed, content, 'pointer');
  while (!sim.isOver()) {
    sim.step(b.next(sim.snapshot()));
    for (const e of sim.drainEvents()) {
      if (e.type === 'ostrichHit' && e.points < 0)
        add(`${e.nest ? 'ostrich nest' : 'ostrich'} (${e.familyId})`, e.points);
      else if (e.type === 'balloonHit')
        add(e.points < 0 ? 'balloon' : 'balloon (cooldown)', e.points);
      else if (e.type === 'meerkatHit' && e.points < 0) add('meerkat', e.points);
      else if (e.type === 'penaltyApplied' && e.creature !== 'lugballon') add(e.creature, e.points);
      else if (e.type === 'secretPenalty') add(`secret ${e.propId}`, e.points);
    }
  }
}
console.log(
  `namibie ${layout}, ${bot}${weapon === undefined ? '' : ` ${weapon}`}, ${seeds} hunts — per hunt:`,
);
for (const [k, c] of [...counts].sort((a, b) => b[1].n - a[1].n))
  console.log(
    `  ${k.padEnd(28)} ${(c.n / seeds).toFixed(2)} hits  ${(c.points / seeds).toFixed(1)} points`,
  );
