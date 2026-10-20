// Pause (GDD §18.3 "pause anywhere"): Esc/P, the HUD pause button, or the tab going hidden. The
// hunt clock stops (ctx.menuPaused) and audio mutes. Resume, Settings or Quit to the title.
import * as Phaser from 'phaser';
import { t } from '../../i18n/i18n';
import type { GameContext } from '../GameContext';
import type { Rect } from '../ui/hudLayout';
import { drawButton, Menu, textStyle, UI, type MenuItem } from '../ui/menu';

export interface PauseData {
  readonly resume: () => void;
  readonly quit: () => void;
}

export class PauseScene extends Phaser.Scene {
  private readonly ctx: GameContext;

  constructor(ctx: GameContext) {
    super({ key: 'Pause' });
    this.ctx = ctx;
  }

  create(data: PauseData): void {
    const { width, height } = this.scale.gameSize;
    this.cameras.main.setSize(width, height);
    this.add.rectangle(0, 0, width, height, UI.ink, 0.65).setOrigin(0);
    this.add
      .text(width / 2, height / 2 - 260, t('pause.title'), {
        ...textStyle(96, '#FFD25A'),
        stroke: '#1B1410',
        strokeThickness: 12,
      })
      .setOrigin(0.5);
    const w = 560;
    const rect = (i: number): Rect => ({
      x: width / 2 - w / 2,
      y: height / 2 - 130 + i * 130,
      w,
      h: 104,
    });
    const resume = rect(0);
    const settings = rect(1);
    const quit = rect(2);
    drawButton(this, resume, t('pause.resume'), 'primary', 48);
    drawButton(this, settings, t('title.settings'), 'secondary', 44);
    drawButton(this, quit, t('pause.quit'), 'secondary', 44);
    let menu: Menu | null = null;
    const items: MenuItem[] = [
      {
        id: 'pause.resume',
        rect: () => resume,
        press: () => {
          data.resume();
        },
      },
      {
        id: 'pause.settings',
        rect: () => settings,
        press: () => {
          menu?.setActive(false);
          this.scene.launch('Settings', {
            close: () => {
              this.scene.stop('Settings');
              // Rebuild in the (possibly new) language, Settings still focused.
              this.scene.restart(data);
            },
          });
          this.scene.bringToTop('Settings');
        },
      },
      {
        id: 'pause.quit',
        rect: () => quit,
        press: () => {
          data.quit();
        },
      },
    ];
    menu = new Menu(this, items, {
      onBack: () => {
        data.resume();
      },
      focus: 'pause.resume',
      hook: this.ctx.hook,
    });
    if (this.ctx.hook) this.ctx.hook.menu = 'pause';
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.ctx.hook?.menu === 'pause') this.ctx.hook.menu = null;
    });
  }
}
