// Charm cards and the draggable charm row (GDD §5.3, §13.5): the Padstal, the pause screen and
// the run screens draw charms the same way. Order matters (Balatro-style), so the row lets the
// player drag a card to a new slot; a tap selects it; ←/→ on the keyboard moves the focused card.
import * as Phaser from 'phaser';
import type { ContentBundle } from '../../content/schemas';
import { tOr } from '../../i18n/i18n';
import { moveOrder, slotAt, slotRects } from './charmSlots';
import type { Rect } from './hudLayout';
import { fitText, textStyle, UI, type MenuItem } from './menu';

/** Card colour by rarity. */
export const RARITY_COLOR: Readonly<Record<string, number>> = {
  common: 0xd9d2bd,
  uncommon: 0x7fb069,
  rare: 0x5b8fd6,
  legendary: 0xd8a73a,
};

export const charmName = (id: string): string => tOr(`charm.${id}`, id);
export const charmDesc = (id: string): string => tOr(`charm.${id}.desc`, '');

/** Draws one card in a container whose origin is the card's top-left corner. */
export function drawCharmCard(
  scene: Phaser.Scene,
  content: ContentBundle,
  rect: Rect,
  id: string,
  opts: { readonly selected?: boolean; readonly detail?: boolean; readonly mult?: number } = {},
): Phaser.GameObjects.Container {
  const c = content.charms.charms.find((x) => x.id === id);
  const color = RARITY_COLOR[c?.rarity ?? 'common'] ?? UI.enamel;
  const box = scene.add.container(rect.x, rect.y);
  const g = scene.add.graphics();
  g.fillStyle(UI.ink, 1).fillRoundedRect(-4, -4, rect.w + 8, rect.h + 8, 18);
  g.fillStyle(color, 1).fillRoundedRect(0, 0, rect.w, rect.h, 14);
  if (opts.selected === true)
    g.lineStyle(6, UI.focus, 1).strokeRoundedRect(-8, -8, rect.w + 16, rect.h + 16, 20);
  box.add(g);
  const name = scene.add
    .text(
      rect.w / 2,
      opts.detail === true ? 34 : rect.h / 2,
      charmName(id),
      textStyle(28, '#1B1410'),
    )
    .setOrigin(0.5);
  fitText(name, rect.w - 20);
  box.add(name);
  if (opts.detail === true) {
    const desc = scene.add
      .text(rect.w / 2, 70, charmDesc(id), {
        ...textStyle(22, '#1B1410'),
        fontStyle: '600',
        align: 'center',
        wordWrap: { width: rect.w - 28 },
      })
      .setOrigin(0.5, 0);
    box.add(desc);
  }
  if (opts.mult !== undefined && opts.mult !== 0) {
    const m = scene.add
      .text(rect.w - 8, 4, `+${opts.mult.toFixed(1)}`, textStyle(20, '#C8302A'))
      .setOrigin(1, 0);
    box.add(m);
  }
  return box;
}

export interface CharmRowOptions {
  readonly content: ContentBundle;
  readonly charms: readonly string[];
  readonly area: Rect;
  readonly cardW: number;
  readonly gap?: number;
  readonly selected?: number | null;
  readonly detail?: boolean;
  readonly mults?: readonly number[];
  /** Menu ids are `${idPrefix}.${slot}`. */
  readonly idPrefix: string;
  readonly reorder: (order: readonly number[]) => void;
  readonly select?: (slot: number) => void;
}

/** Draws the row and returns its Menu items (drag to reorder, tap to select, ←/→ to move). */
export function charmRow(scene: Phaser.Scene, o: CharmRowOptions): MenuItem[] {
  const rects = slotRects(o.area, o.charms.length, o.cardW, o.gap ?? 16);
  return o.charms.map((id, i) => {
    const rect = rects[i] ?? o.area;
    const card = drawCharmCard(scene, o.content, rect, id, {
      selected: o.selected === i,
      detail: o.detail ?? false,
      ...(o.mults?.[i] === undefined ? {} : { mult: o.mults[i] }),
    });
    let grabX: number | null = null;
    return {
      id: `${o.idPrefix}.${i}`,
      rect: () => rect,
      press: () => {
        o.select?.(i);
      },
      adjust: (dir: -1 | 1) => {
        const to = i + dir;
        if (to >= 0 && to < o.charms.length) o.reorder(moveOrder(o.charms.length, i, to));
      },
      drag: (x: number) => {
        grabX ??= x;
        card.setDepth(10).setX(rect.x + x - grabX);
      },
      drop: (x: number, tap: boolean) => {
        const start = grabX ?? x;
        grabX = null;
        card.setX(rect.x);
        if (tap) {
          o.select?.(i);
          return;
        }
        const to = slotAt(rects, rect.x + rect.w / 2 + x - start);
        if (to !== i) o.reorder(moveOrder(o.charms.length, i, to));
      },
    };
  });
}
