// Bakkie Tally (GDD §8, art bible §6): chalk slate with a score count-up, accuracy, birds bagged
// by plane, wing shots, flocks flushed, the whole-flock badge (GDD §6.4), best Frenzy streak,
// penalties and the rank stamp. GDD §16 step 7: [Again] (default focus) starts the next hunt with
// one tap; [Season Run] stays locked until M6; [Menu] goes back to the title. Below the rank:
// what the hunt changed in the save (new best, rank up, Notaboek ticks, unlocks), one line.
import * as Phaser from 'phaser';
import type { I18nKey } from '../../i18n/i18n';
import { fill, isI18nKey, t, tOr } from '../../i18n/i18n';
import type { HuntOutcome } from '../../meta/progress';
import type { HuntResult } from '../../sim/types';
import type { GameContext } from '../GameContext';
import { formatPercent, formatScore } from '../ui/format';
import type { Rect } from '../ui/hudLayout';
import { drawButton, fitText, Menu } from '../ui/menu';
import { FONT } from '../view/Fx';

export interface TallyData {
  readonly result: HuntResult;
  /** Called when the player presses [Again], with the pointer type that pressed it. */
  readonly again: (pointerType: string) => void;
  /** Back to the title. */
  readonly menu: () => void;
  /** What the hunt changed in the save (null if nothing was recorded). */
  readonly outcome: HuntOutcome | null;
  /** This was the FTUE hunt (Oupa se Les). */
  readonly ftue: boolean;
}

const COUNT_UP_MS = 900;

export class TallyScene extends Phaser.Scene {
  private readonly ctx: GameContext;

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
    const rowH = Math.min(52, (panelH - 480) / rows.length);
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
      .text(px + panelW / 2, py + panelH - 222, rankText, {
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

    // What changed in the save: one line, the most exciting news first.
    const news = this.news(data);
    if (news !== null) {
      const line = this.add
        .text(px + panelW / 2, py + panelH - 152, news, chalk(30, '#FFD25A'))
        .setOrigin(0.5)
        .setAlpha(0);
      fitText(line, panelW - 80);
      this.tweens.add({ targets: line, alpha: 1, delay: COUNT_UP_MS + 300, duration: 200 });
    }

    // Buttons: [Again] (default focus, ≥ 64 px), [Season Run] (locked until M6), [Menu].
    const by = py + panelH - 116;
    const again: Rect = { x: px + panelW / 2 - 210, y: by, w: 420, h: 96 };
    const season: Rect = { x: px + 30, y: by + 12, w: Math.min(300, again.x - px - 60), h: 76 };
    const menuR: Rect = { x: px + panelW - 30 - season.w, y: by + 12, w: season.w, h: 76 };
    drawButton(this, again, t('tally.again'), 'primary', 52);
    drawButton(this, season, t('tally.season_run'), 'locked', 28);
    drawButton(this, menuR, t('tally.menu'), 'secondary', 32);

    let pressed = false;
    new Menu(
      this,
      [
        {
          id: 'again',
          rect: () => again,
          press: (pointerType) => {
            // Two fingers lifting in one frame must not queue two restarts.
            if (pressed) return;
            pressed = true;
            this.ctx.audio.unlock();
            data.again(pointerType === 'keyboard' ? 'mouse' : pointerType);
          },
        },
        { id: 'seasonRun', rect: () => season, enabled: () => false, press: () => undefined },
        {
          id: 'menu',
          rect: () => menuR,
          press: () => {
            if (pressed) return;
            pressed = true;
            data.menu();
          },
        },
      ],
      { focus: 'again', hook: this.ctx.hook },
    );
    if (this.ctx.hook) {
      this.ctx.hook.scene = 'tally';
      this.ctx.hook.rects = { again, seasonRun: season, menu: menuR };
    }
  }

  private news(data: TallyData): string | null {
    if (data.ftue) return t('tally.ftue_done');
    const o = data.outcome;
    if (o === null) return null;
    const parts: string[] = [];
    for (const w of o.unlockedWeapons)
      parts.push(fill(t('tally.unlocked'), { weapon: tOr(`weapon.${w}`, w) }));
    if (o.newBest !== null && o.newBest.previous !== null) parts.push(t('tally.new_best'));
    if (o.rankUp !== null)
      parts.push(fill(t('tally.rank_up'), { rank: tOr(`rank.${o.rankUp}`, o.rankUp) }));
    for (const id of o.completed) {
      const c = this.ctx.notaboek.challenges.find((x) => x.id === id);
      if (c === undefined || c.reward.type === 'weapon') continue;
      parts.push(
        fill(t('tally.notaboek_done'), { goal: fill(tOr(`notaboek.${id}`, id), { n: c.target }) }),
      );
    }
    return parts.length === 0 ? null : parts.slice(0, 2).join('  ·  ');
  }
}
