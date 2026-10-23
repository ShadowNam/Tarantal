// v1.3 (D-036, GDD §10.6): the sight picture while a rifle's sight is raised — iron sights (rear
// notch and front post), the peep (aperture ring with the front post), or the scope (dark tube and
// lens edge around the glass, a duplex reticle). Drawn unzoomed above the world at the reticle
// (zoomView.ts), fading in with the raise. The world itself is zoomed by ParallaxView. Shapes and
// rectangles for the reticle and the screen fill: crisp at any zoom, no extra texture memory.
import * as Phaser from 'phaser';
import { TEX, type AssetManifest } from '../assets/AssetManifest';
import {
  BARREL_BOTTOM,
  IRON_PLATE,
  PEEP_CLEAR_R,
  PEEP_DARK,
  SCOPE_DARK,
  SCOPE_GLASS_R,
  SIGHT_SCALE,
} from '../placeholder/sightArt';
import type { ZoomState } from './zoomView';

export type SightPicture = 'iron' | 'peep' | 'scope';

const hex = (c: string): number => Number.parseInt(c.slice(1), 16);
/** Screen fill around the ring: further than the widest screen from any reticle position. */
const FILL = 6000;

export class SightView {
  private readonly root: Phaser.GameObjects.Container;
  private picture: SightPicture | null = null;
  private readonly parts: Phaser.GameObjects.GameObject[] = [];
  /** Reticle and ring parts that are placed around the reticle each frame. */
  private ring: Phaser.GameObjects.Image | null = null;
  private front: Phaser.GameObjects.Image | null = null;
  private rear: Phaser.GameObjects.Image | null = null;
  private fills: Phaser.GameObjects.Rectangle[] = [];
  private reticle: Phaser.GameObjects.Container | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    layer: Phaser.GameObjects.Container,
    private readonly manifest: AssetManifest,
  ) {
    this.root = scene.add.container(0, 0).setVisible(false);
    layer.add(this.root);
  }

  /** Which picture this gun's sight draws (rebuilt only when it changes). */
  setPicture(picture: SightPicture | null): void {
    if (picture === this.picture) return;
    this.picture = picture;
    this.root.removeAll(true);
    this.parts.length = 0;
    this.ring = this.front = this.rear = this.reticle = null;
    this.fills = [];
    if (picture === null) return;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.root.add(o);
      return o;
    };
    const image = (key: string, scale: number): Phaser.GameObjects.Image => {
      const o = this.manifest.origin(key);
      return add(this.scene.add.image(0, 0, key).setOrigin(o.x, o.y).setScale(scale));
    };
    const fill = (color: string): void => {
      // Four rectangles around the ring's square (left, right, above, below).
      for (let i = 0; i < 4; i++)
        this.fills.push(add(this.scene.add.rectangle(0, 0, 1, 1, hex(color)).setOrigin(0, 0)));
    };
    if (picture === 'iron') {
      this.front = image(TEX.sightIronFront, SIGHT_SCALE.ironFront);
      this.rear = image(TEX.sightIronRear, SIGHT_SCALE.ironRear);
      this.fills.push(add(this.scene.add.rectangle(0, 0, 1, 1, hex(IRON_PLATE)).setOrigin(0, 0)));
      return;
    }
    if (picture === 'peep') {
      this.front = image(TEX.sightIronFront, SIGHT_SCALE.ironFront * 0.8);
      this.ring = image(TEX.sightPeep, SIGHT_SCALE.peep);
      fill(PEEP_DARK);
      return;
    }
    // Scope: duplex reticle — fine lines in the middle, heavier posts toward the edge.
    const r = SCOPE_GLASS_R * SIGHT_SCALE.scope;
    const ret = this.scene.add.container(0, 0);
    const ink = 0x0b0c0d;
    const thin = 2;
    const thick = 9;
    const inner = r * 0.42;
    ret.add([
      this.scene.add.rectangle(0, 0, inner * 2, thin, ink),
      this.scene.add.rectangle(0, 0, thin, inner * 2, ink),
      this.scene.add.rectangle(-(inner + r) / 2, 0, r - inner, thick, ink),
      this.scene.add.rectangle((inner + r) / 2, 0, r - inner, thick, ink),
      this.scene.add.rectangle(0, (inner + r) / 2, thick, r - inner, ink),
      this.scene.add.rectangle(0, -(inner + r) / 2, thick, r - inner, ink),
    ]);
    this.reticle = add(ret);
    this.ring = image(TEX.sightScope, SIGHT_SCALE.scope);
    fill(SCOPE_DARK);
  }

  /** Places the picture at the reticle and fades it in with the raise. */
  update(v: ZoomState, height: number): void {
    const on = this.picture !== null && v.raise > 0.02;
    this.root.setVisible(on);
    if (!on) return;
    const x = v.reticleX;
    const y = v.reticleY;
    // Iron sights come up from below as the gun is raised; the rings simply fade in.
    const rise = (1 - v.raise) * 260;
    this.root.setAlpha(this.picture === 'iron' ? Math.min(1, v.raise * 1.6) : v.raise);
    this.front?.setPosition(x, y + rise);
    this.reticle?.setPosition(x, y);
    if (this.rear !== null) {
      // The barrel carries on below the texture down to the bottom of the screen.
      this.rear.setPosition(x, y + rise);
      const s = this.rear.scaleX;
      const left = this.rear.x + (BARREL_BOTTOM.left - this.rear.displayOriginX) * s;
      const bottom = this.rear.y + this.rear.displayHeight * (1 - this.rear.originY) - 2;
      this.fills[0]
        ?.setPosition(left, bottom)
        .setSize((BARREL_BOTTOM.right - BARREL_BOTTOM.left) * s, height + FILL);
    }
    if (this.ring !== null) {
      this.ring.setPosition(x, y);
      const half = this.ring.displayWidth / 2;
      const [l, r, t, b] = this.fills;
      l?.setPosition(x - half - FILL, y - FILL).setSize(FILL + 1, FILL * 2);
      r?.setPosition(x + half - 1, y - FILL).setSize(FILL + 1, FILL * 2);
      t?.setPosition(x - half, y - half - FILL).setSize(half * 2, FILL + 1);
      b?.setPosition(x - half, y + half - 1).setSize(half * 2, FILL + 1);
    }
  }

  /** Radius (design px) of the clear view in the middle (peep and scope), or null (iron). */
  clearRadius(): number | null {
    if (this.picture === 'peep') return PEEP_CLEAR_R * SIGHT_SCALE.peep;
    if (this.picture === 'scope') return SCOPE_GLASS_R * SIGHT_SCALE.scope;
    return null;
  }
}
