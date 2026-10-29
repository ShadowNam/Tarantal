// Draws the birds of each snapshot (interpolated). One pooled image per bird id, added to its
// plane's container in spawn order, so a higher id is always drawn on top (D-018 hit order).
// Pop-ups are cropped at their grass line and get a grass tuft in front of them. Flock members
// pose by phase: standing (walk, alert, crouched for take-off), leaning forward when running,
// fast wing beats when flushed, wings held up when gliding. M4: the kwêvoël stands while perched
// and flaps otherwise; the Generaal stands (struts/runs) until he flies off, and wears his pot
// (a separate sprite on his head) until it is knocked off. M10: a bird with a delivered atlas plays
// its §3.4 clips instead (birdClips.ts), drawn at the atlas's scale and origin; a missing clip
// falls back along CLIP_FALLBACK, then to the placeholder frames.
import * as Phaser from 'phaser';
import type { ContentBundle } from '../../content/schemas';
import type { PlaneId } from '../../sim/types';
import type { BirdClip } from '../assets/assetIndex';
import { artPlaneFor, type ArtPlaneId } from '../assets/artPlane';
import { clipFor, resolveClip } from '../assets/birdClips';
import {
  birdAnimKey,
  TEX,
  type AssetManifest,
  type BirdFrame,
  type FinalBird,
} from '../assets/AssetManifest';
import type { SimEvent } from '../../sim/events';
import type { DrawBird } from './interpolate';
import type { ParallaxView } from './ParallaxView';

/** Where a boss's pot is drawn now, with its sprite origin (the knock-off starts from it). */
export interface PotSpot {
  readonly plane: PlaneId;
  readonly x: number;
  readonly y: number;
  readonly scaleX: number;
  readonly originX: number;
  readonly originY: number;
}

/** D-048: a special day's hats (witch hats on Halloween), from its lazy view module. */
export interface HatSource {
  /** Texture key, frame and origin (fractions) of the hat drawing for a hat this wide (px). */
  frameFor(widthPx: number): {
    readonly key: string;
    readonly frame: string;
    readonly ox: number;
    readonly oy: number;
  };
  /** Whether this bird wears one (cosmetic: picked from the id, the same every frame). */
  wears(id: number, creature: string): boolean;
  /** The head in a frame of a clip (null = the placeholder art): [x, y, rot°, r], bird units,
   *  facing right, at scale 1 (src/game/feesdae/hatAnchors.json). */
  head(clip: string | null, frame: number): readonly [number, number, number, number];
  /** Hat width per head radius, and its tilt back (radians). */
  readonly widthPerHeadR: number;
  readonly tilt: number;
}

interface Drawn {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly tuft: Phaser.GameObjects.Image | null;
  readonly badge: Phaser.GameObjects.Image | null;
  readonly pot: Phaser.GameObjects.Image | null;
  /** D-048: a witch hat (special days only). */
  readonly hat: Phaser.GameObjects.Image | null;
  readonly plane: PlaneId;
  /** Placeholder texture key, or the final clip's animation key. */
  frame: string;
}

/** v1.3: Ver birds are far away — a little of the horizon's haze over them (multiply tint). */
const VER_HAZE_TINT = 0xd9d4ca;

/** Wing-beat period in ticks (rendering only); flushed birds beat twice as fast. */
const FLAP_TICKS = 14;
const FLUSH_FLAP_TICKS = 6;
/** Running lean (radians) and the walking bob (design px), rendering only. */
const RUN_LEAN = 0.18;
const WALK_BOB_PX = 2;

function frameFor(v: DrawBird['view'], tick: number): BirdFrame {
  if (v.motion === 'popup') return 'stand';
  const flapping: BirdFrame = (tick + v.id * 5) % FLAP_TICKS < FLAP_TICKS / 2 ? 'up' : 'down';
  if (v.motion === 'perch') return v.phase === 'perch' ? 'stand' : flapping;
  if (v.motion === 'boss')
    return v.phase === 'flap' ? flapping : v.phase === 'hop' ? 'up' : 'stand';
  // Kuifkop (M8): stands peeking, wings up mid-hop, flaps when it leaves.
  if (v.motion === 'hop') return v.phase === 'flap' ? flapping : v.phase === 'hop' ? 'up' : 'stand';
  if (v.motion === 'flock') {
    if (v.phase === 'glide') return 'up';
    if (v.phase !== 'flap') return 'stand';
    return (tick + v.id * 3) % FLUSH_FLAP_TICKS < FLUSH_FLAP_TICKS / 2 ? 'up' : 'down';
  }
  return (tick + v.id * 5) % FLAP_TICKS < FLAP_TICKS / 2 ? 'up' : 'down';
}

export class BirdView {
  private readonly scene: Phaser.Scene;
  private readonly manifest: AssetManifest;
  private readonly parallax: ParallaxView;
  private readonly drawn = new Map<number, Drawn>();
  private readonly content: ContentBundle;
  /** v1.7d (D-059): creatures that drift (hot-air balloons), drawn by the Namibië chunk. */
  private readonly drifters: ReadonlySet<string>;
  /** v1.3: the rifle zoom view's zoom (Ver birds pick sharper art when zoomed in). */
  private viewZoom = 1;
  private readonly artScales: Readonly<Record<ArtPlaneId, number>>;
  /** D-048: hats on a special day (null = none). Set before the hunt's first frame. */
  hats: HatSource | null = null;

  constructor(
    scene: Phaser.Scene,
    manifest: AssetManifest,
    parallax: ParallaxView,
    content: ContentBundle,
    /** Render ticks per foraging walk/peck spell (feel.json juice.forageSpellTicks). */
    private readonly forageSpellTicks: number,
    /** ⛔ badge on a non-target: only until its first sighting (not yet in the Bird Book). */
    private readonly showBadge: (creature: string) => boolean = () => true,
  ) {
    this.scene = scene;
    this.manifest = manifest;
    this.parallax = parallax;
    this.content = content;
    this.drifters = new Set(content.birds.creatures.filter((c) => 'drift' in c).map((c) => c.id));
    const p = content.scoring.planes;
    this.artScales = { near: p.near.scale, mid: p.mid.scale, far: p.far.scale };
  }

  /** v1.3: the zoom the world is drawn at now (1 = no sight up). */
  setViewZoom(z: number): void {
    this.viewZoom = z;
  }

  /** The plane whose art draws a bird of `plane`, and the scale on top of that art's own. */
  private artOf(plane: PlaneId): { art: ArtPlaneId; ratio: number } {
    const s = this.content.scoring.planes[plane].scale;
    const art = artPlaneFor(plane, s * this.viewZoom, this.artScales);
    return { art, ratio: s / this.artScales[art] };
  }

  /**
   * D-049: the scale on top of a delivered atlas's own: the plane's scale over the scale the
   * atlas was packed at (they differ only under the dev `?planeScale=` override, or for a Ver
   * bird drawn from another plane's art). Placeholder frames are drawn at the content's scales.
   */
  private finalRatio(plane: PlaneId, final: FinalBird | null, ratio: number): number {
    const packed = final?.entry.planeScale;
    return packed === undefined ? ratio : this.content.scoring.planes[plane].scale / packed;
  }

  /** Where a boss's helmet sits: on top of the head hitbox (plane px, scaled). */
  private headTop(v: DrawBird['view'], x: number, y: number): { x: number; y: number } {
    const c = this.content.birds.creatures.find((k) => k.id === v.creature);
    const head = c !== undefined && 'hitbox' in c ? c.hitbox.head : undefined;
    const s = this.content.scoring.planes[v.plane].scale;
    if (head === undefined) return { x, y: y - 100 * s };
    return { x: x + head.ox * s * v.facing, y: y + (head.oy - head.r * 0.55) * s };
  }

  update(birds: readonly DrawBird[], tick: number): void {
    const seen = new Set<number>();
    for (const b of birds) {
      const v = b.view;
      // v1.7d (D-059): drifters (hot-air balloons) are drawn by the Namibië chunk's BalloonView.
      if (this.drifters.has(v.creature)) continue;
      seen.add(v.id);
      const { art, ratio } = this.artOf(v.plane);
      // The atlas goes to the GPU the first time this creature shows on this plane (D-029).
      const final = this.manifest.ensureBird(this.scene.textures, v.creature, art);
      const clip =
        final !== null && this.scene.textures.exists(final.atlasKey)
          ? resolveClip(
              clipFor(v.motion, v.phase, v.id, tick, this.forageSpellTicks),
              (c) => final.entry.clips[c] !== undefined,
            )
          : null;
      const animKey =
        final !== null && clip !== null ? this.ensureAnim(v.creature, art, final, clip) : null;
      // An animation with no frames (it can't play) leaves the bird on its placeholder frames.
      const anim = animKey === null ? undefined : this.scene.anims.get(animKey);
      const playable = final !== null && anim !== undefined && anim.frames.length > 0;
      const key =
        playable && animKey !== null
          ? animKey
          : this.manifest.bird(v.creature, art, frameFor(v, tick));
      let d = this.drawn.get(v.id);
      if (d === undefined) {
        const layer = this.parallax.plane(v.plane);
        const sprite = this.scene.add.sprite(b.x, b.y, TEX.feather);
        if (v.plane === 'ver') sprite.setTint(VER_HAZE_TINT);
        layer.birds?.add(sprite);
        const tuft =
          v.motion === 'popup' && v.ground !== null
            ? this.scene.add.image(b.x, v.ground, TEX.grassTuft).setOrigin(0.5, 30 / 110)
            : null;
        if (tuft) layer.overlay?.add(tuft);
        const badge =
          v.kind === 'nonTarget' && this.showBadge(v.creature)
            ? this.scene.add.image(b.x, b.y, TEX.badgeNo)
            : null;
        if (badge) layer.overlay?.add(badge);
        const po = this.manifest.origin(TEX.pot);
        const pot =
          v.motion === 'boss' && v.armored
            ? this.scene.add.image(b.x, b.y, TEX.pot).setOrigin(po.x, po.y)
            : null;
        if (pot) layer.birds?.add(pot);
        const hat =
          this.hats !== null && v.kind === 'target' && this.hats.wears(v.id, v.creature)
            ? this.scene.add.image(b.x, b.y, TEX.feather)
            : null;
        if (hat) layer.birds?.add(hat);
        d = { sprite, tuft, badge, pot, hat, plane: v.plane, frame: '' };
        this.drawn.set(v.id, d);
      }
      if (d.frame !== key) {
        if (playable) {
          const frames = anim.frames.length;
          // Stagger looping clips so flock members don't move in lockstep; one-shot clips
          // (alert, takeoff, land) always start at their first frame.
          const startFrame = anim.repeat === -1 ? v.id % frames : 0;
          d.sprite.play({ key, startFrame });
          // Cropped frames carry their own pivot (D-029); full-box frames use the entry's origin.
          if (final.entry.pivots !== true)
            d.sprite.setOrigin(final.entry.originX, final.entry.originY);
        } else {
          const o = this.manifest.origin(key);
          d.sprite.stop();
          d.sprite.setTexture(key).setOrigin(o.x, o.y);
        }
        d.frame = key;
      }
      // Ver birds draw another plane's art scaled down to the Ver size (ratio ≤ 1).
      const s = playable ? final.scale * this.finalRatio(v.plane, final, ratio) : ratio;
      // Placeholder frames get a drawn walk bob and running lean; delivered clips animate it.
      const bob =
        !playable &&
        ratio === 1 &&
        v.motion === 'flock' &&
        v.phase === 'walk' &&
        (tick + v.id) % 20 < 10
          ? WALK_BOB_PX
          : 0;
      const lean = !playable && (v.phase === 'run' || v.phase === 'land') ? RUN_LEAN * v.facing : 0;
      // Mirror around the origin (the bird's position) — the hitbox mirrors the same way.
      d.sprite
        .setPosition(b.x, b.y - bob)
        .setScale(v.facing * s, s)
        .setRotation(lean)
        // A peeking boss behind cover (Ou Grys, M8) is not drawn until he peeks out.
        .setVisible(v.phase !== 'hidden');
      if (v.motion === 'popup' && v.ground !== null) {
        // Hide everything below the grass line (in texture px: design px / scale).
        const frameH = d.sprite.frame.height;
        const visible = d.sprite.displayOriginY + (v.ground - b.y) / s;
        d.sprite.setVisible(visible > 0);
        if (visible > 0) d.sprite.setCrop(0, 0, d.sprite.frame.width, Math.min(frameH, visible));
      }
      if (d.badge) d.badge.setPosition(b.x, b.y - 90);
      if (d.pot) {
        const top = this.headTop(v, b.x, b.y);
        const s = this.content.scoring.planes[v.plane].scale;
        d.pot
          .setVisible(v.armored)
          .setPosition(top.x, top.y)
          .setScale(s * v.facing, s)
          .setRotation(lean);
      }
      if (d.hat && this.hats !== null) this.placeHat(d, d.hat, this.hats, v, b.x, b.y - bob, lean);
    }
    for (const [id, d] of this.drawn) {
      if (seen.has(id)) continue;
      d.sprite.destroy();
      d.tuft?.destroy();
      d.badge?.destroy();
      d.pot?.destroy();
      d.hat?.destroy();
      this.drawn.delete(id);
    }
  }

  /**
   * D-048: a witch hat on the head of the frame on screen (the clip's own head anchor), mirrored
   * the way the sprite is, tilted with the head and a little back, sized to the head.
   */
  private placeHat(
    d: Drawn,
    hat: Phaser.GameObjects.Image,
    hats: HatSource,
    v: DrawBird['view'],
    x: number,
    y: number,
    lean: number,
  ): void {
    const ps = this.content.scoring.planes[v.plane].scale;
    // A delivered clip (its key starts "final:") shows its frames; else the placeholder art.
    const anim = d.frame.startsWith('final:') ? d.sprite.anims.currentFrame : null;
    // Delivered clips: "final:<creature>/<plane>/<clip>", frames "<clip>/<nn>".
    const clip = anim === null ? null : (d.frame.split('/').at(-1) ?? null);
    const n = anim === null ? 0 : Number(/(\d+)$/.exec(String(anim.textureFrame))?.[1] ?? 0);
    // A tumble (hit_poof) has no head to wear it.
    if (clip === 'hit_poof') {
      hat.setVisible(false);
      return;
    }
    const [hx, hy, rot, r] = hats.head(clip, n);
    const sx = d.sprite.scaleX < 0 ? -1 : 1;
    const a = ((rot * Math.PI) / 180) * sx + lean - hats.tilt * sx;
    // The brim sits on the crown: up from the head's centre along its own up.
    const up = r * 0.62 * ps;
    const cx = x + hx * ps * sx + Math.sin(a) * up;
    const cy = y + hy * ps - Math.cos(a) * up;
    const f = hats.frameFor(hats.widthPerHeadR * r * ps * this.viewZoom);
    if (hat.texture.key !== f.key || hat.frame.name !== f.frame) hat.setTexture(f.key, f.frame);
    hat.setOrigin(f.ox, f.oy);
    const k = (hats.widthPerHeadR * r * ps) / Math.max(1, hat.frame.width);
    hat
      .setVisible(d.sprite.visible)
      .setPosition(cx, cy)
      .setScale(k * sx, k)
      .setRotation(a);
  }

  /** The animation key of a delivered clip, created on first use. */
  private ensureAnim(creature: string, plane: PlaneId, final: FinalBird, clip: BirdClip): string {
    // D-053: the HD atlas's clips have keys of their own (birdAnimKey).
    const key = birdAnimKey(`${creature}/${plane}`, final, clip);
    const c = final.entry.clips[clip];
    if (!this.scene.anims.exists(key) && c !== undefined) {
      this.scene.anims.create({
        key,
        frames: c.frames.map((frame) => ({ key: final.atlasKey, frame })),
        frameRate: c.fps,
        repeat: c.loop ? -1 : 0,
      });
    }
    return key;
  }

  /** M10: a bagged bird with a delivered `hit_poof` clip plays it once where it was hit. */
  handle(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.type !== 'targetBagged') continue;
      const { art, ratio } = this.artOf(e.plane);
      const final = this.manifest.ensureBird(this.scene.textures, e.creature, art);
      if (final === null || !this.scene.textures.exists(final.atlasKey)) continue;
      if (final.entry.clips.hit_poof === undefined) continue;
      const key = this.ensureAnim(e.creature, art, final, 'hit_poof');
      if ((this.scene.anims.get(key)?.frames.length ?? 0) === 0) continue;
      const k = final.scale * this.finalRatio(e.plane, final, ratio);
      const face = this.drawn.get(e.birdId)?.sprite.scaleX ?? k;
      const poof = this.scene.add
        .sprite(e.x, e.y, final.atlasKey)
        .setOrigin(final.entry.originX, final.entry.originY)
        .setScale(face, k);
      this.parallax.plane(e.plane).overlay?.add(poof);
      // Once, even if rig.json marked hit_poof as a loop (a loop would never complete).
      poof.play({ key, repeat: 0 }).once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        poof.destroy();
      });
    }
  }

  /** D-048: where the drawn witch hats are (plane coordinates), for the test hook. */
  hatSpots(): { plane: PlaneId; x: number; y: number }[] {
    const out: { plane: PlaneId; x: number; y: number }[] = [];
    for (const d of this.drawn.values())
      if (d.hat !== null && d.hat.visible) out.push({ plane: d.plane, x: d.hat.x, y: d.hat.y });
    return out;
  }

  /** Current on-screen design position of a bird, if it is drawn. */
  positionOf(id: number): { plane: PlaneId; x: number; y: number } | null {
    const d = this.drawn.get(id);
    return d ? { plane: d.plane, x: d.sprite.x, y: d.sprite.y } : null;
  }

  /** Where a boss's pot is drawn now (for the CLANG knock-off). */
  potOf(id: number): PotSpot | null {
    const d = this.drawn.get(id);
    return d?.pot
      ? {
          plane: d.plane,
          x: d.pot.x,
          y: d.pot.y,
          scaleX: d.pot.scaleX,
          originX: d.pot.originX,
          originY: d.pot.originY,
        }
      : null;
  }

  clear(): void {
    for (const d of this.drawn.values()) {
      d.sprite.destroy();
      d.tuft?.destroy();
      d.badge?.destroy();
      d.pot?.destroy();
      d.hat?.destroy();
    }
    this.drawn.clear();
  }
}
