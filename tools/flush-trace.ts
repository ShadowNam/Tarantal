// Diagnostics: what happens to the birds of each flush (bagged flying, landed, exited) and the
// shots fired while a flock was flushed. npx tsx tools/flush-trace.ts --bot competent --seeds 10
import { createSim } from '../src/sim/Sim';
import { withOverrides } from './balance-sim';
import { BOT_KINDS, createBot, type BotKind } from './bots';
import { loadContent } from './testContent';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}
const botArg = arg('bot', 'competent');
const bot: BotKind | undefined = BOT_KINDS.find((b) => b === botArg);
if (bot === undefined) throw new Error('bad --bot');
const overrides = process.argv.flatMap((a, i) =>
  a === '--set' ? [process.argv[i + 1] ?? ''] : [],
);
const content = withOverrides(loadContent(), overrides);
const seeds = Number(arg('seeds', '10'));
const t = {
  flushes: 0,
  birds: 0,
  baggedFlying: 0,
  exited: 0,
  landed: 0,
  shotsDuring: 0,
  missDuring: 0,
  cause: new Map<string, number>(),
};
for (let seed = 1; seed <= seeds; seed++) {
  const sim = createSim({ seed, content, mode: { id: 'classic' }, inputKind: 'pointer' });
  const b = createBot(bot, seed, content, 'pointer');
  const flushing = new Set<number>();
  const memberOf = new Map<number, number>();
  while (!sim.isOver()) {
    const s = sim.snapshot();
    for (const x of s.birds) if (x.flockId !== null) memberOf.set(x.id, x.flockId);
    sim.step(b.next(s));
    for (const e of sim.drainEvents()) {
      if (e.type === 'flockStateChanged' && e.to === 'flush') {
        t.flushes++;
        t.cause.set(e.cause, (t.cause.get(e.cause) ?? 0) + 1);
        flushing.add(e.flockId);
        t.birds += sim.snapshot().flocks.find((f) => f.id === e.flockId)?.alive ?? 0;
      }
      if (e.type === 'flockStateChanged' && e.from === 'flush') {
        flushing.delete(e.flockId);
        t.landed += sim.snapshot().flocks.find((f) => f.id === e.flockId)?.alive ?? 0;
      }
      if (e.type === 'flockRemoved') flushing.delete(e.flockId);
      if (e.type === 'shotFired' && flushing.size > 0) t.shotsDuring++;
      if (e.type === 'miss' && flushing.size > 0) t.missDuring++;
      if (
        e.type === 'targetBagged' &&
        e.behaviour === 'flying' &&
        flushing.has(memberOf.get(e.birdId) ?? -1)
      )
        t.baggedFlying++;
      if (
        e.type === 'birdDespawned' &&
        e.reason === 'exited' &&
        flushing.has(memberOf.get(e.birdId) ?? -1)
      )
        t.exited++;
    }
  }
}
const per = (v: number): string => (v / Math.max(1, t.flushes)).toFixed(2);
console.log(
  `${bot}: ${t.flushes} flushes in ${seeds} hunts (${[...t.cause].map(([k, v]) => `${k} ${v}`).join(', ')})`,
);
console.log(
  `  per flush: birds ${per(t.birds)}, bagged flying ${per(t.baggedFlying)}, exited ${per(t.exited)}, landed ${per(t.landed)}, shots during ${per(t.shotsDuring)}, misses ${per(t.missDuring)}`,
);
