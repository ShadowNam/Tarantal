// v1.7d (D-059, GDD §11.3c, art bible §4.5e) Oryx in the mirage: a gemsbok herd walking slowly
// across the far pan and back (oryxRoam.ts, on sim time), drawn by FaunaView from the far gemsbok
// sheet already in the Namibië chunk (no new art), with a faint upside-down reflection on the
// shimmer band below it that breathes with the heat, and the herd wavering gently in it. Tied to
// the pan's mirage: full heat with the mirage on, half on the other hot days, none at dawn, dusk
// or under cloud. No filter pass (Phaser 4.2.1 containers take none, and a filter per part would
// cost a render pass each on phones): the waver is the holders' sideways shift and squash.
import type * as Phaser from 'phaser';
import { TICKS_PER_SECOND } from '../../../sim/clock';
import { coreWidth } from '../../../sim/world';
import type { AssetManifest } from '../../assets/AssetManifest';
import { FaunaView, type FaunaOptions } from '../FaunaView';
import type { ParallaxView } from '../ParallaxView';
import {
  ORYX_REPLACE,
  ORYX_ROAMS,
  roamInto,
  shimmerInto,
  type OryxRoam,
  type RoamPos,
  type Shimmer,
} from './oryxRoam';

interface Spot {
  key: string;
  x: number;
  facing: number;
  mirror: number;
  screenX: number;
}

interface Built {
  readonly roam: OryxRoam;
  readonly core: number;
  readonly holder: Phaser.GameObjects.Container;
  readonly mirror: Phaser.GameObjects.Container;
  readonly herd: FaunaView;
  readonly image: FaunaView;
  readonly root: Phaser.GameObjects.Container;
  /** Its hook entry and scratch results, reused every frame (no allocation). */
  readonly spot: Spot;
  readonly at: RoamPos;
  readonly sh: Shimmer;
}

/** A herd further than this (design px) off the screen's edges is not posed. */
const OFF_SCREEN_PX = 260;

/** Moves and scales a holder, touching only what changed. */
function place(
  c: Phaser.GameObjects.Container,
  x: number,
  y: number,
  sx: number,
  sy: number,
): void {
  if (c.x !== x || c.y !== y) c.setPosition(x, y);
  if (c.scaleX !== sx || c.scaleY !== sy) c.setScale(sx, sy);
}

export class OryxView {
  private readonly built: Built[] = [];
  private readonly replaces: string | null;
  /** The old herd is hidden (once its holder exists; then never touched again). */
  private replaced = false;
  /** e2e hook: where each herd stands now (layer px) and its reflection's alpha. */
  readonly spots: Spot[] = [];

  constructor(
    scene: Phaser.Scene,
    manifest: AssetManifest,
    private readonly parallax: ParallaxView,
    biomeId: string,
    fauna: FaunaOptions,
    private readonly still: boolean,
  ) {
    this.replaces = ORYX_REPLACE[biomeId] ?? null;
    for (const roam of ORYX_ROAMS[biomeId] ?? []) {
      const layer = parallax.layer(roam.herd.layer);
      if (layer === undefined) continue;
      const core = coreWidth(layer.scrollFactor);
      const holder = scene.add.container(0, 0);
      const mirror = scene.add.container(0, 0);
      // Behind the layer's own herds and fixtures, over its ground art.
      layer.root.addAt([mirror, holder], layer.root.getIndex(layer.fruit));
      const herd = new FaunaView(scene, manifest, [roam.herd], core, holder, fauna);
      const image = new FaunaView(scene, manifest, [roam.herd], core, mirror, fauna);
      const spot: Spot = { key: roam.herd.key, x: 0, facing: 1, mirror: 0, screenX: 0 };
      this.spots.push(spot);
      this.built.push({
        roam,
        core,
        holder,
        mirror,
        herd,
        image,
        root: layer.root,
        spot,
        at: { x: 0, facing: 1, walking: false },
        sh: { herdDx: 0, mirrorDx: 0, squash: 1, alpha: 0 },
      });
    }
  }

  /** `heat`: oryxRoam.heatOf (the mirage and the light). */
  update(tick: number, calm: boolean, width: number, heat: number): void {
    const t = tick / TICKS_PER_SECOND;
    // The old far herd stands in the same band: the oryx replace it (until it is hidden).
    if (this.replaces !== null && !this.replaced)
      this.replaced = this.parallax.setHerdVisible(this.replaces, false);
    for (const b of this.built) {
      const at = roamInto(b.at, b.roam, t, b.core);
      const sh = shimmerInto(b.sh, t, heat, calm || this.still);
      const screenX = b.root.x + at.x * b.root.scale;
      b.spot.x = at.x;
      b.spot.facing = at.facing;
      b.spot.screenX = screenX;
      // Off screen: hidden, not posed.
      const on = screenX > -OFF_SCREEN_PX && screenX < width + OFF_SCREEN_PX;
      if (b.holder.visible !== on) b.holder.setVisible(on);
      if (!on) {
        if (b.mirror.visible) b.mirror.setVisible(false);
        b.spot.mirror = 0;
        continue;
      }
      // A walker's step-bob on its own beat (none while it stands, or with reduce motion).
      const bob =
        at.walking && !calm && !this.still
          ? -b.roam.bobPx * Math.abs(Math.sin(t * 5.1 + b.roam.phaseSeconds))
          : 0;
      // Set only on change (review: unchanged setters every frame showed in the profile).
      place(b.holder, at.x + sh.herdDx, bob, at.facing, 1);
      b.herd.update(tick, calm, width);
      // The mirror: flipped about the ground line, squashed, its feet `gapPx` below the herd's;
      // shown only while the heat shows it, posed as the herd is (no second pose pass).
      const mirrorOn = sh.alpha > 0.01;
      if (b.mirror.visible !== mirrorOn) b.mirror.setVisible(mirrorOn);
      b.spot.mirror = 0;
      if (!mirrorOn) continue;
      const sq = b.roam.reflect.squash * sh.squash;
      place(
        b.mirror,
        at.x + sh.mirrorDx,
        b.roam.herd.y * (1 + sq) + b.roam.reflect.gapPx,
        at.facing,
        -sq,
      );
      const alpha = b.roam.reflect.alpha * sh.alpha;
      if (b.mirror.alpha !== alpha) b.mirror.setAlpha(alpha);
      b.image.copyPose(b.herd);
      b.spot.mirror = b.mirror.alpha;
    }
  }

  destroy(): void {
    for (const b of this.built) {
      b.holder.destroy();
      b.mirror.destroy();
    }
    this.built.length = 0;
  }
}
