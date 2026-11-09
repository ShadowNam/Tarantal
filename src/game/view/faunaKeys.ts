// v1.17b (D-080): the far herds' sheet keys per biome, literally — what the placeholder factory
// (first download) needs of the herds, so faunaHerds.ts (the herd tables and their idle motion)
// stays in FaunaView's lazy chunk. faunaKeys.test.ts holds it equal to sheetHerds().
export const FAUNA_SHEET_KEYS: Readonly<Record<string, readonly string[]>> = {
  'karoo-autumn': ['fauna/karoo_springbok_a', 'fauna/karoo_springbok_b', 'fauna/karoo_ostrich'],
  'bushveld-winter': [
    'fauna/bushveld_giraffes_a',
    'fauna/bushveld_zebra',
    'fauna/bushveld_wildebeest',
    'fauna/bushveld_elephants',
  ],
  'kalahari-summer': [
    'fauna/kalahari_springbok',
    'fauna/kalahari_ostrich',
    'fauna/kalahari_wildebeest',
  ],
  namibie: [
    'fauna/namibie_waterhole',
    'fauna/namibie_gemsbok',
    'fauna/namibie_ostrich',
    'fauna/namibie_zebra',
  ],
  'okavango-spring': [
    'fauna/okavango_elephants',
    'fauna/okavango_lechwe',
    'fauna/okavango_zebra',
    'fauna/okavango_wildebeest',
  ],
};
