// v1.8b (D-062): the voice half of the asset index (asset-index-voice.json): every entry of Oupa's
// voice packs (`voice-<lang>`) and the special days' lines (`feesdae-voice-<lang>`). They load
// lazily anyway, and their ~200 entries cost ~13 KB gzip in the first download's index: the pack
// tool writes them here instead (like the HD half, D-053), and the voice packs fetch this file
// once, the first time a pack loads. Tools merge it back (tools/assets/fullIndex.ts).
import { z } from 'zod';
import { audioEntry, type AssetIndex } from './assetIndex';

export const VOICE_INDEX_PATH = 'assets/asset-index-voice.json';

const voiceIndexSchema = z.object({
  version: z.literal(1),
  audio: z.record(z.string(), audioEntry),
});
export type VoiceIndex = z.infer<typeof voiceIndexSchema>;

/** A voice pack's group (Oupa's, or a special day's). */
export const isVoiceGroup = (group: string): boolean =>
  group.startsWith('voice-') || group.startsWith('feesdae-voice-');

/** The index without its voice entries, and those entries. */
export function splitVoiceIndex(index: AssetIndex): { index: AssetIndex; voice: VoiceIndex } {
  const audio: AssetIndex['audio'] = {};
  const voice: VoiceIndex['audio'] = {};
  for (const [k, e] of Object.entries(index.audio)) (isVoiceGroup(e.group) ? voice : audio)[k] = e;
  return { index: { ...index, audio }, voice: { version: 1, audio: voice } };
}

export function parseVoiceIndex(raw: unknown): VoiceIndex | null {
  const r = voiceIndexSchema.safeParse(raw);
  return r.success ? r.data : null;
}

export function mergeVoiceIndex(index: AssetIndex, voice: VoiceIndex): AssetIndex {
  return { ...index, audio: { ...index.audio, ...voice.audio } };
}

let loading: Promise<VoiceIndex | null> | null = null;

/** Fetches the voice half once (a failure is forgotten: the next call tries again). */
export function loadVoiceIndex(): Promise<VoiceIndex | null> {
  loading ??= fetch(VOICE_INDEX_PATH, { cache: 'no-cache' })
    .then(async (res) => (res.ok ? parseVoiceIndex(await res.json()) : null))
    .catch(() => null)
    .then((v) => {
      if (v === null) loading = null;
      return v;
    });
  return loading;
}
