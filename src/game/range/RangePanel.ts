// v1.3x (D-037) Skietbaan DOM: the setup page (gun, area, distance, target, the session's stats)
// over the live panorama, and the small stats bar over a running range. Like the admin page it is
// plain DOM (native buttons, touch scrolling), mouse and touch, phone landscape included; every
// string through i18n keys. Lives in the range's lazy chunk.
import type { ContentBundle } from '../../content/schemas';
import { fill } from '../../i18n/i18n';
import type { PlaneId, RangeTarget } from '../../sim/types';
import { rt, type RangeKey } from './rangeI18n';
import { RANGE_PLANES, RANGE_TARGETS, reaches, rangeGuns, type RangeChoice } from './rangeGuns';
import {
  biomeName,
  bodyNote,
  cellLines,
  cellTitle,
  dayName,
  distName,
  gunName,
  targetName,
} from './rangeReport';
import { groupStats, hitRate, misses, pelletsPerShot, type RangeCell } from './rangeStats';

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
#tm-range button.btn.primary{background:#d9a21b;border-color:#FFD25A;color:#1b1410;font-size:20px;padding:6px 36px;margin-top:12px}
#tm-range .row,#tm-range-bar .row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
#tm-range table{border-collapse:collapse;width:100%;font-size:13px;margin-top:6px}
#tm-range th,#tm-range td{border-bottom:1px solid #3a2e24;padding:3px 4px;text-align:left;vertical-align:top}
#tm-range th{color:#C9BFA6;font-weight:600}
#tm-range td.n{text-align:right;white-space:nowrap}
#tm-range .toast,#tm-range-bar .toast{color:#FFD25A;font-size:13px}
#tm-range textarea{width:100%;min-height:120px;font:12px/1.3 monospace;color:#1b1410;background:#F3EAD3;border-radius:6px;-webkit-user-select:text;user-select:text}
#tm-range-bar{position:fixed;z-index:15;left:calc(env(safe-area-inset-left) + 8px);top:calc(env(safe-area-inset-top) + 8px);
  max-width:min(440px,40vw);background:rgba(27,20,16,.82);color:#F3EAD3;border:2px solid #8a7458;border-radius:10px;
  padding:6px 8px;font:13px/1.3 'Baloo 2',system-ui,sans-serif;pointer-events:auto;touch-action:manipulation}
#tm-range-bar b{color:#FFD25A}
#tm-range-bar .lines{margin:2px 0 4px}
#tm-range-bar button.btn{min-height:40px;font-size:13px;padding:2px 8px}
@media (max-height:500px){#tm-range{font-size:14px}#tm-range h1{font-size:17px}#tm-range header{padding:2px 10px}
  #tm-range h3{margin:4px 0 2px}#tm-range button.btn{min-height:40px;padding:2px 8px}
  #tm-range button.btn.primary{font-size:17px;margin-top:6px}#tm-range-bar{font-size:11.5px;padding:4px 6px}
  #tm-range-bar button.btn{min-height:36px}#tm-range-bar .note{display:none}
  #tm-range-bar .lines{margin:1px 0 2px}}
#tm-range .choices button.btn.primary{position:sticky;bottom:6px;box-shadow:0 2px 10px rgba(0,0,0,.6)}
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
    const gun = rangeGuns(this.content).find((g) => g.id === c.gun);
    // A gun that can't reach the chosen distance moves it in to the farthest it reaches.
    const plane = gun !== undefined && !reaches(gun, c.plane) ? 'far' : c.plane;
    this.choice = { ...c, plane };
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
      this.chips<PlaneId>(
        'plane',
        RANGE_PLANES,
        c.plane,
        distName,
        (plane) => {
          this.set({ ...this.choice, plane });
        },
        (plane) => (gun === undefined || reaches(gun, plane) ? null : rt('range.out_of_reach')),
      ),
      el('h3', { textContent: rt('range.target') }),
      this.chips<RangeTarget>('target', RANGE_TARGETS, c.target, targetName, (target) => {
        this.set({ ...this.choice, target });
      }),
      start,
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
      this.table(),
      fallback,
    );
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
      el('div', { className: 'cols' }, choices, stats),
    );
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
        head('range.col_shots'),
        head('range.col_hits'),
        head('range.col_misses'),
        head('range.col_rate'),
        head('range.col_pellets'),
        head('range.col_group'),
      ),
    );
    for (const cell of cells) {
      const g = groupStats(cell.impacts);
      const n = (v: string): HTMLElement => el('td', { className: 'n', textContent: v });
      table.append(
        el(
          'tr',
          { dataset: { cell: `${cell.gun}|${cell.plane}|${cell.target}` } },
          el('td', { textContent: cellTitle(this.content, cell) }),
          n(String(cell.shots)),
          n(String(cell.hits)),
          n(String(misses(cell))),
          n(one(hitRate(cell) * 100)),
          n(cell.pellets > 1 ? `${one(pelletsPerShot(cell))} / ${String(cell.pellets)}` : '–'),
          n(g === null ? '–' : `${one(g.meanRadius)} · ${one(g.extremeSpread)} px`),
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
  readonly reset: () => void;
  readonly report: () => string;
}

/** The stats bar over a running range (top-left, where a hunt's clock would be). */
export class RangeBar {
  private readonly root: HTMLElement;
  private readonly lines: HTMLElement;
  private readonly toast: HTMLElement;
  private shown = '';

  constructor(
    private readonly content: ContentBundle,
    h: BarHandlers,
  ) {
    ensureStyle();
    this.lines = el('div', { className: 'lines', dataset: { role: 'lines' } });
    this.toast = el('span', { className: 'toast' });
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
        button(rt('range.reset'), { action: 'reset' }, () => {
          h.reset();
        }),
        button(rt('range.copy'), { action: 'copy-report' }, () => {
          void copyText(h.report()).then((ok) => {
            this.toast.textContent = rt(ok ? 'range.copied' : 'range.copy_failed');
          });
        }),
        this.toast,
      ),
    );
    stopKeys(this.root);
    // Taps on the bar never reach the canvas (no shot, no pan).
    for (const type of ['pointerdown', 'pointerup', 'pointermove'] as const)
      this.root.addEventListener(type, (e) => {
        e.stopPropagation();
      });
    document.body.appendChild(this.root);
  }

  /** Shows the cell's stats (only touches the DOM when the text changed). */
  update(cell: RangeCell): void {
    const text = cell.shots === 0 ? [rt('range.none')] : cellLines(this.content, cell, false);
    // The body-width note is its own line (hidden on short screens: phones in landscape).
    const note = cell.impacts.length > 0 ? bodyNote(this.content, cell) : null;
    const key = `${text.join('\n')}\n${String(note)}`;
    if (key === this.shown) return;
    this.shown = key;
    this.lines.replaceChildren(
      ...text.map((l) => el('div', { textContent: l })),
      ...(note === null ? [] : [el('div', { className: 'note muted', textContent: note })]),
    );
  }

  destroy(): void {
    this.root.remove();
  }
}
