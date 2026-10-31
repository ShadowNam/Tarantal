// D-064: which lazy asset group holds a special day's art and sounds. Each special has its own,
// so a Halloween hunt never downloads Christmas's files and the other way round. Halloween keeps
// its first key ("feesdae"); every later special is "feesdae-<id>". Its voice lines are in
// specialVoiceGroup(lang, id) (src/game/audio/voiceLines.ts).
import { CHRISTMAS_GROUP } from './christmasAssets';
import { FEESDAE_GROUP } from './feesdaeAssets';
import { NEWYEAR_GROUP } from './newyearKeys';

export function specialAssetGroup(special: string): string {
  return special === 'halloween'
    ? FEESDAE_GROUP
    : special === 'christmas'
      ? CHRISTMAS_GROUP
      : special === 'newyear'
        ? NEWYEAR_GROUP
        : `${FEESDAE_GROUP}-${special}`;
}
