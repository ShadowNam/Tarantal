// Settings as the game layer uses them each frame (one live object, updated in place when the
// save changes, so views never re-read storage). Aim assist is not here: it goes to the sim
// through SimConfig.aimAssist, fixed per hunt and recorded in the replay.
import type { Feel } from '../content/schemas';
import type { Settings } from '../meta/saveSchema';
import { resolveTier, type DeviceHints, type QualityTier } from './quality/QualityManager';

export interface LivePrefs {
  tier: QualityTier;
  particleScale: number;
  /** M9: canvas px per design px (Tech §5 render scale). */
  renderScale: number;
  /** M9 tier filters and layer merges (feel.json quality.tiers). */
  vignette: TierLook['vignette'];
  bloom: TierLook['bloom'];
  mergeLayers: TierLook['mergeLayers'];
  /** Muzzle flash / glint alpha (1, or reducedFlashAlpha with "reduce flashes"). */
  flashAlpha: number;
  reduceFlashes: boolean;
  shake: boolean;
  leftHanded: boolean;
  /** M9 accessibility (GDD §18.3). */
  textScale: number;
  highContrast: boolean;
  captions: boolean;
  colourBlind: boolean;
  holdToFire: boolean;
}

type TierLook = Feel['quality']['tiers']['low'];

export interface PrefInputs {
  readonly feel: Feel;
  readonly device: DeviceHints;
  readonly reducedMotion: boolean;
  /** M9: the tier this device's title benchmark chose (SaveData.device), or null. */
  readonly bench?: QualityTier | null;
}

export function computePrefs(s: Settings, i: PrefInputs): LivePrefs {
  const tier = resolveTier(s.quality, i.feel, i.device, i.bench ?? null);
  const t = i.feel.quality.tiers[tier];
  return {
    tier,
    particleScale: t.particleScale,
    renderScale: t.renderScale,
    vignette: t.vignette,
    bloom: t.bloom,
    mergeLayers: t.mergeLayers,
    reduceFlashes: s.reduceFlashes,
    flashAlpha: s.reduceFlashes ? i.feel.accessibility.reducedFlashAlpha : 1,
    // null = follow the OS reduced-motion preference.
    shake: s.screenShake ?? !i.reducedMotion,
    leftHanded: s.leftHanded,
    textScale: s.textSize === 'large' ? i.feel.accessibility.largeTextScale : 1,
    highContrast: s.highContrast,
    captions: s.captions,
    colourBlind: s.colourBlind,
    holdToFire: s.holdToFire,
  };
}

/**
 * The ⛔ badge over a don't-shoot creature (GDD §18.3: shape + icon, never colour alone): until
 * its first sighting (Bird Book), or always with Settings → colour-blind aids (M9).
 */
export function showDontShootBadge(
  prefs: Pick<LivePrefs, 'colourBlind'>,
  birdBook: readonly string[],
  creature: string,
): boolean {
  return prefs.colourBlind || !birdBook.includes(creature);
}

/** Updates `target` in place (views hold a reference to it). */
export function applyPrefs(target: LivePrefs, s: Settings, i: PrefInputs): void {
  Object.assign(target, computePrefs(s, i));
}
