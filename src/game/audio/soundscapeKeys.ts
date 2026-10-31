// v1.9 (D-066): the soundscape's asset group and its sound keys (the catalog, the pack tool and
// the lazy soundscape chunk). Its index entries live in the lazy audio half of the asset index
// (asset-index-voice.json), so the first download carries none of them.
import type { Soundscape } from '../../content/schemas';

/** One lazy group for every area's calls (most calls are heard in several areas). */
export const SOUNDSCAPE_GROUP = 'soundscape';

/** Every sound key the soundscape plays (sfx/amb_*), sorted. */
export function soundscapeSounds(sc: Pick<Soundscape, 'calls'>): string[] {
  return [...new Set(Object.values(sc.calls).map((c) => c.sound))].sort();
}
