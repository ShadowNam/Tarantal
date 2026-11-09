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

/**
 * v1.17 (D-079): the HUD's wind meter (the HUD calls it once this chunk is in, and only when what
 * it shows changes): a dark plate, an arrow downwind and five bars rising left to right, lit by
 * `bars`, warmer during a gust.
 */
export function drawWindMeter(
  g: Phaser.GameObjects.Graphics,
  r: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
  dir: 1 | -1,
  bars: number,
  gust: boolean,
  ink: number,
): void {
  g.fillStyle(ink, 0.45).fillRoundedRect(r.x, r.y, r.w, r.h, 8);
  const ax = r.x + 26;
  const ay = r.y + r.h / 2;
  g.fillStyle(0xf3ead3, 1);
  g.fillRect(ax - 14, ay - 2.5, 28, 5);
  g.fillTriangle(ax + dir * 20, ay, ax + dir * 8, ay - 8, ax + dir * 8, ay + 8);
  for (let i = 0; i < 5; i++) {
    const h = 6 + i * 3;
    const lit = i < bars;
    g.fillStyle(lit ? (gust ? 0xff8a3d : 0xffd25a) : 0xf3ead3, lit ? 1 : 0.25);
    g.fillRect(r.x + 56 + i * 17, r.y + r.h - 3 - h, 12, h);
  }
}
