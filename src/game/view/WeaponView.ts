// First-person gun, muzzle flash and reticle (art bible §6, GDD §17). Screen-space.
// The muzzle flash is a small local sprite at the barrel — never a full-screen brighten.
// On touch the gun shrinks to 60 % and fades to 40 % while a finger is down.
import * as Phaser from 'phaser';
import type { LivePrefs } from '../prefs';
import type { Feel } from '../../content/schemas';
import { gunKey, TEX } from '../assets/AssetManifest';

const GUN_TEX_HEIGHT = 520;
const BARREL_LEN = 500;

export class WeaponView {
  private readonly scene: Phaser.Scene;
  private readonly feel: Feel;
  private readonly gun: Phaser.GameObjects.Image;
  private readonly flash: Phaser.GameObjects.Image;
  private readonly reticle: Phaser.GameObjects.Image;
  private readonly layer: Phaser.GameObjects.Container;
  private baseX = 0;
  private baseY = 0;
  private kick = 0;
  private aimX = 0;
  private aimY = 0;
  private touchDown = false;
  private touchMode = false;
  private reticleHideAt = 0;
  private gunHidden = false;

  constructor(
    scene: Phaser.Scene,
    feel: Feel,
    layer: Phaser.GameObjects.Container,
    private readonly prefs: LivePrefs,
  ) {
    this.scene = scene;
    this.feel = feel;
    this.gun = scene.add.image(0, 0, TEX.gun).setOrigin(0.5, 1);
    this.flash = scene.add.image(0, 0, TEX.flash).setVisible(false);
    this.reticle = scene.add.image(0, 0, TEX.reticle).setVisible(false);
    layer.add([this.flash, this.gun, this.reticle]);
    this.layer = layer;
  }

  /** Shows the active weapon's art (crate weapons have their own; others the shotgun). */
  setWeapon(weaponId: string): void {
    const key = this.scene.textures.exists(gunKey(weaponId)) ? gunKey(weaponId) : TEX.gun;
    if (this.gun.texture.key !== key) this.gun.setTexture(key);
  }

  /** Thick black-powder smoke at the muzzle (Voorlaaier, weapons.json smokeMs). */
  smoke(ms: number, scale: number): void {
    const { x, y } = this.barrelTip();
    for (let k = 0; k < 3; k++) {
      const puff = this.scene.add
        .image(x + (k - 1) * 40, y - k * 20, TEX.smoke)
        .setScale(scale * 0.4)
        .setAlpha(0.9);
      this.layer.add(puff);
      this.scene.tweens.add({
        targets: puff,
        scale: scale,
        y: puff.y - 80,
        alpha: 0,
        duration: ms + k * 120,
        ease: 'Cubic.Out',
        onComplete: () => {
          puff.destroy();
        },
      });
    }
  }

  layout(gunX: number, gunY: number): void {
    this.baseX = gunX;
    this.baseY = gunY;
    if (this.aimX === 0 && this.aimY === 0) {
      this.aimX = gunX;
      this.aimY = gunY / 2;
    }
  }

  setTouchMode(touch: boolean): void {
    this.touchMode = touch;
  }

  setFingerDown(down: boolean): void {
    this.touchDown = down;
  }

  aim(x: number, y: number, showReticle: boolean): void {
    this.aimX = x;
    this.aimY = y;
    this.reticle.setPosition(x, y);
    if (showReticle) {
      this.reticle.setVisible(true).setAlpha(1);
      if (this.touchMode) this.reticleHideAt = this.scene.time.now + 350;
    }
  }

  /** M10 capture mode (?gun=0): no first-person gun or muzzle flash in the shot. */
  setVisible(on: boolean): void {
    this.gunHidden = !on;
    this.gun.setVisible(on);
    if (!on) this.flash.setVisible(false);
  }

  hideReticle(): void {
    this.reticle.setVisible(false);
  }

  fired(): void {
    this.kick = 1;
    if (this.gunHidden) return;
    const { x, y } = this.barrelTip();
    this.flash
      .setPosition(x, y)
      .setVisible(true)
      .setAlpha(this.prefs.flashAlpha)
      .setScale(this.gun.scaleX * (0.8 + Math.random() * 0.3))
      .setRotation(Math.random() * Math.PI);
    this.scene.time.delayedCall(this.feel.juice.muzzleFlashMs, () => this.flash.setVisible(false));
  }

  update(deltaMs: number): void {
    const j = this.feel.juice;
    this.kick = Math.max(0, this.kick - deltaMs / j.gunKickMs);
    const shrink = this.touchMode && this.touchDown;
    const scale = shrink ? j.gunTouchScale : this.touchMode ? 0.8 : 1;
    const alpha = shrink ? j.gunTouchAlpha : 1;
    // Lean the barrels toward the aim point; kick pushes the gun down and tilts it.
    const dx = this.aimX - this.baseX;
    const dy = Math.max(200, this.baseY - this.aimY);
    const lean = Math.atan2(dx, dy) * 0.35;
    this.gun
      .setPosition(
        this.baseX + dx * 0.08,
        this.baseY + this.kick * j.gunKickPx + GUN_TEX_HEIGHT * 0.12 * scale,
      )
      .setRotation(lean - this.kick * 0.06)
      .setScale(scale)
      .setAlpha(alpha);
    if (this.touchMode && this.reticle.visible && this.scene.time.now > this.reticleHideAt) {
      this.reticle.setAlpha(Math.max(0, this.reticle.alpha - deltaMs / 250));
      if (this.reticle.alpha <= 0) this.reticle.setVisible(false);
    }
  }

  private barrelTip(): { x: number; y: number } {
    const r = this.gun.rotation;
    const len = BARREL_LEN * this.gun.scaleY;
    return { x: this.gun.x + Math.sin(r) * len, y: this.gun.y - Math.cos(r) * len };
  }
}
