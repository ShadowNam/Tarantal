// First-person gun, muzzle flash and reticle (art bible §6, GDD §17). Screen-space.
// The muzzle flash is a small local sprite at the barrel — never a full-screen brighten.
// On touch the gun shrinks to 60 % and fades to 40 % while a finger is down.
// D-029: a gun delivered as an animated rig (asset index `guns`) plays its idle, fire (recoil) and
// reload clips and its own muzzle-flash clip at the rig's muzzle; otherwise the single image.
import * as Phaser from 'phaser';
import type { LivePrefs } from '../prefs';
import type { Feel, Weapon } from '../../content/schemas';
import type { GunClip } from '../assets/assetIndex';
import { gunKey, TEX, type FinalGun } from '../assets/AssetManifest';

const GUN_TEX_HEIGHT = 520;
/** Width of the gun frame box (design px): rig tipX/originX are fractions of it. */
const GUN_TEX_WIDTH = 420;
/** Placeholder guns: the muzzle sits this far above the grip (texture px). */
const BARREL_LEN = 500;

export class WeaponView {
  private readonly scene: Phaser.Scene;
  private readonly feel: Feel;
  private readonly gun: Phaser.GameObjects.Sprite;
  private readonly flash: Phaser.GameObjects.Sprite;
  /** The delivered rig in use, or null (placeholder or single image). */
  private rig: FinalGun | null = null;
  private weaponId = '';
  private reloading = false;
  /** Scene time the current reload began (the clip resumes from it when a late rig arrives). */
  private reloadSince = 0;
  /** The touch shrink in use (1, 0.8 or the finger-down scale), before the rig's atlas scale. */
  private displayScale = 1;
  /** e2e/dev only (art previews): the gun is frozen on one clip frame (kick and flash held). */
  private frozen = false;
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
    /** D-029: the delivered animated gun for a weapon id (null = single image / placeholder). */
    private readonly gunRig: (weaponId: string) => FinalGun | null = () => null,
    /** Weapon definitions (reload time and style for the reload clip). */
    private readonly weapons: readonly Weapon[] = [],
  ) {
    this.scene = scene;
    this.feel = feel;
    this.gun = scene.add.sprite(0, 0, TEX.gun).setOrigin(0.5, 1);
    this.flash = scene.add.sprite(0, 0, TEX.flash).setVisible(false);
    // A finished fire clip hands over to a reload that began meanwhile (the Voorlaaier reloads
    // from the same tick it fires); otherwise fire and reload settle back on the idle frame.
    this.gun.on(
      Phaser.Animations.Events.ANIMATION_COMPLETE,
      (anim: Phaser.Animations.Animation) => {
        if (anim.key.endsWith('/fire') && this.reloading) {
          this.startReload();
          return;
        }
        this.showIdle();
      },
    );
    this.reticle = scene.add.image(0, 0, TEX.reticle).setVisible(false);
    layer.add([this.flash, this.gun, this.reticle]);
    this.layer = layer;
  }

  /** Shows the active weapon's art (crate weapons have their own; others the shotgun). */
  setWeapon(weaponId: string): void {
    if (this.frozen && this.weaponId !== '') return;
    // Same gun: only worth another look while its rig hasn't arrived (late group, D-029).
    const sameWeapon = weaponId === this.weaponId;
    if (sameWeapon && (this.rig !== null || this.gunRig(weaponId) === null)) return;
    this.weaponId = weaponId;
    // A real weapon change resets the reload; the same weapon's rig arriving late (final review,
    // D-029) keeps it and picks the reload clip up where the reload has got to.
    if (!sameWeapon) this.reloading = false;
    const rig = this.gunRig(weaponId);
    this.rig = rig !== null && this.scene.textures.exists(rig.atlasKey) ? rig : null;
    if (this.rig !== null) {
      this.gun.stop();
      this.showIdle();
      // Cropped frames carry their own pivot (the grip); full-box frames use the entry's origin.
      if (this.rig.entry.pivots !== true)
        this.gun.setOrigin(this.rig.entry.originX, this.rig.entry.originY);
      if (sameWeapon && this.reloading) this.startReload(this.scene.time.now - this.reloadSince);
      return;
    }
    const key = this.scene.textures.exists(gunKey(weaponId)) ? gunKey(weaponId) : TEX.gun;
    this.gun.stop();
    this.gun.setTexture(key).setOrigin(0.5, 1);
  }

  /**
   * D-029: the snapshot's reload state. A rig with a `reload` clip plays it stretched to the
   * weapon's reloadMs (looping once per shell for per-shell reloads) and returns to idle after.
   */
  setReloading(on: boolean): void {
    if (on === this.reloading || this.frozen) return;
    this.reloading = on;
    if (on) this.reloadSince = this.scene.time.now;
    const rig = this.rig;
    if (rig === null) return;
    if (!on) {
      if (this.gun.anims.currentAnim?.key === this.animKey(rig, 'reload')) {
        this.gun.stop();
        this.showIdle();
      }
      return;
    }
    // Let the shot's recoil finish first; the fire clip's end starts the reload.
    if (this.gun.anims.isPlaying && this.gun.anims.currentAnim?.key === this.animKey(rig, 'fire')) {
      return;
    }
    this.startReload();
  }

  /** Plays the reload clip stretched to the weapon's reloadMs, or rests on idle if there is none. */
  private startReload(elapsedMs = 0): void {
    const rig = this.rig;
    if (rig === null) return;
    const clip = rig.entry.clips.reload;
    const def = this.weapons.find((w) => w.id === this.weaponId);
    const ms = def?.reloadMs ?? 0;
    const key = clip === undefined || ms <= 0 ? null : this.ensureAnim(rig, 'reload');
    if (clip === undefined || key === null) {
      this.showIdle();
      return;
    }
    const perShell = def !== undefined && 'perShellReload' in def && def.perShellReload;
    const n = clip.frames.length;
    // Resume where the reload has got to (a rig that arrived mid-reload); per-shell loops wrap.
    const done = Math.max(0, Math.floor((elapsedMs / ms) * n));
    const startFrame = perShell ? done % n : Math.min(n - 1, done);
    this.gun.play({
      key,
      frameRate: (n * 1000) / ms,
      repeat: perShell ? -1 : 0,
      startFrame,
    });
  }

  private animKey(rig: FinalGun, clip: GunClip): string {
    return `${rig.atlasKey}/${clip}`;
  }

  /** The animation for one of the rig's clips, created on first use (null if not delivered). */
  private ensureAnim(rig: FinalGun, clip: GunClip): string | null {
    const c = rig.entry.clips[clip];
    if (c === undefined) return null;
    const key = this.animKey(rig, clip);
    if (!this.scene.anims.exists(key))
      this.scene.anims.create({
        key,
        frames: c.frames.map((frame) => ({ key: rig.atlasKey, frame })),
        frameRate: c.fps,
        repeat: c.loop ? -1 : 0,
      });
    return key;
  }

  private showIdle(): void {
    const rig = this.rig;
    const frame = rig?.entry.clips.idle?.frames[0];
    if (rig === null || frame === undefined) return;
    this.gun.setTexture(rig.atlasKey, frame);
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
    if (this.frozen) return;
    this.kick = 1;
    if (this.gunHidden) return;
    const rig = this.rig;
    if (rig !== null) {
      const fire = this.ensureAnim(rig, 'fire');
      if (fire !== null) this.gun.play(fire);
    }
    const { x, y } = this.barrelTip();
    const own = rig === null ? null : this.ensureAnim(rig, 'flash');
    this.flash
      .setPosition(x, y)
      .setVisible(true)
      .setAlpha(this.prefs.flashAlpha)
      .setScale(this.displayScale * (rig?.scale ?? 1) * (0.8 + Math.random() * 0.3));
    if (own !== null && rig !== null) {
      // The gun's own flash is drawn along the barrel: it turns with the gun. Its frames carry
      // their centre as the pivot when cropped.
      this.flash.setRotation(this.gun.rotation).play(own);
      if (rig.entry.pivots !== true) this.flash.setOrigin(0.5, 0.5);
    } else {
      this.flash.stop();
      this.flash
        .setTexture(TEX.flash)
        .setOrigin(0.5, 0.5)
        .setRotation(Math.random() * Math.PI);
    }
    this.scene.time.delayedCall(this.feel.juice.muzzleFlashMs, () => this.flash.setVisible(false));
  }

  /**
   * e2e/dev only (D-029 art previews): freezes the gun on a clip frame — `fire` holds a mid-recoil
   * kick and the muzzle flash; a placeholder gun shows its one image. Undo with `null`.
   */
  pose(weaponId: string, clip: GunClip | null, frame = 0): void {
    this.frozen = false;
    this.setWeapon(weaponId);
    this.frozen = clip !== null;
    this.gun.stop();
    this.flash.setVisible(false);
    if (clip === null) {
      this.showIdle();
      return;
    }
    const rig = this.rig;
    const name = rig?.entry.clips[clip]?.frames[frame];
    if (rig !== null && name !== undefined) this.gun.setTexture(rig.atlasKey, name);
    else this.showIdle();
    this.kick = clip === 'fire' ? 0.6 : 0;
    this.update(0);
    if (clip !== 'fire' || frame > 0) return;
    const { x, y } = this.barrelTip();
    const flash = rig?.entry.clips.flash?.frames[0];
    this.flash
      .setPosition(x, y)
      .setVisible(true)
      .setAlpha(this.prefs.flashAlpha)
      .setScale(this.displayScale * (rig?.scale ?? 1));
    if (rig !== null && flash !== undefined) {
      this.flash.setTexture(rig.atlasKey, flash).setRotation(this.gun.rotation);
      if (rig.entry.pivots !== true) this.flash.setOrigin(0.5, 0.5);
    } else this.flash.setTexture(TEX.flash).setOrigin(0.5, 0.5).setRotation(0.4);
  }

  update(deltaMs: number): void {
    const j = this.feel.juice;
    if (this.frozen && deltaMs > 0) deltaMs = 0;
    this.kick = Math.max(0, this.kick - deltaMs / j.gunKickMs);
    const shrink = this.touchMode && this.touchDown;
    const scale = shrink ? j.gunTouchScale : this.touchMode ? 0.8 : 1;
    const alpha = shrink ? j.gunTouchAlpha : 1;
    this.displayScale = scale;
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
      // A @2x rig atlas (high tier) is drawn at half scale (FinalGun.scale).
      .setScale(scale * (this.rig?.scale ?? 1))
      .setAlpha(alpha);
    if (this.touchMode && this.reticle.visible && this.scene.time.now > this.reticleHideAt) {
      this.reticle.setAlpha(Math.max(0, this.reticle.alpha - deltaMs / 250));
      if (this.reticle.alpha <= 0) this.reticle.setVisible(false);
    }
  }

  private barrelTip(): { x: number; y: number } {
    const r = this.gun.rotation;
    const e = this.rig?.entry;
    // Muzzle relative to the grip in design px (rig: rig.json tipX/tipY, fractions of the box),
    // whatever the atlas resolution or crop.
    const dx = e === undefined ? 0 : (e.tipX - e.originX) * GUN_TEX_WIDTH;
    const dy = e === undefined ? -BARREL_LEN : (e.tipY - e.originY) * GUN_TEX_HEIGHT;
    const sx = dx * this.displayScale;
    const sy = dy * this.displayScale;
    return {
      x: this.gun.x + sx * Math.cos(r) - sy * Math.sin(r),
      y: this.gun.y + sx * Math.sin(r) + sy * Math.cos(r),
    };
  }
}
