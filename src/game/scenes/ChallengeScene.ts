// "Beat this" card (GDD §12.4, Tech §12): shown before the title when the page was opened from a
// challenge link. Who sent it, the score to beat, the hunt (Daily #n or Classic · biome · gun),
// a note if the game changed since the link was made, and two buttons: [Accept] starts the
// identical hunt (it fixes the input kind from the press, like START), [Not now] goes to the title.
import { designSize } from '../layout';
import { fitCamera } from '../view/fitCamera';
import * as Phaser from 'phaser';
import { fill, t, tOr } from '../../i18n/i18n';
import type { Challenge } from '../../meta/challenge';
import { groupThousands } from '../../meta/share';
import type { InputKind } from '../../sim/types';
import type { GameContext } from '../GameContext';
import { inputKindOf } from '../input/InputMapper';
import type { Rect } from '../ui/hudLayout';
import { drawButton, fitText, Menu, textStyle } from '../ui/menu';

export interface ChallengeData {
  readonly challenge: Challenge;
  readonly contentChanged: boolean;
  readonly accept: (kind: InputKind, pointerId: number | null) => void;
  readonly later: () => void;
}

export class ChallengeScene extends Phaser.Scene {
  private readonly ctx: GameContext;

  constructor(ctx: GameContext) {
    super({ key: 'Challenge' });
    this.ctx = ctx;
  }

  create(data: ChallengeData): void {
    const { width, height } = designSize();
    fitCamera(this.cameras.main);
    const safe = this.ctx.safeArea();
    const c = data.challenge;
    const panelW = Math.min(1200, width - safe.left - safe.right - 120);
    const panelH = Math.min(820, height - safe.top - safe.bottom - 80);
    const px = (width - panelW) / 2;
    const py = safe.top + (height - safe.top - safe.bottom - panelH) / 2;

    this.add.rectangle(0, 0, width, height, 0x1b1410, 0.55).setOrigin(0);
    const g = this.add.graphics();
    g.fillStyle(0x8b5a2b, 1).fillRoundedRect(px - 14, py - 14, panelW + 28, panelH + 28, 26);
    g.fillStyle(0x2e3b33, 1).fillRoundedRect(px, py, panelW, panelH, 18);

    const line = (y: number, text: string, size: number, color?: string): void => {
      const o = this.add.text(width / 2, py + y, text, textStyle(size, color)).setOrigin(0.5);
      fitText(o, panelW - 80);
    };
    line(80, t('challenge.title'), 72, '#FFD25A');
    line(
      170,
      c.by === undefined ? t('challenge.anon') : fill(t('challenge.from'), { by: c.by }),
      44,
    );
    line(290, fill(t('challenge.beat'), { score: groupThousands(c.score) }), 110, '#FFD25A');
    const biome = tOr(`share.biome.${c.biome.replace(/-/g, '_')}`, c.biome);
    const hunt =
      c.mode === 'daily'
        ? c.n === undefined
          ? t('challenge.daily_any')
          : fill(t('share.daily'), { n: c.n })
        : fill(t('share.classic'), { biome });
    line(400, `${hunt} · ${tOr(`weapon.${c.weapon}`, c.weapon)}`, 40);
    if (data.contentChanged) line(470, t('challenge.updated'), 30, '#FF8A7A');

    const accept: Rect = { x: width / 2 - 260, y: py + panelH - 230, w: 520, h: 120 };
    const later: Rect = { x: width / 2 - 180, y: py + panelH - 92, w: 360, h: 72 };
    drawButton(this, accept, t('challenge.accept'), 'primary', 64);
    drawButton(this, later, t('challenge.later'), 'secondary', 32);

    let done = false;
    new Menu(
      this,
      [
        {
          id: 'accept',
          rect: () => accept,
          trigger: 'down',
          press: (pointerType, pointerId) => {
            if (done) return;
            done = true;
            this.ctx.audio.unlock();
            data.accept(pointerId === null ? 'pointer' : inputKindOf(pointerType), pointerId);
          },
        },
        {
          id: 'later',
          rect: () => later,
          press: () => {
            if (done) return;
            done = true;
            data.later();
          },
        },
      ],
      { focus: 'accept', hook: this.ctx.hook },
    );
    const hook = this.ctx.hook;
    if (hook) {
      hook.scene = 'challenge';
      hook.challenge = {
        seed: c.seed,
        mode: c.mode,
        score: c.score,
        contentChanged: data.contentChanged,
      };
    }
  }
}
