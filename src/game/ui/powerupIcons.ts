// v1.7b (D-046): each power-up's and crate gun's icon (HUD chip, crate parachute, pickup card,
// Gun Shed card, tally). Interim art from tools/art/sprites.ts; ProceduralAssetFactory draws
// placeholders until it is delivered.
import { TEX } from '../assets/AssetManifest';

const POWERUP_ICONS: Readonly<Record<string, string>> = {
  blitslaai: TEX.puBlitslaai,
  oupa_laai: TEX.puOupaLaai,
  chilli_biltong: TEX.puChilliBiltong,
  boeretroos: TEX.puBoeretroos,
  bush_buckshot: TEX.puBushBuckshot,
  meerkat_spotter: TEX.puMeerkatSpotter,
  voorlaaier: TEX.puVoorlaaier,
  mielie_masjien: TEX.puMielieMasjien,
};

/** The icon texture key of a power-up or crate gun (`ui/pu_<id>`). */
export function powerupIcon(id: string): string {
  return POWERUP_ICONS[id] ?? `ui/pu_${id}`;
}
