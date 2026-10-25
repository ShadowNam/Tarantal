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
  readonly kats: Map<number, Phaser.GameObjects.Image>;
  readonly flicks: Map<number, Phaser.GameObjects.Image>;
}

export class MeerkatView {
  private readonly frames: readonly SheetRect[] = sheetFrames();
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
  ) {}

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
    return this.frames.find((f) => f.name === name);
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
    this.cues = [];
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
    const seen = new Set<number>();
    for (const m of col.meerkats) {
      seen.add(m.id);
      const barkAt = this.barking.get(m.id);
      const name = meerkatFrame(m, barkAt !== undefined && tick - barkAt < BARK_TICKS);
      let img = art.kats.get(m.id);
      if (img === undefined) {
        img = this.scene.add.image(m.x, m.y, MEERKAT_SHEET, 'sit');
        layer.fixtures.add(img);
        art.kats.set(m.id, img);
      }
      this.place(
        img,
        name,
        m,
        scale * k * (m.pup && name !== null && !name.startsWith('pup_') ? this.tuning.pupScale : 1),
      );
      // Digging flicks sand behind it, on sim time.
      let flick = art.flicks.get(m.id);
      const digging = m.pose === 'forage';
      if (digging && flick === undefined) {
        flick = this.scene.add.image(m.x, m.y, MEERKAT_SHEET, 'flick');
        layer.fixtures.addAt(flick, layer.fixtures.getIndex(img));
        art.flicks.set(m.id, flick);
      }
      if (flick !== undefined) {
        const ph = (m.poseTicks % 18) / 18;
        flick
          .setVisible(digging && ph < 0.7)
          .setPosition(m.x - m.facing * (18 + ph * 26) * scale, m.y - ph * (1 - ph) * 60 * scale)
          .setScale(scale * k * (0.6 + ph * 0.5))
          .setAlpha(1 - ph)
          .setFlipX(m.facing < 0);
      }
    }
    for (const [id, img] of art.kats)
      if (!seen.has(id)) {
        img.destroy();
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

  private place(
    img: Phaser.GameObjects.Image,
    name: MeerkatFrame | null,
    m: Meerkat,
    s: number,
  ): void {
    if (name === null) {
      img.setVisible(false);
      return;
    }
    const r = this.rect(name);
    if (img.frame.name !== name) img.setFrame(name);
    if (r !== undefined) img.setOrigin(r.ox / r.w, r.oy / r.h);
    // Side views face their way; the camera-facing ones never flip.
    const flip =
      m.facing < 0 && name !== 'front' && !name.startsWith('stand') && !name.startsWith('peek');
    img
      .setVisible(true)
      .setPosition(m.x, m.y)
      .setScale(s)
      .setFlipX(flip)
      .setRotation(m.pose === 'tumble' ? (m.facing * m.poseTicks * 0.35) % (Math.PI * 2) : 0);
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
        const k = this.planeScale[c.plane] * (m.pup ? this.tuning.pupScale : 1);
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
      for (const i of a.kats.values()) i.destroy();
      for (const f of a.flicks.values()) f.destroy();
    }
    this.art.clear();
    for (const p of this.puffs) p.img.destroy();
    this.puffs.length = 0;
  }

  clear(): void {
    for (const a of this.art.values()) {
      for (const m of a.mounds) m.destroy();
      for (const i of a.kats.values()) i.destroy();
      for (const f of a.flicks.values()) f.destroy();
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
