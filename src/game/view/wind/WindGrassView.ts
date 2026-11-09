// v1.17 (D-079): grass tufts along the near ground that bow with the wind (the lazy wind chunk).
// Each tuft is drawn once (a Graphics with its foot at 0,0) and only turned each frame: no
// texture, no redraw. They sit in the near plane's fixtures (above its props, below Brakkie and
// the birds), low on the ground, so they never cover a target.
import Phaser from 'phaser';
import type { SimState } from '../../../sim/types';
import { coreWidth } from '../../../sim/world';
import type { ParallaxView } from '../ParallaxView';
import { grassLean } from './windGrass';

export interface WindGrassOptions {
  readonly scene: Phaser.Scene;
  readonly parallax: ParallaxView;
  readonly exponent: number;
  readonly reducedMotion: boolean;
  /** The tufts' feet (design px from the top, on the near plane). */
  readonly groundY: number;
  readonly now: () => number;
}

const SPACING = 300;
const BLADES = 5;

export class WindGrassView {
  private readonly tufts: Phaser.GameObjects.Graphics[] = [];
  private readonly phase: number[] = [];
  lastMs = 0;

  constructor(private readonly o: WindGrassOptions) {
    const node = o.parallax.plane('near');
    const n = Math.floor(coreWidth(node.scrollFactor) / SPACING);
    for (let i = 0; i < n; i++) {
      const g = o.scene.add.graphics();
      const h = 34 + ((i * 37) % 22);
      g.lineStyle(4, 0x6f7a3a, 1);
      for (let b = 0; b < BLADES; b++) {
        const spread = (b - (BLADES - 1) / 2) * 6;
        g.beginPath();
        g.moveTo(spread * 0.4, 0);
        g.lineTo(spread, -h + Math.abs(spread) * 1.5);
        g.strokePath();
      }
      g.lineStyle(2, 0xc9b56a, 1);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(2, -h - 4);
      g.strokePath();
      g.setPosition(i * SPACING + 80 + ((i * 53) % 90), o.groundY + 70 + ((i * 29) % 18));
      node.fixtures.add(g);
      this.tufts.push(g);
      this.phase.push((i * 1.7) % (Math.PI * 2));
    }
  }

  update(s: SimState): void {
    const t0 = this.o.now();
    const w = s.wind;
    const show = w !== null;
    const lean = w === null ? null : grassLean(w.dir, w.strength, this.o.exponent);
    const sec = this.o.now() / 1000;
    for (let i = 0; i < this.tufts.length; i++) {
      const g = this.tufts[i];
      if (g === undefined) continue;
      g.setVisible(show);
      if (lean === null) continue;
      const flutter = this.o.reducedMotion
        ? 0
        : Math.sin(sec * (3 + 4 * (w?.gust ?? 0)) + (this.phase[i] ?? 0)) * lean.flutter;
      g.setRotation(lean.lean + flutter);
    }
    this.lastMs = this.o.now() - t0;
  }

  /** e2e: the tufts' lean now (radians), null without tufts. */
  leanNow(): number | null {
    return this.tufts[0]?.rotation ?? null;
  }

  destroy(): void {
    for (const g of this.tufts) g.destroy();
    this.tufts.length = 0;
  }
}
