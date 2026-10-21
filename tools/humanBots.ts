// Human-like balance bots (GDD §13.8): `plinker` and `competent`. Both share one model of a
// player so the score gap between them measures strategy (flock tempo), not aim:
//   - perception lag: decisions use the snapshot from ~250 ms ago (reaction time);
//   - leading: moving targets are aimed where they will be, from their perceived velocity;
//   - aim error: Gaussian, larger for a finger than a mouse — touch aim assist only gives back
//     what the finger loses, so touch scores stay close to pointer scores;
//   - panning at keyboard pan speed (no instant camera jumps) and a human shot cadence.
// Bots read only snapshot() (what the screen shows), never sim internals.
// M4 (D-021): both styles shoot supply crates and the boss when they see them; only the competent
// bot shoots visible secret parts, and only when nothing better is in view.
import type { ContentBundle } from '../src/content/schemas';
import { planeToDx } from '../src/sim/camera';
import { createStream, fnv1a32, type RandomStream } from '../src/sim/rng';
import type { BirdView, Command, FlockView, InputKind, PlaneId, SimState } from '../src/sim/types';
import { CAMERA_MAX_X, CAMERA_MIN_X } from '../src/sim/world';

export type HumanStyle = 'plinker' | 'competent';

/** The player model. Times in ticks (60/s), distances in design px. */
export interface HumanProfile {
  /** Reaction time: the age of the snapshot decisions are made from. ~250 ms (GDD §13.8). */
  readonly reactionTicks: number;
  /** Aim error σ per axis, by input. */
  readonly aimSigmaPx: Readonly<Record<InputKind, number>>;
  /** Minimum ticks between shots at the same area, and after switching to a new target. */
  readonly followUpTicks: readonly [number, number];
  readonly switchTicks: readonly [number, number];
  /** Camera pan speed in reference units per tick (feel.json keyPanPxPerSec 1600 / 60). */
  readonly panPerTick: number;
  /** Half-width of the screen the bot watches (16:9 minus a margin). */
  readonly viewHalfWidth: number;
}

export const HUMAN: HumanProfile = {
  reactionTicks: 15,
  aimSigmaPx: { pointer: 10, touch: 26 },
  followUpTicks: [10, 14],
  switchTicks: [16, 26],
  panPerTick: 1600 / 60,
  viewHalfWidth: 880,
};

interface Aim {
  readonly bird: BirdView;
  readonly dx: number;
  readonly sy: number;
}

export interface HumanBot {
  readonly kind: HumanStyle;
  next(state: SimState): Command[];
}

const HISTORY = 64;
/** Skip a shot if a do-not-shoot creature is this close to the aim point (screen px). */
const PENALTY_CLEARANCE_PX = 90;
/** Flushed birds within this distance of each other are one cluster (shotgun spread ~70). */
const CLUSTER_PX = 45;

export function createHumanBot(
  style: HumanStyle,
  seed: number,
  content: ContentBundle,
  inputKind: InputKind,
  profile: HumanProfile = HUMAN,
): HumanBot {
  const rng = createStream((seed ^ fnv1a32(`bot:${style}`)) >>> 0);
  const planes = content.scoring.planes;
  const creatures = new Map(content.birds.creatures.map((c) => [c.id, c]));
  const history: SimState[] = [];
  let nextShotAt = 0;
  let lastAim: { dx: number; sy: number } | null = null;
  let camGoal: number | null = null;
  const sigma = profile.aimSigmaPx[inputKind];
  const layerFactor = new Map(
    content.biomes.flatMap((b) => b.layers.map((l) => [l.id, l.scrollFactor] as const)),
  );

  const gauss = (r: RandomStream): number => {
    // Box–Muller (tools may use Math; the sim never sees this).
    const u = Math.max(1e-9, r.next());
    const v = r.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  /** Projectile weapons (Kettie): ticks to each plane and the drop there (aim higher, lead more). */
  const flight = new Map(
    content.weapons.weapons.flatMap((w) =>
      w.kind === 'primary' && w.projectile !== null ? [[w.id, w.projectile] as const] : [],
    ),
  );

  /** Where a bird's body centre will be on screen when the shot gets there, from what was seen
   *  `lag` ticks ago (plus the flight time and drop of a Kettie stone). */
  function project(
    b: BirdView,
    before: BirdView | undefined,
    cx: number,
    lag: number,
    weapon: string,
  ): Aim {
    const p = planes[b.plane];
    const c = creatures.get(b.creature);
    const body = c !== undefined && 'hitbox' in c ? c.hitbox.body : { ox: 0, oy: 0 };
    const stone = flight.get(weapon);
    const travel = stone === undefined ? 0 : Math.round((stone.travelMs[b.plane] * 60) / 1000) + 1;
    const drop = stone === undefined ? 0 : stone.dropPx[b.plane];
    const vx = before === undefined ? 0 : b.x - before.x;
    const vy = before === undefined ? 0 : b.y - before.y;
    const x = b.x + vx * (lag + travel) + body.ox * p.scale * b.facing;
    const y = b.y + vy * (lag + travel) + body.oy * p.scale - drop;
    return { bird: b, dx: planeToDx(cx, p.scrollFactor, x), sy: y };
  }

  function valueOf(b: BirdView): number {
    const c = creatures.get(b.creature);
    const base =
      c !== undefined && 'baseOverride' in c && c.baseOverride !== undefined
        ? c.baseOverride
        : planes[b.plane].base;
    return base * (1 + content.scoring.behaviourAdd[b.behaviour]);
  }

  function panToward(cx: number, goal: number): Command {
    const step = Math.max(-profile.panPerTick, Math.min(profile.panPerTick, goal - cx));
    return { t: 'cameraTarget', cx: Math.min(CAMERA_MAX_X, Math.max(CAMERA_MIN_X, cx + step)) };
  }

  /** Camera centre that puts plane x in the middle of the screen. */
  function cameraFor(plane: PlaneId, x: number): number {
    const f = planes[plane].scrollFactor;
    return Math.min(CAMERA_MAX_X, Math.max(CAMERA_MIN_X, (x - 960) / f + 960));
  }

  function fire(s: SimState, aim: { dx: number; sy: number }): Command {
    const switched = lastAim === null || Math.hypot(aim.dx - lastAim.dx, aim.sy - lastAim.sy) > 200;
    const gap = switched ? profile.switchTicks : profile.followUpTicks;
    nextShotAt = s.tick + rng.int(gap[0], gap[1]);
    lastAim = aim;
    return {
      t: 'fire',
      dx: aim.dx + gauss(rng) * sigma,
      sy: aim.sy + gauss(rng) * sigma,
    };
  }

  /** Mean aim point of the flushed birds clustered around `a` (Twee Vlieë hunting). */
  function clusterAim(a: Aim, all: readonly Aim[]): { dx: number; sy: number; n: number } {
    const near = all.filter((o) => Math.hypot(o.dx - a.dx, o.sy - a.sy) <= CLUSTER_PX);
    const dx = near.reduce((t, o) => t + o.dx, 0) / near.length;
    const sy = near.reduce((t, o) => t + o.sy, 0) / near.length;
    return { dx, sy, n: near.length };
  }

  return {
    kind: style,
    next(now) {
      history.push(now);
      if (history.length > HISTORY) history.shift();
      const lag = Math.min(profile.reactionTicks, history.length - 1);
      const seen = history[history.length - 1 - lag] ?? now;
      const seenBefore = history[history.length - 2 - lag];
      const before = new Map((seenBefore?.birds ?? []).map((b) => [b.id, b]));
      const flocks = new Map<number, FlockView>(seen.flocks.map((f) => [f.id, f]));
      const out: Command[] = [];
      const cx = now.cameraX;
      const w = now.weapon;

      // Everything visible, projected to where it is now.
      const aims = seen.birds
        .filter((b) => b.hittable)
        .map((b) => project(b, before.get(b.id), cx, lag, now.weapon.id))
        .filter((a) => Math.abs(a.dx) < profile.viewHalfWidth && a.sy > 0 && a.sy < 1080);
      const blockers = aims.filter((a) => a.bird.kind === 'nonTarget');
      const safe = (p: { dx: number; sy: number }): boolean =>
        blockers.every((b) => Math.hypot(b.dx - p.dx, b.sy - p.sy) > PENALTY_CLEARANCE_PX);
      const targets = aims.filter((a) => a.bird.kind !== 'nonTarget' && safe(a));
      const flockOf = (a: Aim): FlockView | undefined =>
        a.bird.flockId === null ? undefined : flocks.get(a.bird.flockId);

      const inView = (p: { dx: number; sy: number }): boolean =>
        Math.abs(p.dx) < profile.viewHalfWidth && p.sy > 0 && p.sy < 1080 && safe(p);
      // Crates fall slowly: lead them like birds.
      const crates = seen.crates
        .map((c) => {
          const prev = seenBefore?.crates.find((x) => x.id === c.id);
          const f = planes[c.plane].scrollFactor;
          return {
            dx: planeToDx(cx, f, c.x),
            sy: c.y + (prev === undefined ? 0 : c.y - prev.y) * lag,
          };
        })
        .filter(inView);
      const bosses = targets.filter((a) => a.bird.kind === 'boss');
      // Secret parts (some turn on a rotor): lead them from their last movement too.
      const secretParts =
        style !== 'competent'
          ? []
          : seen.secrets
              .filter((sec) => sec.ready)
              .flatMap((sec) => {
                const f = layerFactor.get(sec.layerId) ?? 1;
                const prev = seenBefore?.secrets.find((x) => x.propId === sec.propId);
                return sec.parts
                  .filter((part) => !part.hit)
                  .map((part) => {
                    const old = prev?.parts.find((x) => x.id === part.id);
                    const vx = old === undefined ? 0 : part.x - old.x;
                    const vy = old === undefined ? 0 : part.y - old.y;
                    return { dx: planeToDx(cx, f, part.x + vx * lag), sy: part.y + vy * lag };
                  });
              })
              .filter(inView);

      const flushed = targets.filter((a) => flockOf(a)?.state === 'flush');
      const loose = targets.filter((a) => a.bird.flockId === null);
      const grounded = (state: FlockView['state']): Aim[] =>
        targets.filter((a) => flockOf(a)?.state === state && a.bird.behaviour !== 'flying');

      // Pick a shot by style.
      let shot: { dx: number; sy: number } | null = null;
      let wantShells = 1;
      const best = (list: readonly Aim[]): Aim | undefined =>
        [...list].sort(
          (a, b) => valueOf(b.bird) - valueOf(a.bird) || Math.abs(a.dx) - Math.abs(b.dx),
        )[0];

      if (style === 'competent') {
        const escalating = [...grounded('run'), ...grounded('alert')];
        const foraging = [...grounded('forage'), ...grounded('settle')];
        if (flushed.length === 0 && bosses.length > 0) {
          shot = best(bosses) ?? null;
        } else if (flushed.length === 0 && crates[0] !== undefined) {
          shot = crates[0];
        } else if (flushed.length > 0) {
          const pick = flushed
            .map((a) => ({ a, c: clusterAim(a, flushed) }))
            .sort((x, y) => y.c.n - x.c.n || valueOf(y.a.bird) - valueOf(x.a.bird))[0];
          if (pick) shot = pick.c.n > 1 && safe(pick.c) ? pick.c : pick.a;
        } else if (escalating.length > 0) {
          shot = best(escalating) ?? null;
        } else {
          const flyer = best(loose.filter((a) => a.bird.behaviour === 'flying'));
          const flock = foraging[0];
          const big = seen.flocks.find(
            (f) =>
              (f.state === 'forage' || f.state === 'alert') &&
              f.alive >= 8 &&
              foraging.some((a) => a.bird.flockId === f.id),
          );
          const g = now.gadget;
          if (big && g && g.charges > 0 && g.cooldownTicks === 0 && w.shells === w.magazine) {
            out.push({ t: 'gadget' });
          } else if (flyer && (flock === undefined || valueOf(flyer.bird) > 30)) {
            shot = flyer;
          } else if (flock) {
            // Starting an escalation needs shells for the run, the flush and the fountain.
            wantShells = w.magazine;
            shot = best(foraging) ?? null;
          } else shot = best(loose) ?? secretParts[0] ?? null;
        }
      } else {
        // Plinker: never escalates on purpose — only foraging flocks, waiting out every alert.
        const foraging = grounded('forage');
        const flyer = best([...loose, ...flushed].filter((a) => a.bird.behaviour === 'flying'));
        shot = best(bosses) ?? crates[0] ?? flyer ?? best(foraging) ?? best(loose) ?? null;
      }

      if (w.shells === 0 && !w.reloading) return [...out, { t: 'reload' }];
      const ready = w.cooldownTicks === 0 && !w.reloading && now.tick >= nextShotAt;
      if (shot !== null) {
        camGoal = null;
        if (w.shells >= 0 && w.shells < wantShells && !w.reloading && flushed.length === 0) {
          return [...out, { t: 'reload' }];
        }
        if (ready && out.length === 0) out.push(fire(now, shot));
        return out;
      }

      // Nothing to shoot: top up the belt, then pan toward the most promising birds.
      if (w.shells >= 0 && w.shells < w.magazine - 2 && !w.reloading) out.push({ t: 'reload' });
      if (camGoal === null || Math.abs(camGoal - cx) < 1 || now.tick % 90 === 0) {
        camGoal = chooseCamera(now, style);
      }
      if (camGoal !== null) out.push(panToward(cx, camGoal));
      return out;
    },
  };

  function chooseCamera(s: SimState, st: HumanStyle): number | null {
    // Flocks the style wants, nearest first; otherwise any target bird.
    const wanted = s.flocks.filter((f) =>
      st === 'competent' ? f.state !== 'settle' || f.alive >= 3 : f.state === 'forage',
    );
    let bestCx: number | null = null;
    let bestScore = -Infinity;
    for (const f of wanted) {
      const members = s.birds.filter((b) => b.flockId === f.id);
      if (members.length === 0) continue;
      const x = members.reduce((t, b) => t + b.x, 0) / members.length;
      const target = cameraFor(f.plane, x);
      const score = members.length * planes[f.plane].base - Math.abs(target - s.cameraX) / 40;
      if (score > bestScore) {
        bestScore = score;
        bestCx = target;
      }
    }
    if (bestCx !== null) return bestCx;
    const any = s.birds.find((b) => b.hittable && b.kind !== 'nonTarget');
    return any === undefined ? null : cameraFor(any.plane, any.x);
  }
}
