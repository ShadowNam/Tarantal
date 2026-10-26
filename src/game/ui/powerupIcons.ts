// v1.7b (D-046): each power-up's and crate gun's icon (HUD chip, crate parachute, pickup card,
// Gun Shed card, tally). Interim art from tools/art/sprites.ts; ProceduralAssetFactory draws
// placeholders until it is delivered.
import type * as Phaser from 'phaser';
import { TEX, type AssetManifest } from '../assets/AssetManifest';

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

/** Bumped whenever the delivered icons replace their placeholders (views re-set their textures). */
let epoch = 0;

export function powerupIconEpoch(): number {
  return epoch;
}

/**
 * v1.7b (D-046): the icons load with the late group (not the first download). Once it has landed,
 * swaps every placeholder icon for the delivered one; views holding an icon re-set its texture
 * when the epoch changes. Returns how many it swapped.
 */
export function upgradePowerupIcons(
  manifest: Pick<AssetManifest, 'upgrade'>,
  textures: Phaser.Textures.TextureManager,
): number {
  const n = manifest.upgrade(textures, 'ui/pu_').length;
  if (n > 0) epoch++;
  return n;
}
