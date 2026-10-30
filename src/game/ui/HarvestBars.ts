// v1.8c (D-063, GDD §12.2) The Harvest's two HUD bars, top centre between the clock and the
// score: the big crop meter ("Crop saved 87 %", green → amber → red, a gentle pulse under the
// warning line; never a flash) and the fence repair bar under it ("Fence repaired"). Redrawn only
// when a shown value changes (whole percent).
import type * as Phaser from 'phaser';
import type { HarvestView } from '../../sim/types';
import { fill, t } from '../../i18n/i18n';
import { FONT } from '../view/Fx';

import { cropColor, harvestBarsRects, type HarvestBarsRects } from './harvestBarsLayout';

export { harvestBarsRects };

export class HarvestBars {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly cropText: Phaser.GameObjects.Text;
  private readonly repairText: Phaser.GameObjects.Text;
  private shownCrop = -1;
  private shownRepair = -1;
  private shownWarn = false;
  private rects: HarvestBarsRects | null = null;
  private visible = false;

  constructor(
    scene: Phaser.Scene,
    private readonly warnBelow: number,
  ) {
    this.g = scene.add.graphics().setDepth(40).setVisible(false);
    const style = (size: number): Phaser.Types.GameObjects.Text.TextStyle => ({
      fontFamily: FONT,
      fontSize: `${String(size)}px`,
      fontStyle: '800',
      color: '#F3EAD3',
      stroke: '#1B1410',
      strokeThickness: Math.round(size / 6),
    });
    this.cropText = scene.add
      .text(0, 0, '', style(30))
      .setOrigin(0.5)
      .setDepth(41)
      .setVisible(false);
    this.repairText = scene.add
      .text(0, 0, '', style(20))
      .setOrigin(0.5)
      .setDepth(41)
      .setVisible(false);
  }

  /** Where they go (on a resize). */
  layout(rects: HarvestBarsRects): void {
    this.rects = rects;
    this.shownCrop = -1;
    this.cropText.setPosition(rects.crop.x + rects.crop.w / 2, rects.crop.y + rects.crop.h / 2);
    this.repairText.setPosition(
      rects.repair.x + rects.repair.w / 2,
      rects.repair.y + rects.repair.h / 2,
    );
  }

  /** The bars for this snapshot (null: not the Harvest — hidden). */
  update(h: HarvestView | null): void {
    const show = h !== null && this.rects !== null;
    if (show !== this.visible) {
      this.visible = show;
      this.g.setVisible(show);
      this.cropText.setVisible(show);
      this.repairText.setVisible(show);
    }
    if (h === null || this.rects === null) return;
    const crop = Math.max(0, Math.min(100, Math.round(h.crop)));
    const repair = Math.round(h.repair * 100);
    const warn = crop < this.warnBelow;
    if (crop === this.shownCrop && repair === this.shownRepair && warn === this.shownWarn) return;
    if (crop !== this.shownCrop)
      this.cropText.setText(fill(t('hud.harvest_crop'), { pct: String(crop) }));
    if (repair !== this.shownRepair || this.shownRepair < 0)
      this.repairText.setText(repair >= 100 ? t('hud.harvest_fence_done') : t('hud.harvest_fence'));
    this.shownCrop = crop;
    this.shownRepair = repair;
    this.shownWarn = warn;
    const { crop: c, repair: r } = this.rects;
    const g = this.g;
    g.clear();
    g.fillStyle(0x1b1410, 0.75).fillRoundedRect(c.x - 4, c.y - 4, c.w + 8, c.h + 8, 14);
    g.fillStyle(0x3a2e24, 1).fillRoundedRect(c.x, c.y, c.w, c.h, 10);
    if (crop > 0)
      g.fillStyle(cropColor(crop, this.warnBelow), 1).fillRoundedRect(
        c.x,
        c.y,
        Math.max(20, (c.w * crop) / 100),
        c.h,
        10,
      );
    if (warn) g.lineStyle(4, 0xffd25a, 1).strokeRoundedRect(c.x - 2, c.y - 2, c.w + 4, c.h + 4, 12);
    g.fillStyle(0x1b1410, 0.7).fillRoundedRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6, 9);
    g.fillStyle(0x3a2e24, 1).fillRoundedRect(r.x, r.y, r.w, r.h, 7);
    if (repair > 0)
      g.fillStyle(0x8b6a3e, 1).fillRoundedRect(
        r.x,
        r.y,
        Math.max(14, (r.w * repair) / 100),
        r.h,
        7,
      );
  }

  destroy(): void {
    this.g.destroy();
    this.cropText.destroy();
    this.repairText.destroy();
  }
}
