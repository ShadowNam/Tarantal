// Oupa's speech bubble (v1.0.1, D-028 §3): the text of a bark — its subtitle once a recording is
// delivered (art bible §10: "all subtitled"). A cream plate with an ink outline and a tail, the
// speaker's name, and the line in dark text, sized to the line and kept inside its layout slot.
// Never interactive: taps on it reach the game (it holds no input and no hit area).
import type * as Phaser from 'phaser';
import { fill, t, tOr } from '../../i18n/i18n';
import type { GameContext } from '../GameContext';
import { textStyle } from './menu';
import type { Rect } from './hudLayout';
import { oupaShows, oupaSpeaks } from '../audio/oupaMode';

const PAD = 14;
const INK = 0x1b1410;
const PLATE = 0xf3ead3;

export interface BarkTiming {
  readonly bubbleMs: number;
  readonly fadeMs: number;
}

export class BarkBubble {
  private readonly root: Phaser.GameObjects.Container;
  private readonly plate: Phaser.GameObjects.Rectangle;
  private readonly tail: Phaser.GameObjects.Triangle;
  private readonly name: Phaser.GameObjects.Text;
  private readonly line: Phaser.GameObjects.Text;
  private shownUntil = -Infinity;
  /** D-064: Oupa's face over the bubble's corner on a special day (Christmas: his Santa hat). */
  private portrait: Phaser.GameObjects.Image | null = null;
  /** The bubble's design-px rect while it shows (null = hidden). */
  rect: Rect | null = null;
  /** Called once the bubble has faded out (or was hidden). */
  onHidden: (() => void) | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    fontPx: number,
  ) {
    this.plate = scene.add.rectangle(0, 0, 10, 10, PLATE, 0.96).setOrigin(0, 0);
    this.plate.setStrokeStyle(4, INK);
    this.tail = scene.add.triangle(0, 0, 0, 0, 26, 0, 0, 24, PLATE, 0.96).setOrigin(0, 0);
    this.name = scene.add.text(0, 0, t('ui.oupa'), textStyle(fontPx * 0.7, '#8B5A2B'));
    this.line = scene.add.text(0, 0, '', textStyle(fontPx, '#1B1410'));
    this.root = scene.add.container(0, 0, [this.tail, this.plate, this.name, this.line]);
    this.root.setVisible(false).setDepth(5);
  }

  /**
   * D-064: Oupa's face in his Santa hat (a texture frame, origin at his face's middle) beside his
   * name while a special day's hunt runs; null takes it away. It lives in the name row only: show()
   * sizes it from the name's height (every language, large text) so his beard ends on the row's
   * baseline and the line starts below it; only the hat's tip rises above the plate.
   */
  setPortrait(p: { key: string; frame: string } | null): void {
    if (p === null) {
      this.portrait?.setVisible(false);
      return;
    }
    if (this.portrait === null) {
      this.portrait = this.scene.add.image(0, 0, p.key, p.frame);
      this.root.add(this.portrait);
    }
    this.portrait.setTexture(p.key, p.frame).setVisible(true);
  }

  /** D-064: the line's on-screen rect (the e2e checks Oupa's face never covers it). */
  lineRect(): Rect {
    const b = this.line.getBounds();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  }

  /** D-064: the portrait's on-screen rect while it shows (design px), else null. */
  portraitRect(): Rect | null {
    if (this.portrait?.visible !== true || this.rect === null) return null;
    const b = this.portrait.getBounds();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  }

  /** Shows `text` in `slot` (top-left anchored) for timing.bubbleMs, fading in and out. */
  show(text: string, slot: Rect, timing: BarkTiming, nowMs: number): void {
    const inner = slot.w - 2 * PAD;
    this.line.setWordWrapWidth(inner, true).setText(text).setScale(1);
    // D-064: Oupa's face in the name row, left of his name: its face and beard (the frame below
    // its origin, 32 % of it) end on the row's baseline; the hat rises above. The line starts
    // below the row, so the beard never covers a letter.
    let nameX = PAD;
    const face = this.portrait;
    if (face?.visible === true) {
      const fh = face.frame.height;
      const fw = face.frame.width;
      const dispH = this.name.height * 1.9;
      const k = dispH / Math.max(1, fh);
      face.setScale(k);
      face.setPosition(
        PAD + face.originX * fw * k,
        PAD + this.name.height - (1 - face.originY) * fh * k,
      );
      nameX = PAD + fw * k + 6;
    }
    this.name.setPosition(nameX, PAD);
    const top = PAD + this.name.height;
    // Too tall for the slot (a long translation at a large text size): shrink to fit.
    const room = slot.h - top - PAD;
    if (this.line.height > room) this.line.setScale(Math.max(0.5, room / this.line.height));
    this.line.setPosition(PAD, top);
    const w = Math.min(
      slot.w,
      Math.max(nameX - PAD + this.name.width, this.line.displayWidth) + 2 * PAD,
    );
    const h = Math.min(slot.h, top + this.line.displayHeight + PAD);
    this.plate.setSize(w, h);
    this.plate.setRounded(18);
    this.tail.setPosition(PAD * 2, h - 2);
    this.root.setPosition(slot.x, slot.y).setVisible(true).setAlpha(0);
    this.rect = { x: slot.x, y: slot.y, w, h };
    this.shownUntil = nowMs + timing.bubbleMs;
    this.scene.tweens.killTweensOf(this.root);
    this.scene.tweens.add({ targets: this.root, alpha: 1, duration: timing.fadeMs });
    this.scene.tweens.add({
      targets: this.root,
      alpha: 0,
      delay: Math.max(0, timing.bubbleMs - timing.fadeMs),
      duration: timing.fadeMs,
      onComplete: () => {
        this.hide();
      },
    });
  }

  /** True while the bubble shows. */
  visibleAt(nowMs: number): boolean {
    return this.rect !== null && nowMs < this.shownUntil;
  }

  hide(): void {
    this.scene.tweens.killTweensOf(this.root);
    this.root.setVisible(false);
    this.rect = null;
    const cb = this.onHidden;
    this.onHidden = null;
    cb?.();
  }
}

/** Hook history cap (lines said on this page). */
const HOOK_BARKS_MAX = 50;

/**
 * Oupa says `line` (v1.7b: as Settings → Oupa's comments allows): the bubble shows its text in `slot`, the AudioDirector plays voice/<line> if
 * a recording was delivered (music ducks under it), and the e2e hook records it.
 */
export function sayBark(
  ctx: GameContext,
  bubble: BarkBubble,
  line: string,
  slot: Rect,
  nowMs: number,
  /** v1.7b: `{name}` values for the line (a first pickup's `{item}`, following the names toggle). */
  vars: Readonly<Record<string, string>> = {},
): void {
  // v1.7b (D-046): Settings → Oupa's comments "Off": no bubble, no voice, nothing recorded.
  if (!oupaShows(ctx.prefs.oupa)) return;
  const text = fill(tOr(line, line), vars);
  bubble.hide();
  bubble.show(text, slot, ctx.feel.barks, nowMs);
  // "Text only": the AudioDirector keeps quiet (setOupaVoice).
  if (oupaSpeaks(ctx.prefs.oupa)) ctx.audio.bark(line);
  const hook = ctx.hook;
  if (hook) {
    const r = bubble.rect ?? slot;
    hook.bark = { line, text, x: r.x, y: r.y, w: r.w, h: r.h };
    // D-064: Oupa's Santa-hat face on the bubble, for the safe-area checks.
    const face = bubble.portraitRect();
    if (face === null) {
      delete hook.rects['barkPortrait'];
      delete hook.rects['barkLine'];
    } else {
      hook.rects['barkPortrait'] = face;
      hook.rects['barkLine'] = bubble.lineRect();
    }
    hook.barks.push(line);
    if (hook.barks.length > HOOK_BARKS_MAX) hook.barks.shift();
    bubble.onHidden = () => {
      if (hook.bark?.line === line) hook.bark = null;
    };
  }
}
