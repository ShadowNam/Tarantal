// v1.7 (D-044): the desert maps' meerkat colonies, drawn from the snapshot and the event stream
// (never from sim internals). Each burrow is a mound sprite on the colony's layer; each meerkat
// an image whose frame follows its pose and the sim tick (so a held frame, ?holdAt, holds too);
// a foraging meerkat flicks sand, a shot one leaves a puff of sand, the sentinel barks with its
// mouth open. Every frame comes from one sheet (desertAssets.ts); a pool caps the images.
import * as Phaser from 'phaser';
import type { MeerkatTuning } from '../../content/schemas';
import type { SimEvent } from '../../sim/events';
import type { ColonyView, MeerkatView as Meerkat, PlaneId, SimState } from '../../sim/types';
import type { AssetManifest } from '../assets/AssetManifest';
import {
  MEERKAT_SHEET,
  MOUND_FRAMES,
  MOUND_HEIGHT,
  sheetFrames,
  type MeerkatFrame,
  type SheetRect,
} from '../assets/desertAssets';
import type { ParallaxView } from './ParallaxView';
import { meerkatFrame } from './meerkatPose';
import { shapeOf } from '../../sim/meerkats/colony';

/** A puff of sand where a meerkat was shot (sim ticks). */
const PUFF_TICKS = 30;
/** The sentinel holds its bark this long after an alarm. */
const BARK_TICKS = 40;

interface ColonyArt {
  readonly mounds: Phaser.GameObjects.Image[];
  readonly kats: Map<number, Look>;
  readonly flicks: Map<number, Look>;
}

/** An image and what was last set on it (perf: set only on change, read without getters). */
interface Look {
  readonly img: Phaser.GameObjects.Image;
  frame: string;
  ox: number;
  oy: number;
  x: number;
  y: number;
  scale: number;
  flip: boolean;
  rot: number;
  alpha: number;
  visible: boolean;
}

function lookOf(img: Phaser.GameObjects.Image): Look {
  return {
    img,
    frame: img.frame.name,
    ox: img.originX,
    oy: img.originY,
    x: img.x,
    y: img.y,
    scale: img.scaleX,
    flip: img.flipX,
    rot: img.rotation,
    alpha: img.alpha,
    visible: img.visible,
  };
}

export class MeerkatView {
  private readonly frames: readonly SheetRect[] = sheetFrames();
  /** The frames by name (rect() is asked for every meerkat every frame). */
  private readonly rects = new Map<string, SheetRect>();
  /** Meerkats seen in the colony being drawn (reused every frame). */
  private readonly seen = new Set<number>();
  private readonly art = new Map<string, ColonyArt>();
  private readonly puffs: {
    colony: string;
    x: number;
    y: number;
    tick: number;
    img: Phaser.GameObjects.Image;
  }[] = [];
  private readonly barking = new Map<number, number>();
  /** The texture object the frames were added to (an upgrade swaps it). */
  private sheet: Phaser.Textures.Texture | null = null;
  /** ms the colonies took to draw this frame (e2e perf). */
  ms = 0;
  /** Poses last frame (a head popping up chirps) and the tick of each colony's last cue. */
  private readonly lastPose = new Map<number, string>();
  private readonly lastCue = new Map<string, number>();
  /** This frame's ambient sounds (screen x): chirps and digging, rate-limited on sim time. */
  cues: { sound: 'chirp' | 'dig'; screenX: number }[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly manifest: AssetManifest,
    private readonly parallax: ParallaxView,
    private readonly tuning: MeerkatTuning,
    private readonly planeScale: Readonly<Record<PlaneId, number>>,
  ) {
    // The first frame with a name wins, as a find over the list would.
    for (const f of this.frames) if (!this.rects.has(f.name)) this.rects.set(f.name, f);
  }

  /** Frames on the sheet texture (again after a final file replaced the placeholder). */
  private ensureFrames(): boolean {
    if (!this.scene.textures.exists(MEERKAT_SHEET)) return false;
    const tex = this.scene.textures.get(MEERKAT_SHEET);
    if (tex === this.sheet) return true;
    // A delivered sheet replaced the one drawn so far (and maybe its scale): rebuild the images.
    if (this.sheet !== null) this.dropImages();
    // Texture px per design px: a 2× sheet holds twice the design size.
    const k = 1 / this.manifest.displayScale(MEERKAT_SHEET);
    for (const f of this.frames) {
      if (tex.has(f.name)) continue;
      tex.add(f.name, 0, f.x * k, f.y * k, f.w * k, f.h * k);
    }
    this.sheet = tex;
    return true;
  }

  private rect(name: string): SheetRect | undefined {
    return this.rects.get(name);
  }

  /** This frame's events: sand puffs on hits, the sentinel's bark on alarms. */
  handle(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'meerkatHit') {
        const layer = this.layerOf(e.colonyId);
        if (layer === undefined) continue;
        const img = this.scene.add.image(e.x, e.y, MEERKAT_SHEET);
        layer.fixtures.add(img);
        this.puffs.push({ colony: e.colonyId, x: e.x, y: e.y, tick: e.tick, img });
      } else if (e.type === 'meerkatAlarm') this.barking.set(e.meerkatId, e.tick);
    }
  }

  private colonies: readonly ColonyView[] = [];

  private layerOf(colonyId: string) {
    const c = this.colonies.find((x) => x.id === colonyId);
    return c === undefined ? undefined : this.parallax.layer(c.layerId);
  }

  update(s: SimState): void {
    const t0 = performance.now();
    this.colonies = s.meerkats;
    if (s.meerkats.length === 0 || !this.ensureFrames()) {
      this.ms = performance.now() - t0;
      return;
    }
    const k = this.manifest.displayScale(MEERKAT_SHEET);
    this.cues.length = 0;
    for (const col of s.meerkats) {
      this.drawColony(col, s.tick, k);
      this.listen(col, s.tick);
    }
    this.drawPuffs(s.tick, k);
    this.ms = performance.now() - t0;
  }

  private drawColony(col: ColonyView, tick: number, k: number): void {
    const layer = this.parallax.layer(col.layerId);
    if (layer === undefined) return;
    const scale = this.planeScale[col.plane];
    let art = this.art.get(col.id);
    if (art === undefined) {
      art = { mounds: [], kats: new Map(), flicks: new Map() };
      col.burrows.forEach((b, i) => {
        const name = MOUND_FRAMES[i % MOUND_FRAMES.length] ?? 'mound_a';
        const r = this.rect(name);
        const img = this.scene.add.image(b.x, b.y, MEERKAT_SHEET, name);
        if (r !== undefined) img.setOrigin(r.ox / r.w, r.oy / r.h);
        // The content's mound height sets how tall the mound stands (a little flatter or rounder).
        const h = Math.max(0.6, Math.min(1.4, b.mound / (MOUND_HEIGHT * scale)));
        img.setScale(scale * k, scale * k * h).setFlipX(i % 2 === 1);
        layer.fixtures.add(img);
        art?.mounds.push(img);
      });
      this.art.set(col.id, art);
    }
    // D-078: the meerkats themselves (not their mounds) are sizeMul bigger than the plane's scale.
    const body = scale * this.tuning.sizeMul;
    let added = false;
    for (const m of col.meerkats) {
      const barkAt = this.barking.get(m.id);
      const name = meerkatFrame(m, barkAt !== undefined && tick - barkAt < BARK_TICKS);
      let kat = art.kats.get(m.id);
      if (kat === undefined) {
        const img = this.scene.add.image(m.x, m.y, MEERKAT_SHEET, 'sit');
        layer.fixtures.add(img);
        kat = lookOf(img);
        art.kats.set(m.id, kat);
        added = true;
      }
      this.place(
        kat,
        name,
        m,
        body * k * (m.pup && name !== null && !name.startsWith('pup_') ? this.tuning.pupScale : 1),
      );
      // Digging flicks sand behind it, on sim time.
      let flick = art.flicks.get(m.id);
      const digging = m.pose === 'forage';
      if (digging && flick === undefined) {
        const img = this.scene.add.image(m.x, m.y, MEERKAT_SHEET, 'flick');
        layer.fixtures.addAt(img, layer.fixtures.getIndex(kat.img));
        flick = lookOf(img);
        art.flicks.set(m.id, flick);
      }
      if (flick !== undefined) {
        // Each property set only when it changed; a hidden flick is left as it is (set again
        // the moment it shows).
        const ph = (m.poseTicks % 18) / 18;
        const on = digging && ph < 0.7;
        const img = flick.img;
        if (flick.visible !== on) {
          flick.visible = on;
          img.setVisible(on);
        }
        if (on) {
          const fx = m.x - m.facing * (18 + ph * 26) * body;
          const fy = m.y - ph * (1 - ph) * 60 * body;
          if (flick.x !== fx || flick.y !== fy) {
            flick.x = fx;
            flick.y = fy;
            img.setPosition(fx, fy);
          }
          const fs = body * k * (0.6 + ph * 0.5);
          if (flick.scale !== fs) {
            flick.scale = fs;
            img.setScale(fs);
          }
          if (flick.alpha !== 1 - ph) {
            flick.alpha = 1 - ph;
            img.setAlpha(1 - ph);
          }
          const flip = m.facing < 0;
          if (flick.flip !== flip) {
            flick.flip = flip;
            img.setFlipX(flip);
          }
        }
      }
    }
    // Every meerkat had its image already and there are as many images as meerkats (ids are
    // unique): none is left over (perf: no set and no walk over the images most frames).
    if (!added && art.kats.size === col.meerkats.length) return;
    const seen = this.seen;
    seen.clear();
    for (const m of col.meerkats) seen.add(m.id);
    for (const [id, kat] of art.kats)
      if (!seen.has(id)) {
        kat.img.destroy();
        art.kats.delete(id);
      }
  }

  /** Sounds of a colony on sim time: a chirp when a head pops up, digging every so often. */
  private listen(col: ColonyView, tick: number): void {
    const last = this.lastCue.get(col.id) ?? -Infinity;
    let cue: 'chirp' | 'dig' | null = null;
    let at = 0;
    for (const m of col.meerkats) {
      const before = this.lastPose.get(m.id);
      this.lastPose.set(m.id, m.pose);
      if (before !== m.pose && (m.pose === 'peek' || m.pose === 'emerge')) {
        cue = 'chirp';
        at = m.x;
      } else if (cue === null && m.pose === 'forage' && m.poseTicks % 50 === 25) {
        cue = 'dig';
        at = m.x;
      }
    }
    if (cue === null || tick - last < 40) return;
    this.lastCue.set(col.id, tick);
    this.cues.push({ sound: cue, screenX: this.parallax.screenX(col.plane, at) });
  }

  /** Poses a meerkat's image, each property set only when it changed (perf). */
  private place(kat: Look, name: MeerkatFrame | null, m: Meerkat, s: number): void {
    const img = kat.img;
    if (name === null) {
      if (kat.visible) {
        kat.visible = false;
        img.setVisible(false);
      }
      return;
    }
    const r = this.rect(name);
    if (kat.frame !== name) {
      kat.frame = name;
      img.setFrame(name);
      // A frame with its own pivot moves the origin there.
      kat.ox = img.originX;
      kat.oy = img.originY;
    }
    if (r !== undefined) {
      const ox = r.ox / r.w;
      const oy = r.oy / r.h;
      if (kat.ox !== ox || kat.oy !== oy) {
        kat.ox = ox;
        kat.oy = oy;
        img.setOrigin(ox, oy);
      }
    }
    // Side views face their way; the camera-facing ones never flip; a mirrored frame (the
    // left-looking peek and stand) is its twin flipped.
    const turn =
      m.facing < 0 && name !== 'front' && !name.startsWith('stand') && !name.startsWith('peek');
    const flip = turn !== (r?.mirror === true);
    const rot = m.pose === 'tumble' ? (m.facing * m.poseTicks * 0.35) % (Math.PI * 2) : 0;
    if (!kat.visible) {
      kat.visible = true;
      img.setVisible(true);
    }
    if (kat.x !== m.x || kat.y !== m.y) {
      kat.x = m.x;
      kat.y = m.y;
      img.setPosition(m.x, m.y);
    }
    if (kat.scale !== s) {
      kat.scale = s;
      img.setScale(s);
    }
    if (kat.flip !== flip) {
      kat.flip = flip;
      img.setFlipX(flip);
    }
    if (kat.rot !== rot) {
      kat.rot = rot;
      img.setRotation(rot);
    }
  }

  private drawPuffs(tick: number, k: number): void {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      if (p === undefined) continue;
      const age = (tick - p.tick) / PUFF_TICKS;
      if (age >= 1 || age < 0) {
        p.img.destroy();
        this.puffs.splice(i, 1);
        continue;
      }
      const col = this.colonies.find((c) => c.id === p.colony);
      const scale = col === undefined ? 1 : this.planeScale[col.plane];
      p.img
        .setFrame('flick')
        .setPosition(p.x, p.y - 20 * scale * age)
        .setScale(scale * k * (1 + age * 1.6))
        .setAlpha(1 - age);
    }
  }

  /** e2e: each meerkat's screen position (feet), the centre of its body to aim at, its pose
   *  and whether it can be hit. */
  spots(): {
    id: number;
    colony: string;
    pose: string;
    pup: boolean;
    x: number;
    y: number;
    aimX: number;
    aimY: number;
    hittable: boolean;
  }[] {
    return this.colonies.flatMap((c) =>
      c.meerkats.map((m) => {
        const kind = shapeOf(m.pose) ?? 'low';
        const body = this.tuning.hitboxes[kind].body;
        const k =
          this.planeScale[c.plane] * this.tuning.sizeMul * (m.pup ? this.tuning.pupScale : 1);
        const x = this.parallax.screenX(c.plane, m.x);
        return {
          id: m.id,
          colony: c.id,
          pose: m.pose,
          pup: m.pup,
          x,
          y: m.y,
          aimX: x + body.ox * k * m.facing,
          aimY: m.y + body.oy * k,
          hittable: m.hittable,
        };
      }),
    );
  }

  /** Destroys the colony images (built again from the snapshot next frame). */
  private dropImages(): void {
    for (const a of this.art.values()) {
      for (const m of a.mounds) m.destroy();
      for (const i of a.kats.values()) i.img.destroy();
      for (const f of a.flicks.values()) f.img.destroy();
    }
    this.art.clear();
    for (const p of this.puffs) p.img.destroy();
    this.puffs.length = 0;
  }

  clear(): void {
    for (const a of this.art.values()) {
      for (const m of a.mounds) m.destroy();
      for (const i of a.kats.values()) i.img.destroy();
      for (const f of a.flicks.values()) f.img.destroy();
    }
    this.art.clear();
    for (const p of this.puffs) p.img.destroy();
    this.puffs.length = 0;
    this.barking.clear();
    this.lastPose.clear();
    this.lastCue.clear();
    this.cues = [];
    this.sheet = null;
  }
}
