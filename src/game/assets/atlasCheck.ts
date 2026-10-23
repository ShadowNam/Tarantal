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

/** Where a named frame sits in a multi-page atlas: its page and pixel rect. */
export interface AtlasRegion {
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** TexturePacker rotation (90° clockwise in the page). */
  readonly rotated: boolean;
}

/**
 * D-035: the page and rect of frame `name` in atlas JSON pages (TexturePacker hash), or null. Lets
 * a UI crop one frame from the decoded page image without uploading the whole atlas.
 */
export function atlasRegion(pages: readonly object[], name: string): AtlasRegion | null {
  for (let page = 0; page < pages.length; page++) {
    const frames = (pages[page] as { frames?: unknown }).frames;
    if (typeof frames !== 'object' || frames === null) continue;
    const f = (frames as Record<string, unknown>)[name];
    if (typeof f !== 'object' || f === null) continue;
    const r = (f as { frame?: unknown }).frame;
    if (typeof r !== 'object' || r === null) continue;
    const { x, y, w, h } = r as Record<string, unknown>;
    if (
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      typeof w !== 'number' ||
      typeof h !== 'number'
    )
      continue;
    return { page, x, y, w, h, rotated: (f as { rotated?: unknown }).rotated === true };
  }
  return null;
}
