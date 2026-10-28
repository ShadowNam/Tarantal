// Headless players for tools (run-hunt, golden replays, the M3 balance sim). Bots see only
// snapshot() — like the renderer — and answer with Commands. Their randomness is their own.
// The human-like plinker and competent bots live in humanBots.ts.
import type { ContentBundle } from '../src/content/schemas';
import { planeToDx } from '../src/sim/camera';
import { createStream, fnv1a32 } from '../src/sim/rng';
import type { BirdView, Command, InputKind, SimState } from '../src/sim/types';
import { CAMERA_MAX_X, CAMERA_MIN_X } from '../src/sim/world';

import { createHumanBot } from './humanBots';
import { inReach, RIFLE_STYLES, withRifle } from './rifleBot';

/** random: sprays · aim: near-perfect M1 aimer (goldens) · plinker / competent: GDD §13.8 ·
 *  spook (D-048, goldens only): shoots a special day's lanterns, bats and one owl ·
 *  canHappy (v1.8, D-050): the competent bot that shoots every tin can in view first ·
 *  apexJuggler (v1.8, D-050): the competent bot that juggles every can at the top of its arc ·
 *  nutHappy (1.9.3, D-056): the competent bot that shoots every makalani nut (and can) in view. */
export type BotKind =
  'random' | 'aim' | 'plinker' | 'competent' | 'spook' | 'canHappy' | 'apexJuggler' | 'nutHappy';
export const BOT_KINDS: readonly BotKind[] = [
  'random',
  'aim',
  'plinker',
  'competent',
  'canHappy',
  'apexJuggler',
  'nutHappy',
];

export interface Bot {
  readonly kind: BotKind;
  next(state: SimState): Command[];
}

/** Half the 16:9 reference width: what a bot "sees" either side of the screen centre. */
const VIEW_HALF_WIDTH = 900;

export function createBot(
  kind: BotKind,
  seed: number,
  content: ContentBundle,
  inputKind: InputKind = 'pointer',
): Bot {
  // v1.3: every bot shoots a rifle by hold and release (a no-op for guns without sights).
  const style =
    kind === 'plinker' || kind === 'random' ? RIFLE_STYLES.impatient : RIFLE_STYLES.patient;
  if (kind === 'spook') return spookBot(content);
  if (kind === 'canHappy') {
    const competent = createHumanBot('competent', seed, content, inputKind);
    const bot = canHappyBot(competent, seed, content, inputKind);
    return { kind, next: withRifle(bot, content, seed, style).next };
  }
  if (kind === 'nutHappy') {
    const competent = createHumanBot('competent', seed, content, inputKind);
    const cans = canHappyBot(competent, seed, content, inputKind);
    const bot = nutHappyBot(cans, seed, content, inputKind);
    return { kind, next: withRifle(bot, content, seed, style).next };
  }
  if (kind === 'apexJuggler') {
    const competent = createHumanBot('competent', seed, content, inputKind);
    const bot = apexJuggler(competent, seed, content, inputKind);
    return { kind, next: withRifle(bot, content, seed, style).next };
  }
  const inner =
    kind === 'plinker' || kind === 'competent'
      ? createHumanBot(kind, seed, content, inputKind)
      : kind === 'random'
        ? randomBot(seed)
        : aimBot(seed, content);
  return { kind, next: withRifle(inner, content, seed, style).next };
}

/**
 * v1.8 (D-050): the competent player who can't leave a tin can alone. Whenever a can is in view
 * and the gun is ready it shoots the can — one in the air first (it saw it ~250 ms ago and leads
 * it along its arc, gravity and all), else a resting one — with the competent bot's aim error;
 * otherwise it hunts like the competent bot. The balance cap: cans stay ≤ ~10 % of its score.
 */
function canHappyBot(
  inner: { next(state: SimState): Command[] },
  seed: number,
  content: ContentBundle,
  inputKind: InputKind,
): { next(state: SimState): Command[] } {
  const rng = createStream((seed ^ fnv1a32('bot:canHappy')) >>> 0);
  const planes = content.scoring.planes;
  const LAG = 15;
  const SIGMA = inputKind === 'touch' ? 26 : 10;
  const history: SimState[] = [];
  let ready = 0;
  const gauss = (): number => {
    // Box–Muller from two uniforms (tools may use Math).
    const u = Math.max(1e-9, rng.next());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng.next());
  };
  return {
    next(s) {
      history.push(s);
      if (history.length > LAG + 2) history.shift();
      const seen = history[0];
      const before = history[1];
      const w = s.weapon;
      if (seen === undefined || before === undefined) return inner.next(s);
      if (w.shells === 0 || w.reloading || w.cooldownTicks > 0 || s.tick < ready)
        return inner.next(s);
      const lag = s.tick - seen.tick;
      let aim: { x: number; y: number } | null = null;
      let f = 1;
      // The day's fence first, then (1.9.3, D-056) the far fence behind it.
      for (const which of ['cans', 'farCans'] as const) {
        const c = s[which];
        if (c === undefined || aim !== null) continue;
        f = planes[c.plane].scrollFactor;
        const ratio = planes[c.plane].scale / content.scoring.tuningRefScale;
        const g = (content.birds.cans.juggle.gravityPxPerSec2 * ratio) / 3600;
        const old = new Map((seen[which]?.cans ?? []).map((k) => [k.id, k]));
        const older = new Map((before[which]?.cans ?? []).map((k) => [k.id, k]));
        for (const k of c.cans) {
          const a = old.get(k.id);
          const b = older.get(k.id);
          if (a === undefined || b === undefined || a.state !== 'air') continue;
          // Its velocity as seen then, and where that arc puts it now.
          const vx = b.x - a.x;
          const vy = b.y - a.y;
          aim = { x: a.x + vx * lag, y: a.y + vy * lag + 0.5 * g * lag * lag };
          break;
        }
        if (aim === null) {
          const rest = (seen[which]?.cans ?? []).find(
            (k) => k.state === 'rest' && Math.abs(planeToDx(s.cameraX, f, k.x)) < VIEW_HALF_WIDTH,
          );
          if (rest !== undefined) aim = { x: rest.x, y: rest.y };
        }
      }
      if (aim === null) return inner.next(s);
      const dx = planeToDx(s.cameraX, f, aim.x);
      if (Math.abs(dx) > VIEW_HALF_WIDTH || aim.y < 20) return inner.next(s);
      ready = s.tick + 10;
      return [{ t: 'fire', dx: dx + gauss() * SIGMA, sy: aim.y + gauss() * SIGMA }];
    },
  };
}

/**
 * 1.9.3 (D-056): the competent player who can't leave a makalani nut alone (nor a can: it wraps
 * the can-happy bot). Whenever a nut is in view and the gun is ready it shoots it — one in the air
 * first (seen ~250 ms ago, led along its arc), else a hanging one — with the competent bot's aim
 * error. The balance cap: cans plus nuts stay ≤ ~10 % of its score.
 */
function nutHappyBot(
  inner: { next(state: SimState): Command[] },
  seed: number,
  content: ContentBundle,
  inputKind: InputKind,
): { next(state: SimState): Command[] } {
  const rng = createStream((seed ^ fnv1a32('bot:nutHappy')) >>> 0);
  const planes = content.scoring.planes;
  const LAG = 15;
  const SIGMA = inputKind === 'touch' ? 26 : 10;
  const history: SimState[] = [];
  let ready = 0;
  const gauss = (): number => {
    const u = Math.max(1e-9, rng.next());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng.next());
  };
  return {
    next(s) {
      history.push(s);
      if (history.length > LAG + 2) history.shift();
      const seen = history[0];
      const before = history[1];
      const w = s.weapon;
      if (s.nuts === undefined || seen === undefined || before === undefined) return inner.next(s);
      if (w.shells === 0 || w.reloading || w.cooldownTicks > 0 || s.tick < ready)
        return inner.next(s);
      const lag = s.tick - seen.tick;
      const old = new Map((seen.nuts?.nuts ?? []).map((k) => [k.id, k]));
      const older = new Map((before.nuts?.nuts ?? []).map((k) => [k.id, k]));
      let aim: { x: number; y: number; f: number } | null = null;
      for (const k of s.nuts.nuts) {
        const a = old.get(k.id);
        const b = older.get(k.id);
        if (a === undefined || b === undefined || a.state !== 'air' || k.state !== 'air') continue;
        const ratio = planes[k.plane].scale / content.scoring.tuningRefScale;
        const g = (content.birds.makalani.juggle.gravityPxPerSec2 * ratio) / 3600;
        aim = {
          x: a.x + (b.x - a.x) * lag,
          y: a.y + (b.y - a.y) * lag + 0.5 * g * lag * lag,
          f: planes[k.plane].scrollFactor,
        };
        break;
      }
      if (aim === null) {
        const hanging = (seen.nuts?.nuts ?? []).find(
          (k) =>
            k.state === 'rest' &&
            Math.abs(planeToDx(s.cameraX, planes[k.plane].scrollFactor, k.x)) < VIEW_HALF_WIDTH,
        );
        if (hanging !== undefined)
          aim = { x: hanging.x, y: hanging.y, f: planes[hanging.plane].scrollFactor };
      }
      if (aim === null) return inner.next(s);
      const dx = planeToDx(s.cameraX, aim.f, aim.x);
      if (Math.abs(dx) > VIEW_HALF_WIDTH || aim.y < 20) return inner.next(s);
      ready = s.tick + 10;
      return [{ t: 'fire', dx: dx + gauss() * SIGMA, sy: aim.y + gauss() * SIGMA }];
    },
  };
}

export interface ApexOptions {
  /** Reaction time: it sees the can this many ticks late (default 6 = 100 ms). */
  readonly lagTicks?: number;
  /** Aim error, design px (default: mouse 10, touch 26). */
  readonly sigmaPx?: number;
  /** Pan to a resting can when none is in view (tools/juggle-check: no hunting in between). */
  readonly seekCans?: boolean;
}

/**
 * v1.8 (D-050): the good juggler. It knocks a resting can in view off, then follows the can with
 * the camera and shoots it once per arc at the top (the still point a player waits for): it sees
 * the can `lagTicks` late and aims where it saw the apex, with a Gaussian aim error — so the can
 * has fallen and drifted a little by the time the shot lands. Cooldown and reloads as in play (it
 * reloads at once when empty with a can in the air); without a can it hunts like `inner`.
 */
export function apexJuggler(
  inner: { next(state: SimState): Command[] },
  seed: number,
  content: ContentBundle,
  inputKind: InputKind,
  opts: ApexOptions = {},
): { next(state: SimState): Command[] } {
  const rng = createStream((seed ^ fnv1a32('bot:apexJuggler')) >>> 0);
  const planes = content.scoring.planes;
  const LAG = opts.lagTicks ?? 6;
  const SIGMA = opts.sigmaPx ?? (inputKind === 'touch' ? 26 : 10);
  const history: SimState[] = [];
  /** The arc it already shot at, per can: `${chain}/${state}` (one shot per arc). */
  const shotArc = new Map<number, string>();
  const gauss = (): number => {
    const u = Math.max(1e-9, rng.next());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng.next());
  };
  const camFor = (x: number, f: number): number =>
    Math.round(Math.min(CAMERA_MAX_X, Math.max(CAMERA_MIN_X, (x - 960) / f + 960)) * 2) / 2;
  return {
    next(s) {
      history.push(s);
      if (history.length > LAG + 2) history.shift();
      const c = s.cans;
      const seen = history[history.length - 1 - LAG];
      const before = history[history.length - 2 - LAG];
      if (c === undefined || seen === undefined || before === undefined) return inner.next(s);
      const f = planes[c.plane].scrollFactor;
      const w = s.weapon;
      const ready = w.shells > 0 && !w.reloading && w.cooldownTicks === 0;
      const prev = new Map((before.cans?.cans ?? []).map((k) => [k.id, k]));
      const flying = (seen.cans?.cans ?? []).find(
        (k) => (k.state === 'air' || k.state === 'bounced') && k.y > 0,
      );
      if (flying !== undefined) {
        // Follow it (a player pans after the can).
        const out: Command[] = [{ t: 'cameraTarget', cx: camFor(flying.x, f) }];
        if (w.shells === 0 && !w.reloading) return [...out, { t: 'reload' }];
        const p = prev.get(flying.id);
        const arc = `${String(flying.chain)}/${flying.state}`;
        const pastTop = p !== undefined && p.state === flying.state && flying.y >= p.y;
        if (!ready || !pastTop || shotArc.get(flying.id) === arc) return out;
        shotArc.set(flying.id, arc);
        const cx = camFor(flying.x, f);
        out[0] = { t: 'cameraTarget', cx };
        return [
          ...out,
          {
            t: 'fire',
            dx: planeToDx(cx, f, flying.x) + gauss() * SIGMA,
            sy: flying.y + gauss() * SIGMA,
          },
        ];
      }
      const rest = c.cans.find(
        (k) => k.state === 'rest' && Math.abs(planeToDx(s.cameraX, f, k.x)) < VIEW_HALF_WIDTH,
      );
      if (opts.seekCans === true && w.shells === 0 && !w.reloading) return [{ t: 'reload' }];
      if (rest === undefined) {
        const any = c.cans.find((k) => k.state === 'rest');
        if (opts.seekCans === true && any !== undefined)
          return [{ t: 'cameraTarget', cx: camFor(any.x, f) }];
        return inner.next(s);
      }
      if (!ready) return inner.next(s);
      return [
        {
          t: 'fire',
          dx: planeToDx(s.cameraX, f, rest.x) + gauss() * SIGMA,
          sy: rest.y + gauss() * SIGMA,
        },
      ];
    },
  };
}

/**
 * D-048: the Spookjag's things, so the Halloween golden covers every scoring path: every lit
 * lantern (Lanterns out), each bat, and the first owl only (one penalty). It jumps the camera to
 * the thing and fires at its centre the same tick (the camera moves before the shot resolves).
 */
function spookBot(content: ContentBundle): Bot {
  const planes = content.scoring.planes;
  let owlShot = false;
  let next = 0;
  return {
    kind: 'spook',
    next(s) {
      if (s.weapon.shells === 0 && !s.weapon.reloading) return [{ t: 'reload' }];
      if (s.tick < next || s.weapon.reloading || s.weapon.cooldownTicks > 0) return [];
      const things = s.feesdag?.things ?? [];
      const pick =
        things.find((t) => t.kind === 'lantern' && !t.dark) ??
        things.find((t) => t.kind === 'bat') ??
        (owlShot ? undefined : things.find((t) => t.kind === 'owl'));
      if (pick === undefined) return [];
      const f = planes[pick.plane].scrollFactor;
      const cx =
        Math.round(Math.min(CAMERA_MAX_X, Math.max(CAMERA_MIN_X, (pick.x - 960) / f + 960)) * 2) /
        2;
      const dx = planeToDx(cx, f, pick.x);
      // Off the screen at every aspect even at the camera's end: not now.
      if (Math.abs(dx) > VIEW_HALF_WIDTH) return [];
      if (pick.kind === 'owl') owlShot = true;
      next = s.tick + 14;
      return [
        { t: 'cameraTarget', cx },
        { t: 'fire', dx, sy: pick.y },
      ];
    },
  };
}

/** Sprays shots across the screen, pans at random, reloads when empty. */
function randomBot(seed: number): Bot {
  const rng = createStream((seed ^ fnv1a32('bot:random')) >>> 0);
  return {
    kind: 'random',
    next(s) {
      const out: Command[] = [];
      if (s.tick % 180 === 0)
        out.push({ t: 'cameraTarget', cx: rng.range(CAMERA_MIN_X, CAMERA_MAX_X) });
      if (s.weapon.shells === 0 && !s.weapon.reloading) out.push({ t: 'reload' });
      else if (rng.chance(1 / 18))
        out.push({ t: 'fire', dx: rng.range(-900, 900), sy: rng.range(80, 1040) });
      return out;
    },
  };
}

/** Aims at visible targets with a little error and reaction time, pans toward birds, avoids non-targets. */
function aimBot(seed: number, content: ContentBundle): Bot {
  const rng = createStream((seed ^ fnv1a32('bot:aim')) >>> 0);
  const planes = content.scoring.planes;
  const creatures = new Map(content.birds.creatures.map((c) => [c.id, c]));
  let reactUntil = 0;

  // The aim bot doesn't lead, but it knows a Kettie stone drops (it aims that much higher).
  const drops = new Map(
    content.weapons.weapons.flatMap((w) =>
      w.kind === 'primary' && w.projectile !== null ? [[w.id, w.projectile.dropPx] as const] : [],
    ),
  );
  const aimPoint = (b: BirdView, cx: number, weapon: string): { dx: number; sy: number } => {
    const p = planes[b.plane];
    const c = creatures.get(b.creature);
    const body = c !== undefined && 'hitbox' in c ? c.hitbox.body : { ox: 0, oy: 0 };
    const x = b.x + body.ox * p.scale * b.facing;
    // Stones never reach the Ver plane (v1.3): nothing to aim higher for there.
    const drop = b.plane === 'ver' ? 0 : (drops.get(weapon)?.[b.plane] ?? 0);
    return { dx: planeToDx(cx, p.scrollFactor, x), sy: b.y + body.oy * p.scale - drop };
  };

  return {
    kind: 'aim',
    next(s) {
      const out: Command[] = [];
      const targets = s.birds.filter(
        (b) => b.hittable && b.kind !== 'nonTarget' && inReach(content, s.weapon.id, b),
      );
      const visible = targets
        .map((b) => ({ b, ...aimPoint(b, s.cameraX, s.weapon.id) }))
        .filter((t) => Math.abs(t.dx) < VIEW_HALF_WIDTH);
      const ready = s.weapon.cooldownTicks === 0 && !s.weapon.reloading;

      if (s.weapon.shells === 0 && !s.weapon.reloading) return [{ t: 'reload' }];
      if (visible.length === 0) {
        if (s.weapon.shells < 4 && !s.weapon.reloading) return [{ t: 'reload' }];
        if (s.tick % 30 === 0 && targets.length > 0) {
          const pick = targets[rng.int(0, targets.length - 1)];
          if (pick !== undefined) {
            const f = planes[pick.plane].scrollFactor;
            const cx = Math.min(CAMERA_MAX_X, Math.max(CAMERA_MIN_X, (pick.x - 960) / f + 960));
            out.push({ t: 'cameraTarget', cx });
          }
        }
        return out;
      }
      if (!ready || s.tick < reactUntil) return out;
      visible.sort((a, c) => Math.abs(a.dx) - Math.abs(c.dx));
      const t = visible[0];
      if (t === undefined) return out;
      out.push({ t: 'fire', dx: t.dx + rng.range(-12, 12), sy: t.sy + rng.range(-12, 12) });
      reactUntil = s.tick + rng.int(10, 24);
      return out;
    },
  };
}
