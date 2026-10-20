// Bakkie Tally (GDD §8, art bible §6): chalk slate with a score count-up, accuracy, birds bagged
// by plane, wing shots, flocks flushed, the whole-flock badge (GDD §6.4), best Frenzy streak,
// penalties and the rank stamp. [Again] starts the next
// hunt with one tap. The screen-shake toggle lives here until the Settings screen (M5).
import * as Phaser from 'phaser';
import type { I18nKey } from '../../i18n/i18n';
import { isI18nKey, t } from '../../i18n/i18n';
import { screenShakeEnabled, setScreenShake } from '../../meta/settings';
import type { HuntResult } from '../../sim/types';
import type { GameContext } from '../GameContext';
import { bindButtons } from '../input/screenButtons';
import { formatPercent, formatScore } from '../ui/format';
import type { Rect } from '../ui/hudLayout';
import { FONT } from '../view/Fx';

export interface TallyData {
  readonly result: HuntResult;
  /** Called when the player presses [Again], with the pointer type that pressed it. */
  readonly again: (pointerType: string) => void;
}

const COUNT_UP_MS = 900;

export class TallyScene extends Phaser.Scene {
  private readonly ctx: GameContext;
  private unbind: (() => void) | null = null;

  constructor(ctx: GameContext) {
    super({ key: 'Tally' });
    this.ctx = ctx;
  }

  create(data: TallyData): void {
    const { width, height } = this.scale.gameSize;
    this.cameras.main.setSize(width, height);
    const r = data.result;
    const safe = this.ctx.safeArea();
    const panelW = Math.min(1100, width - safe.left - safe.right - 80);
    const panelH = Math.min(900, height - safe.top - safe.bottom - 60);
    const px = safe.left + (width - safe.left - safe.right - panelW) / 2;
    const py = safe.top + (height - safe.top - safe.bottom - panelH) / 2;

    this.add.rectangle(0, 0, width, height, 0x1b1410, 0.55).setOrigin(0);
    const g = this.add.graphics();
    g.fillStyle(0x8b5a2b, 1).fillRoundedRect(px - 14, py - 14, panelW + 28, panelH + 28, 26);
    g.fillStyle(0x2e3b33, 1).fillRoundedRect(px, py, panelW, panelH, 18);

    const chalk = (size: number, color = '#F3EAD3') => ({
      fontFamily: FONT,
      fontSize: `${size}px`,
      fontStyle: '800',
      color,
    });
    this.add.text(px + panelW / 2, py + 64, t('tally.title'), chalk(64, '#FFD25A')).setOrigin(0.5);

    const score = this.add.text(px + panelW / 2, py + 160, '0', chalk(96)).setOrigin(0.5);
    this.tweens.addCounter({
      from: 0,
      to: r.score,
      duration: COUNT_UP_MS,
      ease: 'Cubic.Out',
      onUpdate: (tw) => score.setText(formatScore(Math.round(tw.getValue() ?? 0))),
    });

    const rows: [I18nKey, string][] = [
      ['tally.accuracy', `${formatPercent(r.accuracy)}  (${r.hitShots}/${r.shots})`],
      ['tally.bagged_near', String(r.baggedByPlane.near)],
      ['tally.bagged_mid', String(r.baggedByPlane.mid)],
      ['tally.bagged_far', String(r.baggedByPlane.far)],
      ['tally.wing_shots', String(r.wingShots)],
      ['tally.flushes', String(r.flushes)],
      ['tally.whole_flocks', r.wholeFlocks > 0 ? `★ ${r.wholeFlocks}` : '0'],
      ['tally.best_streak', String(r.bestStreak)],
      ['tally.secrets', r.secrets > 0 ? `★ ${r.secrets}` : '0'],
      ['tally.crates', String(r.crates)],
      ['tally.penalties', String(r.penalties)],
    ];
    const rowH = Math.min(52, (panelH - 420) / rows.length);
    const rowFont = Math.min(36, Math.floor(rowH * 0.78));
    rows.forEach(([key, value], i) => {
      const y = py + 240 + i * rowH;
      const label = this.add.text(px + 80, y, t(key), chalk(rowFont)).setAlpha(0);
      const val = this.add
        .text(px + panelW - 80, y, value, chalk(rowFont))
        .setOrigin(1, 0)
        .setAlpha(0);
      this.tweens.add({ targets: [label, val], alpha: 1, delay: 150 + i * 90, duration: 160 });
    });

    // Rank stamp thud.
    const rankKey = `rank.${r.rank}`;
    const rankText = isI18nKey(rankKey) ? t(rankKey) : r.rank;
    const stamp = this.add
      .text(px + panelW / 2, py + panelH - 190, rankText, {
        ...chalk(56, '#C8302A'),
        stroke: '#F3EAD3',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setRotation(-0.08)
      .setScale(2.4)
      .setAlpha(0);
    this.tweens.add({
      targets: stamp,
      scale: 1,
      alpha: 1,
      delay: COUNT_UP_MS,
      duration: 220,
      ease: 'Quad.In',
    });

    // Buttons: [Again] (big, ≥ 64 px) and the shake toggle.
    const again: Rect = { x: px + panelW / 2 - 200, y: py + panelH - 120, w: 400, h: 96 };
    const shake: Rect = { x: px + 40, y: py + panelH - 100, w: 300, h: 72 };
    g.fillStyle(0xd8a73a, 1).fillRoundedRect(again.x, again.y, again.w, again.h, 20);
    g.lineStyle(6, 0x1b1410, 1).strokeRoundedRect(again.x, again.y, again.w, again.h, 20);
    this.add
      .text(again.x + again.w / 2, again.y + again.h / 2, t('tally.again'), chalk(52, '#1B1410'))
      .setOrigin(0.5);
    const shakeText = this.add
      .text(shake.x + 12, shake.y + shake.h / 2, '', chalk(26))
      .setOrigin(0, 0.5);
    const showShake = (): void => {
      shakeText.setText(
        t(screenShakeEnabled(this.ctx.reducedMotion) ? 'tally.shake_on' : 'tally.shake_off'),
      );
    };
    showShake();

    const canvas = this.game.canvas;
    let pressed = false;
    this.unbind = bindButtons(canvas, () => this.scale.gameSize, [
      {
        rect: () => again,
        onPress: (pointerType) => {
          // Two fingers lifting in one frame must not queue two restarts.
          if (pressed) return;
          pressed = true;
          this.ctx.audio.unlock();
          data.again(pointerType);
        },
      },
      {
        rect: () => shake,
        onPress: () => {
          setScreenShake(!screenShakeEnabled(this.ctx.reducedMotion));
          showShake();
        },
      },
    ]);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unbind?.();
      this.unbind = null;
    });
    if (this.ctx.hook) {
      this.ctx.hook.scene = 'tally';
      this.ctx.hook.rects = { again, shake };
    }
  }
}
