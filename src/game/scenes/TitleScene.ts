// Title (GDD §16 step 1): over the live panorama, one giant START HUNT — no login, no settings, no
// story wall for a new player. START reacts on press like the M2 start card: it unlocks audio and
// fixes the hunt's inputKind from the pointer that pressed it. A new player's first hunt is the
// FTUE "Oupa se Les"; afterwards START plays Classic and the title also shows the rank, the Karoo
// best, the Skiet-Skuur and Settings (and, in the DOM, the fullscreen button where it works).
import * as Phaser from 'phaser';
import { fill, t, tOr } from '../../i18n/i18n';
import type { ModeId } from '../../sim/types';
import type { GameContext } from '../GameContext';
import { inputKindOf } from '../input/InputMapper';
import type { InputKind } from '../../sim/types';
import { formatScore } from '../ui/format';
import type { Rect } from '../ui/hudLayout';
import { drawButton, fitText, Menu, textStyle, type MenuItem } from '../ui/menu';

export interface TitleData {
  /** Starts the hunt; pointerId is the pressing pointer (null from the keyboard). */
  readonly start: (kind: InputKind, pointerId: number | null, mode: ModeId) => void;
  /** Opens the Season Run (resumes the saved run, or starts a new one). */
  readonly run: () => void;
}

export class TitleScene extends Phaser.Scene {
  private readonly ctx: GameContext;
  private menu: Menu | null = null;
  private data_: TitleData | null = null;
  private started = false;

  constructor(ctx: GameContext) {
    super({ key: 'Title' });
    this.ctx = ctx;
  }

  create(data: TitleData): void {
    this.data_ = data;
    this.started = false;
    const { width, height } = this.scale.gameSize;
    this.cameras.main.setSize(width, height);
    const safe = this.ctx.safeArea();
    const returning = this.ctx.save.data.ftue.done;
    const mode: ModeId = returning ? 'classic' : 'ftue';

    this.add.rectangle(0, 0, width, height, 0x1b1410, 0.4).setOrigin(0);
    const logo = this.add
      .text(width / 2, safe.top + 150, t('app.title'), {
        ...textStyle(110, '#FFD25A'),
        fontStyle: '900',
        stroke: '#1B1410',
        strokeThickness: 14,
      })
      .setOrigin(0.5);
    fitText(logo, width - 160);

    const startW = Math.min(900, width - safe.left - safe.right - 200);
    const start: Rect = { x: (width - startW) / 2, y: height / 2 - 110, w: startW, h: 220 };
    const startBtn = drawButton(this, start, t('title.start'), 'primary', 110);
    this.tweens.add({
      targets: startBtn.text,
      scale: { from: startBtn.text.scale, to: startBtn.text.scale * 1.05 },
      yoyo: true,
      repeat: -1,
      duration: 700,
    });

    const items: MenuItem[] = [
      {
        id: 'start',
        rect: () => start,
        trigger: 'down',
        press: (pointerType, pointerId) => {
          if (this.started) return;
          this.started = true;
          this.ctx.audio.unlock();
          this.data_?.start(
            pointerId === null ? 'pointer' : inputKindOf(pointerType),
            pointerId,
            mode,
          );
        },
      },
    ];

    if (returning) {
      const best = this.ctx.save.data.bests[this.ctx.biome.id];
      const rank = this.ctx.save.data.bestRank;
      const line = [
        rank === null ? null : tOr(`rank.${rank}`, rank),
        best === undefined ? null : fill(t('title.best'), { score: formatScore(best.score) }),
      ]
        .filter((x): x is string => x !== null)
        .join('  ·  ');
      if (line !== '') {
        const info = this.add
          .text(width / 2, start.y + start.h + 60, line, {
            ...textStyle(40),
            stroke: '#1B1410',
            strokeThickness: 6,
          })
          .setOrigin(0.5);
        fitText(info, width - 200);
      }
      const bw = Math.min(420, (width - safe.left - safe.right - 160) / 3);
      const by = height - safe.bottom - 170;
      const shed: Rect = { x: width / 2 - bw * 1.5 - 30, y: by, w: bw, h: 96 };
      const run: Rect = { x: width / 2 - bw / 2, y: by, w: bw, h: 96 };
      const settings: Rect = { x: width / 2 + bw / 2 + 30, y: by, w: bw, h: 96 };
      const resume = this.ctx.run.current !== null;
      drawButton(this, shed, t('title.shed'), 'secondary', 44);
      drawButton(
        this,
        run,
        t(resume ? 'title.continue_run' : 'title.season_run'),
        resume ? 'selected' : 'secondary',
        44,
      );
      drawButton(this, settings, t('title.settings'), 'secondary', 44);
      // Focus order follows the buttons left to right: Shed, Season Run, Settings.
      items.push(
        {
          id: 'shed',
          rect: () => shed,
          press: () => {
            this.openOverlay('Shed');
          },
        },
        {
          id: 'seasonRun',
          rect: () => run,
          press: () => {
            if (this.started) return;
            this.started = true;
            this.ctx.audio.unlock();
            this.data_?.run();
          },
        },
        {
          id: 'settings',
          rect: () => settings,
          press: () => {
            this.openOverlay('Settings');
          },
        },
      );
      const hint = this.add
        .text(
          width / 2,
          height - safe.bottom - 40,
          t(this.ctx.coarsePointer ? 'start.hint_touch' : 'start.hint_mouse'),
          { ...textStyle(26), stroke: '#1B1410', strokeThickness: 5 },
        )
        .setOrigin(0.5);
      fitText(hint, width - safe.left - safe.right - 120);
    }

    this.menu = new Menu(this, items, { focus: 'start', hook: this.ctx.hook });
    this.ctx.chrome.setOnTitle(true);
    if (this.ctx.hook) {
      this.ctx.hook.scene = 'start';
      this.ctx.hook.menu = null;
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.ctx.chrome.setOnTitle(false);
      this.menu = null;
    });
  }

  /** Skiet-Skuur or Settings on top of the title; the title rebuilds when it closes. */
  private openOverlay(key: 'Shed' | 'Settings'): void {
    this.menu?.setActive(false);
    this.ctx.chrome.setOnTitle(false);
    this.scene.launch(key, {
      close: () => {
        this.scene.stop(key);
        // Rebuild: the language, the loadout or progress may have changed.
        if (this.data_) this.scene.restart(this.data_);
      },
    });
    this.scene.bringToTop(key);
  }
}
