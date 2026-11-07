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
function cycle(strip: readonly CameoFrame[], t: number, every: number): CameoFrame {
  const i = Math.floor(Math.max(0, t) / every) % strip.length;
  // Safe: i is within the strip (modulo its length; strips are never empty).
  return strip[i] as CameoFrame;
}

/** One member's picture: the frame, px above its feet (a pronk), and dust at its feet. */
export interface CameoPose {
  readonly frame: CameoFrame;
  readonly lift: number;
  readonly dust: boolean;
}

/** A pose the view reuses (no allocation a frame, lesson 33). */
export interface MutableCameoPose {
  frame: CameoFrame;
  lift: number;
  dust: boolean;
}

const PRONK_TICKS = 34;
const PRONK_PX = 30;
// The baked strips (module constants: nothing is built a frame).
const HOG_TROT: readonly CameoFrame[] = ['hog_trot_a', 'hog_trot_b'];
const HOG_RUN: readonly CameoFrame[] = ['hog_run_a', 'hog_run_b'];
const PIG_TROT: readonly CameoFrame[] = ['pig_trot_a', 'pig_trot_b'];
const BEETLE: readonly CameoFrame[] = [
  'beetle_push_a',
  'beetle_push_b',
  'beetle_push_c',
  'beetle_push_d',
];
const TORT: readonly CameoFrame[] = ['tort_walk_a', 'tort_walk_b'];
const OST: readonly CameoFrame[] = ['ost_run_a', 'ost_run_b', 'ost_run_c'];
const SB_WALK: readonly CameoFrame[] = ['sb_walk_a', 'sb_walk_b'];
const GB_WALK: readonly CameoFrame[] = ['gb_walk_a', 'gb_walk_b'];
const GB_RUN: readonly CameoFrame[] = ['gb_run_a', 'gb_run_b'];

/** The frame for member `m` of visit `v` (`calm`: reduce motion — lower pronks), written into
 *  `out` when given (the view passes one reused object), else a new one. */
export function cameoPose(
  v: CameoVisitView,
  m: CameoMemberView,
  calm = false,
  out: MutableCameoPose = { frame: 'gb_walk_a', lift: 0, dust: false },
): CameoPose {
  const frac = v.dur > 0 ? v.t / v.dur : 0;
  const g = m.gaitT;
  const young = m.role === 'young';
  out.lift = 0;
  out.dust = false;
  switch (v.kind) {
    case 'warthogs':
      if (v.phase === 'pause') out.frame = young ? 'pig_feed' : 'hog_feed';
      else if (v.phase === 'react') out.frame = young ? 'pig_run' : 'hog_run_a';
      else if (v.phase === 'flee') out.frame = young ? 'pig_run' : cycle(HOG_RUN, g, 5);
      else out.frame = young ? cycle(PIG_TROT, g, 6) : cycle(HOG_TROT, g, 8);
      break;
    case 'dungBeetle':
      if (v.phase === 'react') out.frame = frac < 0.7 ? 'beetle_tumble' : 'beetle_right';
      else if (v.phase === 'pause') out.frame = 'beetle_push_a';
      else out.frame = cycle(BEETLE, g, 7);
      break;
    case 'tortoise':
      if (v.phase === 'react') out.frame = frac < 0.8 ? 'tort_hide' : 'tort_peek';
      else if (v.phase === 'pause') out.frame = 'tort_walk_a';
      else out.frame = cycle(TORT, g, 20);
      break;
    case 'ostrich':
      if (v.phase === 'react') {
        out.frame = 'ost_veer';
        out.dust = true;
      } else out.frame = cycle(OST, g, 5);
      break;
    case 'springbok':
      if (v.phase === 'pause') out.frame = 'sb_graze';
      else if (v.phase === 'react') out.frame = frac < 0.4 ? 'sb_alert' : 'sb_pronk_a';
      else if (v.phase === 'flee') {
        // Pronking: up stiff-legged and bunched, down reaching for the ground.
        const u = (Math.max(0, g) % PRONK_TICKS) / PRONK_TICKS;
        out.lift = 4 * u * (1 - u) * PRONK_PX * (calm ? 0.5 : 1);
        out.frame = u < 0.6 ? 'sb_pronk_a' : 'sb_pronk_b';
      } else out.frame = cycle(SB_WALK, g, 12);
      break;
    case 'gemsbok':
      if (v.phase === 'pause') out.frame = 'gb_graze';
      else if (v.phase === 'react') out.frame = 'gb_alert';
      else if (v.phase === 'flee') out.frame = cycle(GB_RUN, g, 7);
      else out.frame = cycle(GB_WALK, g, 14);
      break;
    case 'elephants':
      // Never a visit (the far herd answers in FaunaView); a frame for the type's sake.
      out.frame = 'gb_walk_a';
      break;
  }
  return out;
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
  // A plain loop: called every frame (no closure, lesson 33).
  for (const v of c.visits) if (v.phase === 'react') return true;
  return false;
}
