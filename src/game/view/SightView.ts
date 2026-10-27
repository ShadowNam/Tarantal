// v1.3 (D-036, GDD §10.6): the sight picture while a rifle's sight is raised — iron sights (rear
// notch and front post), the peep (aperture ring with the front post), or the scope (dark tube and
// lens edge around the glass, a duplex reticle). Drawn unzoomed above the world at the reticle
// (zoomView.ts), fading in with the raise. The world itself is zoomed by ParallaxView. Shapes and
// rectangles for the reticle and the screen fill: crisp at any zoom, no extra texture memory.
import * as Phaser from 'phaser';
import { TEX, type AssetManifest } from '../assets/AssetManifest';
import {
  BARREL_BOTTOM,
  REAR_DROP_PX,
  IRON_PLATE,
  PEEP_CLEAR_R,
  PEEP_DARK,
  SCOPE_DARK,
  SCOPE_GLASS_R,
  SIGHT_SCALE,
} from '../placeholder/sightArt';
import type { ZoomState } from './zoomView';

/** 1.9.2 (D-055): 'red_dot' is the Rooikol power-up's reticle (no content sight has it). */
export type SightPicture = 'iron' | 'peep' | 'scope' | 'scope_range' | 'red_dot';

/** 1.9.2 (D-055): the red dot's look (design px): the dot, its soft glow and a faint ring. */
const RED_DOT = { dot: 7, glow: 16, ring: 46, colour: 0xff2a1a, core: 0xffd0c8 } as const;

const hex = (c: string): number => Number.parseInt(c.slice(1), 16);

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

  /** The picture drawn now (null = none). */
  get current(): SightPicture | null {
    return this.picture;
  }

  /** v1.6 (D-042): drops the picture so the next setPicture() rebuilds it (new textures). */
  reset(): void {
    this.setPicture(null);
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
    if (picture === 'red_dot') {
      // 1.9.2 (D-055) Rooikol: no tube, no glass edge, no zoom: a bright red dot with a soft
      // glow, a faint ring to find it against a busy veld, and a pale core so it reads on red.
      const ret = this.scene.add.container(0, 0);
      ret.add([
        this.scene.add.circle(0, 0, RED_DOT.ring, 0, 0).setStrokeStyle(2, RED_DOT.colour, 0.45),
        this.scene.add.circle(0, 0, RED_DOT.glow, RED_DOT.colour, 0.28),
        this.scene.add.circle(0, 0, RED_DOT.dot, RED_DOT.colour, 1).setStrokeStyle(1.5, 0x3a0805),
        this.scene.add.circle(0, 0, RED_DOT.dot * 0.35, RED_DOT.core, 1),
      ]);
      this.reticle = add(ret);
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
    if (picture === 'scope_range') {
      // v1.4 (D-038) Langloop: a fine cross with range marks below the centre for holding over
      // (longer marks every other step), and thin posts toward the edge.
      const step = r * 0.09;
      ret.add([
        this.scene.add.rectangle(0, 0, r * 2, thin * 0.75, ink),
        this.scene.add.rectangle(0, 0, thin * 0.75, r * 2, ink),
        this.scene.add.rectangle(-(inner + r) / 2, 0, r - inner, thick * 0.5, ink),
        this.scene.add.rectangle((inner + r) / 2, 0, r - inner, thick * 0.5, ink),
        this.scene.add.rectangle(0, -(inner + r) / 2, thick * 0.5, r - inner, ink),
      ]);
      for (let i = 1; i <= 4; i++)
        ret.add(this.scene.add.rectangle(0, i * step, i % 2 === 0 ? 34 : 20, thin, ink));
      this.reticle = add(ret);
      this.ring = image(TEX.sightScope, SIGHT_SCALE.scope);
      fill(SCOPE_DARK);
      return;
    }
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
  update(v: ZoomState, width: number, height: number): void {
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
      this.rear.setPosition(x, y + rise + REAR_DROP_PX);
      const s = this.rear.scaleX;
      const left = this.rear.x + (BARREL_BOTTOM.left - this.rear.displayOriginX) * s;
      const bottom = this.rear.y + this.rear.displayHeight * (1 - this.rear.originY) - 2;
      this.fills[0]
        ?.setPosition(left, bottom)
        .setSize((BARREL_BOTTOM.right - BARREL_BOTTOM.left) * s, Math.max(0, height - bottom));
    }
    if (this.ring !== null) {
      this.ring.setPosition(x, y);
      const half = this.ring.displayWidth / 2;
      const [l, r, t, b] = this.fills;
      // The screen around the ring's square, clipped to the screen (v1.3 review: no 6 000 px
      // rectangles for the rasterizer to clip every frame).
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(width, x + half);
      const y0 = Math.max(0, y - half);
      const y1 = Math.min(height, y + half);
      l?.setPosition(0, 0).setSize(Math.max(0, x0 + 1), height);
      r?.setPosition(x1 - 1, 0).setSize(Math.max(0, width - x1 + 1), height);
      t?.setPosition(x0, 0).setSize(Math.max(0, x1 - x0), Math.max(0, y0 + 1));
      b?.setPosition(x0, y1 - 1).setSize(Math.max(0, x1 - x0), Math.max(0, height - y1 + 1));
    }
  }

  /**
   * v1.4 (#56): with a ring sight (peep or scope) fully up, the screen outside the ring's square
   * is covered by the opaque sight fill and the ring's dark edge: the zoomed world only needs
   * drawing inside it (zoomed screen px). Null while the picture is still fading in, or for iron
   * sights (the world shows around them).
   */
  opaqueOutside(v: ZoomState): { x0: number; y0: number; x1: number; y1: number } | null {
    if (this.ring === null || v.raise < 1) return null;
    const half = this.ring.displayWidth / 2;
    return {
      x0: v.reticleX - half,
      y0: v.reticleY - half,
      x1: v.reticleX + half,
      y1: v.reticleY + half,
    };
  }

  /** Radius (design px) of the clear view in the middle (peep and scope), or null (iron). */
  clearRadius(): number | null {
    if (this.picture === 'peep') return PEEP_CLEAR_R * SIGHT_SCALE.peep;
    if (this.picture === 'scope' || this.picture === 'scope_range')
      return SCOPE_GLASS_R * SIGHT_SCALE.scope;
    return null;
  }
}
