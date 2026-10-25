// v1.6 (D-042): the build stamp on screen — a small, low-contrast corner label (≥ 20 design px so
// it reads on phones) on the title, every hunt and the Skietbaan (web builds), and a line in
// Settings and the pause menu (every build, portals too). Hidden in capture mode, and with
// ?stamp=0 (the visual baselines mask it that way).
import type * as Phaser from 'phaser';
import type { Biome } from '../../content/schemas';
import { fill, t, tOr } from '../../i18n/i18n';
import type { AssetManifest } from '../assets/AssetManifest';
import type { GameContext } from '../GameContext';
import { buildInfo, shortArea, stampText, weekdayKey } from './buildStamp';
import { textStyle } from './menu';

/** The stamp's text size (design px). */
export const STAMP_PX = 22;

/** The stamp for a screen showing `biome` (its art status from `manifest`). */
export function stampFor(ctx: GameContext, biome: Biome, manifest: AssetManifest): string {
  const missing = manifest.missingFinal.length;
  return stampText(buildInfo(), {
    area: shortArea(tOr(biome.nameKey, biome.id)),
    day: tOr(`map.day.${weekdayKey(ctx.today())}`, '').slice(0, 3),
    art: missing === 0 ? t('stamp.art_ok') : fill(t('stamp.art_missing'), { n: missing }),
  });
}

/** Whether the corner label shows: web builds, not in capture mode, not masked (?stamp=0). */
export function cornerStampShown(ctx: GameContext): boolean {
  const masked = new URLSearchParams(window.location.search).get('stamp') === '0';
  return ctx.platform.id === 'web' && ctx.capture === null && !masked;
}

/** Whether the Settings / pause line shows: every build (portals too), not in capture mode. */
export function menuStampShown(ctx: GameContext): boolean {
  const masked = new URLSearchParams(window.location.search).get('stamp') === '0';
  return ctx.capture === null && !masked;
}

export class StampLabel {
  readonly text: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    private readonly ctx: GameContext,
    private readonly shown: boolean,
  ) {
    this.text = scene.add
      .text(0, 0, '', { ...textStyle(STAMP_PX, '#F3EAD3'), fontStyle: '600' })
      .setOrigin(0, 1)
      .setAlpha(0.6)
      .setDepth(5_000)
      .setVisible(shown);
  }

  /** Bottom-left anchor (design px) and the current text. */
  place(x: number, y: number, text: string): void {
    this.text.setPosition(x, y).setText(text);
    const hook = this.ctx.hook;
    if (hook)
      hook.stamp = {
        text,
        visible: this.shown,
        px: STAMP_PX,
        rect: { x, y: y - this.text.height, w: this.text.width, h: this.text.height },
      };
  }
}
