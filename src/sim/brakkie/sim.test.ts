// v1.12 (D-069): Brakkie in the hunt — the modes he comes along in, his own stream (a content
// change to him moves no other system's draws before he acts), and a shot through the real hit
// test: aimed at him −25 (the nest's cooldown), a pellet that strikes him without that, nothing.
import { describe, expect, it } from 'vitest';
import { createBot } from '../../../tools/bots';
import { loadContent } from '../../../tools/testContent';
import type { SimEvent } from '../events';
import { hashEvents } from '../events';
import { createSim, type Sim } from '../Sim';
import { createRecorder, decodeInputLogText, encodeInputLogText, runReplay } from '../replay';
import type { Command, ModeConfig, SeasonHuntConfig } from '../types';

const content = loadContent();
const B = content.brakkie;

function sim(mode: ModeConfig, seed = 1): Sim {
  return createSim({ seed, content, mode, inputKind: 'pointer' });
}

function season(kind: 'plain' | 'omen' | 'boss'): SeasonHuntConfig {
  return {
    kind,
    ...(kind === 'boss' ? { boss: 'generaal' } : {}),
    charms: [],
    consumables: [],
    rental: null,
    runShellBonus: 0,
  } as SeasonHuntConfig;
}

describe('Brakkie in the hunt (D-069)', () => {
  it('comes along in Classic, the Daily and plain/omen Season Run hunts on every area', () => {
    for (const a of B.areas) {
      expect(sim({ id: 'classic', biome: a.biome }).snapshot().brakkie).not.toBeNull();
      expect(sim({ id: 'daily', biome: a.biome }).snapshot().brakkie).not.toBeNull();
    }
    for (const kind of ['plain', 'omen'] as const)
      expect(
        sim({
          id: 'seasonHunt',
          biome: 'karoo-autumn',
          weapon: 'dubbelloop',
          season: season(kind),
        }).snapshot().brakkie,
      ).not.toBeNull();
  });

  it('stays home in boss hunts, Oupa se Les and the Harvest', () => {
    expect(
      sim({
        id: 'seasonHunt',
        biome: 'karoo-autumn',
        weapon: 'dubbelloop',
        season: season('boss'),
      }).snapshot().brakkie,
    ).toBeNull();
    expect(sim({ id: 'ftue' }).snapshot().brakkie).toBeNull();
    expect(sim({ id: 'harvest' }).snapshot().brakkie).toBeNull();
  });

  it('the same seed gives the same hunt with him', () => {
    const run = (): string => {
      const s = sim({ id: 'classic', biome: 'okavango-spring' }, 7);
      const ev: SimEvent[] = [];
      while (!s.isOver()) {
        s.step([]);
        ev.push(...s.drainEvents());
      }
      return hashEvents(ev);
    };
    expect(run()).toBe(run());
  });

  it('a shot aimed at him through the hit test: −25, again only after the cooldown', () => {
    const s = sim({ id: 'classic', biome: 'karoo-autumn' }, 3);
    const ev: SimEvent[] = [];
    // Wait until he rests in view with no bird of his plane near (nothing in front of him).
    let guard = 0;
    for (;;) {
      s.step([]);
      ev.push(...s.drainEvents());
      const d = s.snapshot().brakkie;
      if (d?.phase === 'rest' && d.pose !== 'lie') break;
      if (++guard > 60 * 60) throw new Error('he never rested');
    }
    const d = s.snapshot().brakkie;
    if (d === null) throw new Error('no dog');
    const box = B.hitboxes.stand;
    const st = s.snapshot();
    // Near layer (scroll factor 1): planeX = cameraX + dx.
    const fire = {
      t: 'fire' as const,
      dx: d.x + box.body.ox * d.scale * d.facing - st.cameraX,
      sy: d.y + box.body.oy * d.scale,
    };
    const score0 = st.score;
    s.step([fire]);
    const hit = s.drainEvents().filter((e) => e.type === 'brakkieHit');
    expect(hit).toHaveLength(1);
    expect(hit[0]?.type === 'brakkieHit' && hit[0].aimed).toBe(true);
    expect(s.snapshot().score).toBe(score0 - B.hit.penalty);
    expect(s.snapshot().brakkie?.phase).toBe('yelp');
    expect(s.result().penalties).toBeGreaterThanOrEqual(1);
  });

  it('a real bag sends him to fetch it: a whole Classic hunt with the shipped content', () => {
    // The decision the fetch e2e no longer drives by shooting (it was timing-bound on CI): bots
    // bag birds through the real hit test; he starts a fetch, picks the bird up and brings it
    // home at least once a hunt (the balance doc's 0.6–2.6 fetches a hunt).
    const s = sim({ id: 'classic', biome: 'karoo-autumn' }, 42);
    const bot = createBot('competent', 42, content, 'pointer');
    const types: string[] = [];
    while (!s.isOver()) {
      s.step(bot.next(s.snapshot()));
      for (const e of s.drainEvents()) if (e.type.startsWith('brakkie')) types.push(e.type);
    }
    const started = types.indexOf('brakkieFetchStarted');
    expect(started).toBeGreaterThanOrEqual(0);
    const picked = types.indexOf('brakkiePickedUp', started);
    expect(picked).toBeGreaterThan(started);
    expect(types.indexOf('brakkieFetched', picked)).toBeGreaterThan(picked);
  });

  it('his events come only on a hunt he is on', () => {
    const s = sim({ id: 'ftue' }, 2);
    const types = new Set<string>();
    while (!s.isOver()) {
      s.step([]);
      for (const e of s.drainEvents()) types.add(e.type);
    }
    expect([...types].some((t) => t.startsWith('brakkie'))).toBe(false);
  });
});

describe('v1.13 polish: Brakkie rests clear of the gun barrel on screen', () => {
  it('when he stops at a rest spot his head is outside both hands’ gun stripes, and he still rests', () => {
    const [lo, hi] = B.roam.gunStripePx;
    let rests = 0;
    for (const a of B.areas)
      for (const seed of [1, 2]) {
        const s = sim({ id: 'classic', biome: a.biome }, seed);
        let prev = '';
        while (!s.isOver()) {
          s.step([]);
          s.drainEvents();
          const st = s.snapshot();
          const d = st.brakkie;
          const phase = d?.phase ?? '';
          if (d !== null && phase === 'rest' && prev === 'trot' && d.plane === 'near') {
            rests++;
            // Near layer (scroll factor 1): screen dx = x − cameraX.
            const head = Math.abs(d.x - st.cameraX + B.hitboxes.stand.head.ox * d.facing);
            expect(
              head < lo || head > hi,
              `${a.biome} seed ${String(seed)} head ${String(head)}`,
            ).toBe(true);
          }
          prev = phase;
        }
      }
    expect(rests).toBeGreaterThan(20);
  });
});

describe('v1.13 polish: a pan that leaves his head in the gun stripe gets him up', () => {
  it('he rests, the view pans until his head is 200 px right of the centre, and he moves off', () => {
    const [lo, hi] = B.roam.gunStripePx;
    const want = (lo + hi) / 2;
    let checked = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      if (checked > 0) break;
      const s = sim({ id: 'classic', biome: 'bushveld-winter' }, seed);
      // Wait for a rest on the near plane.
      for (let i = 0; i < 60 * 60 && !s.isOver(); i++) {
        s.step([]);
        const d = s.snapshot().brakkie;
        if (d?.phase === 'rest' && d.plane === 'near' && d.dur - d.t > 90) break;
      }
      const d0 = s.snapshot().brakkie;
      if (d0?.phase !== 'rest' || d0.plane !== 'near') continue;
      // Pan (the camera target) so his head sits in the stripe; he stays put while it pans.
      const cx = d0.x + B.hitboxes.stand.head.ox * d0.facing - want;
      let inStripe = false;
      for (let i = 0; i < 120 && !inStripe; i++) {
        s.step([{ t: 'cameraTarget', cx }]);
        const st = s.snapshot();
        const d = st.brakkie;
        if (d?.phase !== 'rest') break;
        const head = Math.abs(d.x + B.hitboxes.stand.head.ox * d.facing - st.cameraX);
        inStripe = head >= lo && head <= hi;
      }
      if (!inStripe) continue;
      // Within his check interval (and a little) he gets up and goes.
      let up = false;
      for (let i = 0; i < Math.ceil(B.clear.checkSeconds * 60) + 6 && !up; i++) {
        s.step([{ t: 'cameraTarget', cx }]);
        up = s.snapshot().brakkie?.phase !== 'rest';
      }
      expect(up, `seed ${String(seed)}`).toBe(true);
      checked++;
    }
    expect(checked).toBe(1);
  });
});

describe('Brakkie the companion in the hunt (v1.17, D-079)', () => {
  it('the whistle is a recorded command: a hunt with whistles replays to the same events', () => {
    const mode: ModeConfig = { id: 'daily', biome: 'bushveld-winter' };
    const s = sim(mode, 31);
    const rec = createRecorder({
      seed: 31,
      contentHash: 'ab'.repeat(32),
      mode,
      inputKind: 'pointer',
    });
    const ev: SimEvent[] = [...s.drainEvents()];
    const bot = createBot('competent', 31, content, 'pointer');
    let whistles = 0;
    while (!s.isOver()) {
      const cmds: Command[] = [...bot.next(s.snapshot())];
      // Whistle whenever it would do something (spring a point, heel, seek), now and then.
      const w = s.snapshot().brakkie?.whistle ?? null;
      if (w !== null && s.tick % 97 === 0) {
        cmds.push({ t: 'whistle' });
        whistles++;
      }
      rec.record(s.tick, cmds);
      s.step(cmds);
      ev.push(...s.drainEvents());
    }
    expect(whistles).toBeGreaterThan(0);
    const acted = ev.filter((e) => e.type === 'brakkieWhistled');
    expect(acted.length).toBeGreaterThan(0);
    const log = decodeInputLogText(encodeInputLogText(rec.toLog()));
    expect(runReplay(log, content).eventHash).toBe(hashEvents(ev));
  });

  it('Bring and Goeie hond pay as event bonuses in a real hunt (× Frenzy × Stampede)', () => {
    const s = sim({ id: 'classic', biome: 'okavango-spring' }, 5);
    const bot = createBot('competent', 5, content, 'pointer');
    const ev: SimEvent[] = [];
    while (!s.isOver()) {
      s.step(bot.next(s.snapshot()));
      ev.push(...s.drainEvents());
    }
    const brings = ev.filter((e) => e.type === 'bonusAwarded' && e.bonus === 'bring');
    const fetched = ev.filter((e) => e.type === 'brakkieFetched');
    expect(brings.length).toBe(fetched.length);
    for (const b of brings)
      if (b.type === 'bonusAwarded') {
        expect(b.base).toBe(B.bring.points);
        expect(b.award).toBeGreaterThanOrEqual(B.bring.points);
      }
    const d = s.snapshot().brakkie;
    expect(d?.points).toBe(
      ev.reduce(
        (n, e) =>
          e.type === 'bonusAwarded' &&
          (e.bonus === 'bring' || e.bonus === 'bringStreak' || e.bonus === 'goodPoint')
            ? n + e.award
            : n,
        0,
      ),
    );
  });

  it('a point in a real hunt flushes a flock of 5 (the Whole Flock is possible)', () => {
    let seen = false;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const s = sim({ id: 'classic', biome: 'kalahari-summer' }, seed);
      const ev: SimEvent[] = [];
      while (!s.isOver() && !seen) {
        s.step([]);
        ev.push(...s.drainEvents());
        const f = ev.find((e) => e.type === 'brakkieFlushed' && e.flockId !== null);
        if (f?.type === 'brakkieFlushed' && f.flockId !== null) {
          const flock = s.snapshot().flocks.find((x) => x.id === f.flockId);
          expect(flock?.spawnSize).toBe(B.point.size);
          expect(ev.some((e) => e.type === 'brakkiePointed')).toBe(true);
          seen = true;
        }
      }
      if (seen) break;
    }
    expect(seen).toBe(true);
  });
});
