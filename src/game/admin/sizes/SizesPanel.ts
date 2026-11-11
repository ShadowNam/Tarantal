// v1.22.1 (D-086): the admin page's "Sizes" tab — each area (Karoo, Bushveld, Kalahari, Okavango,
// Namibië, Die Oes) with its animals: the real size each stands for, its size in the game now (the
// value and the height it shows as beside the guineafowl) and the owner's size, if he set one
// (Revert); "Open in game" per area (the size editor, `?admin=1&sizes=<area>`); "Use my sizes in
// the game"; and the sizes file (Download / Copy / Share). DOM only, like the Texts & voices tab;
// its own lazy chunk (with the knobs it lists): AdminPanel imports it when the tab opens.
import { fill, tOr } from '../../../i18n/i18n';
import type { ContentBundle, Feel } from '../../../content/schemas';
import type { SizeEditStore } from '../../../meta/sizeEdits';
import type { TestHook } from '../../GameContext';
import { at } from '../adminI18n';
import type { SizeArea } from '../../sizes/sizeAreas';
import {
  knobsIn,
  SIZE_AREA_BIOME,
  SIZE_AREAS,
  SIZE_KNOBS,
  type SizeKnob,
} from '../../sizes/sizeKnobs';
import {
  exportSizes,
  factorsOf,
  percentOf,
  shownM,
  sizesFileName,
  valueWith,
  type SizeContent,
} from '../../sizes/sizeWork';

export interface SizesPanelDeps {
  readonly content: ContentBundle;
  readonly feel: Feel;
  /** The sizes store (src/meta/sizeEdits.ts, in the first download): read and save it. */
  readonly edits: { load(): SizeEditStore; save(s: SizeEditStore): void };
  readonly build: { readonly version: string; readonly commit: string };
  readonly hook: TestHook | null;
}

const STYLE_ID = 'tm-sizes-style';
const SIZES_CSS = `
#tm-admin .sview{flex:1;min-height:0;overflow-y:auto;touch-action:pan-y;-webkit-overflow-scrolling:touch;padding:8px 12px}
#tm-admin .sbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px}
#tm-admin .sarea{border:1px solid #5a4632;border-radius:10px;margin:10px 0;background:#241b15}
#tm-admin .sarea>header{display:flex;gap:10px;align-items:center;border-bottom:1px solid #3a2e24;padding:6px 10px}
#tm-admin .sarea h3{margin:0;flex:1}
#tm-admin .stable{width:100%;border-collapse:collapse;font-size:14px}
#tm-admin .stable th{text-align:left;color:#C9BFA6;font-weight:600;font-size:12px;padding:4px 8px}
#tm-admin .stable td{padding:6px 8px;border-top:1px solid #3a2e24;vertical-align:middle}
#tm-admin .stable tr.edited td{background:#3b2e1c}
#tm-admin .stable .mine{color:#FFD25A;font-weight:700}
#tm-admin .stable .path{font-family:ui-monospace,monospace;font-size:11px;color:#a8977c;word-break:break-all}
#tm-admin .stable .stale{color:#ff9a7a;font-size:12px}
#tm-admin .sexport{width:100%;min-height:120px;font-family:ui-monospace,monospace;font-size:12px}
#tm-admin .shelp{font-size:13px;color:#C9BFA6;margin:4px 0 8px}
@media (max-width:700px){#tm-admin .stable .path,#tm-admin .stable .col-now{display:none}}
@media (max-height:500px){#tm-admin .sview{padding:4px 8px}
  #tm-admin .sbar{flex-wrap:nowrap;overflow-x:auto;touch-action:pan-x pan-y;margin-bottom:4px;padding-bottom:2px}
  #tm-admin .sbar>*{flex:none}
  #tm-admin[data-tab=sizes] header [data-role=progress],#tm-admin[data-tab=sizes] header [data-role=stamp],
  #tm-admin[data-tab=sizes] header [data-action=project],#tm-admin[data-tab=sizes] header [data-action=skietbaan],
  #tm-admin[data-tab=sizes] header [data-action=copy-report]{display:none}
  #tm-admin[data-tab=sizes] header{flex-wrap:nowrap}}
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

function btn(text: string, action: string, onClick: () => void, cls = 'btn'): HTMLButtonElement {
  const b = el('button', {
    type: 'button',
    className: cls,
    textContent: text,
    dataset: { action },
  });
  b.addEventListener('click', onClick);
  return b;
}

const fmtM = (m: number): string => (m >= 0.1 ? m.toFixed(2) : m.toFixed(3));

/** The page that opens the size editor on an area (this page's other parameters kept). */
export function editorHref(href: string, area: SizeArea): string {
  const url = new URL(href);
  url.searchParams.set('admin', '1');
  url.searchParams.set('sizes', area);
  url.searchParams.delete('play');
  url.searchParams.delete('tab');
  url.searchParams.delete('project');
  return url.toString();
}

export class SizesPanel {
  readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly applyBtn: HTMLButtonElement;
  private store: SizeEditStore;
  private lastExport: string | null = null;
  private readonly c: SizeContent;

  constructor(private readonly d: SizesPanelDeps) {
    if (document.getElementById(STYLE_ID) === null)
      document.head.appendChild(el('style', { id: STYLE_ID, textContent: SIZES_CSS }));
    this.c = { bundle: d.content, feel: d.feel };
    this.store = d.edits.load();
    this.toast = el('span', { className: 'toast', dataset: { role: 'sizes-toast' } });
    this.applyBtn = btn(at('admin.sizes.apply'), 'sizes-apply', () => {
      this.setStore({ ...this.store, apply: !this.store.apply });
    });
    const share =
      typeof navigator.share === 'function' && typeof navigator.canShare === 'function'
        ? [
            btn(at('admin.sizes.share'), 'sizes-share', () => {
              void this.share();
            }),
          ]
        : [];
    const help = el(
      'div',
      { className: 'shelp', dataset: { role: 'sizes-help' } },
      el('p', { textContent: at('admin.sizes.intro') }),
      el('h3', { textContent: at('admin.sizes.help_title') }),
      el('p', { textContent: at('admin.sizes.help') }),
      el('p', { textContent: at('admin.sizes.apply_hint') }),
    );
    this.list = el('div', { dataset: { role: 'sizes-list' } });
    this.root = el(
      'div',
      { className: 'sview', dataset: { role: 'sizes' } },
      el(
        'div',
        { className: 'sbar' },
        this.applyBtn,
        btn(at('admin.sizes.download'), 'sizes-download', () => {
          this.download();
        }),
        btn(at('admin.sizes.copy'), 'sizes-copy', () => {
          void this.copy();
        }),
        ...share,
        this.toast,
      ),
      help,
      this.list,
    );
    this.render();
  }

  private setStore(s: SizeEditStore): void {
    this.store = s;
    this.d.edits.save(s);
    this.render();
  }

  private render(): void {
    this.applyBtn.setAttribute('aria-pressed', String(this.store.apply));
    const f = factorsOf(this.store, this.c);
    const stale = new Set(this.store.edits.filter((e) => f[e.id] === undefined).map((e) => e.id));
    const areas = SIZE_AREAS.map((area) => this.areaBox(area, f, stale));
    this.list.replaceChildren(
      el('div', {
        className: 'muted',
        dataset: { role: 'sizes-changed' },
        textContent: fill(at('admin.sizes.changed'), {
          n: new Set(this.store.edits.map((e) => e.id)).size,
        }),
      }),
      ...areas,
    );
    this.fillHook();
  }

  private areaBox(area: SizeArea, f: Record<string, number>, stale: Set<string>): HTMLElement {
    const biome = this.d.content.biomes.find((b) => b.id === SIZE_AREA_BIOME[area]);
    const name = biome === undefined ? area : tOr(biome.nameKey, area);
    const open = btn(
      at('admin.sizes.open'),
      `sizes-open-${area}`,
      () => {
        window.location.assign(editorHref(window.location.href, area));
      },
      'btn primary',
    );
    const head = el('tr', {});
    for (const [key, cls] of [
      ['admin.sizes.col_animal', ''],
      ['admin.sizes.col_real', ''],
      ['admin.sizes.col_now', 'col-now'],
      ['admin.sizes.col_mine', ''],
      ['', ''],
    ] as const)
      head.append(el('th', { className: cls, textContent: key === '' ? '' : at(key) }));
    const table = el('table', { className: 'stable' }, el('thead', {}, head));
    const body = el('tbody', {});
    for (const k of knobsIn(area)) body.append(this.row(k, f, stale.has(k.id)));
    table.append(body);
    return el(
      'section',
      { className: 'sarea', dataset: { area } },
      el('header', {}, el('h3', { textContent: name }), open),
      table,
    );
  }

  private row(k: SizeKnob, f: Record<string, number>, stale: boolean): HTMLElement {
    const base = valueWith(k, this.c, 1);
    const now = shownM(k, this.c, {});
    const factor = f[k.id];
    const tail = (k.targets[0] ?? '').split('#')[1] ?? '';
    const mine =
      factor === undefined
        ? el('td', { textContent: stale ? '' : at('admin.sizes.unchanged') })
        : el(
            'td',
            { className: 'mine' },
            `${String(valueWith(k, this.c, factor))} (${percentOf(factor)})`,
            ...(shownM(k, this.c, f) === null
              ? []
              : [
                  el('div', {
                    className: 'muted',
                    textContent: fill(at('admin.sizes.shows'), {
                      m: fmtM(shownM(k, this.c, f) ?? 0),
                    }),
                  }),
                ]),
          );
    if (stale) mine.append(el('div', { className: 'stale', textContent: at('admin.sizes.stale') }));
    const edited = this.store.edits.some((e) => e.id === k.id);
    const tr = el(
      'tr',
      { className: edited ? 'edited' : '', dataset: { knob: k.id } },
      el(
        'td',
        {},
        at(`admin.sizes.k.${k.id}`),
        el('div', { className: 'path', textContent: tail }),
      ),
      el('td', {
        textContent: fill(at('admin.sizes.real'), {
          m: fmtM(k.realM),
          measure: at(`admin.sizes.m.${k.measure}`),
        }),
      }),
      el(
        'td',
        { className: 'col-now' },
        String(base ?? ''),
        ...(now === null
          ? []
          : [
              el('div', {
                className: 'muted',
                textContent: fill(at('admin.sizes.shows'), { m: fmtM(now) }),
              }),
            ]),
      ),
      mine,
      el(
        'td',
        {},
        ...(edited
          ? [
              btn(at('admin.sizes.revert'), `sizes-revert-${k.id}`, () => {
                this.setStore({
                  ...this.store,
                  edits: this.store.edits.filter((e) => e.id !== k.id),
                });
              }),
            ]
          : []),
      ),
    );
    return tr;
  }

  private fillHook(): void {
    const hook = this.d.hook;
    if (hook === null) return;
    hook.sizes = {
      view: 'tab',
      area: null,
      knobs: SIZE_KNOBS.length,
      selected: null,
      factor: 1,
      value: null,
      shownM: null,
      bounds: null,
      sprite: null,
      feet: null,
      spots: {},
      changed: new Set(this.store.edits.map((e) => e.id)).size,
      dirty: false,
      apply: this.store.apply,
      lastExport: this.lastExport,
    };
  }

  private say(msg: string): void {
    this.toast.textContent = msg;
  }

  private exportText(): string {
    const text = JSON.stringify(
      exportSizes(this.store, this.d.build, new Date().toISOString()),
      null,
      2,
    );
    this.lastExport = text;
    this.fillHook();
    return text;
  }

  private download(): void {
    if (this.store.edits.length === 0) {
      this.say(at('admin.sizes.nothing'));
      return;
    }
    const text = this.exportText();
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = el('a', { href: url, download: sizesFileName(new Date().toISOString()) });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 10_000);
  }

  private async copy(): Promise<void> {
    if (this.store.edits.length === 0) {
      this.say(at('admin.sizes.nothing'));
      return;
    }
    const text = this.exportText();
    try {
      await navigator.clipboard.writeText(text);
      this.say(at('admin.sizes.copied'));
    } catch {
      // Some embeds block the clipboard: the file's text to copy by hand.
      this.say(at('admin.sizes.copy_failed'));
      const box = el('textarea', { className: 'sexport', value: text, readOnly: true });
      this.root.querySelector('.sexport')?.remove();
      this.list.before(box);
      box.select();
    }
  }

  private async share(): Promise<void> {
    if (this.store.edits.length === 0) {
      this.say(at('admin.sizes.nothing'));
      return;
    }
    const text = this.exportText();
    const name = sizesFileName(new Date().toISOString());
    try {
      const file = new File([text], name, { type: 'application/json' });
      const data: ShareData = { files: [file], title: name };
      if (!navigator.canShare(data)) throw new Error('no file sharing');
      await navigator.share(data);
      this.say(at('admin.sizes.shared'));
    } catch (e) {
      // The owner closing the share sheet is not a failure.
      if (!(e instanceof DOMException && e.name === 'AbortError'))
        this.say(at('admin.sizes.share_failed'));
    }
  }
}
