// D-053 (test hook): the on-screen boxes the HD bounds check compares. The hunt samples texture
// memory as soon as it releases the old gun atlases, before its views exist (and on a restart the
// field still holds the previous run's destroyed views), so the sample must cope with "no views".

/** One on-screen box (design px, rounded). */
export interface BoundsBox {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** It draws an HD file (D-053). */
  hd: boolean;
}

/** What draws the boxes (ParallaxView), or null before this run built its views. */
export interface BoundsSource {
  boundsSample(): BoundsBox[];
}

/** The boxes now, or none while the views aren't built. */
export function sampleBounds(source: BoundsSource | null): BoundsBox[] {
  return source === null ? [] : source.boundsSample();
}
