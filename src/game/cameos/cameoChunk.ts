// v1.13 (D-075): the first download's handle on the cameos' lazy chunk (CameoView.ts with its frame
// tables and sounds). A hunt on an area with cameos asks for it at START (`requestCameos`); nothing
// ever waits for it: until the chunk and the area's sheet are in the cameos simply aren't drawn
// (the sim runs them all the same, so replays match).
import type { AudioDirector } from '../audio/AudioDirector';
import type { CameoArea } from './cameoKeys';

type CameoChunk = typeof import('./CameoView');

let chunk: CameoChunk | null = null;
let loading: Promise<void> | null = null;

/**
 * Starts (or joins) loading the chunk and, through it, the area's files for this graphics mode
 * (each once per page; a failed one is tried again next time). The delivery switch (lesson 35):
 * with no asset index, or one without the area's files, nothing loads.
 */
export function requestCameos(area: CameoArea, audio: AudioDirector, hd: boolean): void {
  loading ??= import('./CameoView')
    .then((m) => {
      chunk = m;
    })
    .catch(() => {
      loading = null;
    });
  void loading.then(() => chunk?.loadCameoAssets(area, audio, hd));
}

/** The chunk, once it has arrived (its view polls for the sheet itself), else null. */
export function cameoChunk(): CameoChunk | null {
  return chunk;
}
