// 24 Oct update (D-037) Skietbaan steel plate: a round gong hanging from a crossbar on two posts.
// It swings about its hang point when the sim says a pellet struck it (plateHit). The face is
// the interim art (range/plate) once the range group has loaded, else drawn here. Drawn on the
// plane's overlay layer in plane coordinates, like the paper targets. Rendering only.
import * as Phaser from 'phaser';
import type { PaperView } from '../../sim/types';
import {
  PLATE_DISC_R,
  PLATE_HANG_PX,
  PLATE_ORIGIN,
  PLATE_TEX,
  PLATE_TEX_SIZE,
} from './rangeAssets';

// Rendering only: the frame's colours and sizes (fractions of the plate radius), the swing.
const WOOD = 0x6b4a2b;
const WOOD_DARK = 0x4a321d;
const STEEL = 0x8a9198;
const PAINT = 0xefeadf;
const FRAME_HALF = 1.12;
const POST_W = 0.12;
const LEG_BELOW = 1.5;
/** Swing: its amplitude (radians), decay time and period (ms). A hit kicks the plate out at
 *  once (a struck plate jumps), then it swings back and settles; a new hit starts it again. */
const SWING_RAD = 0.32;
const SWING_TAU_MS = 900;
const SWING_PERIOD_MS = 620;

/** Disc centre below the hang point, texture px. */
const CY = PLATE_HANG_PX + PLATE_DISC_R - PLATE_ORIGIN.y * PLATE_TEX_SIZE.height;

export class PlateDraw {
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly swing: Phaser.GameObjects.Container;
  private face: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
  private amp = 0;
  private t = 0;
  /** Swings so far (the test hook reads it). */
  hits = 0;

  get plane(): PaperView['plane'] {
    return this.plate.plane;
  }

  get kind(): PaperView['kind'] {
    return this.plate.kind;
  }

  /** The hang point (plane px): rings and markers take the disc from it. */
  private readonly hangY: number;

  constructor(
    private readonly scene: Phaser.Scene,
    layer: Phaser.GameObjects.Container,
    private readonly plate: PaperView,
  ) {
    const { x, y, r } = plate;
    const k = r / PLATE_DISC_R;
    this.hangY = y - CY * k;
    const half = r * FRAME_HALF;
    const post = Math.max(1, r * POST_W);
    const ground = y + r * LEG_BELOW;
    this.frame = scene.add.graphics();
    this.frame
      .fillStyle(WOOD, 1)
      .fillRect(x - half - post / 2, this.hangY - post, post, ground - this.hangY + post)
      .fillRect(x + half - post / 2, this.hangY - post, post, ground - this.hangY + post)
      .fillStyle(WOOD_DARK, 1)
      .fillRect(x - half - post / 2, this.hangY - post * 1.5, half * 2 + post, post);
    this.swing = scene.add.container(x, this.hangY);
    this.face = this.makeFace();
    this.swing.add(this.face);
    layer.add([this.frame, this.swing]);
  }

  private makeFace(): Phaser.GameObjects.Image | Phaser.GameObjects.Graphics {
    const k = this.plate.r / PLATE_DISC_R;
    if (this.scene.textures.exists(PLATE_TEX))
      return this.scene.add
        .image(0, 0, PLATE_TEX)
        .setOrigin(PLATE_ORIGIN.x, PLATE_ORIGIN.y)
        .setScale(k);
    // Before the art arrives: chains, steel rim and painted face.
    const r = this.plate.r;
    const cy = CY * k;
    const line = Math.max(0.5, r * 0.03);
    return this.scene.add
      .graphics()
      .lineStyle(line, STEEL, 1)
      .lineBetween(-r * 0.15, 0, -r * 0.42, cy - r * 0.86)
      .lineBetween(r * 0.15, 0, r * 0.42, cy - r * 0.86)
      .fillStyle(STEEL, 1)
      .fillCircle(0, cy, r)
      .fillStyle(PAINT, 1)
      .fillCircle(0, cy, r * 0.9);
  }

  /** A pellet struck at plane x: it swings away from the side that was hit. */
  hit(atX: number): void {
    const dir = atX >= this.plate.x ? -1 : 1;
    this.amp = dir * SWING_RAD;
    this.t = 0;
    this.hits++;
  }

  private angle(): number {
    if (this.amp === 0) return 0;
    const w = (2 * Math.PI) / SWING_PERIOD_MS;
    return this.amp * Math.exp(-this.t / SWING_TAU_MS) * Math.cos(w * this.t);
  }

  /** Each frame: the art swaps in once loaded; the swing runs on. */
  update(dtMs: number): void {
    if (this.face instanceof Phaser.GameObjects.Graphics && this.scene.textures.exists(PLATE_TEX)) {
      this.face.destroy();
      this.face = this.makeFace();
      this.swing.add(this.face);
    }
    if (this.amp === 0) return;
    this.t += dtMs;
    if (this.t > SWING_TAU_MS * 5) {
      this.amp = 0;
      this.swing.rotation = 0;
      return;
    }
    this.swing.rotation = this.angle();
  }

  destroy(): void {
    this.frame.destroy();
    this.swing.destroy();
  }
}
