// 1.9.2 (D-055): is the Rooikol's red dot up? One answer for the whole view (sight picture and
// zoom, the HUD's zoom panel, fine aim): while a sight is held, what that hold was pressed with
// (`aim.redDot`, fixed in the sim at the press, so the power-up ending mid-hold changes nothing
// until the release); otherwise whether a red-dot power-up is running (the next press).
import type { ContentBundle } from '../../content/schemas';
import type { SimState } from '../../sim/types';

export type RedDotState = Pick<SimState, 'aim' | 'powerups'>;

/** The power-ups that swap a rifle's sight for a red dot (powerups.json effect.redDot). */
export function redDotIds(content: Pick<ContentBundle, 'powerups'>): ReadonlySet<string> {
  return new Set(
    content.powerups.powerups.filter((p) => p.effect.redDot === true).map((p) => p.id),
  );
}

export function redDotUp(s: RedDotState | null | undefined, ids: ReadonlySet<string>): boolean {
  if (s === null || s === undefined) return false;
  if (s.aim !== null) return s.aim.redDot;
  return s.powerups.some((p) => ids.has(p.id));
}

/**
 * The zoom fine aim divides a finger's or mouse's move by while a rifle is in hand (null: no
 * rifle): 1 under the red dot, else the fitted sight's zoom at its step.
 */
export function inputSightZoom(
  s: (RedDotState & Pick<SimState, 'weapon'>) | null | undefined,
  content: Pick<ContentBundle, 'powerups' | 'weapons'>,
  ids: ReadonlySet<string>,
): number | null {
  const w = s?.weapon;
  if (w?.kind !== 'primary' || w.sight === null) return null;
  if (redDotUp(s, ids)) return 1;
  const sight = content.weapons.sights.find((x) => x.id === w.sight);
  return sight?.zoom[w.zoomStep] ?? sight?.zoom[0] ?? null;
}
