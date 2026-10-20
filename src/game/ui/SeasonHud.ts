// Season Run additions to the hunt HUD (GDD §13): the quota bar under the score, the equipped
// charms (they pulse when they fire), the consumable and rental buttons beside the gadget, the
// Stormvoël rule's darkness (lit by lightning, ≤ 2 flashes a second by content; "reduce flashes"
// keeps the lit screen dim) and a cool tint while Boeretroos-Fles slows the birds.
import * as Phaser from 'phaser';
import { fill, t, tOr } from '../../i18n/i18n';
import type { SimEvent } from '../../sim/events';
import type { SimState } from '../../sim/types';
import type { GameContext } from '../GameContext';
import { charmName, RARITY_COLOR } from './charmCards';
import { formatScore } from './format';
import { rectContains, type HudLayout, type Rect } from './hudLayout';
import { fitText, textStyle, UI } from './menu';

/** Darkness of the Stormvoël rule, between flashes and during one ("reduce flashes"). */
const DARK_ALPHA = 0.86;
const LIT_ALPHA = 0;
const LIT_ALPHA_REDUCED = 0.45;

export class SeasonHud {
  private quota: number | null = null;
  private layout: HudLayout | null = null;
  private readonly dark: Phaser.GameObjects.Rectangle;
  private readonly tint: Phaser.GameObjects.Rectangle;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly quotaText: Phaser.GameObjects.Text;
  private readonly chips: Phaser.GameObjects.Container[] = [];
  private readonly itemTexts: Phaser.GameObjects.Text[] = [];
  private readonly keyTexts: Phaser.GameObjects.Text[] = [];
  private drawn = '';
  private chipKey = '';
  private mouse = true;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ctx: GameContext,
  ) {
    this.dark = scene.add.rectangle(0, 0, 10, 10, 0x05070c, 0).setOrigin(0).setDepth(-10);
    this.tint = scene.add.rectangle(0, 0, 10, 10, 0x7fa8ff, 0).setOrigin(0).setDepth(-9);
    this.g = scene.add.graphics();
    this.quotaText = scene.add
      .text(0, 0, '', { ...textStyle(26), stroke: '#1B1410', strokeThickness: 4 })
      .setOrigin(1, 0.5);
    for (let i = 0; i < 3; i++) {
      this.itemTexts.push(scene.add.text(0, 0, '', textStyle(20, '#1B1410')).setOrigin(0.5));
      this.keyTexts.push(scene.add.text(0, 0, '', textStyle(20, '#1B1410')).setOrigin(0.5));
    }
  }

  /** Null outside a Season Run: everything hides. */
  setSeason(info: { readonly quota: number } | null): void {
    this.quota = info?.quota ?? null;
    this.drawn = '';
    this.chipKey = '';
  }

  setMouse(mouse: boolean): void {
    this.mouse = mouse;
    this.drawn = '';
  }

  relayout(l: HudLayout, width: number, height: number): void {
    this.layout = l;
    this.dark.setSize(width, height);
    this.tint.setSize(width, height);
    this.drawn = '';
    this.chipKey = '';
  }

  /** Consumable/rental slot under (x, y), if it holds something. */
  itemAt(state: SimState | null, x: number, y: number): number | null {
    const season = state?.season ?? null;
    const l = this.layout;
    if (season === null || l === null) return null;
    for (let i = 0; i < l.items.length; i++) {
      const r = l.items[i];
      if (r !== undefined && rectContains(r, x, y) && this.itemOf(state, i) !== null) return i;
    }
    return null;
  }

  private itemOf(state: SimState | null, slot: number): string | null {
    const season = state?.season ?? null;
    if (season === null) return null;
    if (slot < season.consumables.length) return season.consumables[slot] ?? null;
    return slot === season.consumables.length ? season.rental : null;
  }

  render(s: SimState, events: readonly SimEvent[]): void {
    const season = s.season;
    const l = this.layout;
    const on = season !== null && l !== null && this.quota !== null;
    this.quotaText.setVisible(on);
    if (!on) {
      this.g.clear();
      this.dark.setAlpha(0);
      this.tint.setAlpha(0);
      for (const c of this.chips) c.setVisible(false);
      for (const tx of [...this.itemTexts, ...this.keyTexts]) tx.setVisible(false);
      return;
    }
    const quota = this.quota ?? 0;
    const lit = season.lightning;
    const litAlpha = this.ctx.prefs.reduceFlashes ? LIT_ALPHA_REDUCED : LIT_ALPHA;
    this.dark.setAlpha(season.dark ? (lit ? litAlpha : DARK_ALPHA) : 0);
    this.tint.setAlpha(season.slowMo ? 0.14 : 0);

    const met = s.score >= quota;
    const key = `${Math.floor((s.score / Math.max(1, quota)) * 100)}:${met}:${season.consumables.join()}:${season.rental}:${this.mouse}`;
    if (key !== this.drawn) {
      this.drawn = key;
      this.g.clear();
      const q = l.quota;
      const frac = quota <= 0 ? 1 : Math.min(1, Math.max(0, s.score / quota));
      this.g.fillStyle(UI.ink, 0.85).fillRoundedRect(q.x, q.y + 26, q.w, 12, 6);
      this.g
        .fillStyle(met ? 0x7fd36a : UI.gold, 1)
        .fillRoundedRect(q.x, q.y + 26, Math.max(12, q.w * frac), 12, 6);
      this.quotaText
        .setPosition(q.x + q.w, q.y + 12)
        .setText(fill(t('hud.quota'), { quota: formatScore(quota) }))
        .setColor(met ? '#7FD36A' : '#F3EAD3');
      l.items.forEach((r, i) => {
        this.drawItem(r, i, this.itemOf(s, i));
      });
    }
    this.drawChips(season.charms, season.charmMults, l.charms);
    for (const e of events) {
      if (e.type === 'charmTriggered') this.pulse(e.slot);
    }
  }

  private drawItem(r: Rect, slot: number, item: string | null): void {
    const label = this.itemTexts[slot];
    const keyText = this.keyTexts[slot];
    if (label === undefined || keyText === undefined) return;
    label.setVisible(item !== null);
    keyText.setVisible(item !== null && this.mouse);
    if (item === null) return;
    const weapon = slot === 2;
    this.g.fillStyle(UI.ink, 0.9).fillRoundedRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8, 16);
    this.g.fillStyle(weapon ? 0xb9783f : 0xe0c27a, 1).fillRoundedRect(r.x, r.y, r.w, r.h, 12);
    label.setPosition(r.x + r.w / 2, r.y + r.h / 2 + 8).setText(tOr(`item.${item}`, item));
    label.setWordWrapWidth(r.w - 8);
    fitText(label, r.w - 8);
    if (this.mouse) {
      this.g.fillStyle(UI.enamel, 1).fillRoundedRect(r.x + 6, r.y + 6, 28, 26, 6);
      keyText.setPosition(r.x + 20, r.y + 19).setText(String(slot + 1));
    }
  }

  private drawChips(ids: readonly string[], mults: readonly number[], area: Rect): void {
    const key = `${ids.join()}|${mults.map((m) => m.toFixed(1)).join()}|${area.x},${area.w}`;
    if (key === this.chipKey) return;
    this.chipKey = key;
    for (const c of this.chips) c.destroy();
    this.chips.length = 0;
    if (ids.length === 0 || area.w <= 0) return;
    const gap = 8;
    const w = (area.w - (ids.length - 1) * gap) / ids.length;
    ids.forEach((id, i) => {
      const x = area.x + i * (w + gap);
      const box = this.scene.add.container(x + w / 2, area.y + area.h / 2);
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
      const mult = mults[i] ?? 0;
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

  private pulse(slot: number): void {
    const chip = this.chips[slot];
    if (chip === undefined) return;
    this.scene.tweens.killTweensOf(chip);
    chip.setScale(1);
    this.scene.tweens.add({ targets: chip, scale: 1.18, yoyo: true, duration: 120 });
  }
}
