// v1.7b (D-046): a crate's contents are rolled when it drops, so the renderer can show them.
import { describe, expect, it } from 'vitest';
import { createBot } from '../../tools/bots';
import { loadContent } from '../../tools/testContent';
import type { SimEvent } from './events';
import { createSim } from './Sim';
import { rollCrate, spawnCrate } from './props/crates';
import { createRng } from './rng';

const content = loadContent();

describe('crate contents (D-046)', () => {
  it('a spawned crate holds a roll of the table, and the snapshot shows it', () => {
    const biome = content.biomes.find((b) => b.id === 'karoo-autumn');
    if (biome === undefined) throw new Error('no karoo');
    const cfg = content.powerups.crates;
    const a = spawnCrate(
      cfg,
      biome,
      { id: 1, centreX: 0, planeScale: 1, refScale: 1 },
      createRng(5).stream('crates'),
    );
    // Same stream: position first (x, then the landing y), then the roll.
    const s = createRng(5).stream('crates');
    s.next();
    s.next();
    expect(a?.item).toEqual(rollCrate(cfg, s));
    expect(cfg.table.map((e) => e.id)).toContain(a?.item?.id);
  });

  it('in a hunt, the item a crate showed is the one it gives', () => {
    let checked = 0;
    for (let seed = 1; seed <= 40 && checked < 3; seed++) {
      const sim = createSim({ seed, content, mode: { id: 'classic' }, inputKind: 'pointer' });
      const bot = createBot('aim', seed, content, 'pointer');
      const shown = new Map<number, string | null>();
      const events: SimEvent[] = [];
      while (!sim.isOver()) {
        sim.step(bot.next(sim.snapshot()));
        for (const c of sim.snapshot().crates) shown.set(c.id, c.item);
        events.push(...sim.drainEvents());
      }
      for (const e of events) {
        if (e.type === 'crateSpawned') expect(e.item).toBe(shown.get(e.crateId));
        if (e.type === 'crateOpened') {
          expect(e.item).toBe(shown.get(e.crateId));
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
