// Season Run additions to the hunt HUD (GDD §13): the quota bar under the score, the equipped
// charms (they pulse when they fire), the consumable and rental buttons beside the gadget, the
// Stormvoël rule's darkness (lit by lightning, ≤ 2 flashes a second by content; "reduce flashes"
// keeps the lit screen dim) and a cool tint while Boeretroos-Fles slows the birds.
//
// Cost rules (perf budget, Tech §15): outside a Season Run nothing here exists and render()
// returns at once. In a run, objects are built once, redrawn only when what they show changes
// (no per-frame clear/setText/allocation), and the full-screen overlays exist only for the rule
// or charm that needs them and are invisible (not rendered) while unused.
import * as Phaser from 'phaser';
import { fill, t, tOr } from '../../i18n/i18n';
import type { SimEvent } from '../../sim/events';
import type { SeasonView, SimState } from '../../sim/types';
import type { GameContext } from '../GameContext';
import { charmName, RARITY_COLOR } from './charmCards';
import { formatScore } from './format';
import { rectContains, type HudLayout, type Rect } from './hudLayout';
import { fitText, textStyle, UI } from './menu';
import { FlashGate } from '../view/flashLimit';

/** Darkness of the Stormvoël rule, between flashes and during one ("reduce flashes"). */
const DARK_ALPHA = 0.86;
const LIT_ALPHA = 0;
const LIT_ALPHA_REDUCED = 0.45;
const SLOW_TINT_ALPHA = 0.14;
/** A lone charm chip stays chip-sized. */
const CHIP_MAX_W = 200;
/** Quota bar resolution: redraw when the filled share moves by 1 %. */
const BAR_STEPS = 100;

interface Parts {
  readonly g: Phaser.GameObjects.Graphics;
  readonly quotaText: Phaser.GameObjects.Text;
  readonly itemTexts: Phaser.GameObjects.Text[];
  readonly keyTexts: Phaser.GameObjects.Text[];
}

function sameList<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export class SeasonHud {
  private quota: number | null = null;
  private layout: HudLayout | null = null;
  private size = { width: 0, height: 0 };
  private parts: Parts | null = null;
  private dark: Phaser.GameObjects.Rectangle | null = null;
  private tint: Phaser.GameObjects.Rectangle | null = null;
  private readonly chips: Phaser.GameObjects.Container[] = [];
  private mouse = true;
  // What is drawn now (dirty checks).
  private dirty = true;
  private barStep = -1;
  private met = false;
  private items: (string | null)[] = [];
  private chipIds: readonly string[] = [];
  private chipMults: number[] = [];
  private chipsDirty = true;
  private darkAlpha = -1;
  private tintAlpha = -1;

  private readonly darkFlash: FlashGate;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ctx: GameContext,
  ) {
    this.darkFlash = new FlashGate(ctx.flashes);
  }

  /** Null outside a Season Run: nothing is built or drawn. */
  setSeason(info: { readonly quota: number } | null): void {
    this.quota = info?.quota ?? null;
    if (this.quota !== null && this.parts === null) this.parts = this.build();
    this.markDirty();
  }

  setMouse(mouse: boolean): void {
    if (mouse === this.mouse) return;
    this.mouse = mouse;
    this.dirty = true;
  }

  relayout(l: HudLayout, width: number, height: number): void {
    this.layout = l;
    this.size = { width, height };
    this.dark?.setSize(width, height);
    this.tint?.setSize(width, height);
    this.markDirty();
  }

  /** Consumable/rental slot under (x, y), if it holds something. */
  itemAt(state: SimState | null, x: number, y: number): number | null {
    const season = state?.season ?? null;
    const l = this.layout;
    if (season === null || l === null || this.quota === null) return null;
    for (let i = 0; i < l.items.length; i++) {
      const r = l.items[i];
      if (r !== undefined && rectContains(r, x, y) && itemOf(season, i) !== null) return i;
    }
    return null;
  }

  render(s: SimState, events: readonly SimEvent[]): void {
    const season = s.season;
    const l = this.layout;
    const parts = this.parts;
    if (season === null || l === null || parts === null || this.quota === null) return;
    const quota = this.quota;

    this.overlays(season);

    const step =
      quota <= 0
        ? BAR_STEPS
        : Math.max(0, Math.min(BAR_STEPS, Math.floor((s.score / quota) * BAR_STEPS)));
    const met = s.score >= quota;
    let itemsChanged = this.items.length !== l.items.length;
    for (let i = 0; i < l.items.length && !itemsChanged; i++) {
      if (this.items[i] !== itemOf(season, i)) itemsChanged = true;
    }
    if (this.dirty || step !== this.barStep || met !== this.met || itemsChanged) {
      this.dirty = false;
      this.barStep = step;
      this.met = met;
      this.items = l.items.map((_, i) => itemOf(season, i));
      this.drawPanel(parts, l, quota);
      this.publish(quota);
    }

    if (
      this.chipsDirty ||
      !sameList(this.chipIds, season.charms) ||
      !sameList(this.chipMults, season.charmMults)
    ) {
      this.chipsDirty = false;
      this.chipIds = season.charms;
      this.chipMults = [...season.charmMults];
      this.drawChips(l.charms);
      this.publish(quota);
    }
    for (const e of events) {
      if (e.type === 'charmTriggered') this.pulse(e.slot);
    }
  }

  private markDirty(): void {
    this.dirty = true;
    this.chipsDirty = true;
  }

  private build(): Parts {
    const scene = this.scene;
    const itemTexts: Phaser.GameObjects.Text[] = [];
    const keyTexts: Phaser.GameObjects.Text[] = [];
    for (let i = 0; i < 3; i++) {
      itemTexts.push(
        scene.add.text(0, 0, '', textStyle(20, '#1B1410')).setOrigin(0.5).setVisible(false),
      );
      keyTexts.push(
        scene.add.text(0, 0, '', textStyle(20, '#1B1410')).setOrigin(0.5).setVisible(false),
      );
    }
    return {
      g: scene.add.graphics(),
      quotaText: scene.add
        .text(0, 0, '', { ...textStyle(26), stroke: '#1B1410', strokeThickness: 4 })
        .setOrigin(1, 0.5),
      itemTexts,
      keyTexts,
    };
  }

  /** Darkness and slow-mo tint: created on first need, hidden (not rendered) at alpha 0. */
  private overlays(season: SeasonView): void {
    const litAlpha = this.ctx.prefs.reduceFlashes ? LIT_ALPHA_REDUCED : LIT_ALPHA;
    // M10: a strike lights the dark only within the shared large-flash budget.
    const strike = this.darkFlash.lit(season.dark && season.lightning, performance.now());
    const dark = season.dark ? (strike ? litAlpha : DARK_ALPHA) : 0;
    if (dark !== this.darkAlpha) {
      this.darkAlpha = dark;
      if (dark > 0 && this.dark === null) this.dark = this.overlay(0x05070c, -10);
      this.dark?.setAlpha(dark).setVisible(dark > 0);
    }
    const tint = season.slowMo ? SLOW_TINT_ALPHA : 0;
    if (tint !== this.tintAlpha) {
      this.tintAlpha = tint;
      if (tint > 0 && this.tint === null) this.tint = this.overlay(0x7fa8ff, -9);
      this.tint?.setAlpha(tint).setVisible(tint > 0);
    }
  }

  private overlay(color: number, depth: number): Phaser.GameObjects.Rectangle {
    return this.scene.add
      .rectangle(0, 0, this.size.width, this.size.height, color, 1)
      .setOrigin(0)
      .setDepth(depth);
  }

  private drawPanel(parts: Parts, l: HudLayout, quota: number): void {
    const g = parts.g;
    g.clear();
    const q = l.quota;
    const frac = this.barStep / BAR_STEPS;
    g.fillStyle(UI.ink, 0.85).fillRoundedRect(q.x, q.y + 26, q.w, 12, 6);
    g.fillStyle(this.met ? 0x7fd36a : UI.gold, 1).fillRoundedRect(
      q.x,
      q.y + 26,
      Math.max(12, q.w * frac),
      12,
      6,
    );
    parts.quotaText
      .setPosition(q.x + q.w, q.y + 12)
      .setText(fill(t('hud.quota'), { quota: formatScore(quota) }))
      .setColor(this.met ? '#7FD36A' : '#F3EAD3');
    l.items.forEach((r, i) => {
      this.drawItem(parts, r, i, this.items[i] ?? null);
    });
  }

  private drawItem(parts: Parts, r: Rect, slot: number, item: string | null): void {
    const label = parts.itemTexts[slot];
    const keyText = parts.keyTexts[slot];
    if (label === undefined || keyText === undefined) return;
    label.setVisible(item !== null);
    keyText.setVisible(item !== null && this.mouse);
    if (item === null) return;
    const g = parts.g;
    g.fillStyle(UI.ink, 0.9).fillRoundedRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8, 16);
    g.fillStyle(slot === 2 ? 0xb9783f : 0xe0c27a, 1).fillRoundedRect(r.x, r.y, r.w, r.h, 12);
    label.setPosition(r.x + r.w / 2, r.y + r.h / 2 + 8).setText(tOr(`item.${item}`, item));
    fitText(label, r.w - 8);
    if (this.mouse) {
      g.fillStyle(UI.enamel, 1).fillRoundedRect(r.x + 6, r.y + 6, 28, 26, 6);
      keyText.setPosition(r.x + 20, r.y + 19).setText(String(slot + 1));
    }
  }

  private drawChips(area: Rect): void {
    for (const c of this.chips) c.destroy();
    this.chips.length = 0;
    const ids = this.chipIds;
    if (ids.length === 0 || area.w <= 0) return;
    const gap = 8;
    const w = Math.min(CHIP_MAX_W, (area.w - (ids.length - 1) * gap) / ids.length);
    const x0 = area.x + (area.w - (ids.length * w + (ids.length - 1) * gap)) / 2;
    ids.forEach((id, i) => {
      const box = this.scene.add.container(x0 + i * (w + gap) + w / 2, area.y + area.h / 2);
      const c = this.ctx.content.charms.charms.find((ch) => ch.id === id);
      const g = this.scene.add.graphics();
      g.fillStyle(UI.ink, 0.9).fillRoundedRect(-w / 2 - 3, -area.h / 2 - 3, w + 6, area.h + 6, 12);
      g.fillStyle(RARITY_COLOR[c?.rarity ?? 'common'] ?? UI.enamel, 1).fillRoundedRect(
        -w / 2,
        -area.h / 2,
        w,
        area.h,
        10,
      );
      const mult = this.chipMults[i] ?? 0;
      const name = this.scene.add
        .text(
          0,
          0,
          mult === 0 ? charmName(id) : `${charmName(id)} +${mult.toFixed(1)}`,
          textStyle(22, '#1B1410'),
        )
        .setOrigin(0.5);
      fitText(name, w - 10);
      box.add([g, name]);
      this.chips.push(box);
    });
  }

  /** Test hook: what the run HUD shows (updated only when it changes). */
  private publish(quota: number): void {
    const hook = this.ctx.hook;
    if (!hook) return;
    hook.seasonHud = {
      quota,
      chips: this.chips.length,
      items: this.items.filter((x) => x !== null).length,
    };
  }

  private pulse(slot: number): void {
    const chip = this.chips[slot];
    if (chip === undefined) return;
    this.scene.tweens.killTweensOf(chip);
    chip.setScale(1);
    this.scene.tweens.add({ targets: chip, scale: 1.18, yoyo: true, duration: 120 });
  }
}

/** The consumable in a slot, or the rental in the slot after them. */
function itemOf(season: SeasonView, slot: number): string | null {
  if (slot < season.consumables.length) return season.consumables[slot] ?? null;
  return slot === season.consumables.length ? season.rental : null;
}
