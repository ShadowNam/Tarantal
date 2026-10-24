// v1.3x (D-037) Skietbaan paper targets: the face on its post, and every hole in it (D-040: the
// same rule as the steel plates — each pellet the sim put on the paper stays for the whole
// Skietbaan visit, baked by MarkSurface; the newest is highlighted briefly). Drawn on the plane's
// overlay layer in plane coordinates, so it pans and zooms with the world (a raised scope
// magnifies the holes too). Rendering only: hits come from the sim.
import * as Phaser from 'phaser';
import type { PaperView } from '../../sim/types';
import { drawNewest, MarkSurface, type TargetFrame } from './MarkSurface';
import { newestLit, NEWEST_TICKS } from './rangeMarks';

// Rendering only (D-037): colours of the face and rings, and sizes as fractions of the radius.
const FACE = 0xf3ead3;
const INK = 0x1b1410;
const BULL = 0xc8302a;
const POST = 0x6b4a2b;
const RINGS = 4;
const POST_W = 0.14;
const POST_H = 1.2;
/** The baked holes cover the face and a little torn edge around it (fractions of r). */
const HOLES_EXTENT = 1.08;
/** 24 Oct update: a hit blinks the face (≤ 150 ms, local); "reduce flashes" dims it. */
const BLINK_MS = 120;
const BLINK = 0xffd25a;
const BLINK_ALPHA = 0.85;
const BLINK_ALPHA_REDUCED = 0.3;

export class PaperDraw {
  private readonly face: Phaser.GameObjects.Graphics;
  private readonly surface: MarkSurface;
  private readonly newest: Phaser.GameObjects.Graphics;
  private lit: unknown = null;
  private litFade = -1;
  private readonly flash: Phaser.GameObjects.Graphics;
  private blinkLeft = 0;
  /** Blinks so far (the test hook reads it). */
  blinks = 0;
  /** Holes drawn now (the test hook reads it). */
  get count(): number {
    return this.surface.drawn;
  }

  get id(): number {
    return this.paper.id;
  }

  get plane(): PaperView['plane'] {
    return this.paper.plane;
  }

  get kind(): PaperView['kind'] {
    return this.paper.kind;
  }

  constructor(
    scene: Phaser.Scene,
    layer: Phaser.GameObjects.Container,
    private readonly paper: PaperView,
    maxScreenScale: number,
  ) {
    const { x, y, r } = paper;
    this.face = scene.add.graphics();
    const line = Math.max(0.5, r * 0.025);
    this.face
      .fillStyle(POST, 1)
      .fillRect(x - (r * POST_W) / 2, y + r * 0.8, r * POST_W, r * POST_H)
      .fillStyle(FACE, 1)
      .fillCircle(x, y, r)
      .lineStyle(line, INK, 1);
    for (let i = 1; i <= RINGS; i++) this.face.strokeCircle(x, y, (r * i) / RINGS);
    this.face.fillStyle(BULL, 1).fillCircle(x, y, r / RINGS / 2);
    this.surface = new MarkSurface(
      scene,
      {
        width: r * HOLES_EXTENT * 2,
        height: r * HOLES_EXTENT * 2,
        centreX: 0.5,
        centreY: 0.5,
        r,
        maxScreenScale,
        look: 'paper',
      },
      null,
    );
    this.surface.image.setPosition(x, y);
    this.newest = scene.add.graphics();
    this.flash = scene.add.graphics();
    this.flash.setVisible(false);
    layer.add([this.face, this.surface.image, this.newest, this.flash]);
  }

  /** Bakes new holes, picks the bake's level for the zoom, highlights the newest briefly. */
  update(f: TargetFrame): void {
    this.surface.sync(f.marks, f.epoch);
    this.surface.pick(f.screenScale);
    const lit = newestLit(f.marks, f.visit, f.tick);
    const age = lit === null ? 0 : f.tick - lit.tick;
    const fade = lit === null ? 0 : Math.min(1, ((NEWEST_TICKS - age) / NEWEST_TICKS) * 3);
    const step = Math.round(fade * 8) / 8;
    if (lit === this.lit && step === this.litFade) return;
    this.lit = lit;
    this.litFade = step;
    this.newest.clear();
    const { x, y, r } = this.paper;
    if (lit !== null && step > 0) drawNewest(this.newest, 'paper', x, y, r, lit, step);
  }

  /** The sim says a pellet struck this paper: the face blinks once. */
  blink(reduced: boolean): void {
    const { x, y, r } = this.paper;
    this.flash
      .clear()
      .fillStyle(BLINK, reduced ? BLINK_ALPHA_REDUCED : BLINK_ALPHA)
      .fillCircle(x, y, r)
      .setVisible(true);
    this.blinkLeft = BLINK_MS;
    this.blinks++;
  }

  tick(dtMs: number): void {
    if (this.blinkLeft <= 0) return;
    this.blinkLeft -= dtMs;
    if (this.blinkLeft <= 0) this.flash.setVisible(false);
  }

  destroy(): void {
    this.face.destroy();
    this.surface.destroy();
    this.newest.destroy();
    this.flash.destroy();
  }
}
