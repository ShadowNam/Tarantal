// Checks a delivered atlas (birds, M10; guns, D-029) against its clip list before the game uses
// it (M10 review). Phaser drops frame names it can't find with only a warning, and an animation
// left with fewer frames than its clip lists (or none) throws when played — so a page without a
// `frames` object fails the whole atlas, and a clip naming any frame that no page has is dropped
// (its fallback plays instead). Pure.
import type { BirdClip, ClipEntry } from './assetIndex';

export interface AtlasCheck<C extends string = BirdClip> {
  /** The clips whose every frame exists, or null when the atlas can't be used at all. */
  readonly clips: Partial<Record<C, ClipEntry>> | null;
  /** Clips dropped for missing frames (for the console). */
  readonly dropped: readonly C[];
}

export function checkAtlas<C extends string>(
  clips: Partial<Record<C, ClipEntry>>,
  pages: readonly unknown[],
): AtlasCheck<C> {
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
  const kept: Partial<Record<C, ClipEntry>> = {};
  const dropped: C[] = [];
  for (const [clip, c] of Object.entries(clips) as [C, ClipEntry | undefined][]) {
    if (c === undefined) continue;
    if (c.frames.length > 0 && c.frames.every((f) => names.has(f))) kept[clip] = c;
    else dropped.push(clip);
  }
  return { clips: Object.keys(kept).length > 0 ? kept : null, dropped };
}

/** The bird form (M10). */
export function checkBirdAtlas(
  clips: Partial<Record<BirdClip, ClipEntry>>,
  pages: readonly unknown[],
): AtlasCheck {
  return checkAtlas(clips, pages);
}
