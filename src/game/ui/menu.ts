// Menu kit for the Phaser-drawn screens (Title, Skiet-Skuur, Settings, Pause, Tally). Phaser's
// input is off (Tech §6), so a Menu listens to Pointer Events on the canvas and keys on window:
//   pointer: press on release over the same item (or on press for `trigger: 'down'`); sliders drag.
//   keys (GDD §18.3 "full keyboard menus"): ↑/↓/Tab move focus, ←/→ adjust a slider/choice (or
//   move focus), Enter/Space press, Esc goes back.
// Every tap target is ≥ 64 design px tall (art bible §6). Rects are design px of the screen.
import * as Phaser from 'phaser';
import type { TestHook } from '../GameContext';
import { clientToDesign } from '../input/screenButtons';
import { FONT } from '../view/Fx';
import { rectContains, type Rect } from './hudLayout';

export const MIN_TAP_PX = 64;
/** A drag item released within this many design px of where it was pressed was a tap. */
export const DRAG_TAP_PX = 24;

export const UI = {
  ink: 0x1b1410,
  wood: 0x8b5a2b,
  slate: 0x2e3b33,
  enamel: 0xf3ead3,
  gold: 0xd8a73a,
  red: 0xc8302a,
  grey: 0x6b6b60,
  focus: 0xffd25a,
} as const;

export interface MenuItem {
  /** Also the key under hook.rects (e2e taps by id). */
  readonly id: string;
  rect(): Rect;
  /** Pointer press or Enter/Space; pointerId null from the keyboard. */
  press(pointerType: string, pointerId: number | null): void;
  /** ←/→ while focused (sliders and choices). */
  adjust?(dir: -1 | 1): void;
  /** Pointer pressed or dragged on the item (sliders, charm cards): x in design px. */
  drag?(x: number): void;
  /** Drag items: the pointer lifted at x; `tap` = it barely moved (a tap, not a drag). */
  drop?(x: number, tap: boolean): void;
  enabled?(): boolean;
  /** 'down': press on pointerdown (the title's START, like the M2 start card). Default 'up'. */
  readonly trigger?: 'down' | 'up';
}

export interface MenuOptions {
  readonly onBack?: () => void;
  /** Item focused first (keyboard): e.g. [Again] on the tally. */
  readonly focus?: string;
  readonly hook?: TestHook | null;
  /** Focus ring always visible (otherwise it appears after the first key press). */
  readonly showFocus?: boolean;
  /** false: pointer only (the in-hunt HUD, where Space reloads). Default true. */
  readonly keyboard?: boolean;
}

export class Menu {
  private readonly items: MenuItem[];
  private readonly opts: MenuOptions;
  private readonly ring: Phaser.GameObjects.Graphics;
  private focusIndex: number;
  private keyboardUsed: boolean;
  private down: { item: MenuItem; pointerId: number; x: number } | null = null;
  private readonly cleanups: (() => void)[] = [];
  private active = true;

  constructor(scene: Phaser.Scene, items: readonly MenuItem[], opts: MenuOptions = {}) {
    this.items = [...items];
    this.opts = opts;
    this.keyboardUsed = opts.showFocus === true;
    this.focusIndex = Math.max(
      0,
      this.items.findIndex((i) => i.id === opts.focus),
    );
    this.ring = scene.add.graphics().setDepth(1000);
    const canvas = scene.game.canvas;
    const design = (): { width: number; height: number } => scene.scale.gameSize;
    const at = (e: PointerEvent): MenuItem | undefined => {
      const p = clientToDesign(canvas, e.clientX, e.clientY, design());
      return this.items.find((i) => this.isEnabled(i) && rectContains(i.rect(), p.x, p.y));
    };
    const onDown = (e: PointerEvent): void => {
      if (!this.active) return;
      const item = at(e);
      if (item === undefined) return;
      e.preventDefault();
      if (item.trigger === 'down') {
        item.press(e.pointerType, e.pointerId);
        return;
      }
      const x = clientToDesign(canvas, e.clientX, e.clientY, design()).x;
      this.down = { item, pointerId: e.pointerId, x };
      if (item.drag) item.drag(x);
    };
    const onMove = (e: PointerEvent): void => {
      const d = this.down;
      if (!this.active || d === null || d.pointerId !== e.pointerId || !d.item.drag) return;
      d.item.drag(clientToDesign(canvas, e.clientX, e.clientY, design()).x);
    };
    const onUp = (e: PointerEvent): void => {
      const d = this.down;
      if (d === null || d.pointerId !== e.pointerId) return;
      this.down = null;
      if (!this.active) return;
      if (d.item.drag) {
        const x = clientToDesign(canvas, e.clientX, e.clientY, design()).x;
        d.item.drop?.(x, Math.abs(x - d.x) < DRAG_TAP_PX);
        return;
      }
      if (at(e) === d.item) d.item.press(e.pointerType, e.pointerId);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (!this.active || opts.keyboard === false) return;
      this.onKey(e);
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
    this.cleanups.push(() => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
    });
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.destroy();
    });
    this.publish();
    this.drawFocus();
  }

  /** Menus under an overlay (e.g. the title under Settings) stop listening meanwhile. */
  setActive(on: boolean): void {
    this.active = on;
    this.down = null;
    this.drawFocus();
  }

  get focusedId(): string | null {
    return this.items[this.focusIndex]?.id ?? null;
  }

  /** Re-publish rects and redraw the ring (after a relayout). */
  refresh(): void {
    this.publish();
    this.drawFocus();
  }

  destroy(): void {
    for (const fn of this.cleanups) fn();
    this.cleanups.length = 0;
    this.active = false;
  }

  private isEnabled(i: MenuItem): boolean {
    return i.enabled === undefined || i.enabled();
  }

  private onKey(e: KeyboardEvent): void {
    const item = this.items[this.focusIndex];
    switch (e.code) {
      case 'ArrowDown':
        this.move(1);
        break;
      case 'ArrowUp':
        this.move(-1);
        break;
      case 'Tab':
        this.move(e.shiftKey ? -1 : 1);
        break;
      case 'ArrowLeft':
      case 'ArrowRight': {
        const dir = e.code === 'ArrowLeft' ? -1 : 1;
        if (item?.adjust && this.isEnabled(item)) item.adjust(dir);
        else this.move(dir);
        break;
      }
      case 'Enter':
      case 'Space':
      case 'NumpadEnter':
        if (item && this.isEnabled(item)) item.press('keyboard', null);
        break;
      case 'Escape':
        if (this.opts.onBack) this.opts.onBack();
        else return;
        break;
      default:
        return;
    }
    e.preventDefault();
    this.keyboardUsed = true;
    this.drawFocus();
  }

  private move(dir: 1 | -1): void {
    const n = this.items.length;
    for (let k = 1; k <= n; k++) {
      const i = (this.focusIndex + dir * k + n * k) % n;
      const item = this.items[i];
      if (item && this.isEnabled(item)) {
        this.focusIndex = i;
        return;
      }
    }
  }

  private drawFocus(): void {
    this.ring.clear();
    const item = this.items[this.focusIndex];
    if (!this.active || !this.keyboardUsed || item === undefined) return;
    const r = item.rect();
    this.ring.lineStyle(6, UI.focus, 1).strokeRoundedRect(r.x - 8, r.y - 8, r.w + 16, r.h + 16, 18);
  }

  private publish(): void {
    const hook = this.opts.hook;
    if (!hook) return;
    for (const i of this.items) hook.rects[i.id] = i.rect();
  }
}

export type ButtonKind = 'primary' | 'secondary' | 'locked' | 'selected';

export function textStyle(
  size: number,
  color = '#F3EAD3',
): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: FONT, fontSize: `${size}px`, fontStyle: '800', color };
}

/** A rounded button with a centred label that shrinks to fit (labels are always one line). */
export function drawButton(
  scene: Phaser.Scene,
  rect: Rect,
  label: string,
  kind: ButtonKind = 'secondary',
  size = 40,
): { readonly g: Phaser.GameObjects.Graphics; readonly text: Phaser.GameObjects.Text } {
  const g = scene.add.graphics();
  const fill =
    kind === 'primary'
      ? UI.gold
      : kind === 'selected'
        ? UI.enamel
        : kind === 'locked'
          ? UI.grey
          : UI.wood;
  g.fillStyle(UI.ink, 1).fillRoundedRect(rect.x - 4, rect.y - 4, rect.w + 8, rect.h + 8, 22);
  g.fillStyle(fill, 1).fillRoundedRect(rect.x, rect.y, rect.w, rect.h, 18);
  const color = kind === 'primary' || kind === 'selected' ? '#1B1410' : '#F3EAD3';
  const text = scene.add
    .text(rect.x + rect.w / 2, rect.y + rect.h / 2, label, textStyle(size, color))
    .setOrigin(0.5);
  fitText(text, rect.w - 24);
  return { g, text };
}

/** Scales a one-line text down until it fits `maxW` design px. */
export function fitText(text: Phaser.GameObjects.Text, maxW: number): void {
  text.setScale(1);
  if (text.width > maxW) text.setScale(maxW / text.width);
}

/** A 0..1 slider: track + knob; returns the redraw function. */
export function drawSlider(
  scene: Phaser.Scene,
  rect: Rect,
): { readonly g: Phaser.GameObjects.Graphics; draw(value: number): void } {
  const g = scene.add.graphics();
  return {
    g,
    draw(value: number) {
      const v = Math.min(1, Math.max(0, value));
      const cy = rect.y + rect.h / 2;
      g.clear();
      g.fillStyle(UI.ink, 0.9).fillRoundedRect(rect.x, cy - 10, rect.w, 20, 10);
      g.fillStyle(UI.gold, 1).fillRoundedRect(rect.x, cy - 10, Math.max(20, rect.w * v), 20, 10);
      g.fillStyle(UI.enamel, 1).fillCircle(rect.x + rect.w * v, cy, 22);
      g.lineStyle(4, UI.ink, 1).strokeCircle(rect.x + rect.w * v, cy, 22);
    },
  };
}

/** Value under design x on a slider rect, snapped to 5 %. */
export function sliderValueAt(rect: Rect, x: number): number {
  const v = (x - rect.x) / Math.max(1, rect.w);
  return Math.round(Math.min(1, Math.max(0, v)) * 20) / 20;
}
