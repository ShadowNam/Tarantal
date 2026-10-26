// Captions for sound cues (M9, GDD §18.3 "captions/onomatopoeia for key sounds"). One caption per
// cue the AudioDirector plays (same event → sound mapping), so a player who can't hear the game
// reads the same information. Shown by the HUD when Settings → captions is on, whatever the
// volume. Cues already shown as words on screen (POOF!, the score pops, the whole-flock stamp)
// get none. Pure.
import { isI18nKey, type I18nKey } from '../../i18n/i18n';
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
    // v1.7 (D-044): the meerkats.
    case 'meerkatHit':
      return e.points < 0 ? 'caption.penalty' : null;
    case 'meerkatScold':
      return 'caption.meerkat_chirp';
    case 'meerkatAlarm':
      return 'caption.meerkat_alarm';
    case 'familiefoto':
      return 'caption.camera_click';
    case 'stampedeStarted':
      return 'caption.stampede';
    // v1.8 (D-050): tin cans — the clink of a hit, the rattle of a landing, the whistle away.
    case 'canKnocked':
    case 'canJuggled':
      return 'caption.can_tink';
    case 'canLanded':
      return e.final ? null : 'caption.can_rattle';
    case 'canGone':
      return 'caption.can_whistle';
    // D-048: the Spookjag's sting, the owl's hoot (gliding in, or shot), a bat, a lantern.
    case 'feesdagStarted':
      return 'caption.spook_sting';
    case 'spookFlew':
      return e.thing === 'owl' ? 'caption.owl_hoot' : null;
    case 'spookHit':
      return e.thing === 'owl'
        ? 'caption.owl_hoot'
        : e.thing === 'bat'
          ? 'caption.bat_squeak'
          : 'caption.lantern_out';
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
    // v1.7b (D-046): what the power-up does ("[Farm Coffee: everything slows]"), and when it
    // ends ("[Farm Coffee wears off]"; the HUD fills {item}).
    case 'powerupStarted':
      return itemCaption(e.powerup);
    case 'weaponChanged':
      return e.kind === 'crate' ? itemCaption(e.weapon) : 'caption.pu_end';
    case 'powerupEnded':
      return 'caption.pu_end';
    default:
      return null;
  }
}

function itemCaption(id: string): I18nKey {
  const key = `caption.pu.${id}`;
  return isI18nKey(key) ? key : 'caption.powerup';
}

/** v1.7b: the power-up or crate gun a caption names (`{item}`), if any. `crate` follows the
 *  crate gun in hand, so its end names it. */
export function captionItem(e: SimEvent, crate: { id: string | null }): string | null {
  switch (e.type) {
    case 'powerupStarted':
      return e.powerup;
    case 'powerupEnded':
      return e.powerup;
    case 'weaponChanged': {
      const was = crate.id;
      crate.id = e.kind === 'crate' ? e.weapon : null;
      return e.kind === 'crate' ? e.weapon : was;
    }
    default:
      return null;
  }
}

export interface CaptionLine {
  readonly key: I18nKey;
  /** v1.7b: the item the line names (fills `{item}`). */
  readonly item?: string;
  /** ms (scene clock) when it goes. */
  until: number;
}

/**
 * The caption list after a frame: new cues added on top (a cue already on screen, or shown less
 * than `repeatMs` ago, only extends its time), expired ones dropped, at most `max` lines.
 */
export function updateCaptions(
  lines: readonly CaptionLine[],
  lastShown: Map<string, number>,
  events: readonly SimEvent[],
  now: number,
  cfg: {
    readonly captionMs: number;
    readonly captionMax: number;
    readonly captionRepeatMs: number;
  },
  crate: { id: string | null } = { id: null },
): CaptionLine[] {
  let next = lines.filter((l) => l.until > now);
  for (const e of events) {
    const item = captionItem(e, crate);
    const key = captionFor(e);
    if (key === null) continue;
    // v1.7b: an end line that can't name its item says nothing ("[{item} wears off]").
    if (key === 'caption.pu_end' && item === null) continue;
    const same = (l: CaptionLine): boolean => l.key === key && (l.item ?? null) === item;
    const on = next.find(same);
    if (on !== undefined) {
      on.until = now + cfg.captionMs;
      continue;
    }
    const id = item === null ? key : `${key}|${item}`;
    const last = lastShown.get(id);
    if (last !== undefined && now - last < cfg.captionRepeatMs) continue;
    lastShown.set(id, now);
    next = [{ key, ...(item === null ? {} : { item }), until: now + cfg.captionMs }, ...next];
  }
  return next.slice(0, cfg.captionMax);
}
