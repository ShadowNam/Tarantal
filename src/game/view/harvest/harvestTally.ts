// v1.18 (D-081, review): the Harvest tally's rush numbers from the sim's last view. "Crop saved"
// (and the braai story and the share card, which take it from the tally) is the crop the rush
// saved — as the fence closed, beside the rush's crop bonus — never Phase 2's end crop (Phase 2's
// own row shows that). Pure: no Phaser.
import type { HarvestView } from '../../../sim/types';

export interface HarvestTallyNumbers {
  /** The crop the rush saved, whole percent. */
  readonly crop: number;
  /** The crop bonus paid when the fence closed. */
  readonly cropBonus: number;
  /** Points lost to aimed shots at workers and piglets, the rush's and Phase 2's (positive). */
  readonly bystanderPenalty: number;
}

export function harvestTallyNumbers(h: HarvestView | null | undefined): HarvestTallyNumbers {
  return {
    crop: Math.max(0, Math.floor(h?.rushCrop ?? 0)),
    cropBonus: h?.cropBonus ?? 0,
    bystanderPenalty: h?.bystanderPenalty ?? 0,
  };
}
