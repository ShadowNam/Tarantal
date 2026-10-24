// v1.3x (D-037) Skietbaan DOM: the setup page (gun, area, distance, target, the session's stats)
// over the live panorama, and the small stats bar over a running range. Like the admin page it is
// plain DOM (native buttons, touch scrolling), mouse and touch, phone landscape included; every
// string through i18n keys. Lives in the range's lazy chunk.
import type { ContentBundle } from '../../content/schemas';
import { fill } from '../../i18n/i18n';
import { rt, type RangeKey } from './rangeI18n';
import {
  isMixed,
  PLANE_CHOICES,
  pickPlane,
  pickTarget,
  reaches,
  rangeGuns,
  TARGET_CHOICES,
  type RangeChoice,
  type RangePlaneChoice,
  type RangeTargetChoice,
} from './rangeGuns';
import {
  biomeName,
  bodyNote,
  cellLines,
  centreText,
  dayName,
  distName,
  groupText,
  gunName,
  gunNameById,
  targetName,
} from './rangeReport';
import { hitRate, misses, pelletsPerShot, type RangeCell } from './rangeStats';

const STYLE_ID = 'tm-range-style';
const CSS = `
#tm-range{position:fixed;inset:0;z-index:20;display:flex;flex-direction:column;
  background:rgba(27,20,16,.93);color:#F3EAD3;font:15px/1.35 'Baloo 2',system-ui,sans-serif;
  padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom)
  env(safe-area-inset-left);box-sizing:border-box}
#tm-range *,#tm-range-bar *{box-sizing:border-box}
#tm-range header{display:flex;align-items:center;gap:10px;padding:6px 12px;border-bottom:1px solid #5a4632;flex-wrap:wrap}
#tm-range h1{font-size:20px;margin:0;color:#FFD25A}
#tm-range .muted,#tm-range-bar .muted{color:#C9BFA6;font-size:13px}
#tm-range .grow{flex:1}
#tm-range .cols{flex:1;display:flex;min-height:0;overflow-y:auto;touch-action:pan-y;-webkit-overflow-scrolling:touch;flex-wrap:wrap;align-content:flex-start}
#tm-range .choices{flex:1 1 380px;padding:6px 12px 12px}
#tm-range .stats{flex:1 1 320px;padding:6px 12px 12px;border-left:1px solid #5a4632}
#tm-range h3{font-size:14px;margin:8px 0 4px;color:#FFD25A}
#tm-range .chips{display:flex;flex-wrap:wrap;gap:6px}
#tm-range button.btn,#tm-range-bar button.btn{font:inherit;font-weight:700;min-height:44px;min-width:44px;padding:4px 12px;border-radius:8px;
  border:2px solid #8a7458;background:#3a2e24;color:#F3EAD3;cursor:pointer;touch-action:manipulation;line-height:1.1}
#tm-range button.btn[aria-pressed=true]{background:#F3EAD3;color:#1b1410;border-color:#FFD25A}
#tm-range button.btn:disabled{opacity:.55;cursor:not-allowed}
#tm-range button.btn small{display:block;font-size:11px;font-weight:400}
#tm-range button.btn.primary{background:#d9a21b;border-color:#FFD25A;color:#1b1410;font-size:20px;padding:6px 36px}
#tm-range footer{flex:none;display:flex;align-items:center;gap:10px;padding:6px 12px;border-top:1px solid #5a4632;background:#2b211a}
#tm-range footer .pick{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#tm-range .row,#tm-range-bar .row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
#tm-range .table{overflow-x:auto;touch-action:pan-x pan-y;-webkit-overflow-scrolling:touch}
#tm-range table{border-collapse:collapse;width:100%;font-size:13px;margin-top:6px}
#tm-range th,#tm-range td{border-bottom:1px solid #3a2e24;padding:3px 4px;text-align:left;vertical-align:top}
#tm-range th{color:#C9BFA6;font-weight:600}
#tm-range td.n{text-align:right;white-space:nowrap}
#tm-range .toast,#tm-range-bar .toast{color:#FFD25A;font-size:13px}
#tm-range textarea{width:100%;min-height:120px;font:12px/1.3 monospace;color:#1b1410;background:#F3EAD3;border-radius:6px;-webkit-user-select:text;user-select:text}
#tm-range-bar{position:fixed;z-index:15;left:calc(env(safe-area-inset-left) + 8px);top:calc(env(safe-area-inset-top) + 8px);
  max-width:min(440px,40vw);background:rgba(27,20,16,.82);color:#F3EAD3;border:2px solid #8a7458;border-radius:10px;
  padding:6px 8px;font:13px/1.3 'Baloo 2',system-ui,sans-serif;pointer-events:none;touch-action:manipulation}
#tm-range-bar button{pointer-events:auto}
#tm-range-bar [data-action=more]{display:none}
#tm-range-bar b{color:#FFD25A}
#tm-range-bar .lines{margin:2px 0 4px;transform-origin:left center}
#tm-range-bar .lines.pulse{animation:tm-range-pulse .35s ease-out}
@keyframes tm-range-pulse{0%{transform:scale(1.08);color:#FFD25A}100%{transform:scale(1)}}
#tm-range-bar button.btn{min-height:40px;font-size:13px;padding:2px 8px}
@media (max-height:500px){#tm-range{font-size:14px}#tm-range h1{font-size:17px}#tm-range header{padding:2px 10px}
  #tm-range h3{margin:4px 0 2px}#tm-range button.btn{min-height:40px;padding:2px 8px}
  #tm-range button.btn.primary{font-size:17px}#tm-range footer{padding:3px 10px}#tm-range-bar{font-size:11.5px;padding:4px 6px}
  #tm-range-bar button.btn{min-height:36px}#tm-range-bar .note{display:none}
  #tm-range-bar .lines{margin:1px 0 2px}
  #tm-range-bar:not(.open){max-width:min(300px,34vw)}
  #tm-range-bar:not(.open) b,#tm-range-bar:not(.open) .lines>div{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #tm-range-bar:not(.open) .lines>div:not(:first-child):not(.cell+div),#tm-range-bar:not(.open) .full{display:none}
  #tm-range-bar [data-action=more]{display:inline-block}}
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
  dataset: Record<string, string>,
  onClick: (e: MouseEvent) => void,
  cls = 'btn',
): HTMLButtonElement {
  const b = el('button', { type: 'button', className: cls, textContent: text, dataset });
  b.addEventListener('click', onClick);
  return b;
}

/** Copies text with the clipboard API; false when it is blocked (the text is then shown). */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const one = (n: number): string => n.toFixed(1);

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID) === null)
    document.head.appendChild(el('style', { id: STYLE_ID, textContent: CSS }));
}

/** Keys pressed in the panel are not game keys. */
function stopKeys(root: HTMLElement): void {
  root.addEventListener('keydown', (e) => {
    e.stopPropagation();
  });
}

export interface SetupHandlers {
  readonly choice: RangeChoice;
  /** Biomes this build draws. */
  readonly biomes: readonly string[];
  /** Today's weekday layout id (the light the range plays). */
  readonly layout: string;
  readonly cells: () => readonly RangeCell[];
  readonly change: (c: RangeChoice) => void;
  readonly start: (pointerType: string) => void;
  readonly back: () => void;
  readonly reset: () => void;
  readonly report: () => string;
}

/** The setup page. */
export class RangeSetupPanel {
  private readonly root: HTMLElement;
  private choice: RangeChoice;

  constructor(
    private readonly content: ContentBundle,
    private readonly h: SetupHandlers,
  ) {
    ensureStyle();
    this.choice = h.choice;
    this.root = el('div', { id: 'tm-range' });
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', rt('range.title'));
    stopKeys(this.root);
    document.body.appendChild(this.root);
    this.render();
  }

  destroy(): void {
    this.root.remove();
  }

  private set(c: RangeChoice): void {
    // Every distance stays open for every gun (24 Oct): beyond its reach the shots fall short.
    this.choice = c;
    this.h.change(this.choice);
    this.render();
  }

  private chips<T extends string>(
    role: string,
    items: readonly T[],
    selected: T,
    label: (v: T) => string,
    pick: (v: T) => void,
    disabled: (v: T) => string | null = () => null,
  ): HTMLElement {
    const box = el('div', { className: 'chips', dataset: { role } });
    for (const v of items) {
      const why = disabled(v);
      const b = button(label(v), { action: role, value: v }, () => {
        pick(v);
      });
      b.setAttribute('aria-pressed', String(v === selected));
      if (why !== null) {
        b.disabled = true;
        b.append(el('small', { textContent: why }));
      }
      box.append(b);
    }
    return box;
  }

  private render(): void {
    // A tap re-renders the page: keep the scroll where it was (Distance and Target are below the
    // fold on a phone).
    const scrollTop = this.root.querySelector('.cols')?.scrollTop ?? 0;
    const c = this.choice;
    const guns = rangeGuns(this.content);
    const gun = guns.find((g) => g.id === c.gun);
    const toast = el('span', { className: 'toast', dataset: { role: 'toast' } });
    const fallback = el('textarea', { readOnly: true, dataset: { role: 'report-text' } });
    fallback.hidden = true;
    let pressed = false;
    const start = button(
      rt('range.start'),
      { action: 'start' },
      (ev) => {
        if (pressed) return;
        pressed = true;
        const type = ev instanceof PointerEvent && ev.pointerType !== '' ? ev.pointerType : 'mouse';
        this.h.start(type);
      },
      'btn primary',
    );
    const choices = el(
      'div',
      { className: 'choices' },
      el('h3', { textContent: rt('range.gun') }),
      this.chips(
        'gun',
        guns.map((g) => g.id),
        c.gun,
        (id) => {
          const g = guns.find((x) => x.id === id);
          return g === undefined ? id : gunName(g);
        },
        (gunId) => {
          this.set({ ...this.choice, gun: gunId });
        },
      ),
      el('h3', { textContent: rt('range.area') }),
      this.chips(
        'biome',
        this.h.biomes,
        c.biome,
        (b) => biomeName(this.content, b),
        (biome) => {
          this.set({ ...this.choice, biome });
        },
      ),
      el('div', {
        className: 'muted',
        textContent: fill(rt('range.light'), { day: dayName(this.h.layout) }),
      }),
      el('h3', { textContent: rt('range.distance') }),
      this.chips<RangePlaneChoice>('plane', PLANE_CHOICES, c.plane, distName, (plane) => {
        this.set(pickPlane(this.choice, plane));
      }),
      ...(gun !== undefined && !reaches(gun, c.plane)
        ? [
            el('div', {
              className: 'muted',
              dataset: { role: 'reach-note' },
              textContent: rt(isMixed(c) ? 'range.reach_note_mixed' : 'range.reach_note'),
            }),
          ]
        : []),
      el('h3', { textContent: rt('range.target') }),
      this.chips<RangeTargetChoice>('target', TARGET_CHOICES, c.target, targetName, (target) => {
        this.set(pickTarget(this.choice, target));
      }),
    );
    const stats = el(
      'div',
      { className: 'stats' },
      el(
        'div',
        { className: 'row' },
        el('h3', { textContent: rt('range.stats'), className: 'grow' }),
        toast,
        button(rt('range.reset'), { action: 'reset' }, () => {
          this.h.reset();
          this.render();
        }),
        button(rt('range.copy'), { action: 'copy-report' }, () => {
          void this.copy(toast, fallback);
        }),
      ),
      el('div', { className: 'table' }, this.table()),
      fallback,
    );
    const cols = el('div', { className: 'cols', dataset: { role: 'scroll' } }, choices, stats);
    this.root.replaceChildren(
      el(
        'header',
        {},
        el('h1', { textContent: rt('range.title') }),
        el('span', { className: 'muted grow', textContent: rt('range.subtitle') }),
        button(rt('range.back'), { action: 'back' }, () => {
          this.h.back();
        }),
      ),
      cols,
      // Start lives in a footer outside the scrolling area: always on screen, never over a choice.
      el(
        'footer',
        {},
        start,
        el('span', {
          className: 'muted pick',
          dataset: { role: 'pick' },
          textContent: `${gun === undefined ? c.gun : gunName(gun)} · ${biomeName(this.content, c.biome)} · ${distName(c.plane)} · ${targetName(c.target)}`,
        }),
      ),
    );
    cols.scrollTop = scrollTop;
  }

  private table(): HTMLElement {
    const cells = this.h.cells();
    if (cells.length === 0)
      return el('p', {
        className: 'muted',
        textContent: rt('range.none'),
        dataset: { role: 'stats' },
      });
    const head = (k: RangeKey): HTMLElement => el('th', { textContent: rt(k) });
    const table = el(
      'table',
      { dataset: { role: 'stats' } },
      el(
        'tr',
        {},
        head('range.col_gun'),
        head('range.col_dist'),
        head('range.col_target'),
        head('range.col_shots'),
        head('range.col_hits'),
        head('range.col_misses'),
        head('range.col_short'),
        head('range.col_rate'),
        head('range.col_pellets'),
        head('range.col_group'),
        head('range.col_centre'),
      ),
    );
    for (const cell of cells) {
      const n = (v: string): HTMLElement => el('td', { className: 'n', textContent: v });
      table.append(
        el(
          'tr',
          { dataset: { cell: `${cell.gun}|${cell.plane}|${cell.target}` } },
          el('td', { textContent: gunNameById(this.content, cell.gun) }),
          el('td', { textContent: distName(cell.plane) }),
          el('td', { textContent: targetName(cell.target) }),
          n(String(cell.shots)),
          n(String(cell.hits)),
          n(String(misses(cell))),
          n(String(cell.short)),
          n(one(hitRate(cell) * 100)),
          n(cell.pellets > 1 ? `${one(pelletsPerShot(cell))} / ${String(cell.pellets)}` : '–'),
          n(groupText(this.content, cell) ?? '–'),
          n(centreText(cell) ?? '–'),
        ),
      );
    }
    return table;
  }

  private async copy(toast: HTMLElement, fallback: HTMLTextAreaElement): Promise<void> {
    const text = this.h.report();
    const ok = await copyText(text);
    toast.textContent = rt(ok ? 'range.copied' : 'range.copy_failed');
    fallback.value = text;
    fallback.hidden = ok;
    if (!ok) fallback.select();
  }
}

export interface BarHandlers {
  readonly title: string;
  readonly setup: () => void;
  /** The mixed course only: re-rolls the layout with a new seed. */
  readonly shuffle?: () => void;
  readonly reset: () => void;
  readonly report: () => string;
}

/** The stats bar over a running range (top-left, where a hunt's clock would be). */
export class RangeBar {
  private readonly root: HTMLElement;
  private readonly lines: HTMLElement;
  private readonly toast: HTMLElement;
  private shown = '';
  /** Hit pulses so far (the test hook reads it). */
  pulses = 0;

  constructor(
    private readonly content: ContentBundle,
    h: BarHandlers,
  ) {
    ensureStyle();
    this.lines = el('div', { className: 'lines', dataset: { role: 'lines' } });
    this.toast = el('span', { className: 'toast' });
    // Short screens (phones in landscape) show the title, the shots line, Setup and More; More
    // opens the full stats with Reset and Copy (CSS: max-height 500px).
    const more = button(rt('range.more'), { action: 'more' }, () => {
      const open = this.root.classList.toggle('open');
      more.textContent = rt(open ? 'range.less' : 'range.more');
    });
    const full = (b: HTMLButtonElement): HTMLButtonElement => {
      b.classList.add('full');
      return b;
    };
    this.root = el(
      'div',
      { id: 'tm-range-bar' },
      el('b', { textContent: h.title }),
      this.lines,
      el(
        'div',
        { className: 'row' },
        button(rt('range.setup'), { action: 'setup' }, () => {
          h.setup();
        }),
        ...(h.shuffle === undefined
          ? []
          : [
              button(rt('range.shuffle'), { action: 'shuffle' }, () => {
                h.shuffle?.();
              }),
            ]),
        more,
        full(
          button(rt('range.reset'), { action: 'reset' }, () => {
            h.reset();
          }),
        ),
        full(
          button(rt('range.copy'), { action: 'copy-report' }, () => {
            void copyText(h.report()).then((ok) => {
              this.toast.textContent = rt(ok ? 'range.copied' : 'range.copy_failed');
            });
          }),
        ),
        this.toast,
      ),
    );
    stopKeys(this.root);
    // The bar's text lets taps through to the game (pointer-events: none); its buttons take
    // them, and a tap on a button never reaches the game (no shot, no pan).
    for (const b of this.root.querySelectorAll('button'))
      for (const type of ['pointerdown', 'pointerup', 'pointermove'] as const)
        b.addEventListener(type, (e) => {
          e.stopPropagation();
        });
    document.body.appendChild(this.root);
  }

  /** Shows the cell's stats (only touches the DOM when the text changed). */
  update(cell: RangeCell | null, mixed = false): void {
    const text =
      cell === null || cell.shots === 0
        ? [rt('range.none')]
        : [
            // The mixed course: which cell the newest shot went to.
            ...(mixed ? [`${distName(cell.plane)} · ${targetName(cell.target)}`] : []),
            ...cellLines(this.content, cell, false),
          ];
    // The body-width note is its own line (hidden on short screens: phones in landscape).
    const note = cell !== null && cell.impacts.length > 0 ? bodyNote(this.content, cell) : null;
    const key = `${text.join('\n')}\n${String(note)}`;
    if (key === this.shown) return;
    this.shown = key;
    // On the mixed course the first line names the cell; short screens keep it and the shots.
    const labelled = mixed && cell !== null && cell.shots > 0;
    this.lines.replaceChildren(
      ...text.map((l, i) =>
        el('div', { textContent: l, ...(labelled && i === 0 ? { className: 'cell' } : {}) }),
      ),
      ...(note === null ? [] : [el('div', { className: 'note muted', textContent: note })]),
    );
  }

  /** A hit: the stats lines pulse once (24 Oct update). */
  pulse(): void {
    this.pulses++;
    this.lines.classList.remove('pulse');
    // Restart the animation: read layout between removing and adding the class.
    void this.lines.getBoundingClientRect();
    this.lines.classList.add('pulse');
  }

  destroy(): void {
    this.root.remove();
  }
}
