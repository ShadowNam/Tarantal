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
 *  spook (D-048, goldens only): shoots a special day's lanterns, bats and one owl. */
export type BotKind = 'random' | 'aim' | 'plinker' | 'competent' | 'spook';
export const BOT_KINDS: readonly BotKind[] = ['random', 'aim', 'plinker', 'competent'];

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
  const inner =
    kind === 'plinker' || kind === 'competent'
      ? createHumanBot(kind, seed, content, inputKind)
      : kind === 'random'
        ? randomBot(seed)
        : aimBot(seed, content);
  return { kind, next: withRifle(inner, content, seed, style).next };
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
