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
import { layoutForDay } from '../../meta/maps';
import { bonusAllowsSight, bonusSlug, isUnlocked, mapQuota } from '../../meta/bonusMaps';
import { huntSight, plainGun } from '../../meta/progress';
import { BONUS_MAP_IDS } from '../../content/schemas';
import { findLayout } from '../../sim/maps';
import type { Rect } from '../ui/hudLayout';
import { drawButton, fitText, Menu, textStyle, type MenuItem } from '../ui/menu';
import { cornerStampShown, stampFor, StampLabel } from '../ui/StampLabel';
import { drawSpecialBadge } from '../ui/specialBadge';

export interface TitleData {
  /** Starts the hunt; pointerId is the pressing pointer (null from the keyboard). */
  readonly start: (
    kind: InputKind,
    pointerId: number | null,
    mode: ModeId,
    /** v1.2: a bonus map on today's Classic map ('verder'). */
    bonus?: string,
  ) => void;
  /** Opens the Season Run (resumes the saved run, or starts a new one). */
  readonly run: () => void;
  /** M7: one line under the logo (a challenge link that doesn't work). */
  readonly notice?: string;
}

/** Room kept between Verder and the bottom row: the Daily status line plus a gap (design px). */
const VERDER_ROW_GAP = 50;
/** Verder's height and its offset below START (design px). */
const VERDER_H = 72;
const VERDER_BELOW_START = 142;

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
    // v1.4 B: a save that reached Die Verste before the Namibië pack existed gets it now.
    this.ctx.grantAreas();
    const mode: ModeId = returning ? 'classic' : 'ftue';

    this.add.rectangle(0, 0, width, height, 0x1b1410, 0.4).setOrigin(0);
    // v1.6 (D-042): the build stamp, bottom left.
    new StampLabel(this, this.ctx, cornerStampShown(this.ctx)).place(
      safe.left + 24,
      height - safe.bottom - 6,
      stampFor(this.ctx, this.ctx.biome, this.ctx.manifest),
    );
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
    // v1.2: a returning player's START block (START, best, today's map, Verder) moves up as far
    // as the safe area needs, so Verder never reaches the bottom row (iPhone home indicator).
    const rowTop = height - safe.bottom - 170 - VERDER_ROW_GAP;
    const lift = returning
      ? Math.max(0, height / 2 - 110 + 220 + VERDER_BELOW_START + VERDER_H - rowTop)
      : 0;
    const start: Rect = {
      x: (width - startW) / 2,
      y: height / 2 - 110 - lift,
      w: startW,
      h: 220,
    };
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

    // v1.4 B (D-039): [Area: …] above START opens the area picker (returning players; Namibië
    // shows there locked until Die Verste is reached). Hidden under a challenge notice.
    if (returning && data.notice === undefined && this.ctx.capture === null) {
      const areaId = this.ctx.classicArea();
      const b = this.ctx.content.biomes.find((x) => x.id === areaId);
      const areaRect: Rect = { x: width / 2 - 260, y: start.y - 100, w: 520, h: 76 };
      const { text } = drawButton(
        this,
        areaRect,
        fill(t('title.area'), {
          area: b === undefined ? areaId : tOr(`share.${b.nameKey}`, tOr(b.nameKey, areaId)),
        }),
        'secondary',
        34,
      );
      fitText(text, areaRect.w - 40);
      items.push({
        id: 'area',
        rect: () => areaRect,
        press: () => {
          this.openOverlay('Area');
        },
      });
      if (this.ctx.hook) this.ctx.hook.classicArea = areaId;
    }

    if (returning) {
      // v1.4 B (D-039): the area Classic plays (the area picker), home by default.
      const area = this.ctx.classicArea();
      const best = this.ctx.save.data.bests[area];
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
      // v1.2: today's Classic map (UTC weekday), e.g. "Today's map: Monday · Dawn mist". D-048:
      // not on a special day (the Daily is the day's news), nor on the plain biome (dev/e2e).
      const showMap =
        this.ctx.daily.todaysSpecial() === null && (this.ctx.classicLayout ?? '') !== 'none';
      const mapLine = this.add
        .text(
          width / 2,
          start.y + start.h + 112,
          fill(t('title.map'), { map: todayMapName(this.ctx, area) }),
          {
            ...textStyle(32, '#FFE7A8'),
            stroke: '#1B1410',
            strokeThickness: 5,
          },
        )
        .setOrigin(0.5)
        .setVisible(showMap);
      fitText(mapLine, width - 200);
      // v1.2: Verder — a button once today's map quota is beaten, else what unlocks it. v1.3:
      // Nog Verder and Die Verste join it, side by side, as each is unlocked today (D-036).
      const home = area;
      const homeBonus = this.ctx.content.biomes.find((b) => b.id === home)?.bonusMaps ?? [];
      const open = BONUS_MAP_IDS.filter(
        (id) =>
          homeBonus.some((m) => m.id === id) &&
          isUnlocked(this.ctx.save.data.bonusMaps, this.ctx.today(), home, id),
      );
      const verderOpen = open.includes('verder');
      const save = this.ctx.save.data;
      const gun = plainGun(save, this.ctx.content, 'classic', this.ctx.weaponOverride);
      const gunSight = huntSight(gun, save, this.ctx.content, this.ctx.sightOverride);
      const scopeLocked: string[] = [];
      // Above the bottom row and the Daily status line over it (rowTop), whatever the safe area.
      const bonusW = open.length <= 1 ? 400 : Math.min(400, (width - 240) / open.length - 20);
      const y = Math.min(start.y + start.h + VERDER_BELOW_START, rowTop - VERDER_H);
      open.forEach((id, i) => {
        const r: Rect = {
          x: width / 2 - (open.length * (bonusW + 20) - 20) / 2 + i * (bonusW + 20),
          y,
          w: bonusW,
          h: VERDER_H,
        };
        // v1.3 (D-036): Die Verste needs a scope fitted — a grey button that says so instead.
        if (!bonusAllowsSight(this.ctx.content, home, id, gunSight)) {
          // The name on top, the reason under it, both inside the button (no room around it).
          const { text } = drawButton(this, r, tOr(`title.${bonusSlug(id)}`, id), 'locked', 32);
          text.setY(r.y + r.h * 0.34);
          const why = this.add
            .text(r.x + r.w / 2, r.y + r.h * 0.74, t('title.needs_scope'), textStyle(22, '#D9CBB0'))
            .setOrigin(0.5);
          fitText(why, r.w - 24);
          scopeLocked.push(id);
          // e2e: a tap on it must not start a hunt.
          if (this.ctx.hook) this.ctx.hook.rects[`${id}_locked`] = r;
          return;
        }
        drawButton(this, r, tOr(`title.${bonusSlug(id)}`, id), 'selected', 40);
        items.push({
          id,
          rect: () => r,
          trigger: 'down',
          press: (pointerType, pointerId) => {
            if (this.started) return;
            this.started = true;
            this.ctx.audio.unlock();
            this.data_?.start(
              pointerId === null ? 'pointer' : inputKindOf(pointerType),
              pointerId,
              'classic',
              id,
            );
          },
        });
      });
      if (open.length === 0) {
        const locked = this.add
          .text(
            width / 2,
            y + VERDER_H / 2,
            fill(t('title.verder_locked'), {
              quota: formatScore(mapQuota(this.ctx.content, home)),
            }),
            { ...textStyle(28, '#D9CBB0'), stroke: '#1B1410', strokeThickness: 5 },
          )
          .setOrigin(0.5);
        fitText(locked, width - 240);
      }
      if (this.ctx.hook) this.ctx.hook.bonusOpen = open.filter((id) => !scopeLocked.includes(id));
      if (this.ctx.hook) this.ctx.hook.bonusNeedsScope = scopeLocked;
      if (this.ctx.hook) this.ctx.hook.verder = verderOpen;
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
        // D-048: on a special day the Daily is that special ("Spookjag") with a badge.
        const special = this.ctx.daily.todaysSpecial();
        drawButton(
          this,
          daily,
          special === null
            ? fill(t('title.daily'), { n: setup.number })
            : tOr(special.nameKey, special.id),
          played ? 'secondary' : 'selected',
          44,
        );
        if (special !== null) {
          const badge = tOr(special.badgeKey, special.id);
          const r = drawSpecialBadge(this, daily, badge);
          if (this.ctx.hook) this.ctx.hook.rects['dailyBadge'] = r;
          if (this.ctx.hook) this.ctx.hook.feesdag = { id: special.id, badge };
        } else if (this.ctx.hook) this.ctx.hook.feesdag = null;
        const status = this.add
          .text(daily.x + daily.w / 2, daily.y - 14, this.dailyStatus(played), {
            ...textStyle(26),
            stroke: '#1B1410',
            strokeThickness: 5,
          })
          .setOrigin(0.5, 1);
        fitText(status, Math.max(bw * 1.6, 300));
        if (this.ctx.hook) {
          const b = status.getBounds();
          this.ctx.hook.rects['dailyStatus'] = { x: b.x, y: b.y, w: b.width, h: b.height };
        }
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
          // v1.3: with a rifle as the Classic gun, how to hold, fire and cancel the sight.
          t(
            gunSight !== undefined
              ? this.ctx.coarsePointer
                ? 'start.hint_rifle_touch'
                : 'start.hint_rifle_mouse'
              : this.ctx.coarsePointer
                ? 'start.hint_touch'
                : 'start.hint_mouse',
          ),
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
  private openOverlay(key: 'Shed' | 'Settings' | 'Area'): void {
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

/** "Monday · Dawn mist": today's Classic layout of the home biome. */
export function todayMapName(ctx: GameContext, biomeId: string = ctx.biome.id): string {
  const id = ctx.classicLayout ?? layoutForDay(ctx.today());
  const biome = ctx.content.biomes.find((b) => b.id === biomeId) ?? ctx.biome;
  const layout = findLayout(biome, id);
  return fill(t('map.name'), {
    day: tOr(`map.day.${id}`, id),
    light: layout === undefined ? '' : tOr(`map.light.${layout.light}`, layout.light),
  });
}
