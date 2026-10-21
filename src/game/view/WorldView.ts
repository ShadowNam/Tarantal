// M4 world things drawn from the snapshot (never from sim internals): secret rotors and part
// marks, hint glints, supply crates, dust devils, the Meerkat Spotter's reveal rings and helper,
// and wind-blown leaves/dust (omen visual flags). Everything here is driven by the biome JSON
// through the snapshot, so a secret removed from the JSON simply has nothing to draw.
import * as Phaser from 'phaser';
import type { LivePrefs } from '../prefs';
import type { Biome, ContentBundle, Feel } from '../../content/schemas';
import type { SimState } from '../../sim/types';
import { coreWidth } from '../../sim/world';
import { TEX } from '../assets/AssetManifest';
import type { ParallaxView } from './ParallaxView';

/** Rendering only: dust devils sway this much (radians) and this fast (ms per sway). */
const DEVIL_SWAY = 0.08;
const DEVIL_SWAY_MS = 260;
/** At most this many wind particles alive at once. */
const MAX_WIND_PARTICLES = 40;

interface SecretArt {
  readonly rotor: Phaser.GameObjects.Image | null;
  /** Rotor hub on its layer. */
  readonly hubX: number;
  readonly hubY: number;
  readonly marks: Map<string, Phaser.GameObjects.Image>;
}

/** Storm look (rendering only): the gloom under the storm and the light of a flash. */
const STORM_GLOOM_ALPHA = 0.32;
const FLASH_ALPHA = 0.45;
const FLASH_ALPHA_REDUCED = 0.15;
/** Widest design screen (21:9, Tech §3.3): rain falls across all of it. */
const MAX_SCREEN_WIDTH = 2520;

export class WorldView {
  private readonly scene: Phaser.Scene;
  private readonly feel: Feel;
  private readonly parallax: ParallaxView;
  private readonly biome: Biome;
  private readonly secretArt = new Map<string, SecretArt>();
  private readonly crates = new Map<number, Phaser.GameObjects.Image>();
  private readonly devils = new Map<number, Phaser.GameObjects.Image>();
  private readonly stones = new Map<number, Phaser.GameObjects.Image>();
  private glare: Phaser.GameObjects.Image | null = null;
  /** Rain streaks and the sun-shower rainbow: made the first time it rains (rain biomes only). */
  private rain: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private rainbow: Phaser.GameObjects.Image | null = null;
  /** Storm gloom and lightning light (Kalahari storm, Die Stormvoël outside his boss hunt). */
  private gloom: Phaser.GameObjects.Rectangle | null = null;
  private flashLight: Phaser.GameObjects.Rectangle | null = null;
  private readonly midScroll: number;
  private readonly rings: Phaser.GameObjects.Image[] = [];
  private readonly windBits: Phaser.GameObjects.Image[] = [];
  private readonly screen: Phaser.GameObjects.Container;
  private readonly helper: Phaser.GameObjects.Image;
  /** Power-ups that bring a helper creature (helpers' `grants`, birds.json). */
  private readonly helperPowerups: ReadonlySet<string>;
  private readonly planeScale: Readonly<Record<'near' | 'mid' | 'far', number>>;
  private nextGlintAt = 0;
  private windCredit = 0;

  constructor(
    scene: Phaser.Scene,
    content: ContentBundle,
    feel: Feel,
    biome: Biome,
    parallax: ParallaxView,
    screen: Phaser.GameObjects.Container,
    private readonly prefs: LivePrefs,
  ) {
    this.scene = scene;
    this.feel = feel;
    this.parallax = parallax;
    this.biome = biome;
    this.screen = screen;
    const { planes } = content.scoring;
    this.planeScale = { near: planes.near.scale, mid: planes.mid.scale, far: planes.far.scale };
    this.midScroll = planes.mid.scrollFactor;
    this.helperPowerups = new Set(
      content.birds.creatures.flatMap((c) => (c.kind === 'helper' ? [c.grants] : [])),
    );
    this.helper = scene.add.image(0, 0, TEX.meerkat).setVisible(false);
    screen.add(this.helper);
  }

  /** Draws this frame. `width`/`height` are the visible design size. */
  update(s: SimState, width: number, height: number): void {
    const now = this.scene.time.now;
    this.drawSecrets(s, now);
    this.drawCrates(s);
    this.drawDevils(s, now);
    this.drawStones(s, width, height);
    if (s.glare !== null) this.drawGlare(s.glare, width, height);
    if (s.rain || this.rain !== null) this.drawRain(s.rain);
    if (s.lightning || this.flashLight !== null || (s.rain && this.biome.omen.storm !== undefined))
      this.drawStorm(s, width, height);
    this.drawRings(s);
    this.drawHelper(s, width, height);
    this.blowWind(s, width, height);
  }

  private drawSecrets(s: SimState, now: number): void {
    const glint = now >= this.nextGlintAt;
    if (glint) this.nextGlintAt = now + this.feel.juice.glintEveryMs;
    for (const sec of s.secrets) {
      const layer = this.parallax.layer(sec.layerId);
      if (layer === undefined) continue;
      let art = this.secretArt.get(sec.propId);
      if (art === undefined) {
        const def = this.biome.props.find((p) => p.id === sec.propId)?.secret;
        const rotorDef = def?.type === 'multiHit' ? def.rotor : undefined;
        const prop = this.biome.props.find((p) => p.id === sec.propId);
        const hubX = (prop?.u ?? 0) * coreWidth(layer.scrollFactor) + (rotorDef?.ox ?? 0);
        const hubY = (prop?.y ?? 0) + (rotorDef?.oy ?? 0);
        const rotor = rotorDef === undefined ? null : this.scene.add.image(hubX, hubY, TEX.rotor);
        if (rotor !== null) layer.fixtures.add(rotor);
        art = { rotor, hubX, hubY, marks: new Map() };
        // Multi-hit secrets show which parts to hit (painted marks); single hits stay hidden
        // until a glint or the Meerkat Spotter gives them away.
        if (def?.type === 'multiHit') {
          for (const part of sec.parts) {
            const m = this.scene.add.image(part.x, part.y, TEX.mark);
            layer.fixtures.add(m);
            art.marks.set(part.id, m);
          }
        }
        this.secretArt.set(sec.propId, art);
      }
      art.rotor?.setPosition(art.hubX, art.hubY).setRotation(sec.angle);
      for (const part of sec.parts) {
        const m = art.marks.get(part.id);
        if (m === undefined) continue;
        m.setPosition(part.x, part.y).setRotation(sec.angle);
        const key = part.hit || !sec.ready ? TEX.markHit : TEX.mark;
        if (m.texture.key !== key) m.setTexture(key);
        m.setVisible(!sec.done);
      }
      if (glint && sec.ready) {
        const part = sec.parts.find((p) => !p.hit);
        if (part !== undefined) this.glint(layer.fixtures, part.x, part.y);
      }
    }
  }

  private glint(layer: Phaser.GameObjects.Container, x: number, y: number): void {
    const g = this.scene.add
      .image(x, y, TEX.glint)
      .setScale(0)
      .setAlpha(0.95 * this.prefs.flashAlpha);
    layer.add(g);
    this.scene.tweens.add({
      targets: g,
      scale: 0.8,
      angle: 45,
      yoyo: true,
      duration: this.feel.juice.glintMs / 2,
      onComplete: () => {
        g.destroy();
      },
    });
  }

  private drawCrates(s: SimState): void {
    const seen = new Set<number>();
    for (const c of s.crates) {
      seen.add(c.id);
      const key = c.landed ? TEX.crateBox : TEX.crateChute;
      let img = this.crates.get(c.id);
      if (img === undefined) {
        img = this.scene.add.image(c.x, c.y, key);
        this.parallax.plane(c.plane).overlay?.add(img);
        this.crates.set(c.id, img);
      }
      if (img.texture.key !== key) img.setTexture(key);
      const o = img.texture.key === TEX.crateChute ? { x: 0.5, y: 290 / 360 } : { x: 0.5, y: 0.5 };
      const scale = c.plane === 'near' ? 1 : c.plane === 'mid' ? 0.55 : 0.3;
      img.setOrigin(o.x, o.y).setPosition(c.x, c.y).setScale(scale);
    }
    for (const [id, img] of this.crates) {
      if (seen.has(id)) continue;
      img.destroy();
      this.crates.delete(id);
    }
  }

  private drawDevils(s: SimState, now: number): void {
    const seen = new Set<number>();
    for (const d of s.dustDevils) {
      seen.add(d.id);
      let img = this.devils.get(d.id);
      if (img === undefined) {
        img = this.scene.add.image(d.x, d.y, TEX.dustDevil).setOrigin(0.5, 500 / 520);
        this.parallax.plane(d.plane).overlay?.add(img);
        this.devils.set(d.id, img);
      }
      img
        .setPosition(d.x, d.y)
        .setScale(d.radius / 150, d.radius / 150)
        .setRotation(Math.sin(now / DEVIL_SWAY_MS + d.id) * DEVIL_SWAY);
    }
    for (const [id, img] of this.devils) {
      if (seen.has(id)) continue;
      this.scene.tweens.add({
        targets: img,
        alpha: 0,
        duration: 300,
        onComplete: () => {
          img.destroy();
        },
      });
      this.devils.delete(id);
    }
  }

  /**
   * The storm sky darkens the scene while it rains; a lightning flash lights it up. Flashes come
   * from the sim (never more than 2 a second, D-025); "reduce flashes" dims them. The Stormvoël's
   * boss-hunt darkness is the Season HUD's overlay, so this one stays off then.
   */
  private drawStorm(s: SimState, width: number, height: number): void {
    if (s.season?.dark === true) return;
    if (this.flashLight === null) {
      this.gloom = this.scene.add.rectangle(0, 0, width, height, 0x1c2230).setOrigin(0, 0);
      this.flashLight = this.scene.add.rectangle(0, 0, width, height, 0xe8f1ff).setOrigin(0, 0);
      this.screen.addAt(this.gloom, 0);
      this.screen.addAt(this.flashLight, 1);
    }
    const storming = s.rain && this.biome.omen.storm !== undefined;
    this.gloom?.setSize(width, height).setAlpha(storming && !s.lightning ? STORM_GLOOM_ALPHA : 0);
    const lit = this.prefs.reduceFlashes ? FLASH_ALPHA_REDUCED : FLASH_ALPHA;
    this.flashLight.setSize(width, height).setAlpha(s.lightning ? lit : 0);
  }

  /** Rain (omen visual flag `rain`): streaks from a particle emitter, and a rainbow (`rainbow`). */
  private drawRain(raining: boolean): void {
    const flags = this.biome.omen.visual;
    if (flags?.rain !== true) return;
    if (this.rain === null) {
      const rate = this.feel.juice.rainParticlesPerSec * this.prefs.particleScale;
      this.rain = this.scene.add.particles(0, -40, TEX.rain, {
        x: { min: 0, max: MAX_SCREEN_WIDTH },
        speedY: { min: 1000, max: 1300 },
        speedX: { min: -160, max: -100 },
        rotate: 6,
        lifespan: 1300,
        alpha: { start: 0.8, end: 0.4 },
        frequency: rate > 0 ? 1000 / rate : -1,
        emitting: false,
      });
      this.screen.add(this.rain);
      // The rainbow hangs in the sky layer, behind the land and the birds.
      const sky = this.parallax.layers[0];
      if (flags.rainbow === true && sky !== undefined) {
        this.rainbow = this.scene.add
          .image(coreWidth(sky.scrollFactor) * 0.6, 640, TEX.rainbow)
          .setScale(2.4)
          .setAlpha(0);
        sky.root.add(this.rainbow);
      }
    }
    if (raining && !this.rain.emitting) this.rain.start();
    else if (!raining && this.rain.emitting) this.rain.stop();
    if (this.rainbow !== null) {
      const target = raining ? 0.45 : 0;
      this.rainbow.setAlpha(this.rainbow.alpha + (target - this.rainbow.alpha) * 0.02);
    }
  }

  /** Bushveld low sun (omen): a warm glare band on one edge of the screen (drawn only). */
  private drawGlare(g: NonNullable<SimState['glare']>, width: number, height: number): void {
    if (this.glare === null) {
      this.glare = this.scene.add.image(0, 0, TEX.glare).setAlpha(g.alpha);
      this.screen.addAt(this.glare, 0);
    }
    this.glare
      .setOrigin(1, 0)
      .setFlipX(g.side < 0)
      .setPosition(g.side > 0 ? width : g.widthPx, 0)
      .setDisplaySize(g.widthPx, height);
  }

  /** Kettie stones in the air: from the gun up to the aim point, shrinking as they go (the
   *  aim point follows the world as the camera pans; the mid plane stands in for depth). */
  private drawStones(s: SimState, width: number, height: number): void {
    if (s.projectiles.length === 0 && this.stones.size === 0) return;
    const seen = new Set<number>();
    for (const p of s.projectiles) {
      seen.add(p.shotId);
      let img = this.stones.get(p.shotId);
      if (img === undefined) {
        img = this.scene.add.image(0, 0, TEX.stone);
        this.screen.add(img);
        this.stones.set(p.shotId, img);
      }
      const k = Math.min(1, p.age / p.flightTicks);
      const tx = width / 2 + p.dx + (p.cx - s.cameraX) * this.midScroll;
      const lift = Math.sin(k * Math.PI) * 60;
      img
        .setPosition(width / 2 + (tx - width / 2) * k, height + (p.sy - height) * k - lift)
        .setScale(1.6 - 1.2 * k);
    }
    for (const [id, img] of this.stones) {
      if (seen.has(id)) continue;
      img.destroy();
      this.stones.delete(id);
    }
  }

  /** Meerkat Spotter (GDD §10.4): rings around target birds and ready secret parts. */
  private drawRings(s: SimState): void {
    const reveal = s.powerups.some((p) => this.helperPowerups.has(p.id));
    let used = 0;
    const ring = (layer: Phaser.GameObjects.Container | null, x: number, y: number, r: number) => {
      if (layer === null) return;
      let img = this.rings[used];
      if (img === undefined) {
        img = this.scene.add.image(0, 0, TEX.ring);
        this.rings.push(img);
      }
      if (img.parentContainer !== layer) layer.add(img);
      img
        .setVisible(true)
        .setPosition(x, y)
        .setScale(r / 90)
        .setRotation(this.scene.time.now / 900);
      used++;
    };
    if (reveal) {
      for (const b of s.birds) {
        if (b.kind === 'nonTarget' || !b.hittable) continue;
        const scale = this.planeScale[b.plane];
        ring(this.parallax.plane(b.plane).overlay, b.x, b.y, 120 * scale);
      }
    }
    // Oupa se Kaart (charm) makes the secrets glow for the whole hunt.
    if (reveal || s.season?.revealSecrets === true) {
      for (const sec of s.secrets) {
        if (!sec.ready) continue;
        const layer = this.parallax.layer(sec.layerId)?.fixtures ?? null;
        for (const p of sec.parts) if (!p.hit) ring(layer, p.x, p.y, 44);
      }
    }
    for (let i = used; i < this.rings.length; i++) this.rings[i]?.setVisible(false);
  }

  private drawHelper(s: SimState, width: number, height: number): void {
    const active = s.powerups.find((p) => this.helperPowerups.has(p.id));
    if (active === undefined) {
      this.helper.setVisible(false);
      return;
    }
    // Stands up bottom-left (beside the gadget button), sinks for the last half second.
    const left = active.ticksLeft ?? 0;
    const sink = Math.min(1, left / 30);
    this.helper
      .setVisible(true)
      .setPosition(width * 0.2, height + 210 * (1 - sink) - 10)
      .setScale(0.9);
  }

  /** Omen visual flags: leaves and dust blowing downwind, more in a strong wind. */
  private blowWind(s: SimState, width: number, height: number): void {
    const wind = s.wind;
    const flags = this.biome.omen.visual;
    if (wind === null || (flags?.leaves !== true && flags?.dust !== true)) return;
    const rate = this.feel.juice.windParticlesPerSec * wind.strength * this.prefs.particleScale;
    this.windCredit += rate / 60;
    while (this.windCredit >= 1) {
      this.windCredit -= 1;
      if (this.windBits.length >= MAX_WIND_PARTICLES) break;
      const leaf = flags.leaves === true && (flags.dust !== true || Math.random() < 0.5);
      const startX = wind.dir > 0 ? -40 : width + 40;
      const y = Math.random() * height * 0.85;
      const bit = this.scene.add
        .image(startX, y, leaf ? TEX.leaf : TEX.dust)
        .setScale(0.6 + Math.random() * 0.8);
      this.screen.add(bit);
      this.windBits.push(bit);
      this.scene.tweens.add({
        targets: bit,
        x: startX + wind.dir * (width + 80),
        y: y + (Math.random() - 0.3) * 160,
        angle: leaf ? wind.dir * 540 : 0,
        alpha: { from: 0.9, to: 0.2 },
        duration: (2400 + Math.random() * 1200) / (0.5 + wind.strength),
        onComplete: () => {
          bit.destroy();
          const i = this.windBits.indexOf(bit);
          if (i >= 0) this.windBits.splice(i, 1);
        },
      });
    }
  }

  clear(): void {
    for (const a of this.secretArt.values()) {
      a.rotor?.destroy();
      for (const m of a.marks.values()) m.destroy();
    }
    this.secretArt.clear();
    for (const c of this.crates.values()) c.destroy();
    this.crates.clear();
    for (const d of this.devils.values()) d.destroy();
    this.devils.clear();
    for (const r of this.rings) r.destroy();
    this.rings.length = 0;
    for (const b of this.windBits) b.destroy();
    this.windBits.length = 0;
  }
}
