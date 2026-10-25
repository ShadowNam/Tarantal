// v1.7b (D-046): the pickup card. When a power-up or crate gun is picked up, a short card slides
// in at the top centre (HudLayout.pickup, never over the crosshair or the flock in the middle):
// its icon, its name and one line of what it does with its length. The first pickup on a save
// shows the full sentence and a "New!" tag, and stays longer. It runs on sim ticks, so a held
// frame (e2e ?holdAt) holds it too.
import type * as Phaser from 'phaser';
import type { Rect } from './hudLayout';
import { fitText, textStyle, UI } from './menu';

export interface PickupInfo {
  readonly id: string;
  /** Texture key, or null when it isn't loaded. */
  readonly icon: string | null;
  readonly name: string;
  /** The short line (or the full sentence the first time). */
  readonly line: string;
  readonly first: boolean;
  /** The "New!" tag's text (first pickup only). */
  readonly newTag: string;
}

const PAD = 16;
/** The line's sizes tried in turn (1 = 30 px design). */
const LINE_SCALES = [1, 0.92, 0.85, 0.78, 0.72] as const;
const DEPTH = 40;

export class PickupCard {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly disc: Phaser.GameObjects.Arc;
  private readonly icon: Phaser.GameObjects.Image;
  private readonly name: Phaser.GameObjects.Text;
  private readonly tag: Phaser.GameObjects.Text;
  private readonly line: Phaser.GameObjects.Text;
  private info: PickupInfo | null = null;
  private fromTick = 0;
  private untilTick = 0;
  private box: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private textBottom = 0;

  constructor(scene: Phaser.Scene) {
    this.bg = scene.add.graphics().setDepth(DEPTH);
    this.disc = scene.add.circle(0, 0, 1, UI.enamel, 1).setDepth(DEPTH);
    this.icon = scene.add.image(0, 0, '__DEFAULT').setDepth(DEPTH);
    this.name = scene.add.text(0, 0, '', textStyle(40, '#FFD25A')).setDepth(DEPTH);
    this.tag = scene.add.text(0, 0, '', textStyle(28, '#FF8A6A')).setDepth(DEPTH);
    this.line = scene.add.text(0, 0, '', textStyle(30)).setDepth(DEPTH);
    this.setVisible(false);
  }

  /** Shows `info` in `slot` from `tick` for `ticks`. */
  show(info: PickupInfo, slot: Rect, tick: number, ticks: number): void {
    this.info = info;
    this.fromTick = tick;
    this.untilTick = tick + ticks;
    const iconBox = info.first ? 120 : 92;
    const textX = slot.x + PAD + iconBox + 20;
    const textW = slot.x + slot.w - PAD - textX;
    this.name
      .setText(info.name)
      .setScale(1)
      .setPosition(textX, slot.y + PAD);
    this.tag.setText(info.first ? info.newTag : '').setVisible(info.first);
    const tagW = info.first ? this.tag.width + 16 : 0;
    fitText(this.name, textW - tagW);
    this.tag.setPosition(textX + this.name.displayWidth + 16, slot.y + PAD + 8);
    // The line wraps to the text column; a long one (a first pickup's full sentence, German on a
    // 4:3 screen, large text) shrinks, wrapping wider, until it fits the slot (never below
    // MIN_LINE_SCALE of its size; at the floor it is cut to what fits, which a slot of 260 px
    // never needs with the shipped strings).
    const top = slot.y + PAD + this.name.displayHeight + 4;
    const room = slot.y + slot.h - PAD - top;
    this.line.setText(info.line).setPosition(textX, top);
    for (const k of LINE_SCALES) {
      this.line.setScale(k).setWordWrapWidth(textW / k, true);
      if (this.line.displayHeight <= room) break;
    }
    if (this.line.displayHeight > room) {
      const k = this.line.scaleY;
      const lineH = this.line.displayHeight / Math.max(1, this.line.getWrappedText().length);
      this.line.setMaxLines(Math.max(1, Math.floor(room / Math.max(1, lineH))));
      this.line.setScale(k);
    } else this.line.setMaxLines(0);
    const h = Math.min(
      slot.h,
      Math.max(iconBox + 2 * PAD, this.line.y + this.line.displayHeight + PAD - slot.y),
    );
    this.box = { x: slot.x, y: slot.y, w: slot.w, h };
    this.textBottom = Math.round(this.line.y + this.line.displayHeight);
    this.bg.clear();
    this.bg.fillStyle(UI.ink, 0.9).fillRoundedRect(slot.x, slot.y, slot.w, h, 18);
    this.bg
      .lineStyle(4, UI.gold, 1)
      .strokeRoundedRect(slot.x + 2, slot.y + 2, slot.w - 4, h - 4, 16);
    const cx = slot.x + PAD + iconBox / 2;
    const cy = slot.y + h / 2;
    this.disc.setPosition(cx, cy).setRadius(iconBox / 2);
    if (info.icon !== null) {
      this.icon
        .setTexture(info.icon)
        .setPosition(cx, cy)
        .setDisplaySize(iconBox - 14, iconBox - 14);
    }
    this.setVisible(true);
    this.icon.setVisible(info.icon !== null);
    this.tag.setVisible(info.first);
  }

  /** One frame: slide in, hold, slide out (sim ticks), then hide. */
  update(tick: number, slideTicks: number): void {
    if (this.info === null) return;
    if (tick >= this.untilTick || tick < this.fromTick) {
      this.hide();
      return;
    }
    const k = Math.min(
      1,
      (tick - this.fromTick) / slideTicks,
      (this.untilTick - tick) / slideTicks,
    );
    const dy = -24 * (1 - k);
    for (const o of this.parts()) o.setAlpha(k);
    this.bg.setY(dy);
    this.disc.setY(this.box.y + this.box.h / 2 + dy);
    this.icon.setY(this.box.y + this.box.h / 2 + dy);
    this.name.setY(this.box.y + PAD + dy);
    this.tag.setY(this.box.y + PAD + 8 + dy);
    this.line.setY(this.box.y + PAD + this.name.displayHeight + 4 + dy);
  }

  hide(): void {
    this.info = null;
    this.setVisible(false);
  }

  /** The card on screen now (id, first, its text, its box and where its text really ends, and
   *  the line's scale), or null. */
  get shown(): {
    id: string;
    first: boolean;
    name: string;
    line: string;
    rect: Rect;
    textBottom: number;
    lineScale: number;
  } | null {
    const i = this.info;
    return i === null
      ? null
      : {
          id: i.id,
          first: i.first,
          name: i.name,
          line: i.line,
          rect: this.box,
          textBottom: this.textBottom,
          lineScale: this.line.scaleY,
        };
  }

  private parts(): { setAlpha(a: number): unknown }[] {
    return [this.bg, this.disc, this.icon, this.name, this.tag, this.line];
  }

  private setVisible(on: boolean): void {
    this.bg.setVisible(on);
    this.disc.setVisible(on);
    this.icon.setVisible(on);
    this.name.setVisible(on);
    this.tag.setVisible(on);
    this.line.setVisible(on);
  }
}
