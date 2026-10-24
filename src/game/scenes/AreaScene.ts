// v1.4 B (D-039): the area picker, opened from the title's [Area] button. One card per Classic
// area: the home farm (Karoo) and the area packs (Namibië). A locked card says how to unlock it
// (reach Die Verste in any area); tapping an open card makes it the Classic area (saved through
// the SaveStore → src/meta/storage.ts) and closes. Esc or [Back] closes it unchanged.
import { designSize } from '../layout';
import { fitCamera } from '../view/fitCamera';
import * as Phaser from 'phaser';
import { fill, t, tOr } from '../../i18n/i18n';
import type { GameContext } from '../GameContext';
import type { Rect } from '../ui/hudLayout';
import { drawButton, fitText, Menu, textStyle, UI, type MenuItem } from '../ui/menu';
import { areaCards } from '../../meta/areas';
import { bonusKeys } from '../../meta/bonusMaps';
import type { OverlayData } from './SettingsScene';

export class AreaScene extends Phaser.Scene {
  private readonly ctx: GameContext;

  constructor(ctx: GameContext) {
    super({ key: 'Area' });
    this.ctx = ctx;
  }

  create(data: OverlayData): void {
    const { width, height } = designSize();
    fitCamera(this.cameras.main);
    const safe = this.ctx.safeArea();
    const panelW = Math.min(1500, width - safe.left - safe.right - 60);
    const panelH = Math.min(860, height - safe.top - safe.bottom - 40);
    const px = (width - panelW) / 2;
    const py = (height - panelH) / 2;
    this.add.rectangle(0, 0, width, height, UI.ink, 0.7).setOrigin(0);
    const g = this.add.graphics();
    g.fillStyle(UI.wood, 1).fillRoundedRect(px - 12, py - 12, panelW + 24, panelH + 24, 26);
    g.fillStyle(UI.slate, 1).fillRoundedRect(px, py, panelW, panelH, 18);
    this.add
      .text(px + panelW / 2, py + 60, t('area.title'), textStyle(60, '#FFD25A'))
      .setOrigin(0.5);

    const cards = areaCards(
      this.ctx.content,
      this.ctx.save.data,
      this.ctx.playableBiomes,
      this.ctx.notaboek,
    );
    const chosen = this.ctx.classicArea();
    const gap = 40;
    const cardW = (panelW - 120 - gap * (cards.length - 1)) / Math.max(1, cards.length);
    const cardTop = py + 140;
    const cardH = panelH - 140 - 170;
    const items: MenuItem[] = [];
    const hookCards: { id: string; unlocked: boolean; chosen: boolean }[] = [];
    cards.forEach((c, i) => {
      const r: Rect = { x: px + 60 + i * (cardW + gap), y: cardTop, w: cardW, h: cardH };
      const isChosen = c.biome === chosen;
      const kind = !c.unlocked ? 'locked' : isChosen ? 'selected' : 'secondary';
      drawButton(this, r, '', kind, 30);
      const dark = isChosen ? '#1B1410' : '#F3EAD3';
      const slug = c.biome.replace(/-/g, '_');
      const name = this.add
        .text(r.x + r.w / 2, r.y + 60, tOr(c.nameKey, c.biome), textStyle(44, dark))
        .setOrigin(0.5);
      fitText(name, r.w - 48);
      this.add
        .text(r.x + r.w / 2, r.y + 120, tOr(`area.desc.${slug}`, ''), {
          ...textStyle(28, dark),
          fontStyle: '600',
          align: 'center',
          wordWrap: { width: r.w - 64 },
          lineSpacing: 6,
        })
        .setOrigin(0.5, 0);
      let status: string;
      if (!c.unlocked) {
        const bonus =
          c.unlockBonus === null ? '' : tOr(bonusKeys(c.unlockBonus).name, c.unlockBonus);
        status = `${t('area.locked')} — ${fill(t('area.how'), { bonus })}`;
      } else status = t(isChosen ? 'area.chosen' : 'area.pick');
      const line = this.add
        .text(r.x + r.w / 2, r.y + r.h - 40, status, {
          ...textStyle(28, c.unlocked ? dark : '#D9CBB0'),
          align: 'center',
          wordWrap: { width: r.w - 48 },
        })
        .setOrigin(0.5, 1);
      fitText(line, r.w - 48);
      hookCards.push({ id: c.biome, unlocked: c.unlocked, chosen: isChosen });
      // e2e: a locked card has its rect too, and a tap on it must change nothing.
      if (!c.unlocked) {
        if (this.ctx.hook) this.ctx.hook.rects[`area_${c.biome}_locked`] = r;
        return;
      }
      items.push({
        id: `area_${c.biome}`,
        rect: () => r,
        press: () => {
          if (c.biome !== chosen) this.ctx.setClassicArea(c.biome);
          data.close();
        },
      });
    });

    const back: Rect = { x: px + panelW / 2 - 200, y: py + panelH - 130, w: 400, h: 96 };
    drawButton(this, back, t('ui.back'), 'primary', 44);
    items.push({
      id: 'area.back',
      rect: () => back,
      press: () => {
        data.close();
      },
    });
    new Menu(this, items, {
      onBack: () => {
        data.close();
      },
      focus: `area_${chosen}`,
      hook: this.ctx.hook,
    });
    if (this.ctx.hook) {
      this.ctx.hook.menu = 'area';
      this.ctx.hook.areas = hookCards;
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.ctx.hook?.menu === 'area') this.ctx.hook.menu = null;
    });
  }
}
