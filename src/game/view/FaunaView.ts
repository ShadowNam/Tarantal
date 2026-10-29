// D-054: the far animals on one parallax layer. Each herd's sheet (one texture, frames from the
// asset index) gives every animal its parts: tail, body, head (with the neck) and an elephant's
// ear, each an image whose origin is its pivot, so the head dips, the tail swishes and the ear
// fans by rotating or squeezing about it (faunaIdle, on sim time: a held frame holds still).
// Animals are drawn back to front; a herd facing left is mirrored about each pivot. Nothing is
// cropped (the layer's zoom culling leaves these alone) and nothing is hit-tested.
import type Phaser from 'phaser';
import type { AssetManifest } from '../assets/AssetManifest';
import type { FaunaProbe } from '../GameContext';
import {
  animalSeed,
  drawOrder,
  FAUNA_BEFORE,
  FAUNA_PARTS,
  faunaIdle,
  frameName,
  lookOf,
  placePart,
  sheetOf,
  spaceHerd,
  type FaunaFrames,
  type FaunaHerd,
  type FaunaIdle,
  type FaunaIdleTuning,
  type FaunaPart,
  type HerdAnimal,
} from './faunaHerds';

/** e2e/dev only (?fauna=before): where the v1.9.0 herd images are served (vite.config.ts). */
const BEFORE_URL = '__fauna-before/';
/** The v1.9.0 art: 3 texture px per drawn px, the feet 6 drawn px above the image's bottom. */
const BEFORE_MASTER = 3;
const BEFORE_FOOT = 6;

interface Part {
  readonly img: Phaser.GameObjects.Image;
  readonly part: FaunaPart;
  readonly animal: Animal;
  readonly sheet: string;
  readonly frame: string;
  readonly sx: number;
  readonly sy: number;
}

/** An animal and what its pose needs every frame (its seed is worked out once). */
interface Animal {
  readonly a: HerdAnimal & { readonly seed: number };
  readonly herd: string;
  readonly index: number;
  pose: FaunaIdle;
}

interface Herd {
  readonly root: Phaser.GameObjects.Container;
  /** The herd's x extent in its own frame (design px), for culling. */
  x0: number;
  x1: number;
  readonly animals: Animal[];
}

export interface FaunaOptions {
  readonly idle: FaunaIdleTuning;
  readonly ticksPerSecond: number;
  /** e2e/dev only: the v1.9.0 images instead (no motion). */
  readonly before?: boolean;
  /** e2e/dev only: every part's frame outlined. */
  readonly debug?: boolean;
  /** e2e/dev only (?faunaIdle=0): every animal held at its rest pose (no idle motion), so herd
   *  bounds compare across runs sampled at different ticks. */
  readonly still?: boolean;
}

/** Off-screen margin (design px) before a herd stops being posed. */
const CULL_MARGIN = 200;
/** Retry interval (frames) while a herd's sheet is still loading. */
const RETRY_FRAMES = 30;
const REST: FaunaIdle = { head: 0, tail: 0, ear: 1 };

/**
 * An image's on-screen box from its real world transform (Phaser's getBounds() uses |scaleX| and
 * the unflipped origin, so a mirrored part's box landed on the wrong side of its pivot).
 */
export function drawnBox(img: Phaser.GameObjects.Image): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const m = img.getWorldTransformMatrix();
  const x0 = -img.displayOriginX;
  const y0 = -img.displayOriginY;
  const x1 = x0 + img.frame.cutWidth / img.frame.source.resolution;
  const y1 = y0 + img.frame.cutHeight / img.frame.source.resolution;
  const pts = [
    [x0, y0],
    [x1, y0],
    [x0, y1],
    [x1, y1],
  ].map(([x, y]) => m.transformPoint(x ?? 0, y ?? 0));
  const xs = pts.map((q) => q.x);
  const ys = pts.map((q) => q.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { x: left, y: top, w: Math.max(...xs) - left, h: Math.max(...ys) - top };
}

export class FaunaView {
  private readonly parts: Part[] = [];
  private readonly herdViews = new Map<string, Herd>();
  private readonly roots = new Map<string, Phaser.GameObjects.Container>();
  /** The manifest's hdEpoch the parts' frames were cut for (-1: none built yet). */
  private epoch = -1;
  private built = false;
  private lastTick = -1;
  private lastCalm = false;
  private waits = 0;
  private debugGfx: Phaser.GameObjects.Graphics | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly manifest: AssetManifest,
    private readonly herds: readonly FaunaHerd[],
    /** Layer x of u = 1 (the layer's core width). */
    private readonly core: number,
    private readonly parent: Phaser.GameObjects.Container,
    private readonly o: FaunaOptions,
  ) {
    if (o.before === true) this.loadBefore();
    else this.build();
  }

  /** Herd containers are made once (fixed spots); their animals once the sheets are in. */
  private rootOf(h: FaunaHerd): Phaser.GameObjects.Container {
    let r = this.roots.get(h.key);
    if (r === undefined) {
      r = this.scene.add.container(h.u * this.core, h.y);
      this.parent.add(r);
      this.roots.set(h.key, r);
    }
    return r;
  }

  /** Adds a sheet's frames to its texture (texture px = design px / display scale). */
  private cut(key: string, frames: FaunaFrames): boolean {
    const textures = this.scene.textures;
    if (!textures.exists(key)) return false;
    const tex = textures.get(key);
    const k = 1 / this.manifest.displayScale(key);
    for (const [name, f] of Object.entries(frames)) {
      if (tex.has(name)) continue;
      tex.add(name, 0, f[0] * k, f[1] * k, f[2] * k, f[3] * k);
    }
    return true;
  }

  /** Builds every herd whose sheet has arrived (a late sheet may come during the hunt). */
  private build(): void {
    let all = true;
    let added = false;
    for (const h of this.herds) {
      if (this.herdViews.has(h.key)) continue;
      const key = sheetOf(h);
      const frames = this.manifest.faunaFrames(key);
      // A late or Ver sheet lands after the hunt starts: swap its empty placeholder out first.
      if (frames !== undefined && !this.manifest.delivered(this.scene.textures, key))
        this.manifest.upgrade(this.scene.textures, key);
      if (
        frames === undefined ||
        !this.manifest.delivered(this.scene.textures, key) ||
        !this.cut(key, frames)
      ) {
        all = false;
        continue;
      }
      const root = this.rootOf(h);
      const ds = this.manifest.displayScale(key);
      const view: Herd = { root, x0: Infinity, x1: -Infinity, animals: [] };
      // Spread from the frames' real sizes: no head crosses another (D-054).
      const spaced = spaceHerd(h.animals, (a, part) => frames[frameName(lookOf(a), part)]);
      for (const a of drawOrder(spaced)) {
        const animal: Animal = {
          a: { ...a, seed: animalSeed(h.animals[spaced.indexOf(a)] ?? a) },
          herd: h.key,
          index: spaced.indexOf(a),
          pose: REST,
        };
        view.animals.push(animal);
        for (const part of FAUNA_PARTS) {
          const name = frameName(lookOf(a), part);
          const f = frames[name];
          if (f === undefined) continue;
          const p = placePart(a, f);
          const img = this.scene.add
            .image(p.x, p.y, key, name)
            .setOrigin(f[4] / f[2], f[5] / f[3])
            .setScale(p.sx * ds, p.sy * ds);
          root.add(img);
          this.parts.push({ img, part, animal, sheet: key, frame: name, sx: p.sx, sy: p.sy });
          // The frame's reach from the pivot, either way (mirrored herds).
          const reach = Math.max(f[4], f[2] - f[4]) * a.s;
          view.x0 = Math.min(view.x0, p.x - reach);
          view.x1 = Math.max(view.x1, p.x + reach);
          added = true;
        }
      }
      this.herdViews.set(h.key, view);
    }
    if (added) {
      // New parts start in their rest pose: pose them on the next update even on a held tick.
      this.lastTick = -1;
      if (this.epoch < 0) this.epoch = this.manifest.hdEpoch;
    }
    this.built = all;
  }
  /** e2e/dev only: the v1.9.0 herds, one image each (served next to the build, never shipped). */
  private loadBefore(): void {
    // Plain image loads (not the scene's loader, which may be busy with the area's files and
    // then never report this batch complete: the Okavango spec waited for ever).
    for (const h of this.herds) {
      const b = FAUNA_BEFORE[h.key];
      if (b === undefined) continue;
      const key = `${h.key}#before`;
      const place = (): void => {
        if (!this.scene.sys.isActive() && !this.scene.sys.isVisible()) return;
        // v1.9.0 showed the herds at 3× their drawn size (the waterhole at 1×).
        const shown = h.layer === 'ver_veld' ? 1 / BEFORE_MASTER : 1;
        this.rootOf(h).add(
          this.scene.add
            .image(0, 0, key)
            .setOrigin(0.5, (b.h - BEFORE_FOOT) / b.h)
            .setScale(shown),
        );
      };
      if (this.scene.textures.exists(key)) {
        place();
        continue;
      }
      const img = new Image();
      img.onload = () => {
        if (!this.scene.textures.exists(key)) this.scene.textures.addImage(key, img);
        place();
      };
      img.onerror = () => {
        console.warn(`[fauna] no before image for ${h.key}`);
      };
      img.src = `${BEFORE_URL}${h.key.replace('fauna/', '')}.png`;
    }
    this.built = true;
  }

  /**
   * Builds herds whose sheets came in late and moves every part onto the texture under its key
   * now (after an HD swap): every frame, during hunts and between them (the title's herds).
   * The epoch is checked before building, so a swap that lands with a build never goes unseen.
   */
  refresh(now = false): void {
    if (this.o.before === true) return;
    if (this.epoch >= 0 && this.manifest.hdEpoch !== this.epoch) this.retexture();
    if (!this.built && (now || ++this.waits % RETRY_FRAMES === 0)) this.build();
  }

  /**
   * Per frame in a hunt: refresh(), then poses heads, tails and ears for sim tick `tick`
   * (`calm`: reduce motion) on the herds within `view` (design px across the screen).
   */
  update(tick: number, calm: boolean, viewWidth = Infinity): void {
    if (this.o.before === true) return;
    this.refresh();
    if (tick === this.lastTick && calm === this.lastCalm) {
      this.drawDebug();
      return;
    }
    this.lastTick = tick;
    this.lastCalm = calm;
    const live = new Set<Animal>();
    for (const h of this.herdViews.values()) {
      const m = h.root.getWorldTransformMatrix();
      // v1.7d (D-059): a roaming herd's holder may be mirrored (a < 0).
      const left = m.tx + Math.min(m.a * h.x0, m.a * h.x1);
      const right = m.tx + Math.max(m.a * h.x0, m.a * h.x1);
      const on = right >= -CULL_MARGIN && left <= viewWidth + CULL_MARGIN;
      if (!on) continue;
      for (const an of h.animals) {
        an.pose =
          this.o.still === true
            ? REST
            : faunaIdle(tick, an.a, this.o.idle, calm, this.o.ticksPerSecond);
        live.add(an);
      }
    }
    for (const p of this.parts) {
      if (p.part === 'body' || !live.has(p.animal)) continue;
      const m = p.animal.pose;
      const f = p.animal.a.facing;
      if (p.part === 'head') p.img.setAngle(f * m.head);
      else if (p.part === 'tail') p.img.setAngle(f * m.tail);
      else {
        const ds = this.manifest.displayScale(p.sheet);
        p.img.setScale(p.sx * ds * m.ear, p.sy * ds);
      }
    }
    this.drawDebug();
  }

  /** e2e/dev only: each part's frame outlined (tail yellow, body magenta, head cyan, ear green). */
  private drawDebug(): void {
    if (this.o.debug !== true) return;
    const g = (this.debugGfx ??= this.scene.add.graphics());
    this.parent.add(g);
    g.clear();
    const colour: Readonly<Record<FaunaPart, number>> = {
      tail: 0xffee00,
      body: 0xff00ff,
      head: 0x00ffff,
      ear: 0x00ff00,
    };
    const pm = this.parent.getWorldTransformMatrix();
    for (const p of this.parts) {
      const b = drawnBox(p.img);
      g.lineStyle(1, colour[p.part], 1);
      // Boxes are in world px; the graphics sits in the layer's frame.
      g.strokeRect((b.x - pm.tx) / pm.a, (b.y - pm.ty) / pm.d, b.w / pm.a, b.h / pm.d);
    }
  }

  /** D-053: the sheet under a key changed (HD in, or back to Standard): same frames, new pixels. */
  private retexture(): void {
    this.epoch = this.manifest.hdEpoch;
    const done = new Set<string>();
    for (const p of this.parts) {
      if (!done.has(p.sheet)) {
        const frames = this.manifest.faunaFrames(p.sheet);
        if (frames !== undefined) this.cut(p.sheet, frames);
        done.add(p.sheet);
      }
      const ds = this.manifest.displayScale(p.sheet);
      p.img.setTexture(p.sheet, p.frame).setScale(p.sx * ds, p.sy * ds);
    }
    this.lastTick = -1;
  }

  /** Test hook: each herd's on-screen box (design px) and whether it draws HD art. */
  bounds(): { key: string; x: number; y: number; w: number; h: number; hd: boolean }[] {
    const out: { key: string; x: number; y: number; w: number; h: number; hd: boolean }[] = [];
    for (const [key, root] of this.roots) {
      if (root.length === 0) continue;
      const first = root.list[0] as Phaser.GameObjects.Image | undefined;
      // The union of the parts' real boxes (a before-image has no parts: its own box).
      const boxes = this.parts.filter((p) => p.animal.herd === key).map((p) => drawnBox(p.img));
      if (boxes.length === 0 && first !== undefined) boxes.push(drawnBox(first));
      if (boxes.length === 0) continue;
      const x0 = Math.min(...boxes.map((b) => b.x));
      const y0 = Math.min(...boxes.map((b) => b.y));
      const x1 = Math.max(...boxes.map((b) => b.x + b.w));
      const y1 = Math.max(...boxes.map((b) => b.y + b.h));
      out.push({
        key,
        x: Math.round(x0),
        y: Math.round(y0),
        w: Math.round(x1 - x0),
        h: Math.round(y1 - y0),
        hd: first !== undefined && this.manifest.displayScale(first.texture.key) < 1,
      });
    }
    return out;
  }

  /** Test hook: every part as drawn (on-screen box, frame cut, source size). */
  probe(): FaunaProbe[] {
    return this.parts.map((p) => {
      const b = drawnBox(p.img);
      const f = p.img.frame;
      const src = p.img.texture.source[0];
      return {
        herd: p.animal.herd,
        animal: p.animal.index,
        part: p.part,
        frame: f.name,
        box: b,
        cut: { x: f.cutX, y: f.cutY, w: f.cutWidth, h: f.cutHeight },
        origin: { x: p.img.originX, y: p.img.originY },
        scale: { x: p.img.scaleX, y: p.img.scaleY },
        angle: p.img.angle,
        source: { w: src?.width ?? 0, h: src?.height ?? 0 },
      };
    });
  }

  /** v1.7d (D-059): shows or hides one herd (Namibië's roaming oryx replace the far gemsbok). */
  setHerdVisible(key: string, on: boolean): void {
    this.roots.get(key)?.setVisible(on);
  }

  /** Test hook: animals drawn now. */
  animalCount(): number {
    return [...this.herdViews.values()].reduce((n, h) => n + h.animals.length, 0);
  }
}
