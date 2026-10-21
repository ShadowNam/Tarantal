// Privacy (M9, Tech §17, Poki "in-game privacy policy"): what the game stores on this device,
// what it sends (nothing of its own; on a games site the site's own service runs ads and
// statistics), no personal data, and [Clear my data] (tap twice) which removes every key the
// game stored and restarts as a new player. Opened from Settings; Esc or [Back] closes it.
import { designSize } from '../layout';
import { fitCamera } from '../view/fitCamera';
import * as Phaser from 'phaser';
import { t, type I18nKey } from '../../i18n/i18n';
import type { GameContext } from '../GameContext';
import type { Rect } from '../ui/hudLayout';
import { drawButton, Menu, textStyle, UI, type MenuItem } from '../ui/menu';
import type { OverlayData } from './SettingsScene';

export interface PrivacyData extends OverlayData {
  /** After [Clear my data]: restart the page as a new player (main.ts reloads). */
  readonly restart: () => void;
}

export class PrivacyScene extends Phaser.Scene {
  private readonly ctx: GameContext;

  constructor(ctx: GameContext) {
    super({ key: 'Privacy' });
    this.ctx = ctx;
  }

  create(data: PrivacyData): void {
    const { width, height } = designSize();
    fitCamera(this.cameras.main);
    const safe = this.ctx.safeArea();
    const panelW = Math.min(1500, width - safe.left - safe.right - 60);
    const panelH = Math.min(940, height - safe.top - safe.bottom - 40);
    const px = (width - panelW) / 2;
    const py = (height - panelH) / 2;
    this.add.rectangle(0, 0, width, height, UI.ink, 0.7).setOrigin(0);
    const g = this.add.graphics();
    g.fillStyle(UI.wood, 1).fillRoundedRect(px - 12, py - 12, panelW + 24, panelH + 24, 26);
    g.fillStyle(UI.slate, 1).fillRoundedRect(px, py, panelW, panelH, 18);
    this.add
      .text(px + panelW / 2, py + 60, t('privacy.title'), textStyle(60, '#FFD25A'))
      .setOrigin(0.5);

    const portal = this.ctx.platform.id !== 'web';
    const paragraphs: [I18nKey, I18nKey][] = [
      ['privacy.stored_title', 'privacy.stored'],
      ['privacy.sent_title', portal ? 'privacy.sent_portal' : 'privacy.sent_web'],
      ['privacy.personal_title', 'privacy.personal'],
    ];
    let y = py + 130;
    const wrapW = panelW - 120;
    for (const [head, body] of paragraphs) {
      this.add.text(px + 60, y, t(head), textStyle(34, '#FFD25A'));
      y += 48;
      const p = this.add.text(px + 60, y, t(body), {
        ...textStyle(28),
        fontStyle: '600',
        wordWrap: { width: wrapW },
        lineSpacing: 6,
      });
      y += p.height + 28;
    }

    const by = py + panelH - 120;
    const clear: Rect = { x: px + 40, y: by, w: Math.min(560, panelW / 2 - 60), h: 96 };
    const back: Rect = { x: px + panelW - 40 - 400, y: by, w: 400, h: 96 };
    let armed = false;
    let clearBtn = drawButton(this, clear, t('privacy.clear'), 'secondary', 34);
    drawButton(this, back, t('ui.back'), 'primary', 44);
    const items: MenuItem[] = [
      {
        id: 'privacy.clear',
        rect: () => clear,
        press: () => {
          if (!armed) {
            // First tap arms it: the label asks for a second tap (nothing is lost by accident).
            armed = true;
            clearBtn.g.destroy();
            clearBtn.text.destroy();
            clearBtn = drawButton(this, clear, t('privacy.clear_confirm'), 'primary', 30);
            return;
          }
          this.ctx.save.clear();
          this.ctx.platform.analytics('privacy_clear');
          data.restart();
        },
      },
      {
        id: 'privacy.back',
        rect: () => back,
        press: () => {
          data.close();
        },
      },
    ];
    new Menu(this, items, {
      onBack: () => {
        data.close();
      },
      focus: 'privacy.back',
      hook: this.ctx.hook,
    });
    if (this.ctx.hook) this.ctx.hook.menu = 'privacy';
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.ctx.hook?.menu === 'privacy') this.ctx.hook.menu = 'settings';
    });
  }
}
