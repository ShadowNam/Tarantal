// v1.6 (D-042 review, 25 Oct): the far animals as their own sprites, drawn at 3× (shown at 1/3)
// so they stay crisp through a 3× scope instead of being upscaled from the 1× far layers. Each
// entry is one herd or group, placed on its layer at u × core width, its feet on design y; the
// art is made by tools/art/faunaSheets.ts from the same table. ParallaxView places them.

export interface FaunaSprite {
  /** Texture key (one biome's: it loads with that biome, or with the Ver group). */
  readonly key: string;
  readonly layer: 'far_veld' | 'ver_veld';
  readonly u: number;
  /** Design y of the animals' feet. */
  readonly y: number;
  /** Box (design px) and the feet's distance from its bottom. */
  readonly w: number;
  readonly h: number;
}

/** Texture px per design px of the fauna art. */
export const FAUNA_RES = 3;
/** The box's bottom margin under the feet (ground shadows). */
export const FAUNA_FOOT = 6;

export const FAUNA_SPRITES: Readonly<Record<string, readonly FaunaSprite[]>> = {
  'karoo-autumn': [
    { key: 'fauna/karoo_springbok_a', layer: 'far_veld', u: 0.5, y: 590, w: 230, h: 40 },
    { key: 'fauna/karoo_springbok_b', layer: 'far_veld', u: 0.56, y: 596, w: 130, h: 40 },
    { key: 'fauna/karoo_ostrich', layer: 'far_veld', u: 0.3, y: 588, w: 120, h: 50 },
  ],
  'bushveld-winter': [
    { key: 'fauna/bushveld_giraffes_a', layer: 'far_veld', u: 0.19, y: 581, w: 150, h: 84 },
    { key: 'fauna/bushveld_giraffes_b', layer: 'far_veld', u: 0.712, y: 581, w: 110, h: 84 },
    { key: 'fauna/bushveld_zebra', layer: 'far_veld', u: 0.5, y: 588, w: 180, h: 40 },
    { key: 'fauna/bushveld_wildebeest', layer: 'far_veld', u: 0.42, y: 592, w: 140, h: 40 },
    { key: 'fauna/bushveld_elephants', layer: 'far_veld', u: 0.86, y: 588, w: 170, h: 48 },
  ],
  'okavango-spring': [
    { key: 'fauna/okavango_elephants', layer: 'far_veld', u: 0.5, y: 592, w: 190, h: 50 },
    { key: 'fauna/okavango_lechwe', layer: 'far_veld', u: 0.62, y: 590, w: 220, h: 34 },
    { key: 'fauna/okavango_zebra', layer: 'far_veld', u: 0.3, y: 588, w: 150, h: 40 },
    { key: 'fauna/okavango_wildebeest', layer: 'far_veld', u: 0.84, y: 588, w: 130, h: 40 },
  ],
  'kalahari-summer': [
    { key: 'fauna/kalahari_springbok', layer: 'far_veld', u: 0.5, y: 588, w: 200, h: 36 },
    { key: 'fauna/kalahari_ostrich', layer: 'far_veld', u: 0.62, y: 586, w: 90, h: 50 },
    { key: 'fauna/kalahari_wildebeest', layer: 'far_veld', u: 0.8, y: 590, w: 160, h: 40 },
  ],
  namibie: [
    { key: 'fauna/namibie_waterhole', layer: 'ver_veld', u: 0.5, y: 561, w: 440, h: 84 },
    { key: 'fauna/namibie_gemsbok', layer: 'far_veld', u: 0.62, y: 604, w: 160, h: 40 },
    { key: 'fauna/namibie_ostrich', layer: 'far_veld', u: 0.24, y: 600, w: 90, h: 50 },
    { key: 'fauna/namibie_zebra', layer: 'far_veld', u: 0.86, y: 606, w: 150, h: 40 },
  ],
};
