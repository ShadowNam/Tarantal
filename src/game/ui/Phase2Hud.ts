// v1.18 (D-081, GDD §12.2) Die Oes, Phase 2's HUD (a lazy chunk: the Harvest loads it, the first
// download doesn't carry it). Over the fence repair bar (gone with the workers) a plate with the
// big "Animals left: N" and Phase 2's own countdown; the crop meter above it stays. While the
// banner runs (2 s on sim time) "Bonus round: defend the field!" across the screen; when Phase 2
// ends its verdict ("All of them!", "Field defended!", "They ate the lot!", "Time!") through the
// outro. Everything follows the sim's snapshot, so a held frame holds it. Strings from the lazy
// guide tables (passed in). Redrawn only when a shown value changes.
import type * as Phaser from 'phaser';
import type { SimEvent } from '../../sim/events';
import type { HarvestView } from '../../sim/types';
import type { Rect } from './hudLayout';

/** What the HUD scene gives it. */
export interface Phase2HudDeps {
  /** The font family the HUD uses. */
  readonly font: string;
  /** A lazy guide string ('' until the tables are in). */
  readonly text: (key: string) => string;
}

/** e2e: what the Phase 2 HUD shows. */
export interface Phase2HudHook {
  readonly visible: boolean;
  readonly left: number;
  readonly seconds: number;
  readonly banner: string | null;
  readonly verdict: string | null;
  /** The plate on screen (design px), for the no-overlap checks. */
  readonly plate: Rect | null;
}

/** The plate's height (design px) and the counter's font size at most. */
const PLATE_H = 58;
const FONT_PX = 34;

/** "0:24" for ticks at 60 Hz (whole seconds, rounded up). */
export function phase2Clock(ticks: number): string {
  const s = Math.max(0, Math.ceil(ticks / 60));
  return `${String(Math.floor(s / 60))}:${String(s % 60).padStart(2, '0')}`;
}

/** The verdict's string key for how Phase 2 ended (the perfect field beats the clock). */
export function verdictKey(r: NonNullable<NonNullable<HarvestView['phase2']>['result']>): string {
  if (r.reason === 'eaten') return 'guide.harvest2.eaten';
  if (r.reason === 'clear') return 'guide.harvest2.clear';
  return r.perfectBonus > 0 ? 'guide.harvest2.perfect' : 'guide.harvest2.time';
}

export class Phase2Hud {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly left: Phaser.GameObjects.Text;
  private readonly clock: Phaser.GameObjects.Text;
  private readonly big: Phaser.GameObjects.Text;
  private plate: Rect | null = null;
  private shownLeft = -1;
  private shownSec = -1;
  private shownBig = '';
  private visible = false;
  hook: Phase2HudHook = {
    visible: false,
    left: 0,
    seconds: 0,
    banner: null,
    verdict: null,
    plate: null,
  };

  constructor(
    scene: Phaser.Scene,
    private readonly deps: Phase2HudDeps,
  ) {
    const style = (size: number, color: string): Phaser.Types.GameObjects.Text.TextStyle => ({
      fontFamily: deps.font,
      fontSize: `${String(size)}px`,
      fontStyle: '800',
      color,
      stroke: '#1B1410',
      strokeThickness: Math.round(size / 6),
    });
    this.g = scene.add.graphics().setDepth(42).setVisible(false);
    this.left = scene.add
      .text(0, 0, '', style(FONT_PX, '#F3EAD3'))
      .setOrigin(0, 0.5)
      .setDepth(43)
      .setVisible(false);
    this.clock = scene.add
      .text(0, 0, '', style(FONT_PX, '#FFD25A'))
      .setOrigin(1, 0.5)
      .setDepth(43)
      .setVisible(false);
    this.big = scene.add
      .text(0, 0, '', style(72, '#FFD25A'))
      .setOrigin(0.5)
      .setDepth(43)
      .setVisible(false);
  }

  /** Where it goes: over the repair bar (as wide as the crop meter), the big line at `bigY`. */
  layout(crop: Rect, repair: Rect, width: number, bigY: number): void {
    this.plate = { x: crop.x, y: repair.y - 4, w: crop.w, h: PLATE_H };
    this.left.setPosition(crop.x + 14, repair.y - 4 + PLATE_H / 2);
    this.clock.setPosition(crop.x + crop.w - 14, repair.y - 4 + PLATE_H / 2);
    this.big.setPosition(width / 2, bigY).setWordWrapWidth(width * 0.86);
    this.shownLeft = -1;
    this.shownSec = -1;
    this.drawPlate();
  }

  private drawPlate(): void {
    const p = this.plate;
    this.g.clear();
    if (p === null) return;
    this.g.fillStyle(0x1b1410, 0.85).fillRoundedRect(p.x - 4, p.y - 4, p.w + 8, p.h + 8, 14);
    this.g.fillStyle(0x3a2e24, 1).fillRoundedRect(p.x, p.y, p.w, p.h, 10);
  }

  /** Oupa's lines as Phase 2 opens and ends (`oupa`: spoken and shown in the HUD's banner). */
  event(e: SimEvent, oupa: (key: string) => void): void {
    if (e.type === 'phase2Unlocked') oupa('guide.harvest2.start');
    else if (e.type === 'phase2Ended') oupa(`${verdictKey(e)}_oupa`);
  }

  update(h: HarvestView | null): void {
    const p2 = h?.phase2 ?? null;
    const show = p2 !== null && this.plate !== null && h?.phase !== 'banner';
    if (show !== this.visible) {
      this.visible = show;
      this.g.setVisible(show);
      this.left.setVisible(show);
      this.clock.setVisible(show);
    }
    // The banner while it runs, the verdict through the outro.
    const big =
      h === null || p2 === null
        ? ''
        : h.phase === 'banner'
          ? this.deps.text('guide.harvest2.banner')
          : p2.result !== null && h.phase === 'outro'
            ? this.deps.text(verdictKey(p2.result))
            : '';
    if (big !== this.shownBig) {
      this.shownBig = big;
      this.big.setText(big).setVisible(big !== '');
    }
    if (p2 === null) return;
    const sec = Math.ceil(p2.ticksLeft / 60);
    if (p2.left !== this.shownLeft || this.left.text === '') {
      this.shownLeft = p2.left;
      this.left.setText(
        this.deps.text('guide.harvest2.left').replace('{n}', String(p2.left)) || String(p2.left),
      );
      this.fit();
    }
    if (sec !== this.shownSec) {
      this.shownSec = sec;
      this.clock.setText(phase2Clock(p2.ticksLeft));
      this.fit();
    }
    this.hook = {
      visible: show,
      left: p2.left,
      seconds: sec,
      banner: h?.phase === 'banner' ? big : null,
      verdict: p2.result !== null ? big || null : null,
      plate: this.plate,
    };
  }

  /** Shrinks the counter if it and the clock would not fit side by side (narrow phones). */
  private fit(): void {
    const p = this.plate;
    if (p === null) return;
    this.left.setScale(1);
    const room = p.w - 28 - this.clock.width - 16;
    if (this.left.width > room) this.left.setScale(Math.max(0.5, room / this.left.width));
  }

  destroy(): void {
    this.g.destroy();
    this.left.destroy();
    this.clock.destroy();
    this.big.destroy();
  }
}
