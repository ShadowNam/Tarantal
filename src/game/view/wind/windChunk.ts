// v1.17 (D-079): the first download's handle on the wind chunk (the near grass that bows with
// the wind). Asked for at a wind hunt's START; nothing waits for it.
type WindChunk = typeof import('./WindGrassView');

let chunk: WindChunk | null = null;
let loading: Promise<void> | null = null;

export function requestWind(): void {
  loading ??= import('./WindGrassView')
    .then((m) => {
      chunk = m;
    })
    .catch(() => {
      loading = null;
    });
}

export function windChunk(): WindChunk | null {
  return chunk;
}
