// v1.14 (D-076): every voiced key in one list, grouped as the admin page's "Texts & voices" tab
// shows them: Oupa's lines (the year-round voice packs, `voice-<lang>`), the special days' lines
// (their own packs, `feesdae-voice-…`) and the braai's story phrases (`braai-voice-<lang>`). The
// voice tool (tools/audio/voice.ts) and the editor read this one list. Not in the first download.
import type { ContentBundle, Feel } from '../../content/schemas';
import { STORY_LINE_IDS, sayKey } from '../braai/story';
import {
  baboonBarks,
  brakkieBarks,
  cameoBarks,
  harvestBarks,
  veldLifeBarks,
  voicedLines,
} from './voiceLines';

export type VoicedGroup = 'oupa' | 'braai' | 'special';

export interface VoicedKeys {
  /** Every voiced key, sorted (what `npm run audio:voice` makes). */
  readonly all: readonly string[];
  /** The tab's group of each voiced key. */
  readonly group: ReadonlyMap<string, VoicedGroup>;
}

export function voicedKeys(
  content: Pick<ContentBundle, 'biomes' | 'birds' | 'feesdae'>,
  barks: Feel['barks'],
  /** The baboons' raid actions (RaidActionSchema.options: passed in, so the admin tab's lazy
   *  chunk imports nothing of schemas.ts and the bundler keeps it in the entry chunk). */
  raidActions: readonly string[],
): VoicedKeys {
  const story = STORY_LINE_IDS.map(sayKey);
  const specials = content.feesdae.specials.map((f) => f.barks);
  const all = voicedLines(barks, content.biomes, content.birds.meerkats, specials, [
    ...veldLifeBarks(content.birds),
    ...baboonBarks(raidActions),
    ...harvestBarks(),
    // v1.12 (D-069): Oupa's Brakkie lines.
    ...brakkieBarks(),
    ...cameoBarks(),
    // v1.11 (D-068): Oupa's story phrases at the braai (lazy table src/i18n/braai/).
    ...story,
  ]);
  const special = new Set(
    specials.flatMap((b) => Object.values(b).filter((k): k is string => typeof k === 'string')),
  );
  const braai = new Set(story);
  const group = new Map<string, VoicedGroup>();
  for (const k of all) group.set(k, braai.has(k) ? 'braai' : special.has(k) ? 'special' : 'oupa');
  return { all, group };
}
