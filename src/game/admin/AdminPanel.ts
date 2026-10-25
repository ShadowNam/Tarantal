// v1.2x (D-034) playtest admin page: a DOM panel over the canvas (native lists, selects, a notes
// box and touch scrolling work out of the box there). The list page shows every playable map with
// its review; the play page (after [Play] reloaded the game) is one card with [Play] and [Back].
// Text goes through i18n keys. Mouse and touch, phone landscape included.
import type { ContentBundle } from '../../content/schemas';
import { fill, t, tOr, type I18nKey } from '../../i18n/i18n';
import {
  adminReport,
  issueUrl,
  reviewOf,
  withReview,
  type AdminEntry,
  type AdminOptions,
  type AdminSave,
  type ReportContext,
  type ReviewStatus,
} from '../../meta/admin';
import type { AdminContext } from './AdminContext';
import { entryFacts, entryLabel, gunLabel, groupLabel } from './adminLabels';

const STYLE_ID = 'tm-admin-style';
const ADMIN_CSS = `
#tm-admin{position:fixed;inset:0;z-index:20;display:flex;flex-direction:column;
  background:rgba(27,20,16,.95);color:#F3EAD3;font:15px/1.35 'Baloo 2',system-ui,sans-serif;
  padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom)
  env(safe-area-inset-left);box-sizing:border-box}
#tm-admin[hidden]{display:none}
#tm-admin *{box-sizing:border-box}
#tm-admin header{display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid #5a4632;flex-wrap:wrap}
#tm-admin h1{font-size:20px;margin:0;color:#FFD25A}
#tm-admin .muted{color:#C9BFA6;font-size:13px}
#tm-admin .grow{flex:1}
#tm-admin .cols{flex:1;display:flex;min-height:0}
#tm-admin .list{width:38%;min-width:220px;overflow-y:auto;touch-action:pan-y;border-right:1px solid #5a4632;-webkit-overflow-scrolling:touch}
#tm-admin .detail{flex:1;overflow-y:auto;touch-action:pan-y;padding:10px 14px;-webkit-overflow-scrolling:touch}
#tm-admin .group{position:sticky;top:0;background:#2b211a;color:#FFD25A;padding:4px 10px;font-weight:700;font-size:13px}
#tm-admin .item{display:flex;align-items:center;gap:8px;width:100%;min-height:40px;padding:6px 10px;
  background:none;border:0;border-bottom:1px solid #3a2e24;color:inherit;font:inherit;text-align:left;cursor:pointer}
#tm-admin .item[aria-selected=true]{background:#4a3a2a}
#tm-admin .dot{width:12px;height:12px;border-radius:50%;border:2px solid #C9BFA6;flex:none}
#tm-admin .dot.ok{background:#6fbf5a;border-color:#6fbf5a}
#tm-admin .dot.work{background:#e58a2e;border-color:#e58a2e}
#tm-admin .stars{color:#FFD25A;font-size:12px;margin-left:auto;white-space:nowrap}
#tm-admin h2{font-size:18px;margin:4px 0 8px;color:#FFD25A}
#tm-admin h3{font-size:15px;margin:12px 0 6px;color:#FFD25A}
#tm-admin .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px 12px}
#tm-admin label{display:flex;flex-direction:column;gap:2px;font-size:13px;color:#C9BFA6}
#tm-admin input,#tm-admin select,#tm-admin textarea{font:inherit;font-size:15px;color:#1b1410;background:#F3EAD3;
  border:1px solid #8a7458;border-radius:6px;padding:6px 8px;min-height:40px;
  -webkit-user-select:text;user-select:text;touch-action:manipulation}
#tm-admin textarea{width:100%;min-height:96px;resize:vertical}
#tm-admin .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
#tm-admin button.btn{font:inherit;font-weight:700;min-height:44px;min-width:44px;padding:6px 14px;border-radius:8px;
  border:2px solid #8a7458;background:#3a2e24;color:#F3EAD3;cursor:pointer;touch-action:manipulation}
#tm-admin button.btn.primary{background:#d9a21b;border-color:#FFD25A;color:#1b1410;font-size:18px;padding:6px 28px}
#tm-admin button.btn[aria-pressed=true]{background:#F3EAD3;color:#1b1410}
#tm-admin button.btn.project{border-color:#FFD25A;color:#FFD25A}
#tm-admin .star{font-size:22px;min-width:44px;padding:0 4px}
#tm-admin .toast{color:#FFD25A;font-size:13px}
#tm-admin .card{margin:auto;max-width:640px;width:calc(100% - 32px);background:#2b211a;border:2px solid #8a7458;border-radius:14px;padding:18px;text-align:center}
#tm-admin .card .row{justify-content:center;margin-top:14px}
#tm-admin .mt{margin-top:10px}
@media (max-height:500px){#tm-admin{font-size:14px}#tm-admin h1{font-size:17px}#tm-admin header{padding:4px 10px}}
`;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { dataset?: Record<string, string> } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  const { dataset, ...rest } = props;
  Object.assign(e, rest);
  if (dataset !== undefined) for (const [k, v] of Object.entries(dataset)) e.dataset[k] = v;
  e.append(...children);
  return e;
}

function button(
  text: string,
  action: string,
  onClick: (e: MouseEvent) => void,
  cls = 'btn',
): HTMLButtonElement {
  const b = el('button', {
    type: 'button',
    className: cls,
    textContent: text,
    dataset: { action },
  });
  b.addEventListener('click', onClick);
  return b;
}

/** Copies text with the clipboard API; false when it is blocked (the panel then shows the text). */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export interface AdminPanelHooks {
  /** The list or play page changed (e2e hook). */
  readonly onView?: (view: 'list' | 'play', selected: string | null) => void;
  /** v1.3x (D-037): the Skietbaan button (the training ground; its code loads on demand). */
  readonly onRange?: () => void;
  /** D-045: the Project overview button (its code loads on demand; the web build's page only). */
  readonly onProject?: () => void;
}

export class AdminPanel {
  private readonly root: HTMLElement;
  private save: AdminSave;

  constructor(
    private readonly admin: AdminContext,
    private readonly content: ContentBundle,
    private readonly where: () => ReportContext,
    private readonly hooks: AdminPanelHooks = {},
  ) {
    if (document.getElementById(STYLE_ID) === null)
      document.head.appendChild(el('style', { id: STYLE_ID, textContent: ADMIN_CSS }));
    this.root = el('div', { id: 'tm-admin' });
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', t('admin.title'));
    // Keys typed in the notes box are not game keys.
    this.root.addEventListener('keydown', (e) => {
      e.stopPropagation();
    });
    document.body.appendChild(this.root);
    this.save = admin.load();
  }

  destroy(): void {
    this.root.remove();
  }

  /** D-045: hidden under the Project overview; shown again on its Back (focus on its button). */
  setHidden(hidden: boolean): void {
    this.root.hidden = hidden;
    if (!hidden)
      this.root.querySelector<HTMLElement>('[data-action=project]')?.focus({ preventScroll: true });
  }

  private update(fn: (s: AdminSave) => AdminSave): void {
    this.save = fn(this.save);
    this.admin.store(this.save);
  }

  private selected(): AdminEntry {
    const list = this.admin.entries;
    // An empty list cannot happen: there is always the Daily (adminEntries).
    const first = list[0] as AdminEntry;
    return list.find((e) => e.id === this.save.selected) ?? first;
  }

  // --- list page ------------------------------------------------------------------------------

  showList(): void {
    this.root.replaceChildren();
    const reviewed = this.admin.entries.filter(
      (e) => reviewOf(this.save, e.id).status !== 'none',
    ).length;
    const toast = el('span', { className: 'toast', dataset: { role: 'toast' } });
    const header = el(
      'header',
      {},
      el('h1', { textContent: t('admin.title') }),
      el('span', {
        className: 'muted',
        dataset: { role: 'progress' },
        textContent: fill(t('admin.reviewed'), {
          n: reviewed,
          total: this.admin.entries.length,
        }),
      }),
      el('span', {
        className: 'muted grow',
        dataset: { role: 'stamp' },
        textContent: `${t('admin.unranked')} · ${this.admin.build}`,
      }),
      toast,
      ...(this.hooks.onProject === undefined
        ? []
        : [
            button(
              t('admin.project'),
              'project',
              () => {
                this.hooks.onProject?.();
              },
              'btn project',
            ),
          ]),
      ...(this.hooks.onRange === undefined
        ? []
        : [
            button(t('admin.range'), 'skietbaan', () => {
              this.destroy();
              this.hooks.onRange?.();
            }),
          ]),
      button(t('admin.copy'), 'copy-report', () => {
        void this.copyReport(toast);
      }),
    );
    const list = el('div', { className: 'list', dataset: { role: 'list' } });
    list.setAttribute('role', 'listbox');
    const detail = el('div', { className: 'detail' });
    let group = '';
    const sel = this.selected();
    for (const e of this.admin.entries) {
      const g = groupLabel(e, this.content);
      if (g !== group) {
        group = g;
        list.appendChild(el('div', { className: 'group', textContent: g }));
      }
      const r = reviewOf(this.save, e.id);
      const item = button(
        '',
        'select',
        () => {
          this.update((s) => ({ ...s, selected: e.id }));
          for (const n of list.querySelectorAll('[aria-selected]'))
            n.setAttribute('aria-selected', String(n === item));
          this.fillDetail(detail, e);
        },
        'item',
      );
      item.dataset['entry'] = e.id;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(e.id === sel.id));
      item.append(
        el('span', { className: `dot ${r.status}`, dataset: { role: 'status' } }),
        el('span', { textContent: entryLabel(e, this.content) }),
        el('span', { className: 'stars', textContent: r.rating > 0 ? '★'.repeat(r.rating) : '' }),
      );
      list.appendChild(item);
    }
    this.root.append(header, el('div', { className: 'cols' }, list, detail));
    this.fillDetail(detail, sel);
    list.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'center' });
    this.hooks.onView?.('list', sel.id);
  }

  /** Refreshes the list row of an entry (status dot, stars) and the reviewed count. */
  private refreshRow(e: AdminEntry): void {
    const r = reviewOf(this.save, e.id);
    const row = this.root.querySelector(`[data-entry="${CSS.escape(e.id)}"]`);
    const dot = row?.querySelector('.dot');
    if (dot) dot.className = `dot ${r.status}`;
    const stars = row?.querySelector('.stars');
    if (stars) stars.textContent = r.rating > 0 ? '★'.repeat(r.rating) : '';
    const n = this.admin.entries.filter((x) => reviewOf(this.save, x.id).status !== 'none').length;
    const p = this.root.querySelector('[data-role=progress]');
    if (p) p.textContent = fill(t('admin.reviewed'), { n, total: this.admin.entries.length });
  }

  private fillDetail(detail: HTMLElement, e: AdminEntry): void {
    detail.replaceChildren();
    detail.dataset['entry'] = e.id;
    detail.append(
      el('h2', { textContent: entryLabel(e, this.content) }),
      el('div', { className: 'muted', textContent: e.id }),
    );

    // Options (shared by every entry, kept in the admin save).
    const o = this.save.options;
    const setOpt = (patch: Partial<AdminOptions>): void => {
      this.update((s) => ({ ...s, options: { ...s.options, ...patch } }));
    };
    const select = (
      key: string,
      label: I18nKey,
      values: readonly [string, string][],
      value: string,
      onChange: (v: string) => void,
    ): HTMLLabelElement => {
      const s = el('select', { name: key });
      for (const [v, text] of values) s.appendChild(el('option', { value: v, textContent: text }));
      s.value = value;
      s.addEventListener('change', () => {
        onChange(s.value);
      });
      return el('label', {}, t(label), s);
    };
    const weapons = this.content.weapons.weapons;
    const events = [...new Set(this.content.biomes.flatMap((b) => b.events.map((x) => x.id)))];
    const seed = el('input', {
      name: 'seed',
      type: 'text',
      inputMode: 'numeric',
      placeholder: t('admin.seed_random'),
      value: o.seed === null ? '' : String(o.seed),
    });
    seed.addEventListener('change', () => {
      const v = Number(seed.value.trim());
      const ok = seed.value.trim() !== '' && Number.isInteger(v) && v >= 0 && v <= 0xffffffff;
      if (!ok) seed.value = '';
      setOpt({ seed: ok ? v : null });
    });
    const quota = el('input', {
      name: 'quotaMul',
      type: 'number',
      min: '0',
      max: '10',
      step: '0.1',
      value: String(o.quotaMul),
    });
    quota.addEventListener('change', () => {
      const v = Number(quota.value);
      const ok = Number.isFinite(v) && v >= 0 && v <= 10;
      if (!ok) quota.value = '1';
      setOpt({ quotaMul: ok ? v : 1 });
    });
    const date = el('input', { name: 'date', type: 'date', value: o.date ?? '' });
    date.addEventListener('change', () => {
      setOpt({ date: /^\d{4}-\d{2}-\d{2}$/.test(date.value) ? date.value : null });
    });
    const lengths = [15, 30, 45, 60, 90, 120];
    detail.append(
      el('h3', { textContent: t('admin.options') }),
      el(
        'div',
        { className: 'grid' },
        select(
          'weapon',
          'admin.gun',
          [
            ['', t('admin.gun_default')],
            ...weapons.map((w): [string, string] => [w.id, gunLabel(this.content, w.id)]),
          ],
          o.weapon ?? '',
          (v) => {
            setOpt({ weapon: v === '' ? null : v });
          },
        ),
        // v1.3: the sight on a rifle (ignored for guns without sights).
        select(
          'sight',
          'admin.sight',
          [
            ['', t('admin.sight_default')],
            ...this.content.weapons.sights.map((x): [string, string] => [
              x.id,
              tOr(x.nameKey, x.id),
            ]),
          ],
          o.sight ?? '',
          (v) => {
            setOpt({ sight: v === '' ? null : v });
          },
        ),
        el('label', {}, t('admin.seed'), seed),
        select(
          'huntSeconds',
          'admin.length',
          [
            ['', t('admin.length_default')],
            ...lengths.map((s): [string, string] => [String(s), `${String(s)} s`]),
          ],
          o.huntSeconds === null ? '' : String(o.huntSeconds),
          (v) => {
            setOpt({ huntSeconds: v === '' ? null : Number(v) });
          },
        ),
        select(
          'omen',
          'admin.omen',
          [
            ['default', t('admin.omen_default')],
            ['on', t('admin.omen_on')],
            ['off', t('admin.omen_off')],
          ],
          o.omen,
          (v) => {
            setOpt({ omen: v === 'on' || v === 'off' ? v : 'default' });
          },
        ),
        select(
          'event',
          'admin.event',
          [['', t('admin.event_none')], ...events.map((x): [string, string] => [x, x])],
          o.event ?? '',
          (v) => {
            setOpt({ event: v === '' ? null : v });
          },
        ),
        el('label', {}, t('admin.quota'), quota),
        ...(e.kind === 'daily' ? [el('label', {}, t('admin.date'), date)] : []),
      ),
      el(
        'div',
        { className: 'row mt' },
        button(
          t('admin.play'),
          'play',
          () => {
            this.update((s) => ({
              ...s,
              selected: e.id,
              play: { entry: e.id, options: s.options },
            }));
            this.admin.playStored();
          },
          'btn primary',
        ),
      ),
    );

    // Review.
    const r = reviewOf(this.save, e.id);
    const statusRow = el('div', { className: 'row' });
    const statuses: [ReviewStatus, I18nKey][] = [
      ['none', 'admin.status_none'],
      ['ok', 'admin.status_ok'],
      ['work', 'admin.status_work'],
    ];
    const statusBtns = statuses.map(([st, key]) => {
      const b = button(t(key), `status-${st}`, () => {
        this.update((s) => withReview(s, e.id, { status: st }));
        for (const x of statusBtns) x.setAttribute('aria-pressed', String(x === b));
        this.refreshRow(e);
      });
      b.setAttribute('aria-pressed', String(r.status === st));
      return b;
    });
    statusRow.append(...statusBtns);
    const starRow = el('div', { className: 'row' });
    const paint = (n: number): void => {
      starBtns.forEach((b, i) => {
        b.textContent = i < n ? '★' : '☆';
        b.setAttribute('aria-pressed', String(i + 1 === n));
      });
    };
    const starBtns = [1, 2, 3, 4, 5].map((n) => {
      const b = button(
        '☆',
        `rate-${String(n)}`,
        () => {
          // Tapping the current rating again clears it.
          const now = reviewOf(this.save, e.id).rating === n ? 0 : n;
          this.update((s) => withReview(s, e.id, { rating: now }));
          paint(now);
          this.refreshRow(e);
        },
        'btn star',
      );
      b.setAttribute('aria-label', `${t('admin.rating')} ${String(n)}`);
      return b;
    });
    starRow.append(el('span', { className: 'muted', textContent: t('admin.rating') }), ...starBtns);
    paint(r.rating);
    const notes = el('textarea', {
      name: 'notes',
      placeholder: t('admin.notes_hint'),
      value: r.notes,
      maxLength: 4000,
    });
    notes.addEventListener('input', () => {
      this.update((s) => withReview(s, e.id, { notes: notes.value }));
      this.refreshRow(e);
    });
    const toast = el('span', { className: 'toast' });
    detail.append(
      el('h3', { textContent: t('admin.review') }),
      statusRow,
      starRow,
      el('label', { className: 'mt' }, t('admin.notes'), notes),
      el(
        'div',
        { className: 'row mt' },
        button(t('admin.send'), 'send-github', () => {
          const facts = entryFacts(e, this.content, this.save.options, this.save.played[e.id]);
          const url = issueUrl(facts, reviewOf(this.save, e.id), this.where());
          window.open(url, '_blank', 'noopener');
        }),
        toast,
      ),
    );
  }

  private async copyReport(toast: HTMLElement): Promise<void> {
    const facts = this.admin.entries.map((e) =>
      entryFacts(e, this.content, this.save.options, this.save.played[e.id]),
    );
    const md = adminReport(this.save, facts, this.where());
    const ok = await copyText(md);
    toast.textContent = ok ? t('admin.copied') : t('admin.copy_failed');
    toast.dataset['report'] = md;
    if (!ok) {
      // Shown for a manual copy (some embeds block the clipboard).
      const pre = el('textarea', { value: md, readOnly: true });
      pre.style.width = '100%';
      this.root.querySelector('.detail')?.prepend(pre);
      pre.select();
    }
  }

  // --- play page ------------------------------------------------------------------------------

  /** The card after [Play] reloaded the page: [Play] (a tap, so audio may start) or [Back]. */
  showPlay(entry: AdminEntry, start: (pointerType: string) => void): void {
    this.root.replaceChildren();
    const o = this.save.play?.options ?? this.save.options;
    const facts = [
      `${t('admin.gun')}: ${o.weapon === null ? t('admin.gun_default') : gunLabel(this.content, o.weapon)}`,
      `${t('admin.seed')}: ${o.seed === null ? t('admin.seed_random') : String(o.seed)}`,
      `${t('admin.length')}: ${o.huntSeconds === null ? t('admin.length_default') : `${String(o.huntSeconds)} s`}`,
      `${t('admin.omen')}: ${t(o.omen === 'on' ? 'admin.omen_on' : o.omen === 'off' ? 'admin.omen_off' : 'admin.omen_default')}`,
      ...(o.event === null ? [] : [`${t('admin.event')}: ${o.event}`]),
      ...(o.quotaMul === 1 ? [] : [`${t('admin.quota')} ${String(o.quotaMul)}`]),
      ...(entry.kind === 'daily' && o.date !== null ? [`${t('admin.date')}: ${o.date}`] : []),
    ];
    let pressed = false;
    const play = button(
      t('admin.play'),
      'start',
      (ev) => {
        if (pressed) return;
        pressed = true;
        const type = ev instanceof PointerEvent && ev.pointerType !== '' ? ev.pointerType : 'mouse';
        this.destroy();
        start(type);
      },
      'btn primary',
    );
    this.root.append(
      el(
        'div',
        { className: 'card' },
        el('h1', {
          textContent: fill(t('admin.play_card'), { map: entryLabel(entry, this.content) }),
        }),
        el('p', { className: 'muted', textContent: facts.join(' · ') }),
        el('p', { className: 'muted', textContent: t('admin.unranked') }),
        el(
          'div',
          { className: 'row' },
          play,
          button(t('admin.back'), 'back', () => {
            this.admin.back();
          }),
        ),
      ),
    );
    play.focus();
    this.hooks.onView?.('play', entry.id);
  }
}
