// v1.5 (D-041): Oupa's voice packs. Each voice language (en, af, de) is its own lazy asset group
// (`voice-<lang>`, tools/assets/pack.ts), never part of the first download. Only the chosen voice
// language's pack is fetched, after the first gesture anywhere has unlocked audio (main.ts listens
// on the document; nothing can play before), and not at all while the voice volume is 0. A bark
// that comes before its line has arrived waits up to feel.json audio.barkWaitMs (AudioDirector).
// Changing the voice language fetches the new pack; nothing of the old one is kept here (its bytes
// go to the AudioDirector, which keeps only the current language's lines). Files that failed are
// not remembered as done: a later bark retries just those, at most MAX_ATTEMPTS times per language.
// A missing index or file leaves Oupa silent (his speech bubble is the caption either way).
import type { AssetIndex } from '../assets/assetIndex';
import { mergeVoiceIndex, type VoiceIndex } from '../assets/voiceIndex';
import type { FinalSound } from '../assets/AssetManifest';
import type { AudioDirector } from './AudioDirector';
import { voiceGroup } from './voiceLines';
import type { VoiceLanguage } from '../../i18n/i18n';

/** none: not asked for · loading · ready: every line in · partial: some failed · missing: none. */
export type VoicePackState = 'none' | 'loading' | 'ready' | 'partial' | 'missing';

/** Fetch rounds per language (the first load and retries of the files that failed). */
export const MAX_ATTEMPTS = 3;

export interface VoicePackEnv {
  /** Fetches one file (uncached: VoicePacks keeps no bytes either), or null on a failure. */
  readonly loadBytes: (path: string) => Promise<ArrayBuffer | null>;
  /** The state of the language in use changed (test hook). */
  readonly onState?: (lang: VoiceLanguage, state: VoicePackState) => void;
  /** v1.8b (D-062): fetches the voice half of the index (absent: the index has the entries). */
  readonly voiceIndex?: () => Promise<VoiceIndex | null>;
}

/** The index entries of one voice language's pack, by key. */
export function voicePackEntries(
  index: AssetIndex,
  lang: VoiceLanguage,
): [string, AssetIndex['audio'][string]][] {
  const group = voiceGroup(lang);
  return Object.entries(index.audio).filter(([, e]) => e.group === group);
}

export class VoicePacks {
  private wanted: VoiceLanguage | null = null;
  /** The language `done` and `attempts` belong to (reset when the voice language changes). */
  private lang: VoiceLanguage | null = null;
  /** Keys of `lang` handed to the AudioDirector (no bytes are kept). */
  private done = new Set<string>();
  private attempts = 0;
  /** The language with a fetch round in flight, if any. */
  private loading: VoiceLanguage | null = null;
  /** v1.8b (D-062): the index with its voice half merged in, once fetched. */
  private voice: AssetIndex | null = null;

  constructor(
    private readonly audio: AudioDirector,
    private readonly index: AssetIndex | null,
    private readonly env: VoicePackEnv,
  ) {}

  /** Lines of the current language delivered so far (tests). */
  get delivered(): number {
    return this.done.size;
  }

  /**
   * The voice language to speak and whether the voice is on (voice volume > 0). Loads that pack
   * once audio is unlocked; with the voice off nothing is fetched.
   */
  use(lang: VoiceLanguage, voiceOn: boolean): void {
    this.audio.setVoiceLanguage(lang);
    if (this.lang !== lang) {
      // Another language: forget the old one entirely ("one pack in memory").
      this.lang = lang;
      this.done = new Set();
      this.attempts = 0;
    }
    if (!voiceOn) {
      this.wanted = null;
      return;
    }
    if (this.wanted === lang) return;
    this.wanted = lang;
    this.audio.onUnlocked(() => {
      this.load(lang);
    });
  }

  /** A line was missing when Oupa spoke: fetch the files that failed again (bounded). */
  retry(): void {
    const lang = this.wanted;
    if (lang !== null) this.load(lang);
  }

  private load(lang: VoiceLanguage): void {
    if (this.wanted !== lang || this.lang !== lang || this.loading === lang) return;
    // v1.8b (D-062): the packs' entries are in the voice half of the index (fetched once). An
    // index without any audio means no audio was delivered: no voice either (as before the split).
    if (this.index !== null && Object.keys(this.index.audio).length === 0) {
      this.env.onState?.(lang, 'missing');
      return;
    }
    if (this.index !== null && this.voice === null && this.env.voiceIndex !== undefined) {
      this.loading = lang;
      void this.env.voiceIndex().then((v) => {
        if (this.loading === lang) this.loading = null;
        if (v === null || this.index === null) {
          this.env.onState?.(lang, 'missing');
          return;
        }
        this.voice = mergeVoiceIndex(this.index, v);
        this.load(lang);
      });
      return;
    }
    const format = this.audio.fileFormat();
    const index = this.voice ?? this.index;
    const entries = index === null ? [] : voicePackEntries(index, lang);
    if (entries.length === 0 || format === null) {
      this.env.onState?.(lang, 'missing');
      return;
    }
    const todo = entries.filter(([key]) => !this.done.has(key));
    if (todo.length === 0 || this.attempts >= MAX_ATTEMPTS) return;
    this.attempts++;
    this.loading = lang;
    this.env.onState?.(lang, 'loading');
    void Promise.all(
      todo.map(async ([key, entry]): Promise<FinalSound | null> => {
        const bytes = await this.env.loadBytes(entry[format].path);
        return bytes === null ? null : { key, entry, bytes, format };
      }),
    ).then((got) => {
      if (this.loading === lang) this.loading = null;
      // A language left while loading: its bytes are dropped here.
      if (this.wanted !== lang || this.lang !== lang) return;
      const files = got.filter((f): f is FinalSound => f !== null);
      for (const f of files) this.done.add(f.key);
      this.audio.addRecorded(files);
      const state =
        this.done.size === entries.length ? 'ready' : this.done.size > 0 ? 'partial' : 'missing';
      this.env.onState?.(lang, state);
    });
  }
}
