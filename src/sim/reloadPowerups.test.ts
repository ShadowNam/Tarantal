// v1.6b (D-043): the reload power-ups. Blitslaai shortens every reload (also the per-shell steps,
// the Voorlaaier ramrod and the Kettie draw) and stacks with Snelhand, floored at reloadFloorMs.
// Oupa Laai starts the reload of an empty gun by itself and tops per-shell guns up after a pause.
import { describe, expect, it } from 'vitest';
import { createBot } from '../../tools/bots';
import { loadContent, loadContentHash } from '../../tools/testContent';
import type { ContentBundle } from '../content/schemas';
import { msToTicks } from './clock';
import type { SimEvent } from './events';
import { createRecorder } from './replay/inputLog';
import { runReplay } from './replay/verify';
import { createEventHasher } from './events';
import { createSim, type Sim } from './Sim';
import type { Command, ModeConfig, SeasonHuntConfig } from './types';

const content = loadContent();
const FIRE: Command = { t: 'fire', dx: 0, sy: 40 };

function powerup(id: string) {
  const p = content.powerups.powerups.find((x) => x.id === id);
  if (p === undefined) throw new Error(`no power-up ${id}`);
  return p;
}
function primary(id: string) {
  const w = content.weapons.weapons.find((x) => x.id === id);
  if (w?.kind !== 'primary') throw new Error(`no primary ${id}`);
  return w;
}
const blitsMul = powerup('blitslaai').effect.reloadTimeMul ?? 1;
const idleTicks = msToTicks(powerup('oupa_laai').effect.idleTopUpMs ?? 0);
const floorTicks = msToTicks(content.powerups.reloadFloorMs);
const snelMul =
  content.charms.charms
    .find((c) => c.id === 'snelhand')
    ?.effects.find((e) => 'reloadSpeedMul' in e.do)?.do.reloadSpeedMul ?? 1;

/** A Season Run hunt with these consumables in slots 0.. (and optionally charms / a rental). */
function seasonSim(
  weapon: string,
  consumables: readonly string[],
  opts: { charms?: string[]; rental?: string | null; c?: ContentBundle; boss?: string } = {},
): Sim {
  const season: SeasonHuntConfig = {
    kind: opts.boss === undefined ? 'plain' : 'boss',
    boss: opts.boss ?? null,
    charms: opts.charms ?? [],
    consumables,
    rental: opts.rental ?? null,
    runShellBonus: 0,
  };
  return createSim({
    seed: 3,
    content: opts.c ?? content,
    mode: { id: 'seasonHunt', biome: 'karoo-autumn', weapon, season },
    inputKind: 'pointer',
  });
}

function step(sim: Sim, cmds: readonly Command[] = []): SimEvent[] {
  sim.step(cmds);
  return [...sim.drainEvents()];
}

/** Uses every consumable slot, in order. */
function useAll(sim: Sim, n: number): void {
  for (let i = 0; i < n; i++) step(sim, [{ t: 'consumable', slot: i }]);
}

function waitCooldown(sim: Sim): void {
  for (let i = 0; i < 200 && sim.snapshot().weapon.cooldownTicks > 0; i++) step(sim);
}

/** Fires once, then reloads by hand: ticks from the reload command to the full belt. */
function manualReloadTicks(sim: Sim): number {
  waitCooldown(sim);
  step(sim, [FIRE]);
  waitCooldown(sim);
  let events = step(sim, [{ t: 'reload' }]);
  expect(events.some((e) => e.type === 'reloadStarted')).toBe(true);
  for (let n = 1; n < 400; n++) {
    if (events.some((e) => e.type === 'reloadFinished')) return n;
    events = step(sim);
  }
  throw new Error('reload never finished');
}

/** Per-shell guns: ticks between two loaded shells of a manual reload from two shots down. */
function perShellStepTicks(sim: Sim): number {
  for (let i = 0; i < 2; i++) {
    waitCooldown(sim);
    step(sim, [FIRE]);
  }
  waitCooldown(sim);
  step(sim, [{ t: 'reload' }]);
  const at: number[] = [];
  for (let n = 1; n < 400 && at.length < 2; n++) {
    const ev = step(sim);
    if (ev.some((e) => e.type === 'shellLoaded' || e.type === 'reloadFinished')) at.push(n);
  }
  const [a, b] = at;
  if (a === undefined || b === undefined) throw new Error('no shells loaded');
  return b - a;
}

describe('Blitslaai (reload time)', () => {
  const base = msToTicks(primary('dubbelloop').reloadMs);
  const fast = Math.max(floorTicks, Math.round(base * blitsMul));

  it('content: 35 % reload time for 12 s, Padstal price 2, in the crate table', () => {
    expect(blitsMul).toBe(0.35);
    expect(powerup('blitslaai').durationMs).toBe(12000);
    expect(powerup('blitslaai').padstalPrice).toBe(2);
    expect(content.powerups.crates.table.some((e) => e.id === 'blitslaai')).toBe(true);
  });

  it('a full-belt reload takes 35 % of its time', () => {
    expect(manualReloadTicks(seasonSim('dubbelloop', []))).toBe(base);
    const sim = seasonSim('dubbelloop', ['blitslaai']);
    useAll(sim, 1);
    expect(manualReloadTicks(sim)).toBe(fast);
    expect(fast).toBeLessThan(base / 2);
  });

  it('each per-shell step is shorter too (Plaas-Pomp)', () => {
    const pomp = msToTicks(primary('pomp').reloadMs);
    expect(perShellStepTicks(seasonSim('pomp', []))).toBe(pomp);
    const sim = seasonSim('pomp', ['blitslaai']);
    useAll(sim, 1);
    expect(perShellStepTicks(sim)).toBe(Math.round(pomp * blitsMul));
  });

  it('stacks with Snelhand (multiplied)', () => {
    const snel = Math.round(base / snelMul);
    expect(manualReloadTicks(seasonSim('dubbelloop', [], { charms: ['snelhand'] }))).toBe(snel);
    const sim = seasonSim('dubbelloop', ['blitslaai'], { charms: ['snelhand'] });
    useAll(sim, 1);
    expect(manualReloadTicks(sim)).toBe(Math.max(floorTicks, Math.round(snel * blitsMul)));
  });

  it('Oupa Laai leaves the reload time alone; with both it is the Blitslaai time', () => {
    const oupa = seasonSim('dubbelloop', ['oupa_laai']);
    useAll(oupa, 1);
    expect(manualReloadTicks(oupa)).toBe(base);
    const both = seasonSim('dubbelloop', ['oupa_laai', 'blitslaai']);
    useAll(both, 2);
    expect(manualReloadTicks(both)).toBe(fast);
  });

  it("multiplies with Kuifkop Koning's doubled reload (Boss Rule)", () => {
    const boss = 'kuifkop_koning';
    expect(manualReloadTicks(seasonSim('dubbelloop', [], { boss }))).toBe(2 * base);
    const sim = seasonSim('dubbelloop', ['blitslaai'], { boss });
    useAll(sim, 1);
    expect(manualReloadTicks(sim)).toBe(Math.round(2 * base * blitsMul));
  });

  it('picked up mid per-shell reload: the running round keeps its time, the next is fast', () => {
    const pomp = msToTicks(primary('pomp').reloadMs);
    const sim = seasonSim('pomp', ['blitslaai']);
    for (let i = 0; i < 3; i++) {
      waitCooldown(sim);
      step(sim, [FIRE]);
    }
    waitCooldown(sim);
    step(sim, [{ t: 'reload' }]);
    step(sim, [{ t: 'consumable', slot: 0 }]);
    // Ticks counted from the reload command's tick (1) and the pickup's (2).
    const at: number[] = [];
    for (let n = 3; n < 400 && at.length < 2; n++) {
      const ev = step(sim);
      if (ev.some((e) => e.type === 'shellLoaded' || e.type === 'reloadFinished')) at.push(n);
    }
    expect(at[0]).toBe(pomp);
    expect((at[1] ?? 0) - (at[0] ?? 0)).toBe(Math.round(pomp * blitsMul));
  });

  it(`never goes below the ${content.powerups.reloadFloorMs} ms floor`, () => {
    const c: ContentBundle = {
      ...content,
      powerups: {
        ...content.powerups,
        powerups: content.powerups.powerups.map((p) =>
          p.id === 'blitslaai' ? { ...p, effect: { reloadTimeMul: 0.01 } } : p,
        ),
      },
    };
    const sim = seasonSim('dubbelloop', ['blitslaai'], { c, charms: ['snelhand'] });
    useAll(sim, 1);
    expect(manualReloadTicks(sim)).toBe(floorTicks);
  });

  it('shortens the Kettie draw (its reload, D-025) down to the floor', () => {
    const draw = msToTicks(primary('kettie').fireCooldownMs);
    const sim = seasonSim('kettie', ['blitslaai']);
    useAll(sim, 1);
    step(sim, [FIRE]);
    const want = Math.max(floorTicks, Math.round(draw * blitsMul));
    expect(sim.snapshot().weapon.cooldownTicks).toBe(want - 1);
  });

  it('speeds up the Voorlaaier ramrod; the Mielie-Masjien fire interval stays', () => {
    const ramrod = msToTicks(
      content.weapons.weapons.find((w) => w.id === 'voorlaaier')?.reloadMs ?? 0,
    );
    // The rental sits in the slot after the consumables.
    const plain = seasonSim('dubbelloop', [], { rental: 'voorlaaier' });
    step(plain, [{ t: 'consumable', slot: 0 }]);
    step(plain, [FIRE]);
    expect(plain.snapshot().weapon.cooldownTicks).toBe(ramrod - 1);
    const sim = seasonSim('dubbelloop', ['blitslaai'], { rental: 'voorlaaier' });
    step(sim, [{ t: 'consumable', slot: 0 }]);
    step(sim, [{ t: 'consumable', slot: 1 }]);
    step(sim, [FIRE]);
    const w = sim.snapshot().weapon;
    expect(w.id).toBe('voorlaaier');
    expect(w.cooldownTicks).toBe(Math.round(ramrod * blitsMul) - 1);
    expect(w.reloadProgress).toBeGreaterThan(0);

    const mielie = content.weapons.weapons.find((x) => x.id === 'mielie_masjien');
    const interval = msToTicks(mielie?.kind === 'crate' ? (mielie.fireIntervalMs ?? 0) : 0);
    const m = seasonSim('dubbelloop', ['blitslaai'], { rental: 'mielie_masjien' });
    step(m, [{ t: 'consumable', slot: 0 }]);
    step(m, [{ t: 'consumable', slot: 1 }]);
    step(m, [FIRE]);
    expect(m.snapshot().weapon.cooldownTicks).toBe(interval - 1);
  });

  it('picking it up again refreshes the timer', () => {
    const sim = seasonSim('dubbelloop', ['blitslaai', 'blitslaai']);
    step(sim, [{ t: 'consumable', slot: 0 }]);
    for (let i = 0; i < 100; i++) step(sim);
    const before = sim.snapshot().powerups.find((p) => p.id === 'blitslaai');
    // The timer also ticks on the tick it starts.
    expect(before?.ticksLeft).toBe((before?.totalTicks ?? 0) - 101);
    step(sim, [{ t: 'consumable', slot: 1 }]);
    const after = sim.snapshot().powerups.filter((p) => p.id === 'blitslaai');
    expect(after).toHaveLength(1);
    expect(after[0]?.ticksLeft).toBe((after[0]?.totalTicks ?? 0) - 1);
  });

  it('ends after 12 s and reloads take their normal time again', () => {
    const sim = seasonSim('dubbelloop', ['blitslaai']);
    useAll(sim, 1);
    let ended = false;
    for (let i = 0; i < msToTicks(12000) + 2; i++)
      if (step(sim).some((e) => e.type === 'powerupEnded' && e.powerup === 'blitslaai'))
        ended = true;
    expect(ended).toBe(true);
    expect(manualReloadTicks(sim)).toBe(base);
  });
});

describe('Oupa Laai (auto reload)', () => {
  const mag = primary('dubbelloop').magazine;

  function emptyBelt(sim: Sim): SimEvent[] {
    const all: SimEvent[] = [];
    for (let i = 0; i < mag; i++) {
      waitCooldown(sim);
      all.push(...step(sim, [FIRE]));
    }
    return all;
  }

  it('content: auto reload with a 0.6 s idle top-up for 12 s, Padstal price 2', () => {
    expect(powerup('oupa_laai').effect.autoReload).toBe(true);
    expect(powerup('oupa_laai').effect.idleTopUpMs).toBe(600);
    expect(powerup('oupa_laai').durationMs).toBe(12000);
    expect(powerup('oupa_laai').padstalPrice).toBe(2);
  });

  it('the reload starts by itself the moment the belt is empty', () => {
    const sim = seasonSim('dubbelloop', ['oupa_laai']);
    useAll(sim, 1);
    const ev = emptyBelt(sim);
    const started = ev.find((e) => e.type === 'reloadStarted');
    expect(started).toMatchObject({ type: 'reloadStarted', auto: true, perShell: false });
    // Same tick as the last shot.
    const lastShot = ev.filter((e) => e.type === 'shotFired').at(-1);
    expect(started?.tick).toBe(lastShot?.tick);
    for (let i = 0; i < 200 && sim.snapshot().weapon.reloading; i++) step(sim);
    expect(sim.snapshot().weapon.shells).toBe(mag);
  });

  it('without it an empty belt waits for the player', () => {
    const sim = seasonSim('dubbelloop', []);
    const ev = emptyBelt(sim);
    for (let i = 0; i < 120; i++) ev.push(...step(sim));
    expect(ev.some((e) => e.type === 'reloadStarted')).toBe(false);
    expect(sim.snapshot().weapon.shells).toBe(0);
  });

  it('a full-belt gun does not top up when idle', () => {
    const sim = seasonSim('dubbelloop', ['oupa_laai']);
    useAll(sim, 1);
    step(sim, [FIRE]);
    const ev: SimEvent[] = [];
    for (let i = 0; i < 4 * idleTicks; i++) ev.push(...step(sim));
    expect(ev.some((e) => e.type === 'reloadStarted')).toBe(false);
    expect(sim.snapshot().weapon.shells).toBe(mag - 1);
  });

  it('per-shell guns top up after 0.6 s without a shot, and a shot can cut it', () => {
    const wb = primary('windbuks');
    expect(wb.interruptibleReload).not.toBe(true);
    const sim = seasonSim('windbuks', ['oupa_laai']);
    useAll(sim, 1);
    const shot = step(sim, [FIRE]).find((e) => e.type === 'shotFired');
    let started: SimEvent | undefined;
    for (let i = 0; i < 3 * idleTicks && started === undefined; i++)
      started = step(sim).find((e) => e.type === 'reloadStarted');
    expect(started).toMatchObject({ auto: true, perShell: true });
    expect((started?.tick ?? 0) - (shot?.tick ?? 0)).toBe(idleTicks);
    // The Windbuks' own reload can't be cut; an auto top-up can (never locks you out).
    waitCooldown(sim);
    step(sim, [FIRE]);
    step(sim, [FIRE]);
    waitCooldown(sim);
    for (let i = 0; i < idleTicks + 5; i++) step(sim);
    expect(sim.snapshot().weapon.reloading).toBe(true);
    for (let i = 0; i < 10; i++) step(sim);
    const ev = step(sim, [FIRE]);
    expect(ev.some((e) => e.type === 'reloadInterrupted')).toBe(true);
    expect(ev.some((e) => e.type === 'shotFired')).toBe(true);
  });

  it('tops a per-shell gun back up to full', () => {
    const sim = seasonSim('pomp', ['oupa_laai']);
    useAll(sim, 1);
    for (let i = 0; i < 3; i++) {
      waitCooldown(sim);
      step(sim, [FIRE]);
    }
    for (let i = 0; i < idleTicks + 3 * msToTicks(primary('pomp').reloadMs) + 5; i++) step(sim);
    expect(sim.snapshot().weapon.shells).toBe(primary('pomp').magazine);
  });

  it('does nothing under Chilli Biltong; the belt reloads once it wears off', () => {
    const sim = seasonSim('dubbelloop', ['chilli_biltong', 'oupa_laai']);
    emptyBelt(sim);
    step(sim, [{ t: 'consumable', slot: 0 }]);
    const ev = step(sim, [{ t: 'consumable', slot: 1 }]);
    expect(ev.some((e) => e.type === 'powerupStarted' && e.powerup === 'oupa_laai')).toBe(true);
    const during: SimEvent[] = [];
    for (let i = 0; i < msToTicks(powerup('chilli_biltong').durationMs ?? 0) + 5; i++) {
      const e = step(sim);
      if (e.some((x) => x.type === 'powerupEnded' && x.powerup === 'chilli_biltong')) break;
      during.push(...e);
    }
    expect(during.some((e) => e.type === 'reloadStarted')).toBe(false);
    expect(sim.snapshot().weapon.shells).toBe(0);
    // Chilli Biltong wore off at the end of that tick: the auto reload starts on the next one.
    expect(step(sim).find((e) => e.type === 'reloadStarted')).toMatchObject({ auto: true });
  });

  it('a crate gun used up on an empty belt hands back a gun that reloads at once', () => {
    const sim = seasonSim('dubbelloop', ['oupa_laai'], { rental: 'voorlaaier' });
    // Empty the belt first (no Oupa Laai yet: it stays empty).
    for (let i = 0; i < mag; i++) {
      waitCooldown(sim);
      step(sim, [FIRE]);
    }
    expect(sim.snapshot().weapon.shells).toBe(0);
    step(sim, [{ t: 'consumable', slot: 1 }]); // the Voorlaaier
    step(sim, [{ t: 'consumable', slot: 0 }]); // Oupa Laai: nothing to do while it's out
    const ev: SimEvent[] = [];
    for (let i = 0; i < 600 && sim.snapshot().weapon.kind === 'crate'; i++)
      ev.push(...step(sim, sim.snapshot().weapon.cooldownTicks === 0 ? [FIRE] : []));
    expect(ev.some((e) => e.type === 'reloadStarted')).toBe(false);
    const back = ev.find((e) => e.type === 'weaponChanged' && e.kind === 'primary');
    expect(back).toBeDefined();
    const started = step(sim).find((e) => e.type === 'reloadStarted');
    expect(started).toMatchObject({ auto: true, tick: (back?.tick ?? 0) + 1 });
  });

  it('shots under Chilli Biltong count as shots for the idle top-up', () => {
    const sim = seasonSim('pomp', ['oupa_laai', 'chilli_biltong']);
    for (let i = 0; i < 2; i++) {
      waitCooldown(sim);
      step(sim, [FIRE]);
    }
    step(sim, [{ t: 'consumable', slot: 0 }]);
    step(sim, [{ t: 'consumable', slot: 1 }]);
    // Keep firing while Chilli Biltong lasts; the last of those shots starts the idle wait.
    let lastShot = -1;
    for (let i = 0; i < msToTicks(powerup('chilli_biltong').durationMs ?? 0) + 5; i++) {
      const ev = step(sim, sim.snapshot().weapon.cooldownTicks === 0 ? [FIRE] : []);
      const shot = ev.find((e) => e.type === 'shotFired');
      if (shot !== undefined) lastShot = shot.tick;
      if (ev.some((e) => e.type === 'powerupEnded' && e.powerup === 'chilli_biltong')) break;
    }
    let started: SimEvent | undefined;
    for (let i = 0; i < 3 * idleTicks && started === undefined; i++)
      started = step(sim).find((e) => e.type === 'reloadStarted');
    expect(started?.tick).toBe(lastShot + idleTicks);
  });

  it('Blitslaai has nothing to shorten under Chilli Biltong (no reload, no shells used)', () => {
    const sim = seasonSim('dubbelloop', ['chilli_biltong', 'blitslaai']);
    useAll(sim, 2);
    const ev: SimEvent[] = [];
    for (let i = 0; i < 2 * mag; i++) {
      waitCooldown(sim);
      ev.push(...step(sim, [FIRE]));
    }
    expect(sim.snapshot().weapon.shells).toBe(mag);
    expect(ev.some((e) => e.type === 'reloadStarted')).toBe(false);
  });

  it('picking it up again refreshes the timer', () => {
    const sim = seasonSim('dubbelloop', ['oupa_laai', 'oupa_laai']);
    step(sim, [{ t: 'consumable', slot: 0 }]);
    for (let i = 0; i < 300; i++) step(sim);
    step(sim, [{ t: 'consumable', slot: 1 }]);
    const p = sim.snapshot().powerups.filter((x) => x.id === 'oupa_laai');
    expect(p).toHaveLength(1);
    expect(p[0]?.ticksLeft).toBe((p[0]?.totalTicks ?? 0) - 1);
  });
});

/** Plays a hunt from a command source, recording the log and hashing every event. */
function playRecorded(seed: number, mode: ModeConfig, next: (sim: Sim) => readonly Command[]) {
  const sim = createSim({ seed, content, mode, inputKind: 'pointer' });
  const rec = createRecorder({ seed, contentHash: loadContentHash(), mode, inputKind: 'pointer' });
  const hasher = createEventHasher();
  const events: SimEvent[] = [...sim.drainEvents()];
  hasher.add(events);
  while (!sim.isOver()) {
    const cmds = next(sim);
    rec.record(sim.tick, cmds);
    sim.step(cmds);
    const ev = sim.drainEvents();
    hasher.add(ev);
    events.push(...ev);
  }
  return { events, log: rec.toLog(), hash: hasher.digest(), count: hasher.count };
}

describe('reload power-ups replay', () => {
  it('a scripted Season hunt with both (and Snelhand) replays to the same events', () => {
    const mode: ModeConfig = {
      id: 'seasonHunt',
      biome: 'karoo-autumn',
      weapon: 'pomp',
      huntSeconds: 20,
      season: {
        kind: 'plain',
        boss: null,
        charms: ['snelhand'],
        consumables: ['blitslaai', 'oupa_laai'],
        rental: null,
        runShellBonus: 0,
      },
    };
    const play = playRecorded(9, mode, (sim) => {
      const t = sim.tick;
      if (t === 2) return [{ t: 'consumable', slot: 0 }];
      if (t === 3) return [{ t: 'consumable', slot: 1 }];
      if (t % 90 < 40 && t % 10 === 0)
        return [{ t: 'fire', dx: (t % 300) - 150, sy: 300 + (t % 200) }];
      return [];
    });
    expect(play.events.some((e) => e.type === 'reloadStarted' && e.auto === true)).toBe(true);
    const r = runReplay(play.log, content);
    expect(r.eventHash).toBe(play.hash);
    expect(r.eventCount).toBe(play.count);
  });

  it('Classic crates roll both, and those hunts replay identically', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60 && seen.size < 2; seed++) {
      const bot = createBot('competent', seed, content, 'pointer');
      const play = playRecorded(seed, { id: 'classic' }, (sim) => bot.next(sim.snapshot()));
      const got = play.events.flatMap((e) =>
        e.type === 'powerupStarted' && (e.powerup === 'blitslaai' || e.powerup === 'oupa_laai')
          ? [e.powerup]
          : [],
      );
      if (got.length === 0) continue;
      for (const id of got) seen.add(id);
      expect(runReplay(play.log, content).eventHash).toBe(play.hash);
    }
    expect([...seen].sort()).toEqual(['blitslaai', 'oupa_laai']);
  });
});
