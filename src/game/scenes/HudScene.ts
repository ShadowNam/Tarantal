// In-hunt HUD (art bible §6, GDD §17): timer + Frenzy meter top-left, score + pop stack top-right,
// shell belt + RELOAD prompt bottom-right. A separate scene so camera shake never moves it.
// Fed each frame by HuntScene with the latest snapshot and that frame's events.
import * as Phaser from 'phaser';
import type { SimEvent } from '../../sim/events';
import type { SimState } from '../../sim/types';
import { TICKS_PER_SECOND } from '../../sim/clock';
import { t } from '../../i18n/i18n';
import { TEX } from '../assets/AssetManifest';
import type { GameContext } from '../GameContext';
import { FONT } from '../view/Fx';
import { formatAward, formatClock, formatMult, formatScore, popParts } from '../ui/format';
import { hudLayout, rectContains, type HudLayout } from '../ui/hudLayout';

/** Room for "Frenzy ×1.5" left of the meter bar. */
const FRENZY_LABEL_W = 200;

const C = {
  wood: 0x8b5a2b,
  enamel: 0xf3ead3,
  rim: 0x2d5da8,
  slate: 0x2e3b33,
  gold: 0xd8a73a,
  red: 0xc8302a,
  ink: 0x1b1410,
};

interface Pop {
  readonly text: Phaser.GameObjects.Text;
  born: number;
}

export class HudScene extends Phaser.Scene {
  private readonly ctx: GameContext;
  private layoutNow: HudLayout | null = null;
  private panels!: Phaser.GameObjects.Graphics;
  private timer!: Phaser.GameObjects.Text;
  private frenzyLabel!: Phaser.GameObjects.Text;
  private frenzyBar!: Phaser.GameObjects.Graphics;
  private score!: Phaser.GameObjects.Text;
  private shells: Phaser.GameObjects.Image[] = [];
  private reload!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private pops: Pop[] = [];
  private beltFlashUntil = 0;
  private lastMul = 1;
  private lastState: SimState | null = null;

  constructor(ctx: GameContext) {
    super({ key: 'Hud' });
    this.ctx = ctx;
  }

  create(): void {
    this.pops = [];
    this.shells = [];
    this.lastMul = 1;
    this.panels = this.add.graphics();
    const text = (size: number, color: string): Phaser.GameObjects.Text =>
      this.add.text(0, 0, '', {
        fontFamily: FONT,
        fontSize: `${size}px`,
        fontStyle: '900',
        color,
        stroke: '#1B1410',
        strokeThickness: Math.round(size / 7),
      });
    this.timer = text(64, '#F3EAD3').setOrigin(0.5);
    this.frenzyLabel = text(30, '#F3EAD3').setOrigin(0, 0.5);
    this.frenzyBar = this.add.graphics();
    this.score = text(64, '#1B1410').setOrigin(1, 0.5).setStroke('#F3EAD3', 0);
    for (let i = 0; i < 8; i++) this.shells.push(this.add.image(0, 0, TEX.shell));
    this.reload = text(56, '#FFD25A').setOrigin(0.5).setVisible(false);
    this.banner = text(84, '#FFD25A').setOrigin(0.5).setVisible(false);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.relayout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.relayout);
    });
    this.relayout();
  }

  get layoutRects(): HudLayout | null {
    return this.layoutNow;
  }

  isOnBelt(x: number, y: number): boolean {
    return this.layoutNow !== null && rectContains(this.layoutNow.belt, x, y);
  }

  private readonly relayout = (): void => {
    const { width, height } = this.scale.gameSize;
    this.cameras.main.setSize(width, height);
    const l = hudLayout(width, height, this.ctx.safeArea(), this.ctx.feel.hud);
    this.layoutNow = l;
    const hook = this.ctx.hook;
    if (hook) {
      hook.safe = l.safe;
      hook.rects = {
        timer: l.timer,
        frenzy: l.frenzy,
        score: l.score,
        belt: l.belt,
        reloadPrompt: l.reloadPrompt,
      };
    }
    const g = this.panels;
    g.clear();
    // Timer: weathered wood sign.
    g.fillStyle(C.ink, 1).fillRoundedRect(
      l.timer.x - 4,
      l.timer.y - 4,
      l.timer.w + 8,
      l.timer.h + 8,
      18,
    );
    g.fillStyle(C.wood, 1).fillRoundedRect(l.timer.x, l.timer.y, l.timer.w, l.timer.h, 14);
    // Score: cream enamel with blue rim.
    g.fillStyle(C.rim, 1).fillRoundedRect(
      l.score.x - 6,
      l.score.y - 6,
      l.score.w + 12,
      l.score.h + 12,
      20,
    );
    g.fillStyle(C.enamel, 1).fillRoundedRect(l.score.x, l.score.y, l.score.w, l.score.h, 14);
    // Belt: chalk slate.
    g.fillStyle(C.ink, 0.85).fillRoundedRect(l.belt.x, l.belt.y, l.belt.w, l.belt.h, 16);
    this.timer.setPosition(l.timer.x + l.timer.w / 2, l.timer.y + l.timer.h / 2);
    this.frenzyLabel.setPosition(l.frenzy.x, l.frenzy.y + l.frenzy.h / 2);
    this.score.setPosition(l.score.x + l.score.w - 24, l.score.y + l.score.h / 2);
    this.shells.forEach((s, i) =>
      s.setPosition(l.belt.x + 20 + 22 + i * 44, l.belt.y + l.belt.h / 2),
    );
    this.reload.setPosition(
      l.reloadPrompt.x + l.reloadPrompt.w / 2,
      l.reloadPrompt.y + l.reloadPrompt.h / 2,
    );
    this.banner.setPosition(width / 2, l.safe.y + 180);
    if (this.lastState) this.render(this.lastState, []);
  };

  render(s: SimState, events: readonly SimEvent[]): void {
    this.lastState = s;
    const l = this.layoutNow;
    if (l === null) return;
    const now = this.time.now;
    for (const e of events) {
      if (e.type === 'scoreAwarded')
        this.pushPop(`${popParts(e.points, e.mult)}  ${formatAward(e.award)}`, '#F3EAD3');
      else if (e.type === 'bonusAwarded') this.pushPop(formatAward(e.award), '#FFD25A');
      else if (e.type === 'penaltyApplied') this.pushPop(formatAward(e.points), '#FF6B5A');
      else if (e.type === 'emptyClick') this.beltFlashUntil = now + 220;
      else if (e.type === 'stampedeStarted') this.showBanner(t('hud.stampede'));
    }

    this.timer.setText(formatClock(s.ticksLeft, TICKS_PER_SECOND));
    this.timer.setColor(s.stampedeActive ? '#FFD25A' : '#F3EAD3');
    this.score.setText(formatScore(s.score));

    // Frenzy meter: progress toward the next tier; punch-scale on tier up.
    const tiers = this.ctx.content.scoring.frenzyTiers;
    const next = tiers.find((tier) => tier.atStreak > s.streak);
    const prevAt = [...tiers].reverse().find((tier) => tier.atStreak <= s.streak)?.atStreak ?? 0;
    const frac = next ? (s.streak - prevAt) / (next.atStreak - prevAt) : 1;
    const g = this.frenzyBar;
    g.clear();
    g.fillStyle(C.ink, 0.85).fillRoundedRect(
      l.frenzy.x + FRENZY_LABEL_W,
      l.frenzy.y,
      l.frenzy.w - FRENZY_LABEL_W,
      l.frenzy.h,
      10,
    );
    const hot =
      s.frenzyMul >= 3 ? C.red : s.frenzyMul >= 2 ? 0xe2552c : s.frenzyMul > 1 ? C.gold : 0x8e7fa6;
    g.fillStyle(hot, 1).fillRoundedRect(
      l.frenzy.x + FRENZY_LABEL_W + 4,
      l.frenzy.y + 4,
      Math.max(0, (l.frenzy.w - FRENZY_LABEL_W - 8) * frac),
      l.frenzy.h - 8,
      8,
    );
    this.frenzyLabel.setText(`${t('hud.frenzy')} ×${formatMult(s.frenzyMul)}`);
    if (s.frenzyMul > this.lastMul) {
      this.tweens.add({
        targets: this.frenzyLabel,
        scale: { from: 1.5, to: 1 },
        duration: 260,
        ease: 'Back.Out',
      });
    }
    this.lastMul = s.frenzyMul;

    // Belt: filled shells + flash on an empty click.
    const flash = now < this.beltFlashUntil;
    this.shells.forEach((img, i) => {
      const full = s.weapon.shells < 0 || i < s.weapon.shells;
      img.setTexture(full ? TEX.shell : TEX.shellEmpty);
      img.setVisible(i < Math.max(0, s.weapon.magazine));
      img.setTint(flash ? 0xff4040 : 0xffffff);
    });
    const empty = s.weapon.shells === 0 && !s.weapon.reloading;
    this.reload.setText(t('hud.reload')).setVisible(empty);
    if (empty) this.reload.setScale(1 + 0.08 * Math.sin(now / 90));

    // Pop stack under the score: newest on top, fading out.
    let y = l.popAnchor.y;
    this.pops = this.pops.filter((p) => {
      const age = now - p.born;
      if (age > 1600) {
        p.text.destroy();
        return false;
      }
      p.text.setPosition(l.popAnchor.x, y).setAlpha(age < 1200 ? 1 : 1 - (age - 1200) / 400);
      y += 46;
      return true;
    });
  }

  private pushPop(text: string, color: string): void {
    const pop = this.add
      .text(0, 0, text, {
        fontFamily: FONT,
        fontSize: '38px',
        fontStyle: '900',
        color,
        stroke: '#1B1410',
        strokeThickness: 6,
      })
      .setOrigin(1, 0);
    this.pops.unshift({ text: pop, born: this.time.now });
    while (this.pops.length > this.ctx.feel.hud.popStackSize) this.pops.pop()?.text.destroy();
  }

  private showBanner(text: string): void {
    this.banner.setText(text).setVisible(true).setScale(0.4).setAlpha(1);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 300, ease: 'Back.Out' });
    this.tweens.add({
      targets: this.banner,
      alpha: 0,
      delay: 1800,
      duration: 400,
      onComplete: () => this.banner.setVisible(false),
    });
  }
}
