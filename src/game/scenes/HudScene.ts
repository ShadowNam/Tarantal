// In-hunt HUD (art bible §6, GDD §17): timer + Frenzy meter top-left, score + pop stack top-right,
// shell belt + RELOAD prompt bottom-right, Vuvuzela button bottom-left. Banners (Stampede, wing
// shot after a flush) and the "DIE HELE SWERM!" stamp. M4: power-up / crate-weapon chips with
// their time left under the Frenzy meter, a wind sock in omen hunts, banners for secrets, crates
// and bonus time, and call-outs for a don't-shoot creature's first sighting and the boss. M5: the
// pause button (top centre), the FTUE prompt line with a pulsing hand and its Skip button,
// left-handed mirroring, and the ⛔ call-out only for creatures not yet in the Bird Book (first
// sighting ever). A separate scene so camera shake never moves it. Fed each frame by HuntScene
// with the latest snapshot and that frame's events.
import { designSize } from '../layout';
import { fitCamera } from '../view/fitCamera';
import * as Phaser from 'phaser';
import type { SimEvent } from '../../sim/events';
import type { SimState } from '../../sim/types';
import { TICKS_PER_SECOND } from '../../sim/clock';
import { fill, getLanguage, isI18nKey, t, tOr, translator } from '../../i18n/i18n';
import { msToTicks } from '../../sim/clock';
import { markSeen } from '../../meta/powerupsSeen';
import { oupaShows } from '../audio/oupaMode';
import { PickupCard } from '../ui/PickupCard';
import { effectText, shortText } from '../ui/powerupGuide';
import { TEX } from '../assets/AssetManifest';
import { powerupIcon } from '../ui/powerupIcons';
import { ammoSlots, gunLookFor, reloadBoostsOf, roundsOf } from '../ui/gunLook';
import type { GameContext } from '../GameContext';
import { FONT } from '../view/Fx';
import { formatAward, formatClock, formatMult, formatScore, popParts } from '../ui/format';
import type { InputKind } from '../../sim/types';
import { CHIP_GAP, hudLayout, MAX_CHIPS, rectContains, type HudLayout } from '../ui/hudLayout';
import { SeasonHud } from '../ui/SeasonHud';
import { drawButton, fitText, Menu, type MenuItem } from '../ui/menu';
import { BakedDrawing, RoundRect } from '../ui/shapes';
import { fontPx, outline } from '../ui/textLook';
import { BarkBubble, sayBark } from '../ui/BarkBubble';
import { firstHuntToday, type Bark } from '../audio/barks';
import {
  PopPool,
  colorNumber,
  ensurePopFont,
  popCanShow,
  popLook,
  type PopText,
} from '../ui/popFont';
import { fontReadiness } from '../ui/fontReady';
import { cornerStampShown, stampFor, StampLabel } from '../ui/StampLabel';
import { updateCaptions, type CaptionLine } from '../audio/captions';

export interface HudControls {
  readonly pause: () => void;
  /** FTUE only: skip the lesson. */
  readonly skip: (() => void) | null;
}

/** Room for "Frenzy ×1.5" left of the meter bar. */
const FRENZY_LABEL_W = 200;

const C = {
  wood: 0x8b5a2b,
  enamel: 0xf3ead3,
  rim: 0x2d5da8,
  slate: 0x2e3b33,
  gold: 0xd8a73a,
  red: 0xc8302a,
  ink: 0x1b1410,
};

interface Pop {
  /** v1.0.1 (D-028 §4): a pooled BitmapText pop, or a canvas Text for a string outside it. */
  readonly pop: PopText | null;
  readonly text: Phaser.GameObjects.Text | null;
  born: number;
}

/** Events whose HUD feedback is about score (pops, the Whole-flock stamp): none on the range. */
const SCORE_FEEDBACK: ReadonlySet<SimEvent['type']> = new Set([
  'scoreAwarded',
  'bonusAwarded',
  'penaltyApplied',
  'flockWiped',
  'comboChanged',
]);

export class HudScene extends Phaser.Scene {
  private readonly ctx: GameContext;
  private layoutNow: HudLayout | null = null;
  /** M9: HUD panels are cached shapes (no per-frame tessellation, see ui/shapes.ts). */
  private panels: RoundRect[] = [];
  private timer!: Phaser.GameObjects.Text;
  private frenzyLabel!: Phaser.GameObjects.Text;
  private frenzyBack!: RoundRect;
  private frenzyFill!: RoundRect;
  private score!: Phaser.GameObjects.Text;
  /** v1.1 (D-032): the gun's rounds on the belt slate (gunLook.ammoSlots), pooled images. */
  private ammo: Phaser.GameObjects.Image[] = [];
  /** e2e/dev only (art previews): show this gun's ammo with this many rounds instead of the
   *  snapshot's weapon. */
  private ammoPreview: { readonly weaponId: string; readonly rounds: number } | null = null;
  /** Kettie: a draw bar fills as the band is pulled back (the stones sit in a pile beside it). */
  private drawBack!: RoundRect;
  private drawFill!: RoundRect;
  /** Longest draw seen since the last shot (the Boss Rule can double it). */
  private drawTotal = 1;
  private reload!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private pops: Pop[] = [];
  private buildStamp: StampLabel | null = null;
  private stampFrames = 0;
  private popPool: PopPool | null = null;
  private beltFlashUntil = 0;
  private lastMul = 1;
  private lastState: SimState | null = null;
  private timerColor = '';
  private gadgetPanel!: BakedDrawing;
  /** v1.4 (D-038): the variable scope's zoom row (− / + buttons on touch, the zoom label). */
  private zoomPanel!: BakedDrawing;
  private zoomText!: Phaser.GameObjects.Text;
  /** Horizontal shake of the Vuvuzela button (tweened when it is denied). */
  private readonly gadgetShake = { x: 0 };
  private gadgetCharges!: Phaser.GameObjects.Text;
  private gadgetKey!: Phaser.GameObjects.Text;
  private gadgetShout!: Phaser.GameObjects.Text;
  private stamp!: Phaser.GameObjects.Text;
  private gadgetDrawn = '';
  /** Flocks flushed since their last wing-shot banner (GDD §16 step 5: "Wing shot ×2!"). */
  private readonly flushedFlocks = new Set<number>();
  private inputKind: InputKind = 'pointer';
  private chipBacks: RoundRect[] = [];
  private chipBars: RoundRect[] = [];
  private chipTexts: Phaser.GameObjects.Text[] = [];
  /** v1.6b (D-043): a power-up's icon on its chip (ui/pu_<id>, when it has one). */
  private chipIcons: Phaser.GameObjects.Image[] = [];
  /** v1.6b: Blitslaai's lightning glints hopping along the belt, and Oupa Laai's hand on it. */
  private bolts: Phaser.GameObjects.Image[] = [];
  private oupaHand: Phaser.GameObjects.Image | null = null;
  /** v1.7b (D-046): the pickup card, each chip's countdown (seconds or shells), Boeretroos'
   *  warm screen edges and Chilli Biltong's ∞ on the belt. */
  private pickupCard: PickupCard | null = null;
  private chipTimes: Phaser.GameObjects.Text[] = [];
  private slowTint: Phaser.GameObjects.Graphics | null = null;
  private slowTintFor = '';
  private infinity: Phaser.GameObjects.Graphics | null = null;
  /** The crate gun in hand (its end caption names it). */
  private readonly captionCrate: { id: string | null } = { id: null };
  private sockPole!: Phaser.GameObjects.Rectangle;
  private sock!: Phaser.GameObjects.Image;
  private callout!: Phaser.GameObjects.Text;
  /** Don't-shoot creatures already called out (first sighting ever: Bird Book + this hunt). */
  private readonly sighted = new Set<string>();
  private captions: CaptionLine[] = [];
  private readonly captionShown = new Map<string, number>();
  private captionTexts: Phaser.GameObjects.Text[] = [];
  private controls: HudControls | null = null;
  private controlsMenu: Menu | null = null;
  private pauseIcon: Phaser.GameObjects.Shape[] = [];
  private skipButton: { g: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text } | null =
    null;
  private prompt!: Phaser.GameObjects.Text;
  private hand!: Phaser.GameObjects.Graphics;
  private promptKey: string | null = null;
  private season: SeasonHud | null = null;
  /** Kept here: the hunt sets it before launch() has created the scene. */
  private seasonInfo: { readonly quota: number } | null = null;
  /** v1.3x (D-037): the HUD of a Skietbaan session (no timer, score or Frenzy). */
  private rangeOn = false;
  /** v1.0.1 (D-028 §3): Oupa's bubble, and whether he barks this hunt (not in FTUE or capture). */
  private bubble: BarkBubble | null = null;
  private barksOn = false;
  private firstTodayPending = false;
  private lastScore = 0;
  /** M7: "DAILY #n" / "PRACTICE · DAILY #n" / "BEAT 2 840" under the score, in the Season Run
   *  quota's slot (never both: run hunts have no tag), above the score pops. */
  private tagText: string | null = null;
  private tag: Phaser.GameObjects.Text | null = null;

  constructor(ctx: GameContext) {
    super({ key: 'Hud' });
    this.ctx = ctx;
  }

  create(): void {
    this.pops = [];
    // v1.6 (D-042): the build stamp, bottom left beside the gadget (or the belt, left-handed).
    this.buildStamp = new StampLabel(this, this.ctx, cornerStampShown(this.ctx));
    this.stampFrames = 0;
    // startBarks() (the hunt) may run before this create() (launch is deferred): keep its flags.
    this.bubble = new BarkBubble(this, this.ctx.feel.barks.fontPx);
    this.popPool = new PopPool(this);
    // D-028 §4: the pop atlas is built now, not on the first kill; again when Settings change the
    // text size or contrast, and once more if the web font arrives after loadFonts gave up.
    const buildPopAtlas = (): void => {
      ensurePopFont(this, popLook(FONT, 52, 8));
    };
    buildPopAtlas();
    const offPrefs = this.ctx.onPrefsChange(buildPopAtlas);
    const offFonts = fontReadiness.onFontsLoaded(buildPopAtlas);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      offPrefs();
      offFonts();
    });
    this.ammo = [];
    this.lastMul = 1;
    this.timerColor = '';
    this.lastState = null;
    this.beltFlashUntil = 0;
    // Timer sign (ink rim, wood), score plate (blue rim, enamel), belt slate: back to front.
    this.panels = [
      new RoundRect(this, C.ink, 1, 18),
      new RoundRect(this, C.wood, 1, 14),
      new RoundRect(this, C.rim, 1, 20),
      new RoundRect(this, C.enamel, 1, 14),
      new RoundRect(this, C.ink, 0.85, 16),
    ];
    // M9: Settings → text size scales the HUD's messages (not the numbers and labels in fixed
    // signs); high contrast thickens every outline.
    const text = (size: number, color: string, scaled = true): Phaser.GameObjects.Text =>
      this.add.text(0, 0, '', {
        fontFamily: FONT,
        fontSize: fontPx(size, scaled),
        fontStyle: '900',
        color,
        ...outline(size, Math.round(size / 7), '#1B1410', color),
      });
    this.timer = text(64, '#F3EAD3', false).setOrigin(0.5);
    this.frenzyLabel = text(30, '#F3EAD3', false).setOrigin(0, 0.5);
    this.frenzyBack = new RoundRect(this, C.ink, 0.85, 10);
    this.frenzyFill = new RoundRect(this, C.gold, 1, 8);
    this.score = text(64, '#1B1410', false).setOrigin(1, 0.5).setStroke('#F3EAD3', 0);
    this.drawBack = new RoundRect(this, 0xf3ead3, 0.25, 12);
    this.drawFill = new RoundRect(this, 0xffd25a, 1, 12);
    this.drawBack.hide();
    this.drawFill.hide();
    this.drawTotal = 1;
    this.reload = text(56, '#FFD25A').setOrigin(0.5).setVisible(false);
    this.banner = text(84, '#FFD25A').setOrigin(0.5).setVisible(false);
    this.gadgetPanel = new BakedDrawing(this, 'hud.gadget');
    this.zoomPanel = new BakedDrawing(this, 'hud.zoom');
    this.zoomText = text(40, '#F3EAD3', false).setOrigin(0.5).setVisible(false);
    this.gadgetShake.x = 0;
    this.gadgetCharges = text(40, '#F3EAD3', false).setOrigin(0.5);
    this.gadgetKey = text(26, '#1B1410', false).setOrigin(0.5).setStroke('#F3EAD3', 0);
    this.gadgetShout = text(64, '#FFD25A').setOrigin(0, 0.5).setVisible(false);
    this.stamp = text(110, '#C8302A')
      .setOrigin(0.5)
      .setStroke('#F3EAD3', 12)
      .setRotation(-0.09)
      .setVisible(false);
    this.gadgetDrawn = '';
    this.flushedFlocks.clear();
    this.sighted.clear();
    for (const c of this.ctx.save.data.birdBook.creatures) this.sighted.add(c);
    this.controlsMenu = null;
    this.skipButton = null;
    this.promptKey = null;
    this.pauseIcon = [
      this.add.circle(0, 0, 1, C.ink, 0.85),
      this.add.rectangle(0, 0, 12, 44, C.enamel, 1).setOrigin(0, 0).setRounded(4),
      this.add.rectangle(0, 0, 12, 44, C.enamel, 1).setOrigin(0, 0).setRounded(4),
    ];
    this.prompt = text(56, '#FFFFFF').setOrigin(0.5).setVisible(false);
    this.hand = this.add.graphics().setVisible(false);
    this.chipBacks = [];
    this.chipBars = [];
    for (let i = 0; i < MAX_CHIPS; i++) {
      this.chipBacks.push(new RoundRect(this, C.ink, 0.85, 12).hide());
      this.chipBars.push(new RoundRect(this, C.gold, 1, 3).hide());
    }
    this.chipTexts = [];
    for (let i = 0; i < MAX_CHIPS; i++)
      this.chipTexts.push(text(26, '#F3EAD3', false).setOrigin(0, 0.5));
    this.chipIcons = [];
    for (let i = 0; i < MAX_CHIPS; i++)
      this.chipIcons.push(this.add.image(0, 0, TEX.puBlitslaai).setVisible(false));
    // Above the belt's rounds (those images are made as the belt first draws).
    this.bolts = [0, 1].map(() =>
      this.add.image(0, 0, TEX.bolt).setDepth(2).setScale(0.5).setVisible(false),
    );
    this.oupaHand = this.add.image(0, 0, TEX.puOupaLaai).setDepth(2).setVisible(false);
    // v1.7b (D-046): each chip's countdown at its right end; the pickup card; the looks.
    this.chipTimes = [];
    for (let i = 0; i < MAX_CHIPS; i++)
      this.chipTimes.push(text(26, '#F3EAD3', false).setOrigin(1, 0.5).setVisible(false));
    this.pickupCard = new PickupCard(this);
    this.slowTint = this.add.graphics().setDepth(-1).setVisible(false);
    this.slowTintFor = '';
    this.infinity = this.add.graphics().setDepth(3).setVisible(false);
    this.captionCrate.id = null;
    this.sockPole = this.add.rectangle(0, 0, 8, 1, C.ink, 1).setOrigin(0, 0).setVisible(false);
    this.sock = this.add.image(0, 0, TEX.windsock).setVisible(false);
    const so = { x: 6 / 150, y: 0.5 };
    this.sock.setOrigin(so.x, so.y);
    this.callout = text(48, '#FF6B5A').setOrigin(0.5).setVisible(false);
    this.tag = text(28, '#FFD25A').setOrigin(1, 0.5);
    // M9 sound captions (Settings → captions): a pooled stack, bottom centre.
    this.captions = [];
    this.captionShown.clear();
    this.captionTexts = [];
    for (let i = 0; i < this.ctx.feel.accessibility.captionMax; i++)
      this.captionTexts.push(
        text(34, '#F3EAD3')
          .setOrigin(0.5, 1)
          .setBackgroundColor('rgba(27,20,16,0.8)')
          .setPadding(14, 6, 14, 6)
          .setVisible(false),
      );
    this.applyTag();
    this.season = new SeasonHud(this, this.ctx);
    this.season.setSeason(this.seasonInfo);
    this.season.setMouse(this.inputKind === 'pointer');
    this.scale.on(Phaser.Scale.Events.RESIZE, this.relayout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.relayout);
      this.controls = null;
      this.layoutNow = null;
      // v1.7b: Boeretroos' slowed sound never outlives the hunt.
      this.ctx.audio.setSlowMotion(1);
      this.pickupCard = null;
    });
    this.relayout();
    this.wireControls();
  }

  get layoutRects(): HudLayout | null {
    return this.layoutNow;
  }

  isOnBelt(x: number, y: number): boolean {
    return this.layoutNow !== null && rectContains(this.layoutNow.belt, x, y);
  }

  /** Pause and (FTUE) skip buttons: the InputMapper never fires there. */
  isOnUi(x: number, y: number): boolean {
    const l = this.layoutNow;
    if (l === null) return false;
    return (
      rectContains(l.pause, x, y) || (this.controls?.skip != null && rectContains(l.skip, x, y))
    );
  }

  /** Wires the pause button (and the FTUE skip button) for this hunt. */
  setControls(c: HudControls): void {
    this.controls = c;
    // launch() creates the scene on the next step; create() wires the stored controls then.
    if (this.layoutNow !== null && this.sys.isActive()) this.wireControls();
  }

  private wireControls(): void {
    const c = this.controls;
    this.controlsMenu?.destroy();
    this.controlsMenu = null;
    if (c === null) return;
    const none = { x: 0, y: 0, w: 0, h: 0 };
    const items: MenuItem[] = [
      {
        id: 'pause',
        rect: () => this.layoutNow?.pause ?? none,
        press: () => {
          c.pause();
        },
      },
    ];
    const skip = c.skip;
    if (skip !== null) {
      items.push({
        id: 'skip',
        rect: () => this.layoutNow?.skip ?? none,
        press: () => {
          skip();
        },
      });
    }
    // Pointer only: Space reloads and Esc pauses through the InputMapper during a hunt.
    this.controlsMenu = new Menu(this, items, { keyboard: false, hook: this.ctx.hook });
    this.relayout();
  }

  /** The FTUE line (one line, shrunk to fit) and the pulsing hand at the flock or the belt. */
  setFtuePrompt(
    p: { key: string; text: string } | null,
    hand: { x: number; y: number } | 'belt' | null,
  ): void {
    const l = this.layoutNow;
    if (l === null) return;
    if (p === null) {
      this.prompt.setVisible(false);
      this.promptKey = null;
    } else if (p.key !== this.promptKey) {
      this.promptKey = p.key;
      this.prompt.setText(p.text).setVisible(true).setPosition(l.prompt.x, l.prompt.y);
      fitText(this.prompt, l.prompt.w);
      const hook = this.ctx.hook;
      if (hook) {
        hook.ftue.prompts.push({
          key: p.key,
          text: p.text,
          lines: this.prompt.getWrappedText(p.text).length,
          width: this.prompt.displayWidth,
          room: l.prompt.w,
        });
      }
    }
    const target =
      hand === 'belt' ? { x: l.belt.x + l.belt.w / 2, y: l.belt.y + l.belt.h / 2 } : hand;
    this.hand.setVisible(target !== null);
    if (target === null) return;
    const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 160);
    const g = this.hand.clear();
    g.lineStyle(8, 0xffd25a, 0.4 + 0.6 * pulse).strokeCircle(target.x, target.y, 46 + 18 * pulse);
    // A pointing finger (placeholder art: finger + palm): below the target, or above it pointing
    // down when the target is low on the screen (the shell belt).
    const down = target.y > l.safe.y + l.safe.h * 0.6;
    const hx = target.x + 30;
    const tip = target.y + (down ? -60 - 10 * pulse : 10 + 10 * pulse);
    const finger = { x: hx - 6, y: down ? tip - 70 : tip, w: 26, h: 70 };
    const palm = { x: hx - 22, y: down ? finger.y - 52 : tip + 60, w: 66, h: 56 };
    g.fillStyle(0xf3ead3, 1).fillRoundedRect(finger.x, finger.y, finger.w, finger.h, 13);
    g.fillRoundedRect(palm.x, palm.y, palm.w, palm.h, 20);
    g.lineStyle(5, 0x1b1410, 1).strokeRoundedRect(finger.x, finger.y, finger.w, finger.h, 13);
    g.strokeRoundedRect(palm.x, palm.y, palm.w, palm.h, 20);
  }

  relayoutNow(): void {
    // The language may have changed in the pause menu: redraw the FTUE line too.
    this.promptKey = null;
    this.relayout();
  }

  isOnGadget(x: number, y: number): boolean {
    const g = this.lastState?.gadget;
    return (
      this.layoutNow !== null &&
      g !== null &&
      g !== undefined &&
      rectContains(this.layoutNow.gadget, x, y)
    );
  }

  /** v1.4 (D-038): the variable scope's zoom steps for the gun in hand, or null. */
  zoomOf(
    w: SimState['weapon'] | undefined,
  ): { readonly zooms: readonly number[]; readonly step: number } | null {
    if (w?.kind !== 'primary' || w.sight === null) return null;
    const zooms = this.ctx.content.weapons.sights.find((x) => x.id === w.sight)?.zoom;
    return zooms !== undefined && zooms.length > 1 ? { zooms, step: w.zoomStep } : null;
  }

  /** v1.4: the touch zoom button under (x, y) (−1 out, +1 in), or null (none, or a mouse). */
  zoomButtonAt(x: number, y: number): -1 | 1 | null {
    const l = this.layoutNow;
    if (l === null || this.inputKind === 'pointer' || this.zoomOf(this.lastState?.weapon) === null)
      return null;
    if (rectContains(l.zoomOut, x, y)) return -1;
    if (rectContains(l.zoomIn, x, y)) return 1;
    return null;
  }

  private drawZoom(s: SimState): void {
    const l = this.layoutNow;
    const z = this.zoomOf(s.weapon);
    if (l === null || z === null) {
      this.zoomPanel.image.setVisible(false);
      this.zoomText.setVisible(false);
      return;
    }
    const zoom = z.zooms[z.step] ?? 1;
    this.zoomText
      .setText(`${formatMult(zoom)}×`)
      .setPosition(l.zoomLabel.x + l.zoomLabel.w / 2, l.zoomLabel.y + l.zoomLabel.h / 2)
      .setVisible(true);
    const buttons = this.inputKind !== 'pointer';
    const x0 = l.zoomOut.x;
    const w = l.zoomIn.x + l.zoomIn.w - x0;
    const h = l.zoomOut.h;
    const key = `${z.step}:${z.zooms.length}:${buttons}:${w}:${h}`;
    this.zoomPanel.draw(x0, l.zoomOut.y, w, h, key, (g) => {
      // The label's slate, and on touch the two round buttons (dimmed at the ends of the range).
      const lx = l.zoomLabel.x - x0;
      g.fillStyle(C.ink, 0.75).fillRoundedRect(lx, h * 0.18, l.zoomLabel.w, h * 0.64, 14);
      if (!buttons) return;
      const btn = (bx: number, on: boolean, plus: boolean): void => {
        const r = h / 2;
        g.fillStyle(C.ink, 0.9).fillCircle(bx + r, r, r);
        g.fillStyle(on ? C.enamel : 0x7a7466, 1).fillCircle(bx + r, r, r - 6);
        g.fillStyle(C.ink, 1).fillRect(bx + r - r * 0.45, r - 5, r * 0.9, 10);
        if (plus) g.fillRect(bx + r - 5, r - r * 0.45, 10, r * 0.9);
      };
      btn(0, z.step > 0, false);
      btn(l.zoomIn.x - x0, z.step < z.zooms.length - 1, true);
    });
  }

  /** Mouse players see the Q key hint on the gadget button. */
  setInputKind(kind: InputKind): void {
    this.inputKind = kind;
    this.gadgetDrawn = '';
    this.season?.setMouse(kind === 'pointer');
  }

  /** M6: the Season Run hunt's quota (null outside a run). */
  setSeason(info: { readonly quota: number } | null): void {
    this.seasonInfo = info;
    this.season?.setSeason(info);
  }

  /** v1.3x (D-037): the Skietbaan has no clock, score or Frenzy: only the belt and pause. */
  setRange(on: boolean): void {
    this.rangeOn = on;
    this.hideScoring();
  }

  private hideScoring(): void {
    if (!this.rangeOn || this.layoutNow === null) return;
    for (const p of this.panels.slice(0, 4)) p.place(0, 0, 0, 0);
    this.frenzyBack.place(0, 0, 0, 0);
    this.frenzyFill.place(0, 0, 0, 0);
    this.timer.setVisible(false);
    this.score.setVisible(false);
    this.frenzyLabel.setVisible(false);
  }

  /**
   * v1.0.1 (D-028 §3): a hunt starts. Oupa barks in it unless `on` is false (the FTUE has its own
   * Oupa prompts; capture mode's footage has no HUD). The first hunt of a UTC day gets a greeting;
   * the save remembers the day.
   */
  startBarks(on: boolean): void {
    this.barksOn = on;
    this.lastScore = 0;
    if (!on) return;
    this.ctx.barks.startHunt(0);
    const today = this.ctx.today();
    const save = this.ctx.save;
    this.firstTodayPending = firstHuntToday(save.data.barks.lastHuntDay, today);
    if (this.firstTodayPending) save.update((d) => ({ ...d, barks: { lastHuntDay: today } }));
  }

  /** M7: the hunt's tag line (drawn once here, never per frame). */
  setTag(text: string | null): void {
    this.tagText = text;
    this.applyTag();
  }

  private applyTag(): void {
    const tag = this.tag;
    if (tag === null || !tag.active) return;
    tag.setText(this.tagText ?? '').setVisible(this.tagText !== null);
    const l = this.layoutNow;
    if (l !== null) {
      tag.setPosition(l.quota.x + l.quota.w - 8, l.quota.y + l.quota.h / 2);
      fitText(tag, l.quota.w - 16);
    }
  }

  /** Consumable or rental button under (x, y) that holds something, or null. */
  itemAt(x: number, y: number): number | null {
    return this.season?.itemAt(this.lastState, x, y) ?? null;
  }

  private readonly relayout = (): void => {
    const { width, height } = designSize();
    fitCamera(this.cameras.main);
    const l = hudLayout(
      width,
      height,
      this.ctx.safeArea(),
      this.ctx.feel.hud,
      this.ctx.prefs.leftHanded,
    );
    this.layoutNow = l;
    this.placeStamp();
    this.season?.relayout(l, width, height);
    const hook = this.ctx.hook;
    if (hook) {
      hook.safe = l.safe;
      hook.rects = {
        timer: l.timer,
        frenzy: l.frenzy,
        score: l.score,
        belt: l.belt,
        reloadPrompt: l.reloadPrompt,
        gadget: l.gadget,
        chips: l.chips,
        windsock: l.windsock,
        pause: l.pause,
        quota: l.quota,
        charms: l.charms,
        // v1.4: the variable scope's zoom buttons (shown on touch with a variable scope in hand).
        zoomOut: l.zoomOut,
        zoomIn: l.zoomIn,
        ...Object.fromEntries(l.items.map((r, i) => [`item${i}`, r])),
        ...(this.controls?.skip != null ? { skip: l.skip } : {}),
      };
    }
    const [timerRim, timerWood, scoreRim, scoreEnamel, belt] = this.panels;
    // Timer: weathered wood sign.
    timerRim?.place(l.timer.x - 4, l.timer.y - 4, l.timer.w + 8, l.timer.h + 8);
    timerWood?.place(l.timer.x, l.timer.y, l.timer.w, l.timer.h);
    // Score: cream enamel with blue rim.
    scoreRim?.place(l.score.x - 6, l.score.y - 6, l.score.w + 12, l.score.h + 12);
    scoreEnamel?.place(l.score.x, l.score.y, l.score.w, l.score.h);
    // Belt: chalk slate.
    belt?.place(l.belt.x, l.belt.y, l.belt.w, l.belt.h);
    this.timer.setPosition(l.timer.x + l.timer.w / 2, l.timer.y + l.timer.h / 2);
    this.frenzyLabel.setPosition(l.frenzy.x, l.frenzy.y + l.frenzy.h / 2);
    this.score.setPosition(l.score.x + l.score.w - 24, l.score.y + l.score.h / 2);
    this.reload.setPosition(
      l.reloadPrompt.x + l.reloadPrompt.w / 2,
      l.reloadPrompt.y + l.reloadPrompt.h / 2,
    );
    this.banner.setPosition(width / 2, l.safe.y + 180);
    this.stamp.setPosition(width / 2, l.safe.y + l.safe.h * 0.42);
    const gc = { x: l.gadget.x + l.gadget.w / 2, y: l.gadget.y + l.gadget.h / 2 };
    this.gadgetCharges.setPosition(gc.x + l.gadget.w * 0.3, gc.y + l.gadget.h * 0.3);
    this.gadgetKey.setPosition(gc.x + l.gadget.w * 0.34, gc.y - l.gadget.h * 0.34);
    this.gadgetShout.setPosition(l.gadget.x + l.gadget.w + 16, gc.y);
    this.callout.setPosition(width / 2, l.safe.y + 290);
    // Pause: two bars on a dark disc.
    const pc = { x: l.pause.x + l.pause.w / 2, y: l.pause.y + l.pause.h / 2 };
    const [disc, barL, barR] = this.pauseIcon;
    if (disc instanceof Phaser.GameObjects.Arc)
      disc.setPosition(pc.x, pc.y).setRadius(l.pause.w / 2);
    barL?.setPosition(pc.x - 18, pc.y - 22);
    barR?.setPosition(pc.x + 6, pc.y - 22);
    this.skipButton?.g.destroy();
    this.skipButton?.text.destroy();
    this.skipButton =
      this.controls?.skip != null
        ? drawButton(this, l.skip, t('ftue.skip'), 'secondary', 32)
        : null;
    if (this.promptKey !== null) {
      this.prompt.setPosition(l.prompt.x, l.prompt.y);
      fitText(this.prompt, l.prompt.w);
    }
    this.applyTag();
    this.controlsMenu?.refresh();
    this.sockPole
      .setPosition(l.windsock.x + 20 - 4, l.windsock.y + 8)
      .setSize(8, Math.max(1, l.windsock.h - 8));
    this.sock.setPosition(l.windsock.x + 20, l.windsock.y + 14);
    this.gadgetDrawn = '';
    if (this.lastState) this.render(this.lastState, []);
    this.hideScoring();
  };

  /**
   * v1.6 (D-042): the stamp on the bottom edge, centred in the gap between the gadget's items
   * row and the belt (mirrored when left-handed): never over the belt, the reload hint, the
   * gadget or the items, on desktop and on phones.
   */
  private placeStamp(): void {
    const l = this.layoutNow;
    if (this.buildStamp === null || l === null) return;
    const ends = l.items
      .flatMap((r) => [r.x, r.x + r.w])
      .concat([l.gadget.x, l.gadget.x + l.gadget.w]);
    const left = this.ctx.prefs.leftHanded ? l.belt.x + l.belt.w : Math.max(...ends);
    const right = this.ctx.prefs.leftHanded ? Math.min(...ends) : l.belt.x;
    const gap = Math.max(200, right - left - 48);
    const biome = this.ctx.huntBiome;
    this.buildStamp.place(
      (left + right) / 2,
      l.safe.y + l.safe.h - 6,
      stampFor(this.ctx, biome, this.ctx.manifestFor(biome)),
      gap,
    );
  }

  render(s: SimState, events: readonly SimEvent[]): void {
    // The art status can change while the late group loads: refresh the stamp now and then.
    if (++this.stampFrames % 120 === 0) this.placeStamp();
    this.lastState = s;
    const l = this.layoutNow;
    if (l === null) return;
    this.season?.render(s, events);
    const now = this.time.now;
    this.drawCaptions(events, now, l);
    // D-028 review: a secret's own bark (shown in the banner below, said by the AudioDirector) is
    // Oupa's top priority. It claims the bark gap first, so the director picks no generic line
    // this frame or for the gap after, and a generic bubble still up gives way to the banner.
    if (this.secretBarkIn(events)) {
      this.ctx.barks.secret(now);
      this.bubble?.hide();
    }
    const firstPickup = this.pickups(s, events, l);
    this.updateBarks(s, events, now, l, firstPickup);
    const banner: string[] = [];
    for (const e of events) {
      if (e.type === 'secretTriggered') {
        const reward = this.ctx.huntBiome.props.find((p) => p.id === e.propId)?.secret?.reward;
        const bark = reward?.barkKey;
        // v1.7b (D-046): with Oupa's comments off, the banner says only that a secret went off.
        const said = bark !== undefined && oupaShows(this.ctx.prefs.oupa) ? bark : undefined;
        banner.push(said !== undefined ? tOr(said, t('hud.secret')) : t('hud.secret'));
        // M10: Oupa says it too, once his recording is delivered (the banner is the subtitle);
        // v1.7b: never with his comments on "Text only" or "Off" (the AudioDirector checks).
        if (said !== undefined) this.ctx.audio.bark(said);
      } else if (e.type === 'secretPenalty') {
        // A "don't shoot it" prop (the weaver nest): its scolding, and the points off.
        const bark = this.ctx.huntBiome.props.find((p) => p.id === e.propId)?.secret?.reward
          .barkKey;
        if (bark !== undefined && oupaShows(this.ctx.prefs.oupa)) {
          banner.push(tOr(bark, bark));
          this.ctx.audio.bark(bark);
        }
        this.pushPop(formatAward(e.points), '#FF6B5A');
      } else if (e.type === 'timeAdded') {
        banner.unshift(fill(t('hud.time_added'), { n: Math.round(e.ticks / TICKS_PER_SECOND) }));
      } else if (e.type === 'bonusAwarded' && e.bonus === 'secretChain') {
        banner.push(`${t('hud.secret_chain')} ${formatAward(e.award)}`);
      } else if (e.type === 'birdSpawned' && e.motion === 'boss') {
        this.showCallout(
          fill(t('hud.boss'), { name: tOr(`creature.${e.creature}`, e.creature) }),
          '#FFD25A',
        );
      } else if (e.type === 'birdCalled' || e.type === 'birdSpawned') {
        const c = this.ctx.content.birds.creatures.find((x) => x.id === e.creature);
        const firstSighting =
          c?.kind === 'nonTarget' && c.firstSightingBadge === true && !this.sighted.has(c.id);
        // Perching creatures are "sighted" when they land and call, others when they appear.
        const inSight = e.type === 'birdCalled' || c?.behaviours.includes('perchHigh') !== true;
        if (c !== undefined && firstSighting && inSight) {
          this.sighted.add(c.id);
          this.showCallout(
            fill(t('hud.no_shoot'), { name: tOr(`creature.${c.id}`, c.id) }),
            '#FF6B5A',
          );
        }
      }
      // The Skietbaan has no score, bonuses or Frenzy: none of their labels show there (D-037).
      if (this.rangeOn && SCORE_FEEDBACK.has(e.type)) continue;
      if (e.type === 'scoreAwarded')
        this.pushPop(`${popParts(e.points, e.mult)}  ${formatAward(e.award)}`, '#F3EAD3');
      else if (e.type === 'bonusAwarded') this.pushPop(formatAward(e.award), '#FFD25A');
      else if (e.type === 'penaltyApplied') this.pushPop(formatAward(e.points), '#FF6B5A');
      else if (e.type === 'emptyClick') this.beltFlashUntil = now + 220;
      else if (e.type === 'reloadStarted' && e.auto === true && this.ctx.hook)
        this.ctx.hook.reloadFx.autoReloads++;
      else if (e.type === 'stampedeStarted') this.showBanner(t('hud.stampede'));
      else if (e.type === 'flockStateChanged' && e.to === 'flush')
        this.flushedFlocks.add(e.flockId);
      else if (e.type === 'flockRemoved') this.flushedFlocks.delete(e.flockId);
      else if (
        !this.rangeOn &&
        e.type === 'targetBagged' &&
        e.behaviour === 'flying' &&
        e.flockId !== null &&
        this.flushedFlocks.delete(e.flockId)
      ) {
        const mul = 1 + this.ctx.content.scoring.behaviourAdd.flying;
        this.showBanner(`${t('hud.wing_shot')} ×${formatMult(mul)}`);
      } else if (e.type === 'flockWiped') this.showStamp(t('hud.whole_flock'));
      else if (e.type === 'gadgetUsed') this.shoutGadget();
      else if (e.type === 'gadgetDenied') this.shakeGadget();
    }
    if (banner.length > 0) this.showBanner(banner.join(' · '));
    this.drawGadget(s);
    this.drawZoom(s);
    this.drawChips(s);
    this.drawPowerupLooks(s, l);
    this.pickupCard?.update(s.tick, Math.max(1, msToTicks(this.ctx.feel.hud.powerups.cardSlideMs)));
    if (this.ctx.hook) this.ctx.hook.pickupCard = this.pickupCard?.shown ?? null;
    this.drawWindsock(s);

    this.timer.setText(formatClock(s.ticksLeft, TICKS_PER_SECOND));
    // setColor re-renders the text texture every call, so only on change.
    const timerColor = s.stampedeActive ? '#FFD25A' : '#F3EAD3';
    if (timerColor !== this.timerColor) {
      this.timerColor = timerColor;
      this.timer.setColor(timerColor);
    }
    this.score.setText(formatScore(s.score));

    // Frenzy meter: progress toward the next tier; punch-scale on tier up.
    const tiers = this.ctx.content.scoring.frenzyTiers;
    const next = tiers.find((tier) => tier.atStreak > s.streak);
    const prevAt = [...tiers].reverse().find((tier) => tier.atStreak <= s.streak)?.atStreak ?? 0;
    const frac = next ? (s.streak - prevAt) / (next.atStreak - prevAt) : 1;
    this.frenzyBack.place(
      l.frenzy.x + FRENZY_LABEL_W,
      l.frenzy.y,
      l.frenzy.w - FRENZY_LABEL_W,
      l.frenzy.h,
    );
    const hot =
      s.frenzyMul >= 3 ? C.red : s.frenzyMul >= 2 ? 0xe2552c : s.frenzyMul > 1 ? C.gold : 0x8e7fa6;
    this.frenzyFill
      .fill(hot)
      .place(
        l.frenzy.x + FRENZY_LABEL_W + 4,
        l.frenzy.y + 4,
        Math.round(Math.max(0, (l.frenzy.w - FRENZY_LABEL_W - 8) * frac)),
        l.frenzy.h - 8,
      );
    this.frenzyLabel.setText(`${t('hud.frenzy')} ×${formatMult(s.frenzyMul)}`);
    if (s.frenzyMul > this.lastMul) {
      this.tweens.add({
        targets: this.frenzyLabel,
        scale: { from: this.ctx.feel.juice.frenzyPunchScale, to: 1 },
        duration: this.ctx.feel.juice.frenzyPunchMs,
        ease: 'Back.Out',
      });
    }
    this.lastMul = s.frenzyMul;

    // Belt: the gun's own rounds (D-032) + a red flash on an empty click. A per-shell reload
    // (Windbuks, Plaas-Pomp) fades the next round in as it loads.
    const flash = now < this.beltFlashUntil && !this.ctx.prefs.reduceFlashes;
    const w = this.previewWeapon(s.weapon);
    this.drawAmmo(w, l, flash);
    this.drawKettie(w);
    this.drawReloadBoosts(s, now, l);
    const empty = s.weapon.shells === 0 && !s.weapon.reloading && !s.weapon.infinite;
    this.reload.setText(t('hud.reload')).setVisible(empty);
    if (empty) this.reload.setScale(1 + 0.08 * Math.sin(now / 90));

    // Pop stack under the score: newest on top, fading out.
    let y = l.popAnchor.y;
    this.pops = this.pops.filter((p) => {
      const age = now - p.born;
      if (age > 1600) {
        this.dropPop(p);
        return false;
      }
      const alpha = age < 1200 ? 1 : 1 - (age - 1200) / 400;
      p.pop?.root.setPosition(l.popAnchor.x, y).setAlpha(alpha);
      p.text?.setPosition(l.popAnchor.x, y).setAlpha(alpha);
      y += 46;
      return true;
    });
    this.hideScoring();
  }

  /** M9: captions for this frame's sound cues (only with Settings → captions). */
  private drawCaptions(events: readonly SimEvent[], now: number, l: HudLayout): void {
    if (!this.ctx.prefs.captions) {
      if (this.captions.length > 0) {
        this.captions = [];
        for (const tx of this.captionTexts) tx.setVisible(false);
      }
      return;
    }
    this.captions = updateCaptions(
      this.captions,
      this.captionShown,
      events,
      now,
      this.ctx.feel.accessibility,
      this.captionCrate,
    );
    const x = l.safe.x + l.safe.w / 2;
    let y = l.safe.y + l.safe.h - 150;
    this.captionTexts.forEach((tx, i) => {
      const line = this.captions[i];
      tx.setVisible(line !== undefined);
      if (line === undefined) return;
      const said =
        line.item === undefined
          ? t(line.key)
          : fill(t(line.key), { item: tOr(`item.${line.item}`, line.item) });
      tx.setText(said).setPosition(x, y);
      y -= tx.height + 8;
    });
    if (this.ctx.hook) this.ctx.hook.captions = this.captions.map((c) => c.key);
  }

  /** e2e/dev only: the snapshot's weapon, or the previewed gun with N rounds (art previews). */
  private previewWeapon(w: SimState['weapon']): SimState['weapon'] {
    const p = this.ammoPreview;
    if (p === null) return w;
    const def = this.ctx.content.weapons.weapons.find((x) => x.id === p.weaponId);
    if (def === undefined) return w;
    const full = roundsOf(def);
    const total = def.kind === 'crate' && def.durationMs !== undefined ? def.durationMs : null;
    return {
      ...w,
      id: def.id,
      kind: def.kind,
      magazine: full ?? -1,
      shells: full === null ? -1 : Math.max(0, Math.min(full, p.rounds)),
      reloading: false,
      cooldownTicks: full === null && def.kind === 'primary' && p.rounds < 5 ? 1 : 0,
      ticksLeft: total === null ? null : Math.round((total * p.rounds) / 100),
      totalTicks: total,
    };
  }

  /** e2e/dev only (v1.1 art previews): show `weaponId`'s ammo with `rounds` left (for a timed
   *  crate gun, percent of its time; for the Kettie, fewer than 5 = the band drawn); null = live. */
  previewAmmo(weaponId: string | null, rounds = 0): void {
    this.ammoPreview = weaponId === null ? null : { weaponId, rounds };
  }

  private drawAmmo(w: SimState['weapon'], l: HudLayout, flash: boolean): void {
    const look = gunLookFor(this.ctx.feel.guns, w.id);
    const slots = ammoSlots(look.ammo, look.type, look.typeId, w, l.belt);
    while (this.ammo.length < slots.length) this.ammo.push(this.add.image(0, 0, '__WHITE'));
    this.ammo.forEach((img, i) => {
      const slot = slots[i];
      if (slot === undefined) {
        if (img.visible) img.setVisible(false);
        return;
      }
      if (img.texture.key !== slot.key) img.setTexture(slot.key);
      img.setPosition(slot.x, slot.y).setVisible(true).setAlpha(slot.alpha);
      // Hopper level: only the bottom `fill` of the full texture shows (crop keeps the position).
      if (slot.fill < 1) {
        const h = img.frame.realHeight;
        img.setCrop(0, h * (1 - slot.fill), img.frame.realWidth, h * slot.fill);
      } else if (img.isCropped) img.setCrop();
      img.setTint(flash ? 0xff4040 : 0xffffff);
    });
    if (this.ctx.hook) this.ctx.hook.ammo = slots.map((x) => x.key);
  }

  /**
   * v1.6b (D-043): Blitslaai sparks small lightning glints along the rounds (two while a reload
   * runs, hopping every 120 ms; steady and dimmer with "reduce flashes"); Oupa Laai puts his hand
   * holding shells just outside the belt's inner end. Both only with the primary gun out.
   */
  private drawReloadBoosts(s: SimState, now: number, l: HudLayout): void {
    const boosts = reloadBoostsOf(s.powerups, this.ctx.content.powerups.powerups);
    const primary = s.weapon.kind === 'primary' && !s.weapon.infinite;
    const rounds = this.ammo.filter((a) => a.visible);
    const want = primary && boosts.fast && rounds.length > 0 ? (s.weapon.reloading ? 2 : 1) : 0;
    const calm = this.ctx.prefs.reduceFlashes;
    const step = Math.floor(now / 120);
    this.bolts.forEach((b, i) => {
      const show = i < want;
      b.setVisible(show);
      if (!show) return;
      const r = rounds[(step * 3 + i * 5) % rounds.length];
      if (r === undefined) return;
      const flicker = calm ? 0.55 : 0.6 + 0.4 * ((step + i) % 2);
      b.setPosition(r.x, r.y - r.displayHeight * 0.15)
        .setAlpha(flicker)
        .setRotation(calm ? 0 : ((step + i) % 3) * 0.25 - 0.25);
    });
    const hand = this.oupaHand;
    const showHand = primary && boosts.auto;
    if (hand !== null) {
      hand.setVisible(showHand);
      if (showHand) {
        const mirrored = this.ctx.prefs.leftHanded;
        // Just outside the belt's inner end, so it never covers a round.
        const x = mirrored ? l.belt.x + l.belt.w + 32 : l.belt.x - 32;
        hand.setPosition(x, l.belt.y + l.belt.h / 2).setScale(mirrored ? -0.45 : 0.45, 0.45);
      }
    }
    if (this.ctx.hook) {
      this.ctx.hook.reloadFx.bolts = want;
      this.ctx.hook.reloadFx.oupaHand = showHand;
    }
  }

  /** Kettie (unlimited stones): a bar that fills as the next draw is ready, left of the pile. */
  private drawKettie(w: SimState['weapon']): void {
    const l = this.layoutNow;
    const show = w.kind === 'primary' && w.magazine < 0 && l !== null;
    if (!show) {
      this.drawBack.hide();
      this.drawFill.hide();
      return;
    }
    if (w.cooldownTicks > this.drawTotal || w.cooldownTicks === 0)
      this.drawTotal = Math.max(1, w.cooldownTicks);
    const ready = w.cooldownTicks === 0 ? 1 : 1 - w.cooldownTicks / this.drawTotal;
    const y = l.belt.y + l.belt.h / 2;
    const pile = gunLookFor(this.ctx.feel.guns, w.id);
    const pileW =
      pile.ammo.layout === 'pile'
        ? (Math.min(3, pile.ammo.count) - 1) * pile.type.pitch + pile.type.width
        : 0;
    const bx = l.belt.x + 24;
    const bw = l.belt.w - 24 - 20 - pileW - 24;
    this.drawBack.place(bx, y - 12, bw, 24);
    this.drawFill.place(bx, y - 12, Math.round(Math.max(24, bw * ready)), 24);
  }

  /**
   * Crate weapon first, then power-ups: icon, name, a bar of the time (or shells) left and, v1.7b
   * (D-046), the seconds (or shells) left at the right end. Over its last seconds a chip blinks
   * (feel.json hud.powerups; with "reduce flashes" its countdown turns red instead).
   */
  private drawChips(s: SimState): void {
    const l = this.layoutNow;
    if (l === null) return;
    const { chipW, chipH } = this.ctx.feel.hud;
    const look = this.ctx.feel.hud.powerups;
    const tps = TICKS_PER_SECOND;
    const secs = (ticks: number): string => `${Math.ceil(ticks / tps)} s`;
    const chips: {
      id: string;
      label: string;
      frac: number;
      icon: string | null;
      time: string;
      ending: boolean;
    }[] = [];
    const ending = (ticksLeft: number | null): boolean =>
      ticksLeft !== null && (ticksLeft * 1000) / tps <= look.blinkMs;
    const iconOf = (id: string): string | null => {
      const icon = powerupIcon(id);
      return this.textures.exists(icon) ? icon : null;
    };
    if (s.weapon.kind === 'crate') {
      const w = s.weapon;
      const frac =
        w.ticksLeft !== null && w.totalTicks !== null
          ? w.ticksLeft / w.totalTicks
          : w.magazine > 0
            ? Math.max(0, w.shells) / w.magazine
            : 1;
      chips.push({
        id: w.id,
        label: tOr(`item.${w.id}`, w.id),
        frac,
        icon: iconOf(w.id),
        time:
          w.ticksLeft !== null
            ? secs(w.ticksLeft)
            : w.magazine > 0
              ? `×${Math.max(0, w.shells)}`
              : '',
        ending: ending(w.ticksLeft),
      });
    }
    for (const p of s.powerups) {
      const frac =
        p.ticksLeft !== null && p.totalTicks !== null
          ? p.ticksLeft / p.totalTicks
          : p.shellsLeft !== null
            ? Math.min(1, p.shellsLeft / this.shellsOf(p.id))
            : 1;
      chips.push({
        id: p.id,
        label: tOr(`item.${p.id}`, p.id),
        frac,
        icon: iconOf(p.id),
        time:
          p.ticksLeft !== null
            ? secs(p.ticksLeft)
            : p.shellsLeft !== null
              ? `×${p.shellsLeft}`
              : '',
        ending: ending(p.ticksLeft) || p.shellsLeft === 1,
      });
    }
    // Blink on sim time (a held frame holds it); steady red with "reduce flashes".
    const steady = this.ctx.prefs.reduceFlashes;
    const blinkOff = !steady && Math.floor((s.tick * 1000) / tps / look.blinkPeriodMs) % 2 === 1;
    if (this.ctx.hook) {
      this.ctx.hook.reloadFx.chipIcons = chips.map((c) => c.icon);
      this.ctx.hook.chips = chips.map((c) => ({
        id: c.id,
        label: c.label,
        time: c.time,
        ending: c.ending,
        icon: c.icon,
      }));
    }
    this.chipTexts.forEach((txt, i) => {
      const chip = chips[i];
      const iconImg = this.chipIcons[i];
      const timeTxt = this.chipTimes[i];
      txt.setVisible(chip !== undefined);
      iconImg?.setVisible(chip?.icon != null);
      timeTxt?.setVisible(chip !== undefined && chip.time !== '');
      if (chip === undefined) {
        this.chipBacks[i]?.hide();
        this.chipBars[i]?.hide();
        return;
      }
      const y = l.chips.y + i * (chipH + CHIP_GAP);
      this.chipBacks[i]?.place(l.chips.x, y, chipW, chipH);
      this.chipBars[i]?.place(
        l.chips.x + 4,
        y + chipH - 10,
        Math.round(Math.max(0, (chipW - 8) * chip.frac)),
        6,
      );
      if (txt.text !== chip.label) txt.setText(chip.label);
      // v1.6b: an icon sits at the chip's left; a long name shrinks to fit beside it.
      const iconW = chip.icon === null ? 0 : chipH - 6;
      if (iconImg !== undefined && chip.icon !== null) {
        if (iconImg.texture.key !== chip.icon) iconImg.setTexture(chip.icon);
        iconImg
          .setDisplaySize(iconW, iconW)
          .setPosition(l.chips.x + 6 + iconW / 2, y + chipH / 2 - 3);
      }
      let timeW = 0;
      if (timeTxt !== undefined && chip.time !== '') {
        if (timeTxt.text !== chip.time) timeTxt.setText(chip.time);
        const color = chip.ending && steady ? '#FF6B5A' : '#FFD25A';
        if (timeTxt.style.color !== color) timeTxt.setColor(color);
        timeTxt.setPosition(l.chips.x + chipW - 10, y + chipH / 2 - 3);
        timeW = timeTxt.displayWidth + 10;
      }
      const textX = l.chips.x + 14 + iconW;
      const room = chipW - (textX - l.chips.x) - 10 - timeW;
      txt.setScale(txt.width > room ? room / txt.width : 1, 1);
      txt.setPosition(textX, y + chipH / 2 - 3);
      // The last seconds: the whole chip's content blinks.
      const a = chip.ending && blinkOff ? 0.25 : 1;
      txt.setAlpha(a);
      iconImg?.setAlpha(a);
      timeTxt?.setAlpha(a);
    });
  }

  /**
   * v1.7b (D-046): power-ups the player can see, small and local, never a full-screen flash:
   * Boeretroos warms the screen's edges (fading in and out, the middle stays clear) and slows the
   * effects' sound; Chilli Biltong draws ∞ over the belt. Bush Buckshot's ring is the crosshair's
   * (CrosshairView); Meerkat Spotter's helper and rings are the world's; Blitslaai's glints and
   * Oupa's hand are drawn with the belt.
   */
  private drawPowerupLooks(s: SimState, l: HudLayout): void {
    const defs = this.ctx.content.powerups.powerups;
    const look = this.ctx.feel.hud.powerups;
    let slow: (typeof s.powerups)[number] | null = null;
    let rate = 1;
    let endless = false;
    for (const p of s.powerups) {
      const e = defs.find((d) => d.id === p.id)?.effect;
      if (e?.creatureTimeScale !== undefined && e.creatureTimeScale < 1) {
        slow = p;
        rate = look.slowSoundRate;
      }
      if (e?.infiniteAmmo === true) endless = true;
    }
    this.ctx.audio.setSlowMotion(rate);
    const tint = this.slowTint;
    if (tint !== null) {
      tint.setVisible(slow !== null);
      if (slow !== null) {
        const { width, height } = designSize();
        const sig = `${width}x${height}`;
        if (sig !== this.slowTintFor) {
          this.slowTintFor = sig;
          tint.clear();
          const a = look.slowTintAlpha;
          const c = 0xe89a3c;
          const bw = Math.round(width * 0.16);
          const bh = Math.round(height * 0.16);
          tint.fillGradientStyle(c, c, c, c, a, 0, a, 0).fillRect(0, 0, bw, height);
          tint.fillGradientStyle(c, c, c, c, 0, a, 0, a).fillRect(width - bw, 0, bw, height);
          tint.fillGradientStyle(c, c, c, c, a, a, 0, 0).fillRect(0, 0, width, bh);
          tint.fillGradientStyle(c, c, c, c, 0, 0, a, a).fillRect(0, height - bh, width, bh);
        }
        // Fades in over its first half second and out over its last (sim time).
        const half = TICKS_PER_SECOND / 2;
        const left = slow.ticksLeft ?? half;
        const done = (slow.totalTicks ?? half) - left;
        tint.setAlpha(Math.max(0, Math.min(1, left / half, done / half)));
      }
    }
    const inf = this.infinity;
    const onBelt = endless && s.weapon.kind === 'primary';
    if (inf !== null) {
      inf.setVisible(onBelt);
      if (onBelt) this.drawInfinity(inf, l);
    }
    if (this.ctx.hook)
      this.ctx.hook.powerupLooks = {
        slowTint: slow !== null,
        soundRate: rate,
        infinity: onBelt,
      };
  }

  /** A ∞ (a figure-eight lemniscate) in chilli orange over the belt's middle. */
  private drawInfinity(g: Phaser.GameObjects.Graphics, l: HudLayout): void {
    const cx = l.belt.x + l.belt.w / 2;
    const cy = l.belt.y + l.belt.h / 2;
    const r = Math.min(46, l.belt.h * 0.42) * 1.6;
    const pts: Phaser.Math.Vector2[] = [];
    for (let k = 0; k <= 48; k++) {
      const t = (k / 48) * Math.PI * 2;
      const d = 1 + Math.sin(t) ** 2;
      pts.push(
        new Phaser.Math.Vector2(
          cx + (r * Math.cos(t)) / d,
          cy + (r * Math.sin(t) * Math.cos(t)) / d,
        ),
      );
    }
    g.clear();
    g.lineStyle(16, 0x1b1410, 1).strokePoints(pts, true);
    g.lineStyle(9, 0xff6b3a, 1).strokePoints(pts, true);
  }

  /**
   * v1.7b (D-046): a power-up or crate gun picked up this frame shows its card; the first pickup
   * on this save shows the full sentence for longer and is remembered. Returns the id of a first
   * pickup (Oupa may say a word on it), or null.
   */
  private pickups(s: SimState, events: readonly SimEvent[], l: HudLayout): string | null {
    let first: string | null = null;
    for (const e of events) {
      const id =
        e.type === 'powerupStarted'
          ? e.powerup
          : e.type === 'weaponChanged' && e.kind === 'crate'
            ? e.weapon
            : null;
      if (id === null) continue;
      const fresh = markSeen(this.ctx.save.data.powerups.seen, id).first;
      if (fresh) {
        first = id;
        this.ctx.save.update((d) => ({
          ...d,
          powerups: { seen: [...markSeen(d.powerups.seen, id).seen] },
        }));
      }
      const card = this.pickupCard;
      if (card === null) continue;
      const lang = getLanguage();
      const tr = translator(lang);
      const icon = powerupIcon(id);
      const look = this.ctx.feel.hud.powerups;
      card.show(
        {
          id,
          icon: this.textures.exists(icon) ? icon : null,
          name: tOr(`item.${id}`, id),
          line: fresh
            ? effectText(this.ctx.content, id, tr, lang)
            : shortText(this.ctx.content, id, tr, lang),
          first: fresh,
          newTag: t('pickup.new'),
        },
        l.pickup,
        s.tick,
        msToTicks(fresh ? look.cardFirstMs : look.cardMs),
      );
    }
    return first;
  }

  /** A shell-counted power-up's full count (powerups.json durationShells; 1 if none). */
  private shellsOf(id: string): number {
    const def = this.ctx.content.powerups.powerups.find((x) => x.id === id);
    return Math.max(1, def?.durationShells ?? 1);
  }

  /** Omen hunts: the sock points downwind and stands out straighter in a strong wind. */
  private drawWindsock(s: SimState): void {
    const l = this.layoutNow;
    const wind = s.wind;
    const show = l !== null && wind !== null && this.ctx.huntBiome.omen.visual?.windSock === true;
    this.sock.setVisible(show);
    this.sockPole.setVisible(show);
    if (!show) return;
    const droop = (1 - wind.strength) * 0.9;
    const wobble = Math.sin(this.time.now / 140) * 0.06 * wind.strength;
    this.sock
      .setScale(wind.dir * (0.55 + 0.45 * wind.strength), 1)
      .setRotation(wind.dir * (droop + wobble));
  }

  private showCallout(text: string, color: string): void {
    const ms = this.ctx.feel.juice.calloutMs;
    this.tweens.killTweensOf(this.callout);
    this.callout.setText(text).setColor(color).setVisible(true).setAlpha(1).setScale(0.5);
    this.tweens.add({ targets: this.callout, scale: 1, duration: 220, ease: 'Back.Out' });
    this.tweens.add({
      targets: this.callout,
      alpha: 0,
      delay: ms * 0.8,
      duration: ms * 0.2,
      onComplete: () => this.callout.setVisible(false),
    });
  }

  private pushPop(text: string, color: string): void {
    const pool = this.popPool;
    if (pool !== null && popCanShow(text)) {
      // The pop atlas is drawn at the world pops' 52 px; 38 px here scales it (outline 8 → ~6).
      const keys = ensurePopFont(this, popLook(FONT, 52, 8));
      const size = Math.round((keys.sizePx * 38) / 52);
      const pop = pool.acquire(keys).show(keys, size, text, 1, 0, colorNumber(color));
      this.pops.unshift({ pop, text: null, born: this.time.now });
    } else {
      const tx = this.add
        .text(0, 0, text, {
          fontFamily: FONT,
          fontSize: fontPx(38),
          fontStyle: '900',
          color,
          ...outline(38, 6),
        })
        .setOrigin(1, 0);
      this.pops.unshift({ pop: null, text: tx, born: this.time.now });
    }
    while (this.pops.length > this.ctx.feel.hud.popStackSize) {
      const old = this.pops.pop();
      if (old !== undefined) this.dropPop(old);
    }
  }

  /** Does a secret with its own bark (biome content) go off or scold this frame? */
  private secretBarkIn(events: readonly SimEvent[]): boolean {
    return events.some(
      (e) =>
        (e.type === 'secretTriggered' || e.type === 'secretPenalty') &&
        this.ctx.huntBiome.props.find((p) => p.id === e.propId)?.secret?.reward.barkKey !==
          undefined,
    );
  }

  /** v1.0.1 (D-028 §3): this frame's events → maybe one bark, shown in the bubble slot. */
  private updateBarks(
    s: SimState,
    events: readonly SimEvent[],
    now: number,
    l: HudLayout,
    firstPickup: string | null,
  ): void {
    if (!this.barksOn || this.bubble === null) return;
    const quota = this.seasonInfo?.quota;
    const quotaReached = quota !== undefined && this.lastScore < quota && s.score >= quota;
    this.lastScore = s.score;
    let bark: Bark | null = null;
    if (this.firstTodayPending) {
      this.firstTodayPending = false;
      bark = this.ctx.barks.say('firstToday', now);
    }
    bark ??= this.ctx.barks.hunt(events, {
      nowMs: now,
      tick: s.tick,
      ticksLeft: s.ticksLeft,
      ticksPerSecond: TICKS_PER_SECOND,
      frenzyTopMul: Math.max(...this.ctx.content.scoring.frenzyTiers.map((f) => f.mul)),
      quotaReached,
    });
    // v1.7b (D-046): a power-up's first pickup on this save gets Oupa's word on it.
    const pickupLine = firstPickup === null ? null : `bark.pu.${firstPickup}`;
    if (pickupLine !== null && isI18nKey(pickupLine)) bark = this.ctx.barks.claim(pickupLine, now);
    if (bark !== null) sayBark(this.ctx, this.bubble, bark.line, l.bark, now);
  }

  /** Pooled HUD pops: shown and made (test hook, D-028 §4). */
  popStats(): { shown: number; created: number } {
    return { shown: this.popPool?.shown ?? 0, created: this.popPool?.created ?? 0 };
  }

  private dropPop(p: Pop): void {
    if (p.pop !== null) this.popPool?.release(p.pop);
    p.text?.destroy();
  }

  private showBanner(text: string): void {
    // GDD §16: one line of text during the lesson — the FTUE prompt wins.
    if (this.promptKey !== null) return;
    const ms = this.ctx.feel.juice.bannerMs;
    this.tweens.killTweensOf(this.banner);
    this.banner.setText(text).setVisible(true).setScale(1).setAlpha(1);
    // v1.7b (D-046): under the pickup card while it is up.
    const card = this.pickupCard?.shown ?? null;
    const lay = this.layoutNow;
    if (lay !== null)
      this.banner.setY(
        card === null
          ? lay.safe.y + 180
          : Math.max(lay.safe.y + 180, card.rect.y + card.rect.h + 56),
      );
    // Long banners (crate + hint, bonus time + bark) shrink to fit between the HUD corners.
    const l = this.layoutNow;
    const room =
      l === null ? this.banner.width : l.safe.w + 2 * l.safe.x - 2 * (l.frenzy.x + l.frenzy.w + 20);
    const fit = Math.min(1, room / Math.max(1, this.banner.width));
    this.banner.setScale(0.4 * fit);
    this.tweens.add({ targets: this.banner, scale: fit, duration: 300, ease: 'Back.Out' });
    this.tweens.add({
      targets: this.banner,
      alpha: 0,
      delay: ms * 0.8,
      duration: ms * 0.2,
      onComplete: () => this.banner.setVisible(false),
    });
  }

  /** "DIE HELE SWERM!" (GDD §6.4, §17): a rubber stamp thud. */
  private showStamp(text: string): void {
    const ms = this.ctx.feel.juice.stampMs;
    this.tweens.killTweensOf(this.stamp);
    this.stamp.setText(text).setVisible(true).setScale(2.6).setAlpha(0);
    this.tweens.add({ targets: this.stamp, scale: 1, alpha: 1, duration: 180, ease: 'Quad.In' });
    this.tweens.add({
      targets: this.stamp,
      alpha: 0,
      delay: ms * 0.75,
      duration: ms * 0.25,
      onComplete: () => this.stamp.setVisible(false),
    });
  }

  private shoutGadget(): void {
    const ms = this.ctx.feel.juice.kekBubbleMs;
    this.tweens.killTweensOf(this.gadgetShout);
    this.gadgetShout.setText(t('fx.vuvuzela')).setVisible(true).setAlpha(1).setScale(0.5);
    this.tweens.add({ targets: this.gadgetShout, scale: 1, duration: 160, ease: 'Back.Out' });
    this.tweens.add({
      targets: this.gadgetShout,
      alpha: 0,
      delay: ms,
      duration: 300,
      onComplete: () => this.gadgetShout.setVisible(false),
    });
  }

  private shakeGadget(): void {
    const l = this.layoutNow;
    if (l === null) return;
    this.tweens.killTweensOf(this.gadgetShake);
    this.gadgetShake.x = 0;
    this.tweens.add({ targets: this.gadgetShake, x: 8, yoyo: true, repeat: 3, duration: 40 });
  }

  /** Round enamel button with a horn, the charges, a cooldown wedge and (mouse) the Q hint. */
  private drawGadget(s: SimState): void {
    const l = this.layoutNow;
    const gadget = s.gadget;
    const show = l !== null && gadget !== null;
    this.gadgetCharges.setVisible(show);
    this.gadgetKey.setVisible(show && this.inputKind === 'pointer');
    if (!show) {
      this.gadgetPanel.hide();
      return;
    }
    const cd = gadget.cooldownTotalTicks > 0 ? gadget.cooldownTicks / gadget.cooldownTotalTicks : 0;
    const r = l.gadget.w / 2;
    // The key cap pokes out past the disc: draw with a margin, in the drawing's own coordinates.
    const pad = 8;
    const size = 2 * (r + pad);
    // A charm gadget (Fluitjie) has no charge limit (charges −1).
    const ready = gadget.charges !== 0 && gadget.cooldownTicks === 0;
    const key = `${gadget.charges}:${Math.ceil(cd * 40)}:${this.inputKind}:${r}`;
    if (key !== this.gadgetDrawn) {
      this.gadgetDrawn = key;
      this.gadgetCharges.setText(gadget.charges < 0 ? '∞' : `×${gadget.charges}`);
      this.gadgetKey.setText(t('hud.gadget_key'));
    }
    // Baked into a texture only when the look changes (M9: no per-frame tessellation).
    this.gadgetPanel.draw(
      l.gadget.x - pad + this.gadgetShake.x,
      l.gadget.y - pad,
      size,
      size,
      key,
      (g) => {
        const cx = r + pad;
        const cy = r + pad;
        g.fillStyle(C.ink, 0.9).fillCircle(cx, cy, r);
        g.fillStyle(ready ? 0x2f8f4e : 0x55605a, 1).fillCircle(cx, cy, r - 6);
        // Horn: a widening cone with a bell (yellow, like the stadium horn).
        g.fillStyle(ready ? 0xffd25a : 0x9a9a8a, 1);
        g.fillTriangle(
          cx - r * 0.55,
          cy + r * 0.05,
          cx + r * 0.35,
          cy - r * 0.35,
          cx + r * 0.35,
          cy + r * 0.45,
        );
        g.fillEllipse(cx + r * 0.38, cy + r * 0.05, r * 0.3, r * 0.85);
        if (cd > 0) {
          // Cooldown: a dark wedge that shrinks clockwise.
          g.fillStyle(C.ink, 0.6);
          g.slice(cx, cy, r - 6, -Math.PI / 2, -Math.PI / 2 + cd * Math.PI * 2, false).fillPath();
        }
        if (this.inputKind === 'pointer') {
          // Key cap on the rim, top-right, clear of the horn.
          const kx = cx + r * 0.68;
          const ky = cy - r * 0.68;
          g.fillStyle(C.ink, 1).fillRoundedRect(kx - 23, ky - 21, 46, 42, 9);
          g.fillStyle(C.enamel, 1).fillRoundedRect(kx - 19, ky - 17, 38, 34, 7);
        }
      },
    );
  }
}
