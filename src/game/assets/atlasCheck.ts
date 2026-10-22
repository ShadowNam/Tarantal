// Checks a delivered bird atlas against its clip list before the game uses it (M10 review). Phaser
// drops frame names it can't find with only a warning, and an animation left with fewer frames
// than its clip lists (or none) throws when played — so a page without a `frames` object fails the
// whole atlas, and a clip naming any frame that no page has is dropped (its fallback chain plays
// instead). Pure.
import type { BirdClip, BirdPlaneEntry } from './assetIndex';

export interface AtlasCheck {
  /** The clips whose every frame exists, or null when the atlas can't be used at all. */
  readonly clips: BirdPlaneEntry['clips'] | null;
  /** Clips dropped for missing frames (for the console). */
  readonly dropped: readonly BirdClip[];
}

export function checkBirdAtlas(
  clips: BirdPlaneEntry['clips'],
  pages: readonly unknown[],
): AtlasCheck {
  const names = new Set<string>();
  for (const page of pages) {
    const frames =
      typeof page === 'object' && page !== null && !Array.isArray(page)
        ? (page as { frames?: unknown }).frames
        : undefined;
    if (typeof frames !== 'object' || frames === null || Array.isArray(frames))
      return { clips: null, dropped: [] };
    for (const name of Object.keys(frames)) names.add(name);
  }
  const kept: BirdPlaneEntry['clips'] = {};
  const dropped: BirdClip[] = [];
  for (const [clip, c] of Object.entries(clips) as [
    BirdClip,
    NonNullable<BirdPlaneEntry['clips'][BirdClip]>,
  ][]) {
    if (c.frames.length > 0 && c.frames.every((f) => names.has(f))) kept[clip] = c;
    else dropped.push(clip);
  }
  return { clips: Object.keys(kept).length > 0 ? kept : null, dropped };
}
