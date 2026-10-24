// v1.3x (D-037) Skietbaan paper targets: the face on its post, and the newest impacts on it.
// Drawn on the plane's overlay layer in plane coordinates, so it pans and zooms with the world
// (a raised scope magnifies the holes too). Rendering only: hits come from the sim.
import * as Phaser from 'phaser';
import type { PaperView } from '../../sim/types';
import type { Impact } from './rangeStats';

// Rendering only (D-037): colours of the face and rings, and sizes as fractions of the radius.
const FACE = 0xf3ead3;
const INK = 0x1b1410;
const BULL = 0xc8302a;
const POST = 0x6b4a2b;
const HOLE = 0x1b1410;
const NEWEST = 0xffd25a;
const RINGS = 4;
const POST_W = 0.14;
const POST_H = 1.2;
const HOLE_R = 0.045;
const MIN_HOLE_PX = 1;

export class PaperDraw {
  private readonly face: Phaser.GameObjects.Graphics;
  private readonly holes: Phaser.GameObjects.Graphics;
  private drawn = '';
  /** Impacts drawn now (the test hook reads it). */
  count = 0;

  constructor(
    scene: Phaser.Scene,
    layer: Phaser.GameObjects.Container,
    private readonly paper: PaperView,
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
    this.holes = scene.add.graphics();
    layer.add([this.face, this.holes]);
  }

  /** Draws the impacts (redrawn only when they changed). */
  update(impacts: readonly Impact[]): void {
    const last = impacts.at(-1);
    const key = `${String(impacts.length)}:${String(last?.x)}:${String(last?.y)}`;
    if (key === this.drawn) return;
    this.drawn = key;
    const r = Math.max(MIN_HOLE_PX, this.paper.r * HOLE_R);
    this.holes.clear();
    // Only holes on this paper (impacts are on the paper by construction; guard all the same).
    const on = impacts.filter(
      (i) => Math.hypot(i.x - this.paper.x, i.y - this.paper.y) <= this.paper.r + r,
    );
    on.forEach((i, n) => {
      const newest = n === on.length - 1;
      this.holes.fillStyle(newest ? NEWEST : HOLE, 1).fillCircle(i.x, i.y, newest ? r * 1.4 : r);
    });
    this.count = on.length;
  }

  destroy(): void {
    this.face.destroy();
    this.holes.destroy();
  }
}
