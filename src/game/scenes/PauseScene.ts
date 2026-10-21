// Pause (GDD §18.3 "pause anywhere"): Esc/P, the HUD pause button, or the tab going hidden. The
// hunt clock stops (ctx.menuPaused) and audio mutes. Resume, Settings or Quit to the title.
import { designSize } from '../layout';
import { fitCamera } from '../view/fitCamera';
import * as Phaser from 'phaser';
import { t } from '../../i18n/i18n';
import type { GameContext } from '../GameContext';
import type { Rect } from '../ui/hudLayout';
import { charmRow } from '../ui/charmCards';
import { drawButton, Menu, textStyle, UI, type MenuItem } from '../ui/menu';

export interface PauseData {
  readonly resume: () => void;
  readonly quit: () => void;
  /** Season Run: the equipped charms, reorderable here (GDD §5.3); the hunt applies the new
   *  order through a recorded charmOrder command. */
  readonly charms?: {
    readonly ids: readonly string[];
    readonly reorder: (order: readonly number[], ids: readonly string[]) => void;
  };
}

export class PauseScene extends Phaser.Scene {
  private readonly ctx: GameContext;

  constructor(ctx: GameContext) {
    super({ key: 'Pause' });
    this.ctx = ctx;
  }

  create(data: PauseData): void {
    const { width, height } = designSize();
    fitCamera(this.cameras.main);
    this.add.rectangle(0, 0, width, height, UI.ink, 0.65).setOrigin(0);
    this.add
      .text(width / 2, height / 2 - 260, t('pause.title'), {
        ...textStyle(96, '#FFD25A'),
        stroke: '#1B1410',
        strokeThickness: 12,
      })
      .setOrigin(0.5);
    const w = 560;
    // With charms to reorder, the buttons move up to make room for the row.
    const shift = data.charms === undefined ? 0 : -70;
    const rect = (i: number): Rect => ({
      x: width / 2 - w / 2,
      y: height / 2 - 130 + shift + i * 130,
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
    const charms = data.charms;
    if (charms !== undefined) {
      const top = quit.y + quit.h + 40;
      this.add
        .text(width / 2, top, t('pause.charms'), {
          ...textStyle(30),
          stroke: '#1B1410',
          strokeThickness: 5,
        })
        .setOrigin(0.5, 0);
      items.push(
        ...charmRow(this, {
          content: this.ctx.content,
          charms: charms.ids,
          area: { x: 80, y: top + 50, w: width - 160, h: 84 },
          cardW: Math.min(260, (width - 160 - 4 * 16) / 5),
          idPrefix: 'pause.charm',
          reorder: (order) => {
            const ids = order.flatMap((i) => (charms.ids[i] === undefined ? [] : [charms.ids[i]]));
            charms.reorder(order, ids);
            this.scene.restart({ ...data, charms: { ...charms, ids } } satisfies PauseData);
          },
        }),
      );
    }
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
