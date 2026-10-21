// Captions for sound cues (M9, GDD §18.3 "captions/onomatopoeia for key sounds"). One caption per
// cue the AudioDirector plays (same event → sound mapping), so a player who can't hear the game
// reads the same information. Shown by the HUD when Settings → captions is on, whatever the
// volume. Cues already shown as words on screen (POOF!, the score pops, the whole-flock stamp)
// get none. Pure.
import type { I18nKey } from '../../i18n/i18n';
import type { SimEvent } from '../../sim/events';

export function captionFor(e: SimEvent): I18nKey | null {
  switch (e.type) {
    case 'emptyClick':
      return 'caption.empty_click';
    case 'reloadFinished':
      return 'caption.reloaded';
    case 'penaltyApplied':
    case 'secretPenalty':
      return 'caption.penalty';
    case 'stampedeStarted':
      return 'caption.stampede';
    case 'flockStateChanged':
      return e.to === 'alert' ? 'caption.alarm_call' : e.to === 'flush' ? 'caption.flush' : null;
    case 'gadgetUsed':
      return 'caption.vuvuzela';
    case 'secretPartHit':
      return 'caption.ting';
    case 'secretTriggered':
      return 'caption.secret';
    case 'worldEvent':
      return e.event === 'carAlarm'
        ? 'caption.car_alarm'
        : e.event === 'reservoirFlush'
          ? 'caption.splash'
          : e.event === 'dustDevil'
            ? 'caption.whoosh'
            : null;
    case 'armorKnocked':
      return 'caption.clang';
    case 'birdCalled':
      return 'caption.kwe';
    case 'crateOpened':
      return 'caption.crate';
    case 'powerupStarted':
    case 'weaponChanged':
      return 'caption.powerup';
    default:
      return null;
  }
}

export interface CaptionLine {
  readonly key: I18nKey;
  /** ms (scene clock) when it goes. */
  until: number;
}

/**
 * The caption list after a frame: new cues added on top (a cue already on screen, or shown less
 * than `repeatMs` ago, only extends its time), expired ones dropped, at most `max` lines.
 */
export function updateCaptions(
  lines: readonly CaptionLine[],
  lastShown: Map<I18nKey, number>,
  events: readonly SimEvent[],
  now: number,
  cfg: {
    readonly captionMs: number;
    readonly captionMax: number;
    readonly captionRepeatMs: number;
  },
): CaptionLine[] {
  let next = lines.filter((l) => l.until > now);
  for (const e of events) {
    const key = captionFor(e);
    if (key === null) continue;
    const on = next.find((l) => l.key === key);
    if (on !== undefined) {
      on.until = now + cfg.captionMs;
      continue;
    }
    const last = lastShown.get(key);
    if (last !== undefined && now - last < cfg.captionRepeatMs) continue;
    lastShown.set(key, now);
    next = [{ key, until: now + cfg.captionMs }, ...next];
  }
  return next.slice(0, cfg.captionMax);
}
