// D-054: the far animals on one parallax layer. Each herd's sheet (one texture, frames from the
// asset index) gives every animal its parts: tail, body, head (with the neck) and an elephant's
// ear, each an image whose origin is its pivot, so the head dips, the tail swishes and the ear
// fans by rotating or squeezing about it (faunaIdle, on sim time: a held frame holds still).
// Animals are drawn back to front; a herd facing left is mirrored about each pivot. Nothing is
// cropped (the layer's zoom culling leaves these alone) and nothing is hit-tested.
import type Phaser from 'phaser';
import type { AssetManifest } from '../assets/AssetManifest';
import {
  drawOrder,
  FAUNA_BEFORE,
  FAUNA_PARTS,
  faunaIdle,
  frameName,
  lookOf,
  placePart,
  sheetOf,
  type FaunaFrames,
  type FaunaHerd,
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
  readonly animal: HerdAnimal;
  readonly sheet: string;
  readonly frame: string;
  readonly sx: number;
  readonly sy: number;
}

export interface FaunaOptions {
  readonly idle: FaunaIdleTuning;
  readonly ticksPerSecond: number;
  /** e2e/dev only: the v1.9.0 images instead (no motion). */
  readonly before?: boolean;
}

export class FaunaView {
  private readonly parts: Part[] = [];
  private readonly roots = new Map<string, Phaser.GameObjects.Container>();
  /** The manifest's hdEpoch the frames were cut for. */
  private epoch = -1;
  private built = false;
  private lastTick = -1;
  private lastCalm = false;
  private waits = 0;

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
    for (const h of this.herds) {
      if (this.roots.get(h.key)?.length) continue;
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
      for (const a of drawOrder(h.animals)) {
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
          this.parts.push({ img, part, animal: a, sheet: key, frame: name, sx: p.sx, sy: p.sy });
        }
      }
    }
    this.epoch = this.manifest.hdEpoch;
    this.built = all;
  }

  /** e2e/dev only: the v1.9.0 herds, one image each (served next to the build, never shipped). */
  private loadBefore(): void {
    const load = this.scene.load;
    for (const h of this.herds) {
      const b = FAUNA_BEFORE[h.key];
      if (b === undefined) continue;
      const key = `${h.key}#before`;
      if (!this.scene.textures.exists(key))
        load.image(key, `${BEFORE_URL}${h.key.replace('fauna/', '')}.png`);
    }
    const place = (): void => {
      for (const h of this.herds) {
        const b = FAUNA_BEFORE[h.key];
        const key = `${h.key}#before`;
        if (b === undefined || !this.scene.textures.exists(key)) continue;
        // v1.9.0 showed the herds at 3× their drawn size (the waterhole at 1×).
        const shown = h.layer === 'ver_veld' ? 1 / BEFORE_MASTER : 1;
        this.rootOf(h).add(
          this.scene.add
            .image(0, 0, key)
            .setOrigin(0.5, (b.h - BEFORE_FOOT) / b.h)
            .setScale(shown),
        );
      }
      this.built = true;
    };
    load.once('complete', place);
    load.start();
  }

  /**
   * Per frame: builds herds whose sheets came in late, re-cuts frames after an HD swap, and
   * poses heads, tails and ears for sim tick `tick` (`calm`: reduce motion).
   */
  update(tick: number, calm: boolean): void {
    if (this.o.before === true) return;
    if (!this.built && ++this.waits % 30 === 0) this.build();
    if (this.manifest.hdEpoch !== this.epoch) this.refresh();
    if (tick === this.lastTick && calm === this.lastCalm) return;
    this.lastTick = tick;
    this.lastCalm = calm;
    for (const p of this.parts) {
      if (p.part === 'body') continue;
      const m = faunaIdle(tick, p.animal, this.o.idle, calm, this.o.ticksPerSecond);
      const f = p.animal.facing;
      if (p.part === 'head') p.img.setAngle(f * m.head);
      else if (p.part === 'tail') p.img.setAngle(f * m.tail);
      else {
        const ds = this.manifest.displayScale(p.sheet);
        p.img.setScale(p.sx * ds * m.ear, p.sy * ds);
      }
    }
  }

  /** D-053: the sheet under a key changed (HD in, or back to Standard): same frames, new pixels. */
  private refresh(): void {
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
      const b = root.getBounds();
      const first = root.list[0] as Phaser.GameObjects.Image | undefined;
      out.push({
        key,
        x: Math.round(b.x),
        y: Math.round(b.y),
        w: Math.round(b.width),
        h: Math.round(b.height),
        hd: first !== undefined && this.manifest.displayScale(first.texture.key) < 1,
      });
    }
    return out;
  }

  /** Test hook: animals drawn now. */
  animalCount(): number {
    return new Set(this.parts.map((p) => p.animal)).size;
  }
}
