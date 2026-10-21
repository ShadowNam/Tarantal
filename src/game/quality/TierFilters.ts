// The quality tier's camera filters (Tech §5, M9): medium and high get a soft vignette, high also
// a bloom (bright parts thresholded, blurred and added back). Low has none. Applied to the hunt
// scene's camera when its views are built and again whenever the tier changes (Settings, the
// title benchmark). Tiers cut cost only: neither filter hides birds or secrets.
import * as Phaser from 'phaser';
import type { LivePrefs } from '../prefs';

export class TierFilters {
  private vignette: Phaser.Filters.Vignette | null = null;
  private bloom: Phaser.Filters.ParallelFilters | null = null;
  private applied = '';

  constructor(private readonly camera: Phaser.Cameras.Scene2D.Camera) {}

  apply(p: Pick<LivePrefs, 'vignette' | 'bloom'>): void {
    const key = JSON.stringify([p.vignette, p.bloom]);
    if (key === this.applied) return;
    this.applied = key;
    this.clear();
    const f = this.camera.filters;
    if (p.bloom !== null) {
      const pf = f.internal.addParallelFilters();
      pf.top.addThreshold(p.bloom.threshold, 1);
      pf.top.addBlur(0, p.bloom.blur, p.bloom.blur, 1);
      pf.blend.blendMode = Phaser.BlendModes.ADD;
      pf.blend.amount = p.bloom.amount;
      this.bloom = pf;
    }
    if (p.vignette !== null) {
      this.vignette = f.external.addVignette(0.5, 0.5, p.vignette.radius, p.vignette.strength);
    }
  }

  /** Filters currently on (debug overlay, e2e). */
  get active(): string[] {
    return [...(this.vignette ? ['vignette'] : []), ...(this.bloom ? ['bloom'] : [])];
  }

  clear(): void {
    const f = this.camera.filters;
    if (this.vignette) f.external.remove(this.vignette);
    if (this.bloom) f.internal.remove(this.bloom);
    this.vignette = null;
    this.bloom = null;
  }
}
