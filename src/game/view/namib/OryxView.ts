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
import { ORYX_ROAMS, roamAt, shimmerAt, type OryxRoam } from './oryxRoam';

interface Built {
  readonly roam: OryxRoam;
  readonly core: number;
  readonly holder: Phaser.GameObjects.Container;
  readonly mirror: Phaser.GameObjects.Container;
  readonly herd: FaunaView;
  readonly image: FaunaView;
  readonly root: Phaser.GameObjects.Container;
}

export class OryxView {
  private readonly built: Built[] = [];
  /** e2e hook: where each herd stands now (layer px) and its reflection's alpha. */
  readonly spots: { key: string; x: number; facing: number; mirror: number; screenX: number }[] =
    [];

  constructor(
    scene: Phaser.Scene,
    manifest: AssetManifest,
    parallax: ParallaxView,
    biomeId: string,
    fauna: FaunaOptions,
    private readonly still: boolean,
  ) {
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
      this.built.push({ roam, core, holder, mirror, herd, image, root: layer.root });
    }
  }

  /** `heat`: oryxRoam.heatOf (the mirage and the light). */
  update(tick: number, calm: boolean, width: number, heat: number): void {
    const t = tick / TICKS_PER_SECOND;
    this.spots.length = 0;
    for (const b of this.built) {
      const at = roamAt(b.roam, t, b.core);
      const sh = shimmerAt(t, heat, calm || this.still);
      b.holder.setPosition(at.x + sh.herdDx, 0).setScale(at.facing, 1);
      // The mirror: flipped about the ground line, squashed, its feet `gapPx` below the herd's.
      const sq = b.roam.reflect.squash * sh.squash;
      b.mirror
        .setPosition(at.x + sh.mirrorDx, b.roam.herd.y * (1 + sq) + b.roam.reflect.gapPx)
        .setScale(at.facing, -sq)
        .setAlpha(b.roam.reflect.alpha * sh.alpha)
        .setVisible(sh.alpha > 0.01);
      b.herd.update(tick, calm, width);
      b.image.update(tick, calm, width);
      this.spots.push({
        key: b.roam.herd.key,
        x: at.x,
        facing: at.facing,
        mirror: b.mirror.visible ? b.mirror.alpha : 0,
        screenX: b.root.x + at.x * b.root.scale,
      });
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
