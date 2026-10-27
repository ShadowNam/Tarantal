// D-051 (Karoo polish): HD stand-ins for props whose first-download art stays as the placeholder
// (the 3 MB first download is full). The HD textures load with the late group under their own
// keys; AssetManifest.upgrade() renames each key's placeholder away when its file lands, and the
// views switch the prop over to the HD key (never removing a texture an object still draws).
// Extra pieces (the potjie's loose lid) load with them.

/** First-download prop asset → its HD texture key. */
export const HD_PROPS: Readonly<Record<string, string>> = {
  'karoo/aloe_a': 'karoo/hd/aloe_a',
  'karoo/aloe_b': 'karoo/hd/aloe_b',
  'karoo/potjie': 'karoo/hd/potjie',
};

/** The potjie's lid (its own texture: it rattles, and flies off when shot). */
export const POTJIE_LID = 'karoo/hd/potjie_lid';

/** The lid's size in design px; its origin is the middle of its rim (tools/art/potjie.ts). */
export const POTJIE_LID_SIZE = { width: 132, height: 56, originX: 66, originY: 40 } as const;

/** HD pieces that belong to a prop but have no first-download art of their own. */
export const HD_PARTS: Readonly<Record<string, readonly string[]>> = {
  'karoo/potjie': [POTJIE_LID],
};

/** The HD key of a prop asset, if it has one. */
export function hdKeyOf(asset: string): string | undefined {
  return HD_PROPS[asset];
}

/** The prop asset an HD key or HD piece belongs to (undefined for any other key). */
export function hdBaseOf(key: string): string | undefined {
  for (const [base, hd] of Object.entries(HD_PROPS)) {
    if (hd === key || (HD_PARTS[base] ?? []).includes(key)) return base;
  }
  return undefined;
}
