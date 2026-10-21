// Season Run screens (GDD §13): the hunt card before each hunt (season, quota, Boss Rule), the run
// tally after it (quota met or missed, doppies earned), the Padstal (offers, reroll, buy, sell,
// drag charms to reorder) and the run summary (victory or defeat). Every change goes through
// ctx.run, which writes the save, so closing the tab anywhere here resumes in the same place.
import { designSize } from '../layout';
import { fitCamera } from '../view/fitCamera';
import * as Phaser from 'phaser';
import { fill, t, tOr } from '../../i18n/i18n';
import type { RunState, ShopOffer } from '../../sim/run/run';
import type { GameContext } from '../GameContext';
import { charmRow, drawCharmCard, RARITY_COLOR } from '../ui/charmCards';
import { slotRects } from '../ui/charmSlots';
import { formatScore } from '../ui/format';
import type { Rect } from '../ui/hudLayout';
import { drawButton, fitText, Menu, textStyle, UI, type MenuItem } from '../ui/menu';
import { sellPrice, rerollCost } from '../../sim/run/run';

export type RunView = 'intro' | 'tally' | 'padstal' | 'summary';

export interface RunData {
  readonly view: RunView;
  /** Padstal: the owned charm picked for selling. */
  readonly selected?: number | null;
  /** Start the current hunt with the pointer type that pressed HUNT!. */
  readonly hunt: (pointerType: string) => void;
  readonly title: () => void;
  /** Start a fresh run (the summary's [New run]); the scene then shows its hunt card. */
  readonly newRun: () => void;
}

/** The view that fits a saved run's phase (resume). */
export function viewFor(run: RunState): RunView {
  switch (run.phase) {
    case 'hunt':
      return 'intro';
    case 'tally':
      return 'tally';
    case 'padstal':
      return 'padstal';
    case 'victory':
    case 'defeat':
      return 'summary';
  }
}

export class RunScene extends Phaser.Scene {
  private readonly ctx: GameContext;
  private data_!: RunData;
  private panel!: Rect;

  constructor(ctx: GameContext) {
    super({ key: 'Run' });
    this.ctx = ctx;
  }

  create(data: RunData): void {
    this.data_ = data;
    const run = this.ctx.run.shown;
    if (run === null) {
      data.title();
      return;
    }
    const { width, height } = designSize();
    fitCamera(this.cameras.main);
    const safe = this.ctx.safeArea();
    const w = Math.min(1500, width - safe.left - safe.right - 60);
    const h = Math.min(980, height - safe.top - safe.bottom - 40);
    this.panel = {
      x: safe.left + (width - safe.left - safe.right - w) / 2,
      y: safe.top + (height - safe.top - safe.bottom - h) / 2,
      w,
      h,
    };
    const p = this.panel;
    this.add.rectangle(0, 0, width, height, UI.ink, 0.6).setOrigin(0);
    const g = this.add.graphics();
    g.fillStyle(UI.wood, 1).fillRoundedRect(p.x - 14, p.y - 14, p.w + 28, p.h + 28, 26);
    g.fillStyle(UI.slate, 1).fillRoundedRect(p.x, p.y, p.w, p.h, 18);

    const items: MenuItem[] = [];
    let focus = '';
    switch (data.view) {
      case 'intro':
        focus = this.intro(run, items);
        break;
      case 'tally':
        focus = this.tally(run, items);
        break;
      case 'padstal':
        focus = this.padstal(run, items);
        break;
      case 'summary':
        focus = this.summary(run, items);
        break;
    }
    new Menu(this, items, { focus, hook: this.ctx.hook });
    const hook = this.ctx.hook;
    if (hook) {
      hook.scene = 'run';
      const info = this.ctx.run.info(run);
      hook.run = {
        view: data.view,
        phase: run.phase,
        huntIndex: run.huntIndex,
        doppies: run.doppies,
        charms: [...run.charms],
        offers: (run.padstal?.offers ?? []).map(
          (o) => `${o.kind}:${o.id}:${o.price}:${o.bought ? 'sold' : 'open'}`,
        ),
        quota: info.quota,
      };
    }
  }

  private go(view: RunView, selected: number | null = null): void {
    this.scene.restart({ ...this.data_, view, selected } satisfies RunData);
  }

  private text(x: number, y: number, s: string, size: number, color = '#F3EAD3', maxW = 0) {
    const tx = this.add.text(x, y, s, textStyle(size, color)).setOrigin(0.5);
    if (maxW > 0) fitText(tx, maxW);
    return tx;
  }

  private button(
    items: MenuItem[],
    id: string,
    rect: Rect,
    label: string,
    kind: 'primary' | 'secondary' | 'locked',
    size: number,
    press: (pointerType: string) => void,
    enabled = true,
  ): void {
    drawButton(this, rect, label, enabled ? kind : 'locked', size);
    items.push({
      id,
      rect: () => rect,
      enabled: () => enabled,
      press: (pt) => {
        press(pt === 'keyboard' ? 'mouse' : pt);
      },
    });
  }

  // --- hunt card ----------------------------------------------------------------------------

  private intro(run: RunState, items: MenuItem[]): string {
    const p = this.panel;
    const info = this.ctx.run.info(run);
    const cx = p.x + p.w / 2;
    this.text(
      cx,
      p.y + 70,
      fill(t('run.hunt_of'), {
        season: tOr(`season.${info.season}`, info.season),
        n: info.huntInSeason + 1,
      }),
      56,
      '#FFD25A',
      p.w - 80,
    );
    this.text(
      cx,
      p.y + 150,
      tOr(`run.kind.${info.kind}`, info.kind),
      40,
      info.kind === 'boss' ? '#FF8A6A' : '#F3EAD3',
      p.w - 80,
    );
    if (info.kind === 'boss' && info.bossRule !== null) {
      const rule = this.ctx.content.run.bossRules[info.bossRule];
      if (rule !== undefined)
        this.text(cx, p.y + 210, tOr(rule.descriptionKey, info.bossRule), 34, '#FF8A6A', p.w - 80);
    }
    this.text(
      cx,
      p.y + 300,
      fill(t('run.quota'), { quota: formatScore(info.quota) }),
      72,
      '#F3EAD3',
      p.w - 80,
    );
    this.text(cx, p.y + 380, fill(t('run.doppies'), { n: run.doppies }), 36, '#FFD25A');
    this.ownedRow(run, items, { x: p.x + 40, y: p.y + 440, w: p.w - 80, h: 90 }, false, null);
    this.itemsLine(run, p.y + 590);
    const go: Rect = { x: cx - 260, y: p.y + p.h - 150, w: 520, h: 120 };
    const menu: Rect = { x: p.x + 40, y: p.y + p.h - 130, w: 260, h: 84 };
    this.button(items, 'run.go', go, t('run.go'), 'primary', 64, (pt) => {
      this.data_.hunt(pt);
    });
    this.button(items, 'run.menu', menu, t('run.menu'), 'secondary', 34, () => {
      this.data_.title();
    });
    return 'run.go';
  }

  // --- run tally ----------------------------------------------------------------------------

  private tally(run: RunState, items: MenuItem[]): string {
    const p = this.panel;
    const cx = p.x + p.w / 2;
    const last = run.history.at(-1);
    const passed = last?.passed === true;
    this.text(
      cx,
      p.y + 80,
      t(passed ? 'run.quota_met' : 'run.quota_missed'),
      72,
      passed ? '#7FD36A' : '#FF6B5A',
    );
    if (last !== undefined) {
      this.text(
        cx,
        p.y + 170,
        fill(t('run.score_vs'), { score: formatScore(last.score), quota: formatScore(last.quota) }),
        48,
      );
    }
    const pay = last?.doppies ?? null;
    if (pay !== null) {
      const rows: [string, number][] = [
        [t('run.pay.base'), pay.base],
        [t('run.pay.over'), pay.overQuota],
        [t('run.pay.interest'), pay.interest],
        [t('run.pay.boss'), pay.boss],
        [t('run.pay.found'), pay.found],
      ];
      rows.forEach(([label, n], i) => {
        const y = p.y + 260 + i * 56;
        this.add.text(p.x + 200, y, label, textStyle(36)).setOrigin(0, 0.5);
        this.add.text(p.x + p.w - 200, y, `+${n}`, textStyle(36)).setOrigin(1, 0.5);
      });
      const y = p.y + 260 + rows.length * 56 + 20;
      this.add.text(p.x + 200, y, t('run.pay.total'), textStyle(40, '#FFD25A')).setOrigin(0, 0.5);
      this.add
        .text(p.x + p.w - 200, y, `+${pay.total}  →  ${run.doppies}`, textStyle(40, '#FFD25A'))
        .setOrigin(1, 0.5);
    }
    const next: Rect = { x: cx - 300, y: p.y + p.h - 150, w: 600, h: 112 };
    this.rewardedButton(run, items, { x: cx - 300, y: next.y - 108, w: 600, h: 88 });
    if (run.phase === 'tally') {
      this.button(items, 'run.padstal', next, t('run.to_padstal'), 'primary', 52, () => {
        this.ctx.run.openPadstal();
        this.go('padstal');
      });
      return 'run.padstal';
    }
    this.button(items, 'run.summary', next, t('run.to_summary'), 'primary', 52, () => {
      this.go('summary');
    });
    return 'run.summary';
  }

  /**
   * M9 rewarded ads (GDD §19), shown only when the portal can play one: "Oupa se tweede kans"
   * on a lost run (replay the lost hunt) and "double Doppies" on a paid tally. The label says it
   * is an ad before the player taps (Poki rule).
   */
  private rewardedButton(run: RunState, items: MenuItem[], rect: Rect): void {
    if (!this.ctx.ads.rewardedAvailable()) return;
    const flow = this.ctx.run;
    const pay = run.history.at(-1)?.doppies?.total ?? 0;
    const offer: { id: string; label: string; kind: 'retry' | 'doppies' } | null =
      run.phase === 'defeat' && flow.canRetry()
        ? { id: 'run.retryAd', label: t('run.ad_retry'), kind: 'retry' as const }
        : run.phase === 'tally' && flow.canDouble()
          ? { id: 'run.doubleAd', label: fill(t('run.ad_double'), { n: pay }), kind: 'doppies' }
          : null;
    if (offer === null) return;
    if (offer.kind === 'retry')
      this.text(rect.x + rect.w / 2, rect.y - 34, t('run.ad_retry_title'), 34, '#FFD25A', rect.w);
    let busy = false;
    this.button(items, offer.id, rect, offer.label, 'secondary', 34, () => {
      if (busy) return;
      busy = true;
      void this.ctx.ads.rewarded(offer.kind).then((granted) => {
        if (!this.sys.isActive()) return;
        if (!granted) {
          this.text(rect.x + rect.w / 2, rect.y - 80, t('run.ad_none'), 28, '#FFD25A', rect.w);
          return;
        }
        if (offer.kind === 'retry') {
          if (flow.retry() !== null) this.go('intro');
        } else if (flow.doubleDoppies() !== null) this.go('tally');
      });
    });
  }

  // --- Padstal ------------------------------------------------------------------------------

  private padstal(run: RunState, items: MenuItem[]): string {
    const p = this.panel;
    const cx = p.x + p.w / 2;
    this.text(p.x + 220, p.y + 60, t('run.padstal'), 60, '#FFD25A');
    this.text(p.x + p.w - 220, p.y + 60, fill(t('run.doppies'), { n: run.doppies }), 44, '#FFD25A');
    const offers = run.padstal?.offers ?? [];
    const slots = this.ctx.content.charms.slots;
    const cardW = Math.min(300, (p.w - 80 - (offers.length - 1) * 20) / Math.max(1, offers.length));
    const rects = slotRects(
      { x: p.x + 40, y: p.y + 120, w: p.w - 80, h: 250 },
      offers.length,
      cardW,
      20,
    );
    offers.forEach((o, i) => {
      const r = rects[i];
      if (r === undefined) return;
      const can = this.canBuy(run, o, slots);
      this.offerCard(o, r, can);
      items.push({
        id: `run.offer.${i}`,
        rect: () => r,
        enabled: () => can,
        press: () => {
          if (this.ctx.run.buy(i).ok) this.go('padstal');
        },
      });
    });
    const sel = this.data_.selected ?? null;
    this.ownedRow(run, items, { x: p.x + 40, y: p.y + 420, w: p.w - 80, h: 90 }, true, sel);
    this.itemsLine(run, p.y + 560);
    this.text(cx, p.y + 620, t('run.drag_hint'), 26, '#D8CFB8', p.w - 80);

    const by = p.y + p.h - 140;
    const reroll: Rect = { x: p.x + 40, y: by + 10, w: 340, h: 96 };
    const next: Rect = { x: p.x + p.w - 460, y: by, w: 420, h: 112 };
    const cost = rerollCost(this.ctx.content, run);
    this.button(
      items,
      'run.reroll',
      reroll,
      fill(t('run.reroll'), { n: cost }),
      'secondary',
      36,
      () => {
        if (this.ctx.run.reroll().ok) this.go('padstal');
      },
      run.doppies >= cost,
    );
    const charmId = sel === null ? undefined : run.charms[sel];
    if (sel !== null && charmId !== undefined) {
      const sell: Rect = { x: cx - 170, y: by + 10, w: 340, h: 96 };
      this.button(
        items,
        'run.sell',
        sell,
        fill(t('run.sell'), { n: sellPrice(this.ctx.content, charmId) }),
        'secondary',
        36,
        () => {
          if (this.ctx.run.sell(sel).ok) this.go('padstal');
        },
      );
    }
    this.button(items, 'run.next', next, t('run.next'), 'primary', 48, () => {
      this.ctx.run.leavePadstal();
      this.go('intro');
    });
    return 'run.next';
  }

  private canBuy(run: RunState, o: ShopOffer, slots: number): boolean {
    if (o.bought || run.doppies < o.price) return false;
    if (o.kind === 'charm') return run.charms.length < slots;
    if (o.kind === 'consumable') return run.consumables.includes(null);
    return run.rental === null;
  }

  private offerCard(o: ShopOffer, r: Rect, can: boolean): void {
    if (o.kind === 'charm') {
      const card = drawCharmCard(this, this.ctx.content, r, o.id, { detail: true });
      if (!can) card.setAlpha(0.45);
    } else {
      const g = this.add.graphics();
      g.fillStyle(UI.ink, 1).fillRoundedRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8, 18);
      g.fillStyle(o.kind === 'weapon' ? 0xb9783f : 0xe0c27a, 1).fillRoundedRect(
        r.x,
        r.y,
        r.w,
        r.h,
        14,
      );
      if (!can) g.setAlpha(0.45);
      this.text(
        r.x + r.w / 2,
        r.y + 50,
        tOr(`item.${o.id}`, o.id),
        30,
        '#1B1410',
        r.w - 20,
      ).setAlpha(can ? 1 : 0.45);
      this.text(
        r.x + r.w / 2,
        r.y + 100,
        t(o.kind === 'weapon' ? 'run.offer.weapon' : 'run.offer.consumable'),
        22,
        '#1B1410',
        r.w - 20,
      ).setAlpha(can ? 1 : 0.45);
    }
    const c = this.ctx.content.charms.charms.find((x) => x.id === o.id);
    const rarity = c === undefined ? null : tOr(`rarity.${c.rarity}`, c.rarity);
    const label = o.bought ? t('run.sold_out') : fill(t('run.doppies'), { n: o.price });
    this.text(
      r.x + r.w / 2,
      r.y + r.h - 30,
      rarity === null ? label : `${rarity} · ${label}`,
      24,
      '#1B1410',
      r.w - 20,
    ).setAlpha(can || o.bought ? 1 : 0.6);
    if (c !== undefined) {
      const g = this.add.graphics();
      g.fillStyle(RARITY_COLOR[c.rarity] ?? UI.enamel, 1).fillCircle(r.x + 18, r.y + 18, 8);
    }
  }

  /** Owned charms: a draggable row (reorder), with tap-to-select in the Padstal (sell). */
  private ownedRow(
    run: RunState,
    items: MenuItem[],
    area: Rect,
    selectable: boolean,
    selected: number | null,
  ): void {
    if (run.charms.length === 0) {
      this.text(
        area.x + area.w / 2,
        area.y + area.h / 2,
        t('run.no_charms'),
        30,
        '#D8CFB8',
        area.w,
      );
      return;
    }
    const view = this.data_.view;
    items.push(
      ...charmRow(this, {
        content: this.ctx.content,
        charms: run.charms,
        area,
        cardW: Math.min(260, (area.w - 4 * 16) / Math.max(5, run.charms.length)),
        selected,
        idPrefix: 'run.charm',
        reorder: (order) => {
          if (this.ctx.run.reorder(order).ok) this.go(view, null);
        },
        ...(selectable
          ? {
              select: (slot: number) => {
                this.go(view, selected === slot ? null : slot);
              },
            }
          : {}),
      }),
    );
  }

  /** Consumables and the rental, one line. */
  private itemsLine(run: RunState, y: number): void {
    const p = this.panel;
    const cons = run.consumables.map((c) => (c === null ? '—' : tOr(`item.${c}`, c))).join('  ·  ');
    const rental =
      run.rental === null
        ? t('run.rental_none')
        : fill(t('run.rental'), { weapon: tOr(`item.${run.rental}`, run.rental) });
    this.text(p.x + p.w / 2, y, `${cons}   |   ${rental}`, 30, '#F3EAD3', p.w - 80);
  }

  // --- summary ------------------------------------------------------------------------------

  private summary(run: RunState, items: MenuItem[]): string {
    const p = this.panel;
    const cx = p.x + p.w / 2;
    const won = run.phase === 'victory';
    this.text(
      cx,
      p.y + 90,
      t(won ? 'run.victory' : 'run.defeat'),
      72,
      won ? '#FFD25A' : '#FF8A6A',
      p.w - 80,
    );
    const cleared = run.history.filter((h) => h.passed).length;
    const total = run.history.reduce((s, h) => s + h.score, 0);
    this.text(cx, p.y + 200, fill(t('run.cleared'), { n: cleared }), 44);
    this.text(cx, p.y + 270, fill(t('run.total'), { score: formatScore(total) }), 40);
    const stats = this.ctx.save.data.runStats;
    this.text(
      cx,
      p.y + 340,
      fill(t('title.run_record'), { won: stats.won, hunts: stats.bestHunts }),
      30,
      '#D8CFB8',
    );
    if (run.charms.length > 0) {
      const rects = slotRects(
        { x: p.x + 40, y: p.y + 410, w: p.w - 80, h: 90 },
        run.charms.length,
        240,
        16,
      );
      run.charms.forEach((id, i) => {
        const r = rects[i];
        if (r !== undefined) drawCharmCard(this, this.ctx.content, r, id);
      });
    }
    const again: Rect = { x: cx - 280, y: p.y + p.h - 150, w: 560, h: 112 };
    const menu: Rect = { x: p.x + 40, y: p.y + p.h - 130, w: 260, h: 84 };
    this.button(items, 'run.new', again, t('run.new_run'), 'primary', 52, () => {
      this.data_.newRun();
      this.go('intro');
    });
    this.button(items, 'run.menu', menu, t('run.menu'), 'secondary', 34, () => {
      this.data_.title();
    });
    return 'run.new';
  }
}
