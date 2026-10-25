// M4 world things drawn from the snapshot (never from sim internals): secret rotors and part
// marks, hint glints, supply crates, dust devils, the Meerkat Spotter's reveal rings and helper,
// and wind-blown leaves/dust (omen visual flags). Everything here is driven by the biome JSON
// through the snapshot, so a secret removed from the JSON simply has nothing to draw.
import * as Phaser from 'phaser';
import type { LivePrefs } from '../prefs';
import type { Biome, ContentBundle, Feel } from '../../content/schemas';
import type { PlaneId, SimState } from '../../sim/types';
import { TICKS_PER_SECOND } from '../../sim/clock';
import { coreWidth } from '../../sim/world';
import { TEX } from '../assets/AssetManifest';
import { powerupIcon } from '../ui/powerupIcons';
import type { ParallaxView } from './ParallaxView';
import { FlashGate, type FlashLimiter } from './flashLimit';
import { stampedeTintAlpha } from './juice';
import { mirageLook } from './mirage';
import { WindpompView } from './WindpompView';
import { MEERKAT_SHEET, SHEET_W, sheetFrames } from '../assets/desertAssets';

/** Rendering only: dust devils sway this much (radians) and this fast (ms per sway). */
const DEVIL_SWAY = 0.08;
const DEVIL_SWAY_MS = 260;
/** v1.4 B: mirage strips on the far plane (half again on Ver), before the quality tier. */
const MIRAGE_STRIPS = 10;
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
  private readonly crates = new Map<
    number,
    {
      img: Phaser.GameObjects.Image;
      /** v1.7b: the item's icon on the canopy and on the box front (screen layer). */
      tags: { disc: Phaser.GameObjects.Arc; pic: Phaser.GameObjects.Image }[];
      icon: string | null;
    }
  >();
  private readonly devils = new Map<number, Phaser.GameObjects.Image>();
  private readonly stones = new Map<number, Phaser.GameObjects.Image>();
  private glare: Phaser.GameObjects.Image | null = null;
  /** Rain streaks and the sun-shower rainbow: made the first time it rains (rain biomes only). */
  private rain: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private rainbow: Phaser.GameObjects.Image | null = null;
  /** Storm gloom and lightning light (Kalahari storm, Die Stormvoël outside his boss hunt). */
  private gloom: Phaser.GameObjects.Rectangle | null = null;
  private flashLight: Phaser.GameObjects.Rectangle | null = null;
  /** M10: lightning light only starts within the shared large-flash budget (≤ 3 a second). */
  private readonly stormFlash: FlashGate;
  /** GDD §17 Stampede sky tint: fades in and out, never pulses. */
  private stampedeTint: Phaser.GameObjects.Rectangle | null = null;
  private stampedeTarget = 0;
  private stormSize = { w: 0, h: 0 };
  private readonly midScroll: number;
  private readonly rings: Phaser.GameObjects.Image[] = [];
  private readonly windBits: Phaser.GameObjects.Image[] = [];
  private readonly screen: Phaser.GameObjects.Container;
  /** v1.3: full-screen overlays (glare, tints, storm, rain) that a sight's zoom never scales. */
  private readonly fixed: Phaser.GameObjects.Container;
  private readonly helper: Phaser.GameObjects.Image;
  /** v1.7 (D-044): the burrow the Spotter climbs out of on the desert maps. */
  private burrow: Phaser.GameObjects.Image | null = null;
  /** Power-ups that bring a helper creature (helpers' `grants`, birds.json). */
  private readonly helperPowerups: ReadonlySet<string>;
  private readonly planeScale: Readonly<Record<PlaneId, number>>;
  private nextGlintAt = 0;
  private windCredit = 0;
  /** v1.6 (D-042): the windpomps' turning heads and wheels. */
  private readonly windpomps: WindpompView;

  /** v1.2: the map's light makes ready secrets glow (dusk). */
  secretGlow = false;
  /** v1.4 B: the OS asks for reduced motion (the mirage holds still). */
  reducedMotion = false;
  /** v1.4 B (D-039): the Namibië mirage strips, made the first frame the mirage is on. */
  private mirageStrips:
    { img: Phaser.GameObjects.Image; phase: number; base: number; sx: number }[] | null = null;

  constructor(
    scene: Phaser.Scene,
    content: ContentBundle,
    feel: Feel,
    biome: Biome,
    parallax: ParallaxView,
    screen: Phaser.GameObjects.Container,
    private readonly prefs: LivePrefs,
    flashes: FlashLimiter,
    fixed: Phaser.GameObjects.Container = screen,
  ) {
    this.fixed = fixed;
    this.stormFlash = new FlashGate(flashes);
    this.scene = scene;
    this.feel = feel;
    this.parallax = parallax;
    this.biome = biome;
    this.screen = screen;
    const { planes } = content.scoring;
    this.planeScale = {
      near: planes.near.scale,
      mid: planes.mid.scale,
      far: planes.far.scale,
      ver: planes.ver.scale,
    };
    this.midScroll = planes.mid.scrollFactor;
    this.helperPowerups = new Set(
      content.birds.creatures.flatMap((c) => (c.kind === 'helper' ? [c.grants] : [])),
    );
    this.helper = scene.add.image(0, 0, TEX.meerkat).setVisible(false);
    screen.add(this.helper);
    this.windpomps = new WindpompView(scene, biome, parallax);
  }

  /** Draws this frame. `width`/`height` are the visible design size. */
  update(s: SimState, width: number, height: number): void {
    const now = this.scene.time.now;
    this.windpomps.update(s);
    this.parallax.driftClouds(s.tick, s.rain || s.lightning);
    this.drawSecrets(s, now);
    this.drawCrates(s);
    this.drawDevils(s);
    this.drawStones(s, width, height);
    if (s.glare !== null) this.drawGlare(s.glare, width, height);
    if (s.rain || this.rain !== null) this.drawRain(s.rain);
    if (s.lightning || this.flashLight !== null || (s.rain && this.biome.omen.storm !== undefined))
      this.drawStorm(s, width, height);
    if (s.stampedeActive || this.stampedeTint !== null)
      this.drawStampede(s.stampedeActive, width, height);
    if (s.mirage || this.mirageStrips !== null) this.drawMirage(s);
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
      let art = this.crates.get(c.id);
      if (art === undefined) {
        const layer = this.parallax.plane(c.plane).overlay;
        const img = this.scene.add.image(c.x, c.y, key);
        layer?.add(img);
        // v1.7b (D-046): what it holds, fully opaque on a cream disc with a dark ring: big on
        // the canopy while it falls, and on the box's front (where the stencil was). Drawn in the
        // screen layer, above every scenery layer, so no haze band or light tint washes it out.
        const icon = c.item === null ? null : powerupIcon(c.item);
        const shown = icon !== null && this.scene.textures.exists(icon) ? icon : null;
        const tags =
          shown === null
            ? []
            : [0, 1].map(() => {
                const disc = this.scene.add.circle(0, 0, 1, 0xf3ead3, 1);
                const pic = this.scene.add.image(0, 0, shown);
                this.screen.add([disc, pic]);
                return { disc, pic };
              });
        art = { img, tags, icon: shown };
        this.crates.set(c.id, art);
      }
      const img = art.img;
      if (img.texture.key !== key) img.setTexture(key);
      const chute = img.texture.key === TEX.crateChute;
      const o = chute ? { x: 0.5, y: 290 / 360 } : { x: 0.5, y: 0.5 };
      const scale = c.plane === 'near' ? 1 : c.plane === 'mid' ? 0.55 : 0.3;
      img.setOrigin(o.x, o.y).setPosition(c.x, c.y).setScale(scale);
      const sx = this.parallax.screenX(c.plane, c.x);
      // [canopy, box front] in texture px from the crate centre: the canopy's middle, and the
      // planked front's middle (the box art is the same on the chute and on the ground).
      const spots = [
        { show: chute, dx: 0, dy: -240, r: 74 },
        { show: true, dx: -9, dy: 13, r: 40 },
      ];
      art.tags.forEach((t, i) => {
        const spot = spots[i];
        const on = spot !== undefined && spot.show;
        t.disc.setVisible(on);
        t.pic.setVisible(on);
        if (!on) return;
        const r = spot.r * scale;
        const x = sx + spot.dx * scale;
        const y = c.y + spot.dy * scale;
        t.disc
          .setPosition(x, y)
          .setRadius(r)
          .setStrokeStyle(Math.max(3, 9 * scale), 0x1b1410, 1);
        t.pic.setPosition(x, y).setDisplaySize(r * 1.7, r * 1.7);
      });
    }
    for (const [id, art] of this.crates) {
      if (seen.has(id)) continue;
      art.img.destroy();
      for (const t of art.tags) {
        t.disc.destroy();
        t.pic.destroy();
      }
      this.crates.delete(id);
    }
  }

  /** v1.7b (D-046): the icon a crate shows (null = none drawn yet, or no icon). */
  crateIcon(id: number): string | null {
    return this.crates.get(id)?.icon ?? null;
  }

  /**
   * v1.4 B (D-039): heat shimmer over the white pan — a few soft bright strips along the far
   * and Ver horizons that breathe and ripple on sim time (a held frame holds them). Cheap (at
   * most MIRAGE_STRIPS images, fewer on the low tier), no flashes: a slow alpha drift only, and
   * still with "reduce flashes" or reduced motion.
   */
  /** v1.4 B (e2e perf): ms the mirage took to draw this frame. */
  mirageMs = 0;

  private drawMirage(s: SimState): void {
    const t0 = performance.now();
    this.mirageDraw(s);
    this.mirageMs = performance.now() - t0;
  }

  private mirageDraw(s: SimState): void {
    if (this.mirageStrips === null) {
      this.mirageStrips = [];
      const n = Math.max(4, Math.round(MIRAGE_STRIPS * this.prefs.particleScale));
      for (const layerId of ['ver_veld', 'far_veld']) {
        const layer = this.parallax.layer(layerId);
        const lane = this.biome.lanes[layerId === 'ver_veld' ? 'ver' : 'far'];
        const ground = lane !== undefined && 'groundY' in lane ? lane.groundY : undefined;
        if (layer === undefined || ground === undefined) continue;
        const w = coreWidth(layer.scrollFactor);
        const [y0] = ground;
        const count = layerId === 'ver_veld' ? Math.ceil(n / 2) : n;
        for (let i = 0; i < count; i++) {
          // Fixed spots along the pan (golden-ratio spread): the same on every device.
          const f = (i * 0.618034 + (layerId === 'ver_veld' ? 0.31 : 0)) % 1;
          const img = this.scene.add
            .image(f * w, y0 - 6 + ((i * 7) % 11), TEX.mirage)
            .setDisplaySize(260 + ((i * 137) % 340), 10 + ((i * 5) % 9));
          layer.fixtures.add(img);
          this.mirageStrips.push({
            img,
            phase: i * 1.9,
            base: 0.35 + ((i * 3) % 4) * 0.08,
            sx: img.scaleX,
          });
        }
      }
    }
    const still = this.prefs.reduceFlashes || this.reducedMotion;
    const t = s.tick / TICKS_PER_SECOND;
    for (const m of this.mirageStrips) {
      m.img.setVisible(s.mirage);
      if (!s.mirage) continue;
      const look = mirageLook(m, t, still);
      m.img.setAlpha(look.alpha);
      m.img.setScale(m.sx * look.scaleX, m.img.scaleY);
    }
  }

  private drawDevils(s: SimState): void {
    // Sway on sim time, not the wall clock: a held hunt (?holdAt) holds its dust devils too.
    const simMs = (s.tick * 1000) / TICKS_PER_SECOND;
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
        .setRotation(Math.sin(simMs / DEVIL_SWAY_MS + d.id) * DEVIL_SWAY);
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
      this.fixed.addAt(this.gloom, 0);
      this.fixed.addAt(this.flashLight, 1);
    }
    if (this.stormSize.w !== width || this.stormSize.h !== height) {
      this.stormSize = { w: width, h: height };
      this.gloom?.setSize(width, height);
      this.flashLight.setSize(width, height);
    }
    const storming = s.rain && this.biome.omen.storm !== undefined;
    const gloom = storming && !s.lightning ? STORM_GLOOM_ALPHA : 0;
    this.gloom?.setAlpha(gloom).setVisible(gloom > 0);
    const strike = this.stormFlash.lit(s.lightning, performance.now());
    const lit = strike ? (this.prefs.reduceFlashes ? FLASH_ALPHA_REDUCED : FLASH_ALPHA) : 0;
    this.flashLight.setAlpha(lit).setVisible(lit > 0);
  }

  /**
   * GDD §17: while the Stampede runs, a warm tint washes over the scene (fades in and out over
   * tintFadeMs; one steady change, not a flash; dimmed by "reduce flashes").
   */
  private drawStampede(on: boolean, width: number, height: number): void {
    const cfg = this.feel.juice.stampede;
    if (this.stampedeTint === null) {
      const colour = Number.parseInt(cfg.tint.slice(1), 16);
      this.stampedeTint = this.scene.add
        .rectangle(0, 0, width, height, colour)
        .setOrigin(0, 0)
        .setAlpha(0)
        .setVisible(false);
      this.fixed.addAt(this.stampedeTint, 0);
    }
    const tint = this.stampedeTint;
    if (tint.width !== width || tint.height !== height) tint.setSize(width, height);
    // Re-read every frame: Settings → reduce flashes applies during a Stampede too.
    const target = stampedeTintAlpha(
      on,
      cfg.tintAlpha,
      this.prefs.reduceFlashes,
      this.feel.accessibility.reducedFlashAlpha,
    );
    if (target === this.stampedeTarget) return;
    this.stampedeTarget = target;
    this.scene.tweens.killTweensOf(tint);
    tint.setVisible(true);
    this.scene.tweens.add({
      targets: tint,
      alpha: target,
      duration: cfg.tintFadeMs,
      onComplete: () => {
        if (this.stampedeTarget === 0) tint.setVisible(false);
      },
    });
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
      this.fixed.add(this.rain);
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
      this.fixed.addAt(this.glare, 0);
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
    // Oupa se Kaart (charm) makes the secrets glow for the whole hunt; so does a dusk map (v1.2).
    if (reveal || s.season?.revealSecrets === true || this.secretGlow) {
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
      this.burrow?.setVisible(false);
      return;
    }
    if (s.meerkats.length > 0 && this.scene.textures.exists(MEERKAT_SHEET)) {
      this.helperFromBurrow(active, width, height);
      return;
    }
    // Stands up bottom-left (beside the gadget button), sinks for the last half second.
    const left = active.ticksLeft ?? 0;
    const sink = Math.min(1, left / 30);
    this.helper
      .setVisible(true)
      .setOrigin(0.5, 0.5)
      .setCrop()
      .setPosition(width * 0.2, height + 210 * (1 - sink) - 10)
      .setScale(0.9);
  }

  /**
   * v1.7 (D-044): on the desert maps the Meerkat Spotter climbs out of a burrow (a mound with a
   * hole bottom-left) instead of rising from nowhere, and goes back down it at the end. Nothing
   * of it shows below the hole's rim. Paced by the power-up's ticks (sim time).
   */
  private helperFromBurrow(
    active: SimState['powerups'][number],
    width: number,
    height: number,
  ): void {
    const x = width * 0.2;
    const holeY = height - 34;
    // A delivered sheet may replace the drawn one: the burrow follows it once its frames exist
    // (MeerkatView adds them).
    const tex = this.scene.textures.get(MEERKAT_SHEET);
    if (this.burrow !== null && this.burrow.texture !== tex) {
      this.burrow.destroy();
      this.burrow = null;
    }
    if (this.burrow === null && tex.has('mound_b')) {
      this.burrow = this.scene.add.image(x, holeY, MEERKAT_SHEET, 'mound_b');
      const r = sheetFrames().find((f) => f.name === 'mound_b');
      if (r !== undefined) this.burrow.setOrigin(r.ox / r.w, r.oy / r.h);
      this.screen.addAt(this.burrow, this.screen.getIndex(this.helper));
    }
    const k = 1 / this.burrowScale();
    this.burrow
      ?.setVisible(true)
      .setPosition(x, holeY)
      .setScale(0.9 / k);
    const left = active.ticksLeft ?? 0;
    const since = (active.totalTicks ?? left) - left;
    const rise = Math.max(0, Math.min(1, since / 30, left / 30));
    const scale = 0.9;
    const dh = this.helper.height * scale;
    // Feet a third of the way down the burrow when fully out; all the way down at rise 0.
    const bottom = holeY + dh * 0.3 + (1 - rise) * dh * 0.7;
    const visible = Math.max(0, (holeY - (bottom - dh)) / scale);
    this.helper
      .setVisible(rise > 0)
      .setOrigin(0.5, 1)
      .setPosition(x, bottom)
      .setScale(scale)
      .setCrop(0, 0, this.helper.width, visible);
  }

  /** Display scale of the delivered sheet (2× art is 0.5), from the texture's size. */
  private burrowScale(): number {
    const src = this.scene.textures.get(MEERKAT_SHEET).getSourceImage();
    return src.width > SHEET_W ? SHEET_W / src.width : 1;
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
    this.windpomps.clear();
    for (const a of this.secretArt.values()) {
      a.rotor?.destroy();
      for (const m of a.marks.values()) m.destroy();
    }
    this.secretArt.clear();
    for (const c of this.crates.values()) {
      c.img.destroy();
      for (const t of c.tags) {
        t.disc.destroy();
        t.pic.destroy();
      }
    }
    this.crates.clear();
    for (const d of this.devils.values()) d.destroy();
    this.devils.clear();
    this.burrow?.destroy();
    this.burrow = null;
    for (const r of this.rings) r.destroy();
    this.rings.length = 0;
    for (const b of this.windBits) b.destroy();
    this.windBits.length = 0;
  }
}
