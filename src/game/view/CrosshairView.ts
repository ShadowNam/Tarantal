// v1.1 (D-032, GDD §17.1): the gun's own crosshair, built from its feel.json shape parts
// (gunLook.crosshairPrims) as Phaser Shape objects: a dark keyline under each line, the style's
// colour on top. Shapes keep their geometry between frames (no per-frame tessellation, M9) and
// use no texture memory (the low tier is close to its 128 MB cap, D-031 §6b). Rebuilt only when
// the weapon or the style changes; the Skiet-Skuur's crosshair styles will pass another style id
// (colours and line weight) and keep the shape, so the spread still reads.
import * as Phaser from 'phaser';
import type { CrosshairStyle, GunLook, Weapon } from '../../content/schemas';
import { crosshairPrims, crosshairWeapon, gunLookFor, type CrosshairPrim } from '../ui/gunLook';

const hex = (c: string): number => Number.parseInt(c.slice(1), 16);

export class CrosshairView {
  readonly root: Phaser.GameObjects.Container;
  private signature = '';
  private jitterPx = 0;
  /** The built crosshair's prims (test hook: what is drawn). */
  prims: readonly CrosshairPrim[] = [];
  /** The gun the built crosshair belongs to. */
  weaponId = '';
  /** v1.7b: the Bush Buckshot ring is drawn (spread multiplier above 1). */
  boosted = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly guns: GunLook,
    private readonly weapons: readonly Weapon[],
  ) {
    this.root = scene.add.container(0, 0).setVisible(false);
  }

  /** Builds the weapon's crosshair in a style (the default style when unknown). */
  /** The style's opacity (aiming shows the crosshair at this, not at 1). */
  alpha = 1;

  setWeapon(weaponId: string, styleId: string = this.guns.crosshairStyle, spreadMul = 1): void {
    const sig = `${weaponId}|${styleId}|${spreadMul}`;
    if (sig === this.signature) return;
    this.signature = sig;
    const style: CrosshairStyle | undefined =
      this.guns.crosshairStyles[styleId] ?? this.guns.crosshairStyles[this.guns.crosshairStyle];
    if (style === undefined) return;
    const look = gunLookFor(this.guns, weaponId);
    this.weaponId = weaponId;
    this.jitterPx = look.crosshair.jitterPx;
    this.prims = crosshairPrims(
      look.crosshair,
      crosshairWeapon(
        this.weapons.find((w) => w.id === weaponId),
        spreadMul,
      ),
    );
    this.root.removeAll(true);
    const objs: Phaser.GameObjects.GameObject[] = [];
    // Keyline pass first (all of it), then the colour pass, so crossing lines stay clean.
    for (const pass of ['keyline', 'color'] as const) {
      const color = hex(pass === 'keyline' ? style.keyline : style.color);
      const extra = pass === 'keyline' ? style.keylinePx * 2 : 0;
      for (const p of this.prims) {
        if (p.kind === 'dot') {
          objs.push(
            this.scene.add.circle(0, 0, p.r + (pass === 'keyline' ? style.keylinePx : 0), color),
          );
          continue;
        }
        const flat = p.pts.flatMap(([x, y]) => [x, y]);
        const poly = this.scene.add.polygon(0, 0, flat);
        // Points are around the aim point: draw them as given (no bounding-box centring).
        poly.setDisplayOrigin(0, 0);
        poly.closePath = p.closed;
        poly.setFillStyle();
        poly.setStrokeStyle(style.lineWidth * p.w + extra, color, 1);
        objs.push(poly);
      }
    }
    // v1.7b (D-046): Bush Buckshot — a warm ring round the widened spread, so the wider shot
    // is plain to see (local, steady: no flash).
    this.boosted = spreadMul > 1;
    if (this.boosted) {
      let r = 0;
      for (const p of this.prims) {
        if (p.kind === 'dot') r = Math.max(r, p.r);
        else for (const [x, y] of p.pts) r = Math.max(r, Math.hypot(x, y));
      }
      const ring = this.scene.add.circle(0, 0, r + 10);
      ring.setFillStyle();
      ring.setStrokeStyle(5, hex('#FF8A3A'), 0.9);
      const key = this.scene.add.circle(0, 0, r + 10);
      key.setFillStyle();
      key.setStrokeStyle(9, hex(style.keyline), 0.7);
      objs.unshift(key, ring);
    }
    this.root.add(objs);
    this.alpha = style.alpha;
    this.root.setAlpha(style.alpha);
  }

  /** Moves it to the aim point; a jittery crosshair (Mielie-Masjien) shakes around it. */
  place(x: number, y: number): void {
    const j = this.jitterPx;
    // Render-side shake: Math.random is fine outside the sim.
    if (j > 0)
      this.root.setPosition(x + (Math.random() * 2 - 1) * j, y + (Math.random() * 2 - 1) * j);
    else this.root.setPosition(x, y);
  }
}
