// v1.5 (D-041): the lines Oupa says out loud (art bible §10). Each is an i18n key: its text in the
// text language is the caption, and its voice is the file voice/<voice language>/<key> from that
// language's voice pack. Pure: from the bark tuning (feel.json barks) and the biomes' secrets.
import type { Biome, MeerkatTuning } from '../../content/schemas';
import { VOICE_LANGUAGES, type VoiceLanguage } from '../../i18n/i18n';
import { allBarkLines, type BarkTuning, type SpecialBarks } from './barks';

/** Asset group of one voice language's pack (lazy: only the chosen language downloads). */
export const VOICE_GROUP_PREFIX = 'voice-';

export function voiceGroup(lang: VoiceLanguage): string {
  return `${VOICE_GROUP_PREFIX}${lang}`;
}

/**
 * D-048: a special day's own lines in one voice language, a lazy group of their own (loaded with
 * that day's hunt, src/game/feesdae), so the year-round voice packs don't carry them.
 */
export const SPECIAL_VOICE_GROUP_PREFIX = 'feesdae-voice-';

export function specialVoiceGroup(lang: string): string {
  return `${SPECIAL_VOICE_GROUP_PREFIX}${lang}`;
}

/** The voice language a pack group belongs to, or null for any other group. */
export function voiceLanguageOfGroup(group: string): VoiceLanguage | null {
  if (!group.startsWith(VOICE_GROUP_PREFIX)) return null;
  const lang = group.slice(VOICE_GROUP_PREFIX.length);
  return VOICE_LANGUAGES.find((l) => l === lang) ?? null;
}

/**
 * Every voiced key: Oupa's trigger lines, plus each secret's bark (the weavers' "Tsk-tsk-tsk!"
 * scold, the windpomp sign, the egg…), and (v1.7, D-044) the meerkats' scold and Oupa's
 * Familiefoto line, once each, sorted.
 */
export function voicedLines(
  barks: BarkTuning,
  biomes: readonly Pick<Biome, 'props'>[],
  meerkats?: Pick<MeerkatTuning, 'hit' | 'familiefoto'>,
  /** D-048: the special days' own lines (feesdae.json barks). */
  specials: readonly SpecialBarks[] = [],
): string[] {
  const out = new Set(allBarkLines(barks, specials));
  if (meerkats !== undefined) {
    out.add(meerkats.hit.barkKey);
    out.add(meerkats.familiefoto.barkKey);
  }
  for (const b of biomes)
    for (const p of b.props) {
      const k = p.secret?.reward.barkKey;
      if (k !== undefined) out.add(k);
    }
  return [...out].sort();
}
