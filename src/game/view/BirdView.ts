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
import { clipFor, resolveClip } from '../assets/birdClips';
import { TEX, type AssetManifest, type BirdFrame, type FinalBird } from '../assets/AssetManifest';
import type { SimEvent } from '../../sim/events';
import type { DrawBird } from './interpolate';
import type { ParallaxView } from './ParallaxView';

interface Drawn {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly tuft: Phaser.GameObjects.Image | null;
  readonly badge: Phaser.GameObjects.Image | null;
  readonly pot: Phaser.GameObjects.Image | null;
  readonly plane: PlaneId;
  /** Placeholder texture key, or the final clip's animation key. */
  frame: string;
}

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

  constructor(
    scene: Phaser.Scene,
    manifest: AssetManifest,
    parallax: ParallaxView,
    content: ContentBundle,
    /** ⛔ badge on a non-target: only until its first sighting (not yet in the Bird Book). */
    private readonly showBadge: (creature: string) => boolean = () => true,
  ) {
    this.scene = scene;
    this.manifest = manifest;
    this.parallax = parallax;
    this.content = content;
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
      seen.add(b.view.id);
      const v = b.view;
      const final = this.manifest.finalBird(v.creature, v.plane);
      const clip =
        final !== null && this.scene.textures.exists(final.atlasKey)
          ? resolveClip(
              clipFor(v.motion, v.phase, v.id, tick),
              (c) => final.entry.clips[c] !== undefined,
            )
          : null;
      const key =
        final !== null && clip !== null
          ? this.ensureAnim(v.creature, v.plane, final, clip)
          : this.manifest.bird(v.creature, v.plane, frameFor(v, tick));
      let d = this.drawn.get(v.id);
      if (d === undefined) {
        const layer = this.parallax.plane(v.plane);
        const sprite = this.scene.add.sprite(b.x, b.y, TEX.feather);
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
        d = { sprite, tuft, badge, pot, plane: v.plane, frame: '' };
        this.drawn.set(v.id, d);
      }
      if (d.frame !== key) {
        if (final !== null && clip !== null) {
          const frames = final.entry.clips[clip]?.frames.length ?? 1;
          // Stagger flock members so they don't move in lockstep.
          d.sprite
            .play({ key, startFrame: v.id % frames })
            .setOrigin(final.entry.originX, final.entry.originY);
        } else {
          const o = this.manifest.origin(key);
          d.sprite.stop();
          d.sprite.setTexture(key).setOrigin(o.x, o.y);
        }
        d.frame = key;
      }
      const s = final !== null && clip !== null ? final.scale : 1;
      // Placeholder frames get a drawn walk bob and running lean; delivered clips animate it.
      const bob =
        s === 1 && v.motion === 'flock' && v.phase === 'walk' && (tick + v.id) % 20 < 10
          ? WALK_BOB_PX
          : 0;
      const lean = s === 1 && (v.phase === 'run' || v.phase === 'land') ? RUN_LEAN * v.facing : 0;
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
    }
    for (const [id, d] of this.drawn) {
      if (seen.has(id)) continue;
      d.sprite.destroy();
      d.tuft?.destroy();
      d.badge?.destroy();
      d.pot?.destroy();
      this.drawn.delete(id);
    }
  }

  /** The animation key of a delivered clip, created on first use. */
  private ensureAnim(creature: string, plane: PlaneId, final: FinalBird, clip: BirdClip): string {
    const key = `final:${creature}/${plane}/${clip}`;
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
      const final = this.manifest.finalBird(e.creature, e.plane);
      if (final === null || !this.scene.textures.exists(final.atlasKey)) continue;
      if (final.entry.clips.hit_poof === undefined) continue;
      const key = this.ensureAnim(e.creature, e.plane, final, 'hit_poof');
      const face = this.drawn.get(e.birdId)?.sprite.scaleX ?? final.scale;
      const poof = this.scene.add
        .sprite(e.x, e.y, final.atlasKey)
        .setOrigin(final.entry.originX, final.entry.originY)
        .setScale(face, final.scale);
      this.parallax.plane(e.plane).overlay?.add(poof);
      poof.play(key).once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        poof.destroy();
      });
    }
  }

  /** Current on-screen design position of a bird, if it is drawn. */
  positionOf(id: number): { plane: PlaneId; x: number; y: number } | null {
    const d = this.drawn.get(id);
    return d ? { plane: d.plane, x: d.sprite.x, y: d.sprite.y } : null;
  }

  /** Where a boss's pot is drawn now (for the CLANG knock-off). */
  potOf(id: number): { plane: PlaneId; x: number; y: number; scaleX: number } | null {
    const d = this.drawn.get(id);
    return d?.pot ? { plane: d.plane, x: d.pot.x, y: d.pot.y, scaleX: d.pot.scaleX } : null;
  }

  clear(): void {
    for (const d of this.drawn.values()) {
      d.sprite.destroy();
      d.tuft?.destroy();
      d.badge?.destroy();
      d.pot?.destroy();
    }
    this.drawn.clear();
  }
}
