// v1.3 (D-036): how the balance and golden bots shoot a rifle (hold to zoom, release to fire).
// Wraps any bot: while the snapshot's weapon has no sight its commands pass through unchanged
// (every existing golden replay and balance run is identical). With a rifle in hand, a `fire` the
// bot wants becomes: aimStart at that point, then each tick aimMove onto the body centre of the
// target bird nearest that point (as the snapshot shows it), with the bot's aim error divided by
// the sight's zoom (a scope is why you can hit a 4 px bird), then aimRelease — as soon as the
// sight is up (impatient) or once the breath is held (patient), never later than `maxHoldTicks`.
// Bots read only snapshot(), like the renderer.
import type { ContentBundle } from '../src/content/schemas';
import { planeToDx } from '../src/sim/camera';
import { createStream, fnv1a32 } from '../src/sim/rng';
import type { BirdView, Command, SimState } from '../src/sim/types';

/** Whether a gun's shot reaches the Ver plane (rifles); a player soon learns a shotgun doesn't. */
export function reachesVer(content: ContentBundle, weaponId: string): boolean {
  const w = content.weapons.weapons.find((x) => x.id === weaponId);
  return w?.kind === 'primary' && w.reachesVer === true;
}

/** A bird the gun can reach: anything but a Ver bird, which needs a rifle. */
export function inReach(content: ContentBundle, weaponId: string, b: BirdView): boolean {
  return b.plane !== 'ver' || reachesVer(content, weaponId);
}

export interface CommandBot {
  readonly next: (state: SimState) => Command[];
}

export interface RifleStyle {
  /** Release once the breath is held and the sway has eased, holding off for the wind (else as
   *  soon as the sight is up, ignoring the wind). */
  readonly patient: boolean;
  /** Aim error σ (unzoomed design px) before dividing by the zoom. */
  readonly sigmaPx: number;
  /** Give up waiting for the breath after this many ticks of holding. */
  readonly maxHoldTicks: number;
  /** A target bird must be within this many screen px of the point the bot wanted. */
  readonly pickRadiusPx: number;
}

export const RIFLE_STYLES = {
  impatient: { patient: false, sigmaPx: 10, maxHoldTicks: 40, pickRadiusPx: 90 },
  patient: { patient: true, sigmaPx: 10, maxHoldTicks: 120, pickRadiusPx: 90 },
} as const satisfies Record<string, RifleStyle>;

export function withRifle(
  inner: CommandBot,
  content: ContentBundle,
  seed: number,
  style: RifleStyle,
): CommandBot {
  const rng = createStream((seed ^ fnv1a32('bot:rifle')) >>> 0);
  const planes = content.scoring.planes;
  const creatures = new Map(content.birds.creatures.map((c) => [c.id, c]));
  const sights = new Map(content.weapons.sights.map((s) => [s.id, s]));
  /** 1.9.2 (D-055): power-ups that swap the sight for a red dot (no magnification). */
  const redDots = new Set(
    content.powerups.powerups.filter((p) => p.effect.redDot === true).map((p) => p.id),
  );
  let target: number | null = null;
  /** The raise is for something that isn't a bird (a crate, a secret part): hold the point the
   *  bot wanted and release (review of v1.3: the bot never shot crates or secrets). */
  let freeShot = false;
  // The wind's drift at full strength (only biomes with wind have it; the windsock shows it).
  const driftAtFar =
    content.biomes.find((b) => b.omen.wind !== undefined)?.omen.wind?.driftPxAtFar ?? 0;
  const sens = new Map(content.weapons.weapons.map((w) => [w.id, w.windSensitivity] as const));
  let err = { x: 0, y: 0 };

  const bodyAt = (b: BirdView, cx: number): { dx: number; sy: number } => {
    const p = planes[b.plane];
    const c = creatures.get(b.creature);
    const body = c !== undefined && 'hitbox' in c ? c.hitbox.body : { ox: 0, oy: 0 };
    return {
      dx: planeToDx(cx, p.scrollFactor, b.x + body.ox * p.scale * b.facing),
      sy: b.y + body.oy * p.scale,
    };
  };

  /** The hittable target or boss nearest (dx, sy) on screen, within the pick radius. */
  const pick = (s: SimState, dx: number, sy: number): BirdView | null => {
    let best: BirdView | null = null;
    let bestD = style.pickRadiusPx;
    for (const b of s.birds) {
      if (!b.hittable || b.kind === 'nonTarget') continue;
      const p = bodyAt(b, s.cameraX);
      const d = Math.hypot(p.dx - dx, p.sy - sy);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  };

  const gauss = (): number => {
    const u = Math.max(1e-9, rng.next());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng.next());
  };

  return {
    next(s) {
      const inner_ = inner.next(s);
      const w = s.weapon;
      if (w.kind !== 'primary' || w.sight === null) return inner_;
      const sight = sights.get(w.sight);
      // Under a red dot the bot sees the birds at 1× (its aim error isn't divided down).
      const red = s.powerups.some((p) => redDots.has(p.id));
      const zoom = red ? 1 : (sight?.zoom[w.zoomStep] ?? 1);
      const out = inner_.filter((c) => c.t !== 'fire');
      const want = inner_.find((c): c is Extract<Command, { t: 'fire' }> => c.t === 'fire');
      const aim = s.aim;
      if (aim === null) {
        target = null;
        // Nothing to raise for, or the gun can't fire yet (bolt, reload, empty).
        if (want === undefined || w.reloading || w.shells === 0) return out;
        const b = pick(s, want.dx, want.sy);
        target = b?.id ?? null;
        freeShot = b === null;
        err = { x: (gauss() * style.sigmaPx) / zoom, y: (gauss() * style.sigmaPx) / zoom };
        out.push({ t: 'aimStart', dx: want.dx, sy: want.sy });
        return out;
      }
      // Holding: stay on the target's body (it may have moved, or the camera panned).
      const b = target === null ? undefined : s.birds.find((x) => x.id === target && x.hittable);
      if (b === undefined && target !== null) {
        // It left or was bagged: lower the sight and pick again next time.
        target = null;
        freeShot = false;
        return [...out.filter((c) => c.t !== 'reload'), { t: 'aimCancel' }];
      }
      // A free shot follows the point the bot still wants (a falling crate, a turning part).
      if (b === undefined && want !== undefined)
        out.push({ t: 'aimMove', dx: want.dx + err.x, sy: want.sy + err.y });
      if (b !== undefined) {
        const p = bodyAt(b, s.cameraX);
        // A patient shooter holds off for the wind at the far and Ver planes; the sway is not
        // compensated (a person can't): waiting for the breath is the skill.
        const hold =
          style.patient && s.wind !== null && (b.plane === 'far' || b.plane === 'ver')
            ? driftAtFar * s.wind.strength * s.wind.dir * (sens.get(w.id) ?? 0)
            : 0;
        out.push({ t: 'aimMove', dx: p.dx + err.x - hold, sy: p.sy + err.y });
      }
      const up = aim.progress >= 1;
      const settleTicks =
        sight === undefined
          ? 0
          : Math.round(((sight.breath.holdAfterMs + sight.breath.easeMs) * 60) / 1000);
      // Only long shots are worth the breath hold: a mid or near bird is shot once the sight is up.
      const far = b !== undefined && (b.plane === 'far' || b.plane === 'ver');
      const ready =
        up && (!style.patient || !far || (aim.breath === 'held' && aim.heldTicks >= settleTicks));
      if (style.patient && target === null && !freeShot) return [...out, { t: 'aimCancel' }];
      if ((ready || aim.heldTicks >= style.maxHoldTicks) && w.cooldownTicks === 0)
        out.push({ t: 'aimRelease' });
      // Never reload mid-aim (it would lower the sight).
      return out.filter((c) => c.t !== 'reload' || !up);
    },
  };
}
