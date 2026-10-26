// Bakkie Tally (GDD §8, art bible §6): chalk slate with a score count-up, accuracy, birds bagged
// by plane, wing shots, flocks flushed, the whole-flock badge (GDD §6.4), best Frenzy streak,
// penalties and the rank stamp. GDD §16 step 7: [Again] (default focus) starts the next hunt with
// one tap; [Season Run] opens the run (M6); [Menu] goes back to the title. Below the rank:
// what the hunt changed in the save (new best, rank up, Notaboek ticks, unlocks), one line.
import { designSize } from '../layout';
import { fitCamera } from '../view/fitCamera';
import * as Phaser from 'phaser';
import type { I18nKey } from '../../i18n/i18n';
import { fill, isI18nKey, t, tOr } from '../../i18n/i18n';
import type { HuntOutcome } from '../../meta/progress';
import type { HuntResult } from '../../sim/types';
import type { ShareOutcome } from '../../platform/share';
import type { TallyExtras } from '../daily/DailyFlow';
import type { GameContext } from '../GameContext';
import { formatPercent, formatScore } from '../ui/format';
import { tallyBarkSlot, type Rect } from '../ui/hudLayout';
import { drawSlateFrame } from '../ui/specialBadge';
import { BarkBubble, sayBark } from '../ui/BarkBubble';
import { powerupIcon } from '../ui/powerupIcons';
import type { BarkTrigger } from '../../content/schemas';
import { drawButton, fitText, Menu } from '../ui/menu';
import { FONT } from '../view/Fx';
import { fontPx, outline } from '../ui/textLook';

export interface TallyData {
  readonly result: HuntResult;
  /** Called when the player presses [Again], with the pointer type that pressed it. */
  readonly again: (pointerType: string) => void;
  /** Back to the title. */
  readonly menu: () => void;
  /** Opens the Season Run. */
  readonly seasonRun: () => void;
  /** v1.2x (D-034): admin hunts swap [Season Run] for [Back to admin]. */
  readonly admin?: () => void;
  /** What the hunt changed in the save (null if nothing was recorded). */
  readonly outcome: HuntOutcome | null;
  /** This was the FTUE hunt (Oupa se Les). */
  readonly ftue: boolean;
  /** M7: Daily/challenge lines and the share message (null for the FTUE). */
  readonly extras: TallyExtras | null;
  /** v1.7b (D-046): power-ups and crate guns used in the hunt (ids, first use first). */
  readonly powerups?: readonly string[];
  /** M7: [Share] — sends extras.share (from inside the tap's event handler). */
  readonly share: (extras: TallyExtras) => Promise<ShareOutcome>;
}

export class TallyScene extends Phaser.Scene {
  private readonly ctx: GameContext;

  constructor(ctx: GameContext) {
    super({ key: 'Tally' });
    this.ctx = ctx;
  }

  /**
   * v1.7b (D-046): the power-ups used, right-aligned at `right`: each one's icon and name (names
   * dropped, icons only, when they don't fit in `room`). Returns the objects (they fade in).
   */
  private powerupRow(
    ids: readonly string[],
    right: number,
    y: number,
    rowH: number,
    room: number,
    style: (size: number) => Phaser.Types.GameObjects.Text.TextStyle,
  ): Phaser.GameObjects.GameObject[] {
    const size = Math.max(28, Math.round(rowH * 0.95));
    const font = Math.min(30, Math.floor(rowH * 0.7));
    const names = ids.map((id) => tOr(`item.${id}`, id));
    const made: Phaser.GameObjects.GameObject[] = [];
    let x = right;
    const withNames =
      names.reduce((w, n) => w + size + 12 + n.length * font * 0.55 + 18, 0) <= room;
    for (let i = ids.length - 1; i >= 0; i--) {
      const id = ids[i] ?? '';
      if (withNames) {
        const name = this.add
          .text(x, y, names[i] ?? id, style(font))
          .setOrigin(1, 0)
          .setAlpha(0);
        made.push(name);
        x -= name.displayWidth + 8;
      }
      const icon = powerupIcon(id);
      if (this.textures.exists(icon)) {
        made.push(
          this.add
            .image(x - size / 2, y + rowH * 0.42, icon)
            .setDisplaySize(size, size)
            .setAlpha(0),
        );
        x -= size + 18;
      }
    }
    return made;
  }

  /**
   * v1.0.1 (D-028 §3): a new best, the top rank ("Bosveld Legend!") or the bottom one
   * ("Stadsjapie…") gets a word from Oupa; not after his lesson or in capture mode.
   */
  private verdictBark(data: TallyData, at: { safe: Rect; panel: Rect }): void {
    if (data.ftue || this.ctx.capture !== null) return;
    const ranks = this.ctx.content.scoring.ranks;
    const r = data.result;
    const trigger: BarkTrigger | null =
      data.outcome?.newBest != null && r.score > 0
        ? 'newBest'
        : // D-048: a special day's hunt ends with its own line.
          r.feesdag !== undefined && this.ctx.barks.specialLines !== null
          ? 'feesdagEnd'
          : r.rank === ranks.at(-1)?.id
            ? 'legend'
            : r.rank === ranks[0]?.id && r.shots > 0
              ? 'badHunt'
              : null;
    if (trigger === null) return;
    const now = this.time.now;
    const bark = this.ctx.barks.say(trigger, now);
    if (bark === null) return;
    const bubble = new BarkBubble(this, this.ctx.feel.barks.fontPx);
    sayBark(this.ctx, bubble, bark.line, tallyBarkSlot(at.safe, at.panel), now);
  }

  create(data: TallyData): void {
    const { width, height } = designSize();
    fitCamera(this.cameras.main);
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

    // Settings → large text scales the tag, the news line and the toast; the title, score, rows
    // and rank stamp sit in fixed slots of the slate (already large), like the HUD numbers.
    const chalk = (size: number, color = '#F3EAD3', scaled = true) => ({
      fontFamily: FONT,
      fontSize: fontPx(size, scaled),
      fontStyle: '800',
      color,
      ...outline(size, 0, '#1B1410', color),
    });
    const extras = data.extras;
    // D-048: a special day's slate has its own title ("Spookjag 2026") and frame.
    const special = extras?.special ?? null;
    const moon =
      special == null
        ? null
        : drawSlateFrame(this, special.frame, { x: px, y: py, w: panelW, h: panelH });
    // D-048: the frame's moon and the tag's rects ride along into the hook's final rects below.
    const frameRects: Record<string, Rect> = {};
    if (moon !== null) frameRects['tallyMoon'] = moon;
    const title = this.add
      .text(
        px + panelW / 2,
        py + 64,
        special?.title ?? t('tally.title'),
        chalk(64, special == null ? '#FFD25A' : '#FFB347', false),
      )
      .setOrigin(0.5);
    fitText(title, panelW - 560);
    if (extras?.tag != null) {
      const tag = this.add.text(px + 30, py + 30, extras.tag, chalk(28, '#FFD25A'));
      fitText(tag, panelW / 2 - 240);
      const b = tag.getBounds();
      frameRects['tallyTag'] = { x: b.x, y: b.y, w: b.width, h: b.height };
    }

    const score = this.add
      .text(px + panelW / 2, py + 160, '0', chalk(96, '#F3EAD3', false))
      .setOrigin(0.5);
    // No Oupa bark over the count-up (art bible §10). The count ticks as it climbs (GDD §17).
    const pace = this.ctx.feel.tally;
    this.ctx.audio.setTallyCounting(true);
    let ticks = 0;
    this.tweens.addCounter({
      from: 0,
      to: r.score,
      duration: pace.countUpMs,
      ease: 'Cubic.Out',
      onUpdate: (tw) => {
        score.setText(formatScore(Math.round(tw.getValue() ?? 0)));
        const due = Math.floor((tw.progress * pace.countUpMs) / pace.tickEveryMs);
        if (r.score > 0 && due > ticks && tw.progress < 1) {
          ticks = due;
          this.ctx.audio.ui('tick');
        }
      },
      onComplete: () => {
        this.ctx.audio.setTallyCounting(false);
        // D-028 §3: Oupa's verdict once the count-up is done (never over it, art bible §10).
        this.verdictBark(data, {
          safe: {
            x: safe.left,
            y: safe.top,
            w: width - safe.left - safe.right,
            h: height - safe.top - safe.bottom,
          },
          panel: { x: px, y: py, w: panelW, h: panelH },
        });
      },
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.ctx.audio.setTallyCounting(false);
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
    // D-048: the Spookjag's bats, owls and lanterns.
    if (special != null && isI18nKey(special.nameKey)) rows.push([special.nameKey, special.line]);
    // v1.7b (D-046): the power-ups used, as icons and names (a row of their own).
    const used = data.powerups ?? [];
    if (used.length > 0) rows.splice(rows.length - 1, 0, ['tally.powerups', '']);
    if (this.ctx.hook) this.ctx.hook.tallyPowerups = [...used];
    const rowH = Math.min(52, (panelH - 480) / rows.length);
    const rowFont = Math.min(36, Math.floor(rowH * 0.78));
    rows.forEach(([key, value], i) => {
      const y = py + 240 + i * rowH;
      const label = this.add.text(px + 80, y, t(key), chalk(rowFont, '#F3EAD3', false)).setAlpha(0);
      const val = this.add
        .text(px + panelW - 80, y, value, chalk(rowFont, '#F3EAD3', false))
        .setOrigin(1, 0)
        .setAlpha(0);
      const extra =
        key === 'tally.powerups'
          ? this.powerupRow(used, px + panelW - 80, y, rowH, panelW / 2 - 40 - label.width, (n) =>
              chalk(n, '#F3EAD3', false),
            )
          : [];
      this.tweens.add({
        targets: [label, val, ...extra],
        alpha: 1,
        delay: pace.rowDelayMs + i * pace.rowStaggerMs,
        duration: pace.rowFadeMs,
      });
    });

    // Rank stamp thud.
    const rankKey = `rank.${r.rank}`;
    const rankText = isI18nKey(rankKey) ? t(rankKey) : r.rank;
    const stamp = this.add
      .text(px + panelW / 2, py + panelH - 222, rankText, {
        ...chalk(56, '#C8302A', false),
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
      delay: pace.countUpMs,
      duration: pace.stampMs,
      ease: 'Quad.In',
      onComplete: () => {
        this.ctx.audio.ui('thud');
      },
    });

    // What changed in the save: one line, the most exciting news first.
    const news = this.news(data);
    if (news !== null) {
      const line = this.add
        .text(px + panelW / 2, py + panelH - 152, news, chalk(30, '#FFD25A'))
        .setOrigin(0.5)
        .setAlpha(0);
      fitText(line, panelW - 80);
      this.tweens.add({
        targets: line,
        alpha: 1,
        delay: pace.countUpMs + pace.newsDelayMs,
        duration: 200,
      });
    }

    // Buttons: [Again] (default focus, ≥ 64 px), [Season Run], [Menu].
    const by = py + panelH - 116;
    const again: Rect = { x: px + panelW / 2 - 210, y: by, w: 420, h: 96 };
    const season: Rect = { x: px + 30, y: by + 12, w: Math.min(300, again.x - px - 60), h: 76 };
    const menuR: Rect = { x: px + panelW - 30 - season.w, y: by + 12, w: season.w, h: 76 };
    drawButton(this, again, t('tally.again'), 'primary', 52);
    const toAdmin = data.admin;
    drawButton(
      this,
      season,
      t(toAdmin === undefined ? 'tally.season_run' : 'admin.back'),
      'secondary',
      30,
    );
    drawButton(this, menuR, t('tally.menu'), 'secondary', 32);

    // M7 [Share]: top-right of the slate (≥ 64 px), Classic and the official daily only.
    const shareR: Rect = { x: px + panelW - 30 - 240, y: py + 20, w: 240, h: 84 };
    const shareMsg = extras?.share != null ? extras : null;
    let toast: Phaser.GameObjects.Text | null = null;
    if (shareMsg !== null) drawButton(this, shareR, t('tally.share'), 'secondary', 40);
    let sharing = false;
    const shareItems =
      shareMsg === null
        ? []
        : [
            {
              id: 'share',
              rect: () => shareR,
              press: () => {
                if (sharing) return;
                sharing = true;
                // Synchronous up to navigator.share / clipboard.writeText: keeps user activation.
                void data.share(shareMsg).then((outcome) => {
                  sharing = false;
                  if (!this.sys.isActive()) return;
                  if (this.ctx.hook)
                    this.ctx.hook.lastShare = {
                      outcome,
                      text: shareMsg.share?.text ?? '',
                      url: shareMsg.share?.url ?? '',
                    };
                  if (outcome === 'cancelled') return;
                  const key =
                    outcome === 'shared'
                      ? 'tally.shared'
                      : outcome === 'copied'
                        ? 'tally.copied'
                        : 'tally.share_failed';
                  toast?.destroy();
                  const tx = this.add
                    .text(
                      shareR.x + shareR.w,
                      shareR.y + shareR.h + 14,
                      t(key),
                      chalk(26, '#FFD25A'),
                    )
                    .setOrigin(1, 0);
                  fitText(tx, panelW / 2);
                  toast = tx;
                  this.tweens.add({ targets: tx, alpha: 0, delay: 2200, duration: 400 });
                });
              },
            },
          ];

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
        {
          id: toAdmin === undefined ? 'seasonRun' : 'admin',
          rect: () => season,
          press: () => {
            if (pressed) return;
            pressed = true;
            if (toAdmin !== undefined) toAdmin();
            else data.seasonRun();
          },
        },
        {
          id: 'menu',
          rect: () => menuR,
          press: () => {
            if (pressed) return;
            pressed = true;
            data.menu();
          },
        },
        ...shareItems,
      ],
      { focus: 'again', hook: this.ctx.hook },
    );
    if (this.ctx.hook) {
      this.ctx.hook.scene = 'tally';
      this.ctx.hook.rects = {
        ...frameRects,
        again,
        ...(toAdmin === undefined ? { seasonRun: season } : { admin: season }),
        menu: menuR,
        ...(shareMsg === null ? {} : { share: shareR }),
      };
      this.ctx.hook.tally = {
        tag: extras?.tag ?? null,
        compare: extras?.compare ?? null,
        news,
        share: shareMsg !== null,
        frame: special?.frame ?? null,
        ...(special == null ? {} : { title: special.title }),
      };
    }
  }

  private news(data: TallyData): string | null {
    if (data.ftue) return t('tally.ftue_done');
    // M7 first: the challenge verdict, then the streak / practice line.
    const parts: string[] = [
      ...(data.extras?.compare != null ? [data.extras.compare] : []),
      ...(data.extras?.news ?? []),
    ];
    const o = data.outcome;
    if (o === null) return parts.length === 0 ? null : parts.slice(0, 2).join('  ·  ');
    for (const w of o.unlockedWeapons)
      parts.push(fill(t('tally.unlocked'), { weapon: tOr(`weapon.${w}`, w) }));
    if (o.newBest !== null && o.newBest.previous !== null) parts.push(t('tally.new_best'));
    if (o.rankUp !== null)
      parts.push(fill(t('tally.rank_up'), { rank: tOr(`rank.${o.rankUp}`, o.rankUp) }));
    for (const id of o.completed) {
      const c = this.ctx.notaboek.challenges.find((x) => x.id === id);
      if (c === undefined || c.reward.type === 'weapon') continue;
      // v1.3: a sight for the rifles (fitted in the Skiet-Skuur).
      if (c.reward.type === 'sight') {
        parts.push(fill(t('tally.unlocked'), { weapon: tOr(`sight.${c.reward.id}`, c.reward.id) }));
        continue;
      }
      if (c.reward.type === 'charm') {
        parts.push(
          fill(t('tally.charm_unlocked'), { charm: tOr(`charm.${c.reward.id}`, c.reward.id) }),
        );
        continue;
      }
      parts.push(
        fill(t('tally.notaboek_done'), { goal: fill(tOr(`notaboek.${id}`, id), { n: c.target }) }),
      );
    }
    return parts.length === 0 ? null : parts.slice(0, 2).join('  ·  ');
  }
}
