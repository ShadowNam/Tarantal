// v1.13 (D-075): which baked frame each cameo shows, and how high a pronking springbok is, from the
// sim's snapshot alone (phase, reaction, ticks, each member's gait ticks): pure, so a held tick
// (?holdAt) holds the picture and the tests can walk every phase.
import type { CameoKindId } from '../../sim/events';
import type { CameoMemberView, CameoVisitView, SimState } from '../../sim/types';
import type { CameoSheetArea } from './cameoKeys';
import type { CameoFrame } from './cameoSheet';

/** The sheet each walking kind is drawn from. */
export const CAMEO_KIND_AREA: Readonly<Record<Exclude<CameoKindId, 'elephants'>, CameoSheetArea>> =
  {
    warthogs: 'bushveld',
    dungBeetle: 'bushveld',
    tortoise: 'karoo',
    ostrich: 'karoo',
    springbok: 'kalahari',
    gemsbok: 'namibie',
  };

/** The field guide's species id for each kind (content/client/journal.json). */
export const CAMEO_SPECIES: Readonly<Record<CameoKindId, string>> = {
  warthogs: 'warthog',
  dungBeetle: 'dungBeetle',
  tortoise: 'tortoise',
  ostrich: 'ostrich',
  springbok: 'springbok',
  gemsbok: 'gemsbok',
  elephants: 'elephant',
};

/** A frame of a strip every `every` ticks. */
function cycle<T>(strip: readonly T[], t: number, every: number): T {
  const i = Math.floor(Math.max(0, t) / every) % strip.length;
  // Safe: i is within the strip (modulo its length; strips are never empty).
  return strip[i] as T;
}

/** One member's picture: the frame, px above its feet (a pronk), and dust at its feet. */
export interface CameoPose {
  readonly frame: CameoFrame;
  readonly lift: number;
  readonly dust: boolean;
}

const PRONK_TICKS = 34;
const PRONK_PX = 30;

/** A pose the view reuses (no allocation a frame, lesson 33). */
export interface MutableCameoPose {
  frame: CameoFrame;
  lift: number;
  dust: boolean;
}

/** The frame for member `m` of visit `v` (`calm`: reduce motion — lower pronks), written into
 *  `out` when given (the view passes one reused object), else a new one. */
export function cameoPose(
  v: CameoVisitView,
  m: CameoMemberView,
  calm = false,
  out: MutableCameoPose = { frame: 'gb_walk_a', lift: 0, dust: false },
): CameoPose {
  const p = (frame: CameoFrame, lift = 0, dust = false): CameoPose => {
    out.frame = frame;
    out.lift = lift;
    out.dust = dust;
    return out;
  };
  const frac = v.dur > 0 ? v.t / v.dur : 0;
  const g = m.gaitT;
  const young = m.role === 'young';
  switch (v.kind) {
    case 'warthogs':
      if (v.phase === 'pause') return p(young ? 'pig_feed' : 'hog_feed');
      if (v.phase === 'react') return p(young ? 'pig_run' : 'hog_run_a');
      if (v.phase === 'flee')
        return p(young ? 'pig_run' : cycle<CameoFrame>(['hog_run_a', 'hog_run_b'], g, 5));
      return p(
        young
          ? cycle<CameoFrame>(['pig_trot_a', 'pig_trot_b'], g, 6)
          : cycle<CameoFrame>(['hog_trot_a', 'hog_trot_b'], g, 8),
      );
    case 'dungBeetle':
      if (v.phase === 'react') return p(frac < 0.7 ? 'beetle_tumble' : 'beetle_right');
      if (v.phase === 'pause') return p('beetle_push_a');
      return p(
        cycle<CameoFrame>(
          ['beetle_push_a', 'beetle_push_b', 'beetle_push_c', 'beetle_push_d'],
          g,
          7,
        ),
      );
    case 'tortoise':
      if (v.phase === 'react') return p(frac < 0.8 ? 'tort_hide' : 'tort_peek');
      if (v.phase === 'pause') return p('tort_walk_a');
      return p(cycle<CameoFrame>(['tort_walk_a', 'tort_walk_b'], g, 20));
    case 'ostrich':
      if (v.phase === 'react') return p('ost_veer', 0, true);
      return p(cycle<CameoFrame>(['ost_run_a', 'ost_run_b', 'ost_run_c'], g, 5));
    case 'springbok': {
      if (v.phase === 'pause') return p('sb_graze');
      if (v.phase === 'react') return p(frac < 0.4 ? 'sb_alert' : 'sb_pronk_a');
      if (v.phase === 'flee') {
        // Pronking: up stiff-legged and bunched, down reaching for the ground.
        const u = (Math.max(0, g) % PRONK_TICKS) / PRONK_TICKS;
        const lift = 4 * u * (1 - u) * PRONK_PX * (calm ? 0.5 : 1);
        return p(u < 0.6 ? 'sb_pronk_a' : 'sb_pronk_b', lift);
      }
      return p(cycle<CameoFrame>(['sb_walk_a', 'sb_walk_b'], g, 12));
    }
    case 'gemsbok':
      if (v.phase === 'pause') return p('gb_graze');
      if (v.phase === 'react') return p('gb_alert');
      if (v.phase === 'flee') return p(cycle<CameoFrame>(['gb_run_a', 'gb_run_b'], g, 7));
      return p(cycle<CameoFrame>(['gb_walk_a', 'gb_walk_b'], g, 14));
    case 'elephants':
      // Never a visit (the far herd answers in FaunaView); a frame for the type's sake.
      return p('gb_walk_a');
  }
}

/** v1.13 (D-075, lesson 36): a cameo is calling now (one reacting — its grunt, plop, tok, boom or
 *  alarm whistle — or the elephants' trumpet window): the soundscape's calls make room. */
export function cameoCalling(state: Pick<SimState, 'tick' | 'cameos'>): boolean {
  const c = state.cameos;
  if (c === null) return false;
  if (
    c.trumpetTick !== null &&
    state.tick >= c.trumpetTick &&
    state.tick < c.trumpetTick + c.flapTicks
  )
    return true;
  return c.visits.some((v) => v.phase === 'react');
}
