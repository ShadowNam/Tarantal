// v1.11 (D-068): the first download's handle on Die Braai's lazy chunk (BraaiView.ts and its
// table and strings). A hunt asks for it when it starts (`requestBraai`), so the chunk, the sheet,
// the sounds and Oupa's story lines are there by the tally; the tally asks `braaiReady()` once,
// synchronously — the braai shows only if everything it draws has already arrived, otherwise the
// plain slate shows (never a wait, never a blank screen, never a late switch-over).
import type { AudioDirector } from '../audio/AudioDirector';

type BraaiChunk = typeof import('./BraaiView');

let chunk: BraaiChunk | null = null;
let loading: Promise<void> | null = null;

/** e2e/dev only (?braai=0, ?braaiDance=1, set by main.ts under the test hooks). */
export interface BraaiFlags {
  /** The plain slate, as before v1.11. */
  readonly off: boolean;
  /** Oupa dances whatever the result (the screenshot spec's perfect hunt). */
  readonly dance: boolean;
  /** Holds the braai's clock at this many ms (screenshots, visual baselines); null: runs. */
  readonly at: number | null;
}
let flags: BraaiFlags = { off: false, dance: false, at: null };

export function setBraaiFlags(f: BraaiFlags): void {
  flags = f;
}

export function braaiFlags(): BraaiFlags {
  return flags;
}

/**
 * Starts (or joins) loading the chunk and, through it, the braai's files for this voice language
 * and graphics mode (each file once per page; a failed one is tried again next hunt). Obeys the
 * delivery switch: with no asset index, or one without the braai's files, nothing loads.
 */
export function requestBraai(audio: AudioDirector, hd: boolean): void {
  if (flags.off) return;
  loading ??= import('./BraaiView')
    .then((m) => {
      chunk = m;
    })
    .catch(() => {
      loading = null;
    });
  void loading.then(() => chunk?.loadBraaiAssets(audio, hd));
}

/** The chunk, if it has arrived and its sheet with it (else null: the plain slate shows). */
export function braaiReady(): BraaiChunk | null {
  if (flags.off || chunk === null) return null;
  return chunk.braaiSheetIn() ? chunk : null;
}
