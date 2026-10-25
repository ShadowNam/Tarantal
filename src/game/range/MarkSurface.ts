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

/** Largest level-0 side (texels): a near plate is ~240 plane px, so this keeps it near 1:1 at a
 *  4× scope (≤ 4 MB for level 0, ~5.3 MB with the chain; far and Ver targets are far smaller). */
const MAX_SIDE = 1024;
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

/**
 * Bake work across every surface (the test hook and the bench read it): textures made and
 * destroyed, render passes, and the time the last sync spent baking.
 */
export const bakeStats = {
  /** DynamicTextures created / destroyed (live = created − destroyed). */
  created: 0,
  destroyed: 0,
  /** DynamicTexture render() calls (one per level baked). */
  renders: 0,
  /** Marks drawn into level 0. */
  marks: 0,
  /** Wall-clock ms of the last sync that baked anything. */
  lastBakeMs: 0,
};

/** At most this many marks are drawn into a surface per frame (a full re-bake spreads out). */
export const MARKS_PER_FRAME = 120;

/** The bake's texture API (a Phaser DynamicTexture; tests pass a fake). */
export type BakeTexture = Pick<
  Phaser.Textures.DynamicTexture,
  'key' | 'width' | 'height' | 'clear' | 'draw' | 'stamp' | 'render' | 'destroy' | 'setFilter'
>;

/** Wall clock for lastBakeMs (performance where there is one). */
const now = (): number => (typeof performance === 'undefined' ? Date.now() : performance.now());

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
  /** Level textures, made on first need (null = not made yet). */
  private readonly levels: (BakeTexture | null)[] = [];
  /** Each level's size (all known up front; only level 0 is made at once). */
  private readonly sizes: { readonly w: number; readonly h: number }[] = [];
  /** Bake version of each level's content (level 0's is the truth). */
  private readonly versions: number[] = [];
  private version = 0;
  private readonly id = ++serial;
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
    for (;;) {
      this.sizes.push({ w, h });
      this.levels.push(null);
      this.versions.push(-1);
      if (Math.max(w, h) / 2 < MIN_SIDE) break;
      w = even(w / 2);
      h = even(h / 2);
    }
    this.gfx = scene.make.graphics({}, false);
    const top = this.texture(0);
    this.image = scene.add.image(0, 0, top?.key ?? '__MISSING');
    this.image.setOrigin(spec.centreX, spec.centreY);
    this.show(0);
    scene.renderer.on(Phaser.Renderer.Events.RESTORE_WEBGL, this.restored);
  }

  /** The WebGL context came back: framebuffers are empty, so bake everything again. */
  private readonly restored = (): void => {
    this.epoch = -1;
  };

  /** Level `i`'s texture, made on its first use (null if the renderer can't). */
  private texture(i: number): BakeTexture | null {
    const have = this.levels[i];
    if (have !== null && have !== undefined) return have;
    const size = this.sizes[i];
    if (size === undefined) return null;
    const dt = this.scene.textures.addDynamicTexture(
      `range/marks/${String(this.id)}/${String(i)}`,
      size.w,
      size.h,
    );
    if (dt === null) return null;
    dt.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.levels[i] = dt;
    bakeStats.created++;
    return dt;
  }

  /** Levels made so far (the bench reads it). */
  get made(): number {
    return this.levels.filter((l) => l !== null).length;
  }

  /** Level 0's texels per plane px. */
  private get scale0(): number {
    const top = this.levels[0];
    return top === null || top === undefined ? 1 : top.width / this.spec.width;
  }

  /**
   * Brings the bake up to date with the store's marks: appends new ones, or re-bakes from
   * scratch when the epoch changed (Repaint, a trim past the cap, a context restore, the face
   * art arriving).
   */
  sync(marks: readonly Mark[], epoch: number): void {
    const top = this.texture(0);
    if (top === null) return;
    const full = epoch !== this.epoch || marks.length < this.drawn;
    if (!full && marks.length === this.drawn) return;
    const t0 = now();
    const k = this.scale0;
    const cx = this.spec.centreX * top.width;
    const cy = this.spec.centreY * top.height;
    const unit = this.spec.r * k;
    if (full) {
      top.clear();
      if (this.base !== null) this.base(top as Phaser.Textures.DynamicTexture, k);
      this.drawn = 0;
    }
    // Only new marks are drawn (appended over the bake), at most MARKS_PER_FRAME a frame: a
    // re-bake of hundreds of marks spreads over a few frames instead of stalling one.
    const end = Math.min(marks.length, this.drawn + MARKS_PER_FRAME);
    this.gfx.clear();
    for (let i = this.drawn; i < end; i++) {
      const m = marks[i];
      if (m !== undefined) drawMark(this.gfx, this.spec.look, cx, cy, unit, m);
    }
    top.draw(this.gfx);
    top.render();
    bakeStats.renders++;
    bakeStats.marks += end - this.drawn;
    this.gfx.clear();
    this.drawn = end;
    this.epoch = epoch;
    this.versions[0] = ++this.version;
    // The smaller levels are rebuilt only when shown (pick), never all of them on every hit.
    this.refresh(this.shown);
    bakeStats.lastBakeMs = now() - t0;
  }

  /**
   * Brings levels 1…`upTo` up to date with level 0, each from the one above it (a half-size box
   * filter, like a mipmap level); a level already current is skipped, so each is built once
   * per bake.
   */
  private refresh(upTo: number): void {
    for (let i = 1; i <= upTo; i++) {
      if (this.versions[i] === this.version) continue;
      const up = this.levels[i - 1];
      const dt = this.texture(i);
      if (up === null || up === undefined || dt === null) return;
      dt.clear();
      dt.stamp(up.key, undefined, 0, 0, {
        originX: 0,
        originY: 0,
        scaleX: dt.width / up.width,
        scaleY: dt.height / up.height,
      });
      dt.render();
      bakeStats.renders++;
      this.versions[i] = this.version;
    }
  }

  /** Forces a full re-bake on the next sync (the face art arrived). */
  invalidate(): void {
    this.epoch = -1;
  }

  /** Shows the level for `screenScale` screen px per plane px (call each frame). */
  pick(screenScale: number): void {
    const need = Math.max(this.spec.width, this.spec.height) * screenScale;
    let pick = 0;
    for (let i = 1; i < this.sizes.length; i++) {
      const size = this.sizes[i];
      if (size === undefined || Math.max(size.w, size.h) < need) break;
      pick = i;
    }
    if (pick !== this.shown) this.refresh(pick);
    this.show(pick);
  }

  /** The level shown now (the test hook and tests read it). */
  get level(): number {
    return this.shown;
  }

  private show(i: number): void {
    if (i === this.shown) return;
    const dt = this.texture(i);
    if (dt === null) return;
    this.shown = i;
    this.image.setTexture(dt.key);
    // One uniform scale (from the width): each level's sides are rounded to even texels on their
    // own, so a per-axis scale would differ by a hair, and under the rotated swing container the
    // image's matrix would carry a slight skew. Uniform keeps it a plain rotation of a quad; the
    // height is then within a texel of spec.height.
    this.image.setScale(this.spec.width / dt.width);
  }

  destroy(): void {
    this.scene.renderer.off(Phaser.Renderer.Events.RESTORE_WEBGL, this.restored);
    this.image.destroy();
    this.gfx.destroy();
    for (const dt of this.levels)
      if (dt !== null) {
        dt.destroy();
        bakeStats.destroyed++;
      }
    this.levels.length = 0;
  }
}

function even(n: number): number {
  return Math.max(2, Math.ceil(n / 2) * 2);
}
