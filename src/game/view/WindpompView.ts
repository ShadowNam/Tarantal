// v1.6 (D-042, product owner 25 Oct): the windpomps' turning heads and wheels. The towers are
// prop art; the head (gearbox, tail boom, vane: fx/windpomp_vane) and the wheel (secret/rotor)
// are drawn here on the prop's layer, above the prop. The head swings into the omen wind on sim
// time and the wheel turns: fast when windy, a slow idle when calm (windpompMotion.ts). When the
// windpomp secret is live, WorldView's rotor (driven by the sim's angle, unchanged, face-on so the
// painted marks and the hit shapes match) is the wheel and this view draws only the head.
import * as Phaser from 'phaser';
import type { Biome } from '../../content/schemas';
import { TICKS_PER_SECOND } from '../../sim/clock';
import type { SimState } from '../../sim/types';
import { coreWidth } from '../../sim/world';
import { TEX } from '../assets/AssetManifest';
import type { ParallaxView } from './ParallaxView';
import { CALM_HEADING, stepPump, vaneScaleX, wheelSquash, type PumpMotion } from './windpompMotion';

/** Where each windpomp prop's head sits (prop px from its content position) and its size. */
const PUMPS: Readonly<Record<string, { ox: number; oy: number; scale: number }>> = {
  // The tower's turntable (tools/art/biomes/karoo.ts windpompTower; the secret's hub is (0, −70)).
  'karoo/windpomp': { ox: 0, oy: -70, scale: 1 },
  // The windpomp behind the Kalahari sign (tools/art/biomes/kalahari.ts windpompSign).
  'kalahari/windpomp_sign': { ox: 92, oy: -186, scale: 0.6 },
};

/** The head's pivot (the gearbox over the turntable) in fx/windpomp_vane, as fractions (docs/06). */
const VANE_PIVOT = { x: 290 / 320, y: 70 / 140 } as const;

interface Pump {
  readonly propId: string;
  readonly hubX: number;
  readonly hubY: number;
  readonly scale: number;
  readonly vane: Phaser.GameObjects.Image;
  readonly wheelBox: Phaser.GameObjects.Container;
  readonly wheel: Phaser.GameObjects.Image;
  motion: PumpMotion;
}

export class WindpompView {
  private readonly pumps: Pump[] = [];
  private lastTick: number | null = null;

  constructor(scene: Phaser.Scene, biome: Biome, parallax: ParallaxView) {
    for (const prop of biome.props) {
      const spec = PUMPS[prop.asset];
      const layer = parallax.layer(prop.layer);
      const def = biome.layers.find((l) => l.id === prop.layer);
      if (spec === undefined || layer === undefined || def === undefined) continue;
      const hubX = prop.u * coreWidth(def.scrollFactor) + spec.ox;
      const hubY = prop.y + spec.oy;
      const vane = scene.add
        .image(hubX, hubY, TEX.windpompVane)
        .setOrigin(VANE_PIVOT.x, VANE_PIVOT.y);
      const wheel = scene.add.image(0, 0, TEX.rotor);
      const wheelBox = scene.add.container(hubX, hubY, [wheel]);
      // Behind the secret's own rotor and marks (added to the fixtures later).
      layer.fixtures.addAt(wheelBox, 0);
      layer.fixtures.addAt(vane, 0);
      const pump: Pump = {
        propId: prop.id,
        hubX,
        hubY,
        scale: spec.scale,
        vane,
        wheelBox,
        wheel,
        motion: { heading: CALM_HEADING, angle: (prop.u * 977) % (Math.PI * 2) },
      };
      this.pose(pump, false);
      this.pumps.push(pump);
    }
  }

  private pose(p: Pump, live: boolean): void {
    const h = p.motion.heading;
    p.vane.setScale(vaneScaleX(h) * p.scale, p.scale);
    p.wheelBox.setVisible(!live);
    if (live) return;
    // The wheel sits in front of the head, shifted toward the side it faces.
    p.wheelBox
      .setPosition(p.hubX - h * 10 * p.scale, p.hubY)
      .setScale(wheelSquash(h) * p.scale, p.scale);
    p.wheel.setRotation(p.motion.angle);
  }

  update(s: SimState): void {
    if (this.pumps.length === 0) return;
    const dt =
      this.lastTick === null
        ? 0
        : Math.min(0.5, Math.max(0, s.tick - this.lastTick) / TICKS_PER_SECOND);
    this.lastTick = s.tick;
    for (const p of this.pumps) {
      p.motion = stepPump(p.motion, s.wind, dt);
      this.pose(
        p,
        s.secrets.some((sec) => sec.propId === p.propId),
      );
    }
  }

  /** A hunt ended: the next one starts its clock afresh (the objects live with the layers). */
  clear(): void {
    this.lastTick = null;
  }
}
