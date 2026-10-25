// v1.5 (D-041): Oupa's voice packs. Each voice language (en, af, de) is its own lazy asset group
// (`voice-<lang>`, tools/assets/pack.ts), never part of the first download. Only the chosen voice
// language's pack is fetched, after the first gesture anywhere has unlocked audio (main.ts listens
// on the document; nothing can play before), and not at all while the voice volume is 0. A bark
// that comes before its line has arrived waits up to feel.json audio.barkWaitMs (AudioDirector). Changing the voice language fetches the
// new pack; the AudioDirector keeps only the current language's lines in memory. A missing index
// or file leaves Oupa silent (his speech bubble is the caption either way).
import type { AssetIndex } from '../assets/assetIndex';
import type { FinalSound } from '../assets/AssetManifest';
import type { AudioDirector } from './AudioDirector';
import { voiceGroup } from './voiceLines';
import type { VoiceLanguage } from '../../i18n/i18n';

export type VoicePackState = 'none' | 'loading' | 'ready' | 'missing';

export interface VoicePackEnv {
  readonly loadBytes: (path: string) => Promise<ArrayBuffer | null>;
  /** The state of the language in use changed (test hook). */
  readonly onState?: (lang: VoiceLanguage, state: VoicePackState) => void;
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
  private readonly loads = new Map<VoiceLanguage, Promise<readonly FinalSound[]>>();

  constructor(
    private readonly audio: AudioDirector,
    private readonly index: AssetIndex | null,
    private readonly env: VoicePackEnv,
  ) {}

  /**
   * The voice language to speak and whether the voice is on (voice volume > 0). Loads that pack
   * once audio is unlocked; with the voice off nothing is fetched.
   */
  use(lang: VoiceLanguage, voiceOn: boolean): void {
    this.audio.setVoiceLanguage(lang);
    if (!voiceOn) {
      this.wanted = null;
      return;
    }
    if (this.wanted === lang) return;
    this.wanted = lang;
    this.audio.onUnlocked(() => {
      if (this.wanted === lang) this.load(lang);
    });
  }

  private load(lang: VoiceLanguage): void {
    const index = this.index;
    const format = this.audio.fileFormat();
    const entries = index === null ? [] : voicePackEntries(index, lang);
    if (entries.length === 0 || format === null) {
      this.env.onState?.(lang, 'missing');
      return;
    }
    let p = this.loads.get(lang);
    if (p === undefined) {
      this.env.onState?.(lang, 'loading');
      p = Promise.all(
        entries.map(async ([key, entry]) => {
          const bytes = await this.env.loadBytes(entry[format].path);
          return bytes === null ? null : { key, entry, bytes, format };
        }),
      ).then((files) => files.filter((f): f is FinalSound => f !== null));
      this.loads.set(lang, p);
    }
    void p.then((files) => {
      // A language left while loading keeps its bytes cached here, but isn't decoded.
      if (this.wanted !== lang) return;
      this.audio.addRecorded(files);
      this.env.onState?.(lang, files.length > 0 ? 'ready' : 'missing');
    });
  }
}
