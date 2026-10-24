// Skietbaan steel plate (D-037; clean gongs with lasting hit marks, D-040): a round gong hanging
// from a crossbar on two posts. Freshly painted each Skietbaan visit; every pellet the sim says
// struck it (plateHit) leaves a lead-splash mark at that point, drawn in the plate's own swinging
// frame and baked (MarkSurface) so hundreds of marks cost one image. A hit swings the plate on sim
// time (the snapshot tick), so a held frame (?holdAt) holds the swing too. The face and frame are
// the interim art (range/plate, range/plate_frame) once the range group has loaded, else drawn
// here. Drawn on the plane's overlay layer in plane coordinates. Rendering only.
import * as Phaser from 'phaser';
import { TICKS_PER_SECOND } from '../../sim/clock';
import type { PaperView } from '../../sim/types';
import { drawNewest, MarkSurface, type TargetFrame } from './MarkSurface';
import { newestLit, NEWEST_TICKS, swingAngle, type Mark } from './rangeMarks';
import {
  FRAME_HALF,
  FRAME_LEG_BELOW,
  FRAME_POST,
  PLATE_CY,
  PLATE_DISC_R,
  PLATE_FRAME_ORIGIN,
  PLATE_FRAME_TEX,
  PLATE_ORIGIN,
  PLATE_TEX,
  PLATE_TEX_SIZE,
} from './rangeAssets';

// Rendering only: the stand-in frame's and face's colours (before the art arrives), the swing.
const WOOD = 0x8a6440;
const WOOD_LIT = 0xb08559;
const WOOD_DARK = 0x4b321d;
const STEEL = 0x8e969d;
const STEEL_LIT = 0xdfe3e6;
const PAINT = 0xf3f1ea;
/** A hit kicks the plate out by this much (radians), away from the side that was hit. */
const SWING_RAD = 0.32;

export class PlateDraw {
  private frame: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
  private readonly swing: Phaser.GameObjects.Container;
  private readonly surface: MarkSurface;
  private readonly newest: Phaser.GameObjects.Graphics;
  private hasArt: boolean;
  private amp = 0;
  private hitTick = 0;
  private lit: Mark | null = null;
  private litFade = -1;
  /** Swings so far (the test hook reads it). */
  hits = 0;

  get id(): number {
    return this.plate.id;
  }

  get plane(): PaperView['plane'] {
    return this.plate.plane;
  }

  get kind(): PaperView['kind'] {
    return this.plate.kind;
  }

  /** Marks baked on the plate now (the test hook reads it). */
  get drawn(): number {
    return this.surface.drawn;
  }

  /** The hang point (plane px): rings and markers take the disc from it. */
  private readonly hangY: number;
  /** Plane px per texture px. */
  private readonly k: number;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Container,
    private readonly plate: PaperView,
    maxScreenScale: number,
  ) {
    const { x, y, r } = plate;
    this.k = r / PLATE_DISC_R;
    this.hangY = y - PLATE_CY * this.k;
    this.frame = this.makeFrame();
    this.swing = scene.add.container(x, this.hangY);
    this.hasArt = scene.textures.exists(PLATE_TEX);
    const w = PLATE_TEX_SIZE.width * this.k;
    const h = PLATE_TEX_SIZE.height * this.k;
    const top = PLATE_ORIGIN.y * PLATE_TEX_SIZE.height;
    this.surface = new MarkSurface(
      scene,
      {
        width: w,
        height: h,
        centreX: 0.5,
        centreY: (top + PLATE_CY) / PLATE_TEX_SIZE.height,
        r,
        maxScreenScale,
        look: 'steel',
      },
      (dt, s) => {
        this.drawFace(dt, s);
      },
    );
    this.surface.image.setPosition(0, PLATE_CY * this.k);
    this.newest = scene.add.graphics();
    this.newest.setPosition(0, PLATE_CY * this.k);
    this.swing.add([this.surface.image, this.newest]);
    layer.add([this.frame, this.swing]);
  }

  private makeFrame(): Phaser.GameObjects.Image | Phaser.GameObjects.Graphics {
    const { x, r } = this.plate;
    if (this.scene.textures.exists(PLATE_FRAME_TEX)) {
      this.scene.textures.get(PLATE_FRAME_TEX).setFilter(Phaser.Textures.FilterMode.LINEAR);
      return this.scene.add
        .image(x, this.hangY, PLATE_FRAME_TEX)
        .setOrigin(PLATE_FRAME_ORIGIN.x, PLATE_FRAME_ORIGIN.y)
        .setScale(this.k);
    }
    // Before the art arrives: two posts (lit left edge) and a crossbar.
    const half = r * FRAME_HALF;
    const post = Math.max(1, r * FRAME_POST);
    const ground = this.plate.y + r * FRAME_LEG_BELOW;
    const top = this.hangY - post * 1.6;
    const gfx = this.scene.add.graphics();
    for (const px of [x - half, x + half]) {
      gfx
        .fillStyle(WOOD, 1)
        .fillRect(px - post / 2, top, post, ground - top)
        .fillStyle(WOOD_LIT, 1)
        .fillRect(px - post / 2, top, post * 0.3, ground - top)
        .fillStyle(WOOD_DARK, 1)
        .fillRect(px + post * 0.25, top, post * 0.25, ground - top);
    }
    return gfx
      .fillStyle(WOOD, 1)
      .fillRect(x - half - post * 0.8, top, half * 2 + post * 1.6, post * 1.1)
      .fillStyle(WOOD_LIT, 1)
      .fillRect(x - half - post * 0.8, top, half * 2 + post * 1.6, post * 0.3);
  }

  /** The clean painted face at level 0 of the bake (`s` texels per plane px). */
  private drawFace(dt: Phaser.Textures.DynamicTexture, s: number): void {
    if (this.scene.textures.exists(PLATE_TEX)) {
      dt.stamp(PLATE_TEX, undefined, 0, 0, {
        originX: 0,
        originY: 0,
        scale: s * this.k,
      });
      return;
    }
    // Before the art arrives: chains, a steel rim with a lit edge, the painted face.
    const kk = s * this.k;
    const cx = (PLATE_TEX_SIZE.width / 2) * kk;
    const hang = PLATE_ORIGIN.y * PLATE_TEX_SIZE.height * kk;
    const cy = hang + PLATE_CY * kk;
    const R = PLATE_DISC_R * kk;
    const gfx = this.scene.make.graphics({}, false);
    gfx
      .lineStyle(Math.max(0.5, R * 0.03), STEEL, 1)
      .lineBetween(cx - R * 0.15, hang, cx - R * 0.42, cy - R * 0.86)
      .lineBetween(cx + R * 0.15, hang, cx + R * 0.42, cy - R * 0.86)
      .fillStyle(STEEL, 1)
      .fillCircle(cx, cy, R)
      .lineStyle(Math.max(0.5, R * 0.03), STEEL_LIT, 1)
      .beginPath()
      .arc(cx, cy, R * 0.95, Math.PI * 0.95, Math.PI * 1.6)
      .strokePath()
      .fillStyle(PAINT, 1)
      .fillCircle(cx, cy, R * 0.9);
    dt.draw(gfx);
    gfx.destroy();
  }

  /** A pellet struck at plane x on sim tick `tick`: it swings away from the side that was hit. */
  hit(atX: number, tick: number): void {
    const dir = atX >= this.plate.x ? -1 : 1;
    this.amp = dir * SWING_RAD;
    this.hitTick = tick;
    this.hits++;
  }

  /** The swing now (radians; tests and the hook read it). */
  get rotation(): number {
    return this.swing.rotation;
  }

  /** Each frame: the art swaps in once loaded, the marks bake, the swing runs on sim time. */
  update(f: TargetFrame): void {
    if (
      this.frame instanceof Phaser.GameObjects.Graphics &&
      this.scene.textures.exists(PLATE_FRAME_TEX)
    ) {
      this.frame.destroy();
      this.frame = this.makeFrame();
      this.layer.addAt(this.frame, this.layer.getIndex(this.swing));
    }
    if (!this.hasArt && this.scene.textures.exists(PLATE_TEX)) {
      this.hasArt = true;
      this.surface.invalidate();
    }
    this.surface.sync(f.marks, f.epoch);
    this.surface.pick(f.screenScale);
    const ms = ((f.tick - this.hitTick) * 1000) / TICKS_PER_SECOND;
    this.swing.rotation = swingAngle(this.amp, ms);
    // The newest mark glints, then fades into a normal mark over its last third.
    const lit = newestLit(f.marks, f.visit, f.tick);
    const age = lit === null ? 0 : f.tick - lit.tick;
    const fade = lit === null ? 0 : Math.min(1, ((NEWEST_TICKS - age) / NEWEST_TICKS) * 3);
    const step = Math.round(fade * 8) / 8;
    if (lit !== this.lit || step !== this.litFade) {
      this.lit = lit;
      this.litFade = step;
      this.newest.clear();
      if (lit !== null && step > 0) drawNewest(this.newest, 'steel', 0, 0, this.plate.r, lit, step);
    }
  }

  destroy(): void {
    this.frame.destroy();
    this.surface.destroy();
    this.swing.destroy();
  }
}
