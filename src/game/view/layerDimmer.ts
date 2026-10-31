// D-065: an extra tint on top of each layer's map light (New Year's dusk going to blue hour),
// applied cheaply: each layer's tint is worked out once per change and a layer whose tint did not
// change is skipped; the work is spread over frames, one changed layer per step (round robin), and
// an image or herd is tinted only when its tint really changes. Pure apart from the setTint calls.
import { multiplyRgb } from './lightTint';

export interface DimTarget {
  readonly tintTopLeft: number;
  setTint(tint: number): unknown;
}

export interface DimLayer {
  readonly id: string;
  /** The map light's tint on the layer (0xFFFFFF without one). */
  readonly base: number;
  /** The layer's art and props now (the HD refresh may swap them). */
  images(): readonly DimTarget[];
  /** Its far animals (FaunaView.setTint skips an unchanged tint itself). */
  readonly fauna: readonly { setTint(tint: number): void }[];
}

export class LayerDimmer {
  private readonly applied: number[];
  private readonly target: number[];
  private cursor = 0;
  private pending = 0;

  constructor(private readonly layers: readonly DimLayer[]) {
    this.applied = layers.map((l) => l.base);
    this.target = layers.map((l) => l.base);
  }

  /** The extra tint per layer id (absent: none). Marks only the layers whose tint changes. */
  set(extra: ReadonlyMap<string, number>): void {
    this.layers.forEach((l, i) => {
      const tint = multiplyRgb(l.base, extra.get(l.id) ?? 0xffffff);
      this.target[i] = tint;
    });
    this.pending = this.layers.reduce(
      (n, _l, i) => n + (this.target[i] !== this.applied[i] ? 1 : 0),
      0,
    );
  }

  /** Whether a layer still waits for its new tint. */
  get busy(): boolean {
    return this.pending > 0;
  }

  /** Applies the next changed layer (round robin); returns the setTint calls it made. */
  step(): number {
    if (this.pending === 0) return 0;
    const n = this.layers.length;
    for (let k = 0; k < n; k++) {
      const i = (this.cursor + k) % n;
      const tint = this.target[i] ?? 0xffffff;
      if (tint === this.applied[i]) continue;
      const layer = this.layers[i];
      this.cursor = (i + 1) % n;
      this.applied[i] = tint;
      this.pending--;
      if (layer === undefined) return 0;
      let calls = 0;
      for (const img of layer.images())
        if (img.tintTopLeft !== tint) {
          img.setTint(tint);
          calls++;
        }
      for (const f of layer.fauna) {
        f.setTint(tint);
        calls++;
      }
      return calls;
    }
    this.pending = 0;
    return 0;
  }
}
