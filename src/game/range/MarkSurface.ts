// Skietbaan gongs (D-040): a target's hit marks (and, for a plate, its painted face) baked into
// textures, so drawing hundreds of marks costs one image per frame on phones. Rendering only.
//
// Crisp at every zoom: the targets sit on planes scaled from 1 (near) down to 0.1 (Ver), and a
// scope magnifies them up to 9×. One texture can't be sharp at both ends without mipmaps, which
// Phaser 4 only switches on game-wide (every power-of-two texture would change). So each surface
// keeps a small chain of its own: level 0 sized for the strongest scope (capped), each next level
// half of the one before (a 2×2 box filter, like a mipmap level), and the image shows the level
// that is at least one texel per screen pixel at the current zoom. Every level filters LINEAR,
// even on the low quality tier (its antialias-off default would be NEAREST: blocky in a scope).
import * as Phaser from 'phaser';
import { markShape, type Mark } from './rangeMarks';

/** Largest level-0 side (texels): ~1 MB of GPU memory per target at most. */
const MAX_SIDE = 512;
/** Smallest level side worth keeping. */
const MIN_SIDE = 16;

/** How a mark looks on paper and on steel (rendering only). */
const STEEL = {
  splash: 0xb3b9bf,
  edge: 0xdfe3e6,
  core: 0x5b6167,
  fleck: 0x9ea5ab,
  newest: 0xfff1b8,
} as const;
const PAPER = {
  splash: 0x6a5c50,
  edge: 0x8f8276,
  core: 0x1b1410,
  fleck: 0x4a3d33,
  newest: 0xffd25a,
} as const;
export type MarkLook = 'steel' | 'paper';

let serial = 0;

/** Fills a star polygon (unit points) at (x0, y0), `k` px per unit. */
function fillStar(
  gfx: Phaser.GameObjects.Graphics,
  pts: readonly (readonly [number, number])[],
  x0: number,
  y0: number,
  k: number,
): void {
  gfx.beginPath();
  pts.forEach(([x, y], i) => {
    if (i === 0) gfx.moveTo(x0 + x * k, y0 + y * k);
    else gfx.lineTo(x0 + x * k, y0 + y * k);
  });
  gfx.closePath();
  gfx.fillPath();
}

/** Draws one mark into a Graphics: centre (cx, cy), `unit` px per target radius. */
export function drawMark(
  gfx: Phaser.GameObjects.Graphics,
  look: MarkLook,
  cx: number,
  cy: number,
  unit: number,
  m: Mark,
): void {
  const c = look === 'steel' ? STEEL : PAPER;
  const s = markShape(m.seed);
  const r = m.size * unit;
  const x0 = cx + m.u * unit;
  const y0 = cy + m.v * unit;
  if (look === 'steel') {
    // Spatter flecks, the silver-grey star where the paint flaked off, its lit rim, the lead.
    gfx.fillStyle(c.fleck, 0.85);
    for (const f of s.flecks) gfx.fillCircle(x0 + f.x * r, y0 + f.y * r, Math.max(0.35, f.r * r));
    gfx.fillStyle(c.edge, 1);
    fillStar(gfx, s.star, x0, y0, r * 1.08);
    gfx.fillStyle(c.splash, 1);
    fillStar(gfx, s.star, x0, y0, r);
    gfx.fillStyle(c.core, 1);
    gfx.fillCircle(x0 + s.coreX * r, y0 + s.coreY * r, Math.max(0.4, s.core * r));
  } else {
    // A punched hole: a faint grey ring of torn fibre, then the dark hole itself.
    gfx.fillStyle(c.edge, 0.45);
    gfx.fillCircle(x0, y0, r * 1.25);
    gfx.fillStyle(c.core, 1);
    fillStar(gfx, s.star, x0, y0, r * 0.9);
  }
}

/** The newest mark's highlight: a soft ring around it (drawn live, not baked). */
export function drawNewest(
  gfx: Phaser.GameObjects.Graphics,
  look: MarkLook,
  cx: number,
  cy: number,
  unit: number,
  m: Mark,
  fade: number,
): void {
  const c = look === 'steel' ? STEEL : PAPER;
  const r = m.size * unit;
  const x = cx + m.u * unit;
  const y = cy + m.v * unit;
  if (look === 'paper') {
    gfx.fillStyle(c.newest, 0.9 * fade).fillCircle(x, y, r * 1.4);
    return;
  }
  gfx
    .lineStyle(Math.max(0.5, r * 0.35), c.newest, 0.9 * fade)
    .strokeCircle(x, y, r * 1.45)
    .fillStyle(0xffffff, 0.55 * fade)
    .fillCircle(x, y, r * 0.75);
}

/** What a target (plate or paper) shows this frame. */
export interface TargetFrame {
  /** The view's sim tick (held while the range is held). */
  readonly tick: number;
  readonly marks: readonly Mark[];
  readonly epoch: number;
  /** The range session now (only its newest mark is highlighted). */
  readonly visit: number;
  /** Screen px per plane px now (plane zoom × render scale). */
  readonly screenScale: number;
}

/** Where a surface sits (target-relative) and what it covers. */
export interface SurfaceSpec {
  /** Covered size in plane px. */
  readonly width: number;
  readonly height: number;
  /** The target's centre inside it (fractions of width/height). */
  readonly centreX: number;
  readonly centreY: number;
  /** Plane px per target radius. */
  readonly r: number;
  /** Screen px per plane px at the strongest scope (zoom × render scale). */
  readonly maxScreenScale: number;
  readonly look: MarkLook;
}

/**
 * A target's baked marks: an Image showing one level of the chain. `base` (a plate's face)
 * is drawn under the marks at level 0 on every full bake.
 */
export class MarkSurface {
  readonly image: Phaser.GameObjects.Image;
  private readonly levels: Phaser.Textures.DynamicTexture[] = [];
  private readonly gfx: Phaser.GameObjects.Graphics;
  private shown = -1;
  /** Marks baked now (the test hook reads it). */
  drawn = 0;
  /** Store epoch of what is baked (a change means re-bake from scratch). */
  private epoch = -1;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly spec: SurfaceSpec,
    private readonly base: ((dt: Phaser.Textures.DynamicTexture, scale: number) => void) | null,
  ) {
    const big = Math.max(spec.width, spec.height);
    const s0 = Math.min(spec.maxScreenScale, MAX_SIDE / big);
    let w = even(spec.width * s0);
    let h = even(spec.height * s0);
    const id = ++serial;
    for (let i = 0; ; i++) {
      const dt = scene.textures.addDynamicTexture(`range/marks/${String(id)}/${String(i)}`, w, h);
      if (dt === null) break;
      dt.setFilter(Phaser.Textures.FilterMode.LINEAR);
      this.levels.push(dt);
      if (Math.max(w, h) / 2 < MIN_SIDE) break;
      w = even(w / 2);
      h = even(h / 2);
    }
    this.gfx = scene.make.graphics({}, false);
    const top = this.levels[0];
    this.image = scene.add.image(0, 0, top?.key ?? '__MISSING');
    this.image.setOrigin(spec.centreX, spec.centreY);
    this.show(0);
    scene.renderer.on(Phaser.Renderer.Events.RESTORE_WEBGL, this.restored);
  }

  /** The WebGL context came back: framebuffers are empty, so bake everything again. */
  private readonly restored = (): void => {
    this.epoch = -1;
  };

  /** Level 0's texels per plane px. */
  private get scale0(): number {
    const top = this.levels[0];
    return top === undefined ? 1 : top.width / this.spec.width;
  }

  /**
   * Brings the bake up to date with the store's marks: appends new ones, or re-bakes from
   * scratch when the epoch changed (Repaint, a trim past the cap, a context restore, the face
   * art arriving).
   */
  sync(marks: readonly Mark[], epoch: number): void {
    const top = this.levels[0];
    if (top === undefined) return;
    const full = epoch !== this.epoch || marks.length < this.drawn;
    if (!full && marks.length === this.drawn) return;
    const k = this.scale0;
    const cx = this.spec.centreX * top.width;
    const cy = this.spec.centreY * top.height;
    const unit = this.spec.r * k;
    if (full) {
      top.clear();
      if (this.base !== null) this.base(top, k);
      this.drawn = 0;
    }
    this.gfx.clear();
    for (let i = this.drawn; i < marks.length; i++) {
      const m = marks[i];
      if (m !== undefined) drawMark(this.gfx, this.spec.look, cx, cy, unit, m);
    }
    top.draw(this.gfx);
    top.render();
    this.gfx.clear();
    // Every smaller level from the one above it (each a half-size box filter).
    for (let i = 1; i < this.levels.length; i++) {
      const up = this.levels[i - 1];
      const dt = this.levels[i];
      if (up === undefined || dt === undefined) continue;
      dt.clear();
      dt.stamp(up.key, undefined, 0, 0, {
        originX: 0,
        originY: 0,
        scaleX: dt.width / up.width,
        scaleY: dt.height / up.height,
      });
      dt.render();
    }
    this.drawn = marks.length;
    this.epoch = epoch;
  }

  /** Forces a full re-bake on the next sync (the face art arrived). */
  invalidate(): void {
    this.epoch = -1;
  }

  /** Shows the level for `screenScale` screen px per plane px (call each frame). */
  pick(screenScale: number): void {
    const need = Math.max(this.spec.width, this.spec.height) * screenScale;
    let pick = 0;
    for (let i = 1; i < this.levels.length; i++) {
      const dt = this.levels[i];
      if (dt === undefined || Math.max(dt.width, dt.height) < need) break;
      pick = i;
    }
    this.show(pick);
  }

  /** The level shown now (the test hook and tests read it). */
  get level(): number {
    return this.shown;
  }

  private show(i: number): void {
    const dt = this.levels[i];
    if (dt === undefined || i === this.shown) return;
    this.shown = i;
    this.image.setTexture(dt.key);
    this.image.setScale(this.spec.width / dt.width, this.spec.height / dt.height);
  }

  destroy(): void {
    this.scene.renderer.off(Phaser.Renderer.Events.RESTORE_WEBGL, this.restored);
    this.image.destroy();
    this.gfx.destroy();
    for (const dt of this.levels) dt.destroy();
    this.levels.length = 0;
  }
}

function even(n: number): number {
  return Math.max(2, Math.ceil(n / 2) * 2);
}
