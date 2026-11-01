// v1.12 (D-069): the first download's handle on Brakkie's lazy chunk (BrakkieView.ts with its frame
// table and sounds). A hunt asks for it at START (`requestBrakkie`), and the title for the wag;
// nothing ever waits for it: until the chunk and his sheet are in he simply isn't drawn (the sim
// runs him all the same, so replays match).
import type { AudioDirector } from '../audio/AudioDirector';

type BrakkieChunk = typeof import('./BrakkieView');

let chunk: BrakkieChunk | null = null;
let loading: Promise<void> | null = null;

/**
 * Starts (or joins) loading the chunk and, through it, his files for this graphics mode (each once
 * per page; a failed one is tried again next time). The delivery switch (lesson 35): with no asset
 * index, or one without his files, nothing loads.
 */
export function requestBrakkie(audio: AudioDirector, hd: boolean): void {
  loading ??= import('./BrakkieView')
    .then((m) => {
      chunk = m;
    })
    .catch(() => {
      loading = null;
    });
  void loading.then(() => chunk?.loadBrakkieAssets(audio, hd));
}

/** The chunk, once it has arrived (its view polls for the sheet itself), else null. */
export function brakkieChunk(): BrakkieChunk | null {
  return chunk;
}
