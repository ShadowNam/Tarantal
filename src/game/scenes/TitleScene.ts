// Title (GDD §16 step 1): over the live panorama, one giant START HUNT — no login, no settings, no
// story wall for a new player. START reacts on press like the M2 start card: it unlocks audio and
// fixes the hunt's inputKind from the pointer that pressed it. A new player's first hunt is the
// FTUE "Oupa se Les"; afterwards START plays Classic and the title also shows the rank, the Karoo
// best, the Skiet-Skuur and Settings (and, in the DOM, the fullscreen button where it works).
import { designSize } from '../layout';
import { fitCamera } from '../view/fitCamera';
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
  /** M7: one line under the logo (a challenge link that doesn't work). */
  readonly notice?: string;
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
    // M9: the quality benchmark measures frames while the title is up.
    this.ctx.titleShown(this);
    const { width, height } = designSize();
    fitCamera(this.cameras.main);
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
    if (data.notice !== undefined) {
      const notice = this.add
        .text(width / 2, safe.top + 260, data.notice, {
          ...textStyle(40, '#FF8A7A'),
          stroke: '#1B1410',
          strokeThickness: 6,
        })
        .setOrigin(0.5);
      fitText(notice, width - 200);
    }
    if (this.ctx.hook) this.ctx.hook.notice = data.notice ?? null;

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
      // Bottom row, left to right: Skiet-Skuur, Daily Hunt (M7), Season Run, Settings.
      const gap = 30;
      const bw = Math.min(380, (width - safe.left - safe.right - 160 - gap * 3) / 4);
      const by = height - safe.bottom - 170;
      const x0 = width / 2 - (bw * 4 + gap * 3) / 2;
      const slot = (i: number): Rect => ({ x: x0 + i * (bw + gap), y: by, w: bw, h: 96 });
      const shed = slot(0);
      const daily = slot(1);
      const run = slot(2);
      const settings = slot(3);
      const resume = this.ctx.run.current !== null;
      drawButton(this, shed, t('title.shed'), 'secondary', 44);
      // M10: capture mode is unranked (slow-mo would inflate a Daily score): no Daily entry.
      const dailyOn = this.ctx.capture === null;
      if (dailyOn) {
        const setup = this.ctx.daily.todaySetup();
        const played = this.ctx.daily.playedToday() || this.ctx.daily.unranked;
        drawButton(
          this,
          daily,
          fill(t('title.daily'), { n: setup.number }),
          played ? 'secondary' : 'selected',
          44,
        );
        const status = this.add
          .text(daily.x + daily.w / 2, daily.y - 14, this.dailyStatus(played), {
            ...textStyle(26),
            stroke: '#1B1410',
            strokeThickness: 5,
          })
          .setOrigin(0.5, 1);
        fitText(status, Math.max(bw * 1.6, 300));
      }
      drawButton(
        this,
        run,
        t(resume ? 'title.continue_run' : 'title.season_run'),
        resume ? 'selected' : 'secondary',
        44,
      );
      drawButton(this, settings, t('title.settings'), 'secondary', 44);
      // Focus order follows the buttons left to right: Shed, Daily, Season Run, Settings.
      items.push(
        {
          id: 'shed',
          rect: () => shed,
          press: () => {
            this.openOverlay('Shed');
          },
        },
        ...(dailyOn
          ? ([
              {
                id: 'daily',
                rect: () => daily,
                trigger: 'down',
                press: (pointerType, pointerId) => {
                  if (this.started) return;
                  this.started = true;
                  this.ctx.audio.unlock();
                  this.data_?.start(
                    pointerId === null ? 'pointer' : inputKindOf(pointerType),
                    pointerId,
                    'daily',
                  );
                },
              },
            ] satisfies MenuItem[])
          : []),
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

  /** The line above the Daily button: new today, the streak (and its freeze), or played. */
  private dailyStatus(played: boolean): string {
    // D-028: a test link on a public build only ever plays practice.
    if (this.ctx.daily.unranked) return t('title.daily_unranked');
    if (played) return t('title.daily_played');
    const streak = this.ctx.daily.streakToday();
    if (streak.streak === 0) return t('title.daily_new');
    const line = fill(t('title.daily_streak'), { n: streak.streak });
    return streak.freezeReady ? `${line} · ${t('title.daily_freeze')}` : line;
  }

  /** Skiet-Skuur or Settings on top of the title; the title rebuilds when it closes. */
  private openOverlay(key: 'Shed' | 'Settings'): void {
    // START (or the run) was pressed: its break or hunt is on its way (D-026).
    if (this.started) return;
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
