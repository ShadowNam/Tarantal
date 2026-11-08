// v1.14 (D-076): the admin page's "Texts & voices" tab — every player-facing line in en/af/de/nl,
// grouped, with Oupa's current clip per voice language (▶), the voice tool's "spoken as" lines, a
// search, filters and a language switch (phones), editing with Save / Cancel / Revert, "Use my
// edits in the game", and the corrections file (Download / Copy / Share). DOM only, like the admin
// list (no Phaser objects); pages of PAGE_SIZE rows, so ~1,000 lines × 4 languages stay smooth.
// Its own lazy chunk (with the text tables it lists): AdminPanel imports it when the tab opens.
import { fill, LANGUAGES, VOICE_LANGUAGES, type Language } from '../../../i18n/i18n';
import type { Feel, ContentBundle } from '../../../content/schemas';
import type { TextEdit, TextEditStore, TextField } from '../../../meta/textEdits';
import { loadVoiceIndex, type VoiceIndex } from '../../assets/voiceIndex';
import { voiceKey } from '../../assets/AssetManifest';
import type { AudioDirector } from '../../audio/AudioDirector';
import { voicedKeys } from '../../audio/voicedKeys';
import type { TestHook } from '../../GameContext';
import { at } from '../adminI18n';
import {
  checkTokens,
  collectLines,
  currentOf,
  editId,
  rebaseEdit,
  reconcileEdits,
  editMap,
  exportEdits,
  exportFileName,
  filterLines,
  isChanged,
  LINE_GROUPS,
  originalOf,
  withEdit,
  withoutEdit,
  type EditMap,
  type LineFilter,
  type LineGroup,
  type TextLine,
} from './textLines';
import { SAY_DATA, TEXT_TABLE_DATA } from './textTables';

/** Rows per page. */
export const PAGE_SIZE = 40;

const STYLE_ID = 'tm-texts-style';
const TEXTS_CSS = `
#tm-admin .tview{flex:1;min-height:0;overflow-y:auto;touch-action:pan-y;-webkit-overflow-scrolling:touch;padding:8px 12px}
#tm-admin .tbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px}
#tm-admin .tbar input[type=search]{flex:1 1 220px;min-width:160px}
#tm-admin .tbar select{min-width:120px}
#tm-admin .thelp{font-size:13px;color:#C9BFA6;margin:4px 0 8px}
#tm-admin .thelp[hidden]{display:none}
#tm-admin .trow{border:1px solid #3a2e24;border-radius:8px;padding:6px 8px;margin:6px 0;background:#241b15}
#tm-admin .trow.changed{border-color:#d9a21b}
#tm-admin .tmeta{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:12px;color:#C9BFA6;margin-bottom:4px}
#tm-admin .tkey{font-family:ui-monospace,monospace;font-size:12px;color:#F3EAD3;word-break:break-all}
#tm-admin .tbadge{border:1px solid #8a7458;border-radius:10px;padding:0 6px;font-size:12px;white-space:nowrap}
#tm-admin .tbadge.voiced{border-color:#6fbf5a;color:#9fe08a}
#tm-admin .tbadge.edit{border-color:#d9a21b;color:#FFD25A}
#tm-admin .tcells{display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));gap:6px}
#tm-admin .tcell{display:flex;flex-direction:column;gap:4px;min-width:0}
#tm-admin .tlang{display:flex;align-items:center;gap:6px;font-size:12px;color:#FFD25A;font-weight:700;min-height:24px}
#tm-admin .ttext,#tm-admin .tsay{font:inherit;font-size:15px;text-align:left;white-space:pre-wrap;overflow-wrap:anywhere;
  min-height:44px;width:100%;padding:6px 8px;border-radius:6px;border:1px solid #5a4632;background:#2f251d;color:#F3EAD3;
  cursor:text;touch-action:manipulation}
#tm-admin .ttext.edited,#tm-admin .tsay.edited{border-color:#d9a21b;background:#3b2e1c}
#tm-admin .tsay{font-size:14px;font-style:italic;min-height:40px}
#tm-admin .tsaylabel{font-size:12px;color:#C9BFA6}
#tm-admin .twas{font-size:12px;color:#C9BFA6;overflow-wrap:anywhere}
#tm-admin .tplay{font:inherit;font-size:13px;font-weight:700;min-height:40px;min-width:52px;padding:2px 8px;border-radius:8px;
  border:2px solid #6fbf5a;background:#24341d;color:#d8f5cc;cursor:pointer;touch-action:manipulation}
#tm-admin .tnoclip{font-size:12px;color:#a8977c;font-style:italic}
#tm-admin .tsmall{font:inherit;font-size:13px;min-height:40px;padding:2px 10px;border-radius:8px;border:1px dashed #8a7458;
  background:none;color:#C9BFA6;cursor:pointer;align-self:flex-start;touch-action:manipulation}
#tm-admin .torphans{border:1px dashed #e58a2e;border-radius:8px;padding:4px 8px;margin:6px 0}
#tm-admin .torphans[hidden]{display:none}
#tm-admin .terr{color:#ff9a7a;font-size:13px}
#tm-admin .tpager{display:flex;gap:8px;align-items:center;justify-content:center;margin:10px 0 4px}
#tm-admin .texport{width:100%;min-height:120px;font-family:ui-monospace,monospace;font-size:12px}
@media (max-height:500px){#tm-admin .tview{padding:4px 8px}#tm-admin .trow{margin:4px 0}
  #tm-admin .tbar{flex-wrap:nowrap;overflow-x:auto;touch-action:pan-x pan-y;margin-bottom:4px;padding-bottom:2px}
  #tm-admin .tbar>*{flex:none}#tm-admin .tbar input[type=search]{flex:0 0 200px}
  #tm-admin .thint{display:none}#tm-admin .tbar .btn,#tm-admin .tbar select,#tm-admin .tbar input{min-height:40px}
  #tm-admin[data-tab=texts] header [data-role=progress],#tm-admin[data-tab=texts] header [data-role=stamp],
  #tm-admin[data-tab=texts] header [data-action=project],#tm-admin[data-tab=texts] header [data-action=skietbaan],
  #tm-admin[data-tab=texts] header [data-action=copy-report]{display:none}
  #tm-admin[data-tab=texts] header{flex-wrap:nowrap}}
`;

type LangView = 'all' | Language;

export interface TextsPanelDeps {
  readonly content: Pick<ContentBundle, 'biomes' | 'birds' | 'feesdae'>;
  readonly feel: Feel;
  /** The baboons' raid actions (RaidActionSchema.options), for the voiced keys. */
  readonly raidActions: readonly string[];
  /** The edits store (src/meta/textEdits.ts, in the first download): read it, and save it (which
   *  also applies it in the game when "Use my edits" is on). */
  readonly edits: { load(): TextEditStore; save(s: TextEditStore): void };
  /** ▶ plays through the AudioDirector (CLAUDE.md: audio only through it). */
  readonly audio: AudioDirector | null;
  readonly build: { readonly version: string; readonly commit: string };
  /** The e2e hook (null outside test builds). */
  readonly hook: TestHook | null;
}

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

/** The last clip ▶ started (a new one stops it). */
let playing: AudioBufferSourceNode | null = null;

/** One clip's compressed bytes, decoded and played once on the AudioDirector's voice bus (so mute
 *  and the voice volume apply); false while muted, before audio unlocked, or when undecodable. */
async function playOn(audio: AudioDirector, bytes: ArrayBuffer): Promise<boolean> {
  const out = audio.voiceOut;
  if (out === null) return false;
  try {
    const buf = await out.ctx.decodeAudioData(bytes);
    try {
      playing?.stop();
    } catch {
      // Already ended.
    }
    const src = out.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(out.bus);
    src.start();
    playing = src;
    return true;
  } catch {
    return false;
  }
}

const groupLabel = (g: LineGroup): string => at(`admin.texts.group.${g}`);

export class TextsPanel {
  readonly root: HTMLElement;
  private readonly lines: readonly TextLine[];
  private readonly byId: ReadonlyMap<string, TextLine>;
  private store: TextEditStore;
  private edits: EditMap;
  /** Edits dropped on load because the game has them now. */
  private readonly dropped: number;
  /** Edits whose original changed since they were made (`table|key|lang|field`). */
  private readonly stale: Set<string>;
  /** The box listing edits of lines no longer in the game (empty: hidden). */
  private readonly orphanBox: HTMLElement;
  private filter: LineFilter = { query: '', voicedOnly: false, changedOnly: false, group: null };
  private lang: LangView;
  private page = 0;
  private shown: TextLine[] = [];
  /** `table|key|lang|field` being edited, or null. */
  private editing: string | null = null;
  private error: string | null = null;
  private lastExport: string | null = null;
  private played: { key: string; result: 'played' | 'missing' | 'failed' } | null = null;
  /** The voice half of the asset index (null until loaded, or when it failed). */
  private clips: VoiceIndex | null = null;
  private readonly list: HTMLElement;
  private readonly count: HTMLElement;
  private readonly range: HTMLElement;
  private readonly pager: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly applyBtn: HTMLButtonElement;

  constructor(private readonly deps: TextsPanelDeps) {
    if (document.getElementById(STYLE_ID) === null)
      document.head.appendChild(el('style', { id: STYLE_ID, textContent: TEXTS_CSS }));
    const voiced = voicedKeys(deps.content, deps.feel.barks, deps.raidActions);
    this.lines = collectLines(TEXT_TABLE_DATA, voiced.group, SAY_DATA);
    this.byId = new Map(this.lines.map((l) => [l.id, l]));
    // A build that shipped the owner's corrections: edits the tables now have are dropped, edits
    // whose original changed are flagged (shown with the text now: keep or revert).
    const stored = deps.edits.load();
    const rec = reconcileEdits(this.lines, stored.edits);
    this.store = { ...stored, edits: rec.edits };
    if (rec.dropped.length > 0) deps.edits.save(this.store);
    this.dropped = rec.dropped.length;
    this.stale = new Set(rec.stale);
    this.edits = editMap(this.store.edits);
    // Phones (narrow): one language at a time; wider screens: all four side by side.
    this.lang = window.innerWidth >= 1000 ? 'all' : 'en';

    this.root = el('div', { className: 'tview', dataset: { role: 'texts' } });
    this.list = el('div', { dataset: { role: 'text-list' } });
    this.count = el('span', { className: 'muted', dataset: { role: 'changed' } });
    this.range = el('span', { className: 'muted', dataset: { role: 'range' } });
    this.pager = el('div', { className: 'tpager' });
    this.toast = el('span', { className: 'toast', dataset: { role: 'texts-toast' } });
    this.applyBtn = btn(at('admin.texts.apply'), 'texts-apply', () => {
      this.setStore({ ...this.store, apply: !this.store.apply });
    });
    this.orphanBox = el('div', { className: 'torphans', dataset: { role: 'texts-orphans' } });
    this.root.append(this.toolbar(), this.orphanBox, this.list, this.pager);
    this.renderOrphans();
    if (this.dropped > 0) this.say(fill(at('admin.texts.dropped'), { n: this.dropped }));
    this.render();
    void loadVoiceIndex().then((v) => {
      this.clips = v;
      if (this.root.isConnected) this.renderPage();
    });
  }

  // --- toolbar --------------------------------------------------------------------------------

  private toolbar(): DocumentFragment {
    const search = el('input', {
      type: 'search',
      name: 'texts-search',
      placeholder: at('admin.texts.search'),
      autocomplete: 'off',
    });
    search.setAttribute('aria-label', at('admin.texts.search'));
    search.addEventListener('input', () => {
      this.setFilter({ query: search.value });
    });
    const group = el('select', { name: 'texts-group' });
    group.append(
      el('option', { value: '', textContent: at('admin.texts.group_all') }),
      ...LINE_GROUPS.map((g) => el('option', { value: g, textContent: groupLabel(g) })),
    );
    group.setAttribute('aria-label', at('admin.texts.group_all'));
    group.addEventListener('change', () => {
      const g = LINE_GROUPS.find((x) => x === group.value) ?? null;
      this.setFilter({ group: g });
    });
    const lang = el('select', { name: 'texts-lang' });
    lang.append(
      el('option', { value: 'all', textContent: at('admin.texts.lang_all') }),
      ...LANGUAGES.map((l) => el('option', { value: l, textContent: l.toUpperCase() })),
    );
    lang.value = this.lang;
    lang.setAttribute('aria-label', at('admin.texts.language'));
    lang.addEventListener('change', () => {
      this.lang = LANGUAGES.find((l) => l === lang.value) ?? 'all';
      this.renderPage();
    });
    const toggle = (label: string, action: string, key: 'voicedOnly' | 'changedOnly') => {
      const b = btn(label, action, () => {
        this.setFilter({ [key]: !this.filter[key] });
        b.setAttribute('aria-pressed', String(this.filter[key]));
      });
      b.setAttribute('aria-pressed', 'false');
      return b;
    };
    const download = btn(at('admin.texts.download'), 'texts-download', () => {
      this.download();
    });
    const copy = btn(at('admin.texts.copy'), 'texts-copy', () => {
      void this.copy();
    });
    const shareOk =
      typeof navigator.share === 'function' && typeof navigator.canShare === 'function';
    const share = shareOk
      ? [
          btn(at('admin.texts.share'), 'texts-share', () => {
            void this.share();
          }),
        ]
      : [];
    // The help opens under the toolbar from a small "?" in it (no row of its own on phones).
    const help = el(
      'div',
      { className: 'thelp', dataset: { role: 'texts-help' } },
      el('h3', { textContent: at('admin.texts.help_title') }),
      el('p', { textContent: at('admin.texts.help') }),
      el('p', { textContent: at('admin.texts.voice_note') }),
      el('p', { textContent: at('admin.texts.apply_hint') }),
    );
    help.hidden = true;
    const helpBtn = btn('?', 'texts-help', () => {
      help.hidden = !help.hidden;
      helpBtn.setAttribute('aria-expanded', String(!help.hidden));
    });
    helpBtn.setAttribute('aria-label', at('admin.texts.help_title'));
    helpBtn.setAttribute('aria-expanded', 'false');
    const f = document.createDocumentFragment();
    f.append(
      el(
        'div',
        { className: 'tbar' },
        search,
        group,
        lang,
        toggle(at('admin.texts.voiced_only'), 'texts-voiced', 'voicedOnly'),
        toggle(at('admin.texts.changed_only'), 'texts-changed', 'changedOnly'),
      ),
      el(
        'div',
        { className: 'tbar' },
        this.applyBtn,
        this.count,
        download,
        copy,
        ...share,
        helpBtn,
        this.range,
        this.toast,
      ),
      el('div', { className: 'muted thint', textContent: at('admin.texts.apply_hint') }),
      help,
    );
    return f;
  }

  // --- state ----------------------------------------------------------------------------------

  private setFilter(patch: Partial<LineFilter>): void {
    this.filter = { ...this.filter, ...patch };
    this.page = 0;
    this.editing = null;
    this.render();
  }

  private setStore(s: TextEditStore): void {
    this.store = s;
    this.edits = editMap(s.edits);
    this.deps.edits.save(s);
    this.renderCounts();
  }

  private render(): void {
    this.shown = filterLines(this.lines, this.filter, this.edits);
    const last = Math.max(0, Math.ceil(this.shown.length / PAGE_SIZE) - 1);
    this.page = Math.min(this.page, last);
    this.renderPage();
  }

  private renderCounts(): void {
    const changed = this.lines.filter((l) => isChanged(l, this.edits)).length;
    this.count.textContent = fill(at('admin.texts.changed'), { n: changed });
    this.applyBtn.setAttribute('aria-pressed', String(this.store.apply));
    this.publish(changed);
  }

  private publish(changed: number): void {
    const hook = this.deps.hook;
    if (hook === null) return;
    const from = this.page * PAGE_SIZE;
    hook.adminTexts = {
      lines: this.lines.length,
      shown: this.shown.length,
      page: this.shown.slice(from, from + PAGE_SIZE).map((l) => l.id),
      changed,
      apply: this.store.apply,
      editing: this.editing,
      error: this.error,
      lastExport: this.lastExport,
      played: this.played,
      orphans: this.orphans().length,
    };
  }

  private republish(): void {
    this.publish(this.lines.filter((l) => isChanged(l, this.edits)).length);
  }

  /** Stored edits whose line (or language, or `say` field) is no longer in the game. */
  private orphans(): TextEdit[] {
    return reconcileEdits(this.lines, this.store.edits).orphans.slice();
  }

  private renderOrphans(): void {
    const list = this.orphans();
    this.orphanBox.hidden = list.length === 0;
    if (list.length === 0) {
      this.orphanBox.replaceChildren();
      return;
    }
    this.orphanBox.replaceChildren(
      el('h3', { textContent: fill(at('admin.texts.orphans'), { n: list.length }) }),
      ...list.map((e) =>
        el(
          'div',
          { className: 'row', dataset: { orphan: editId(e) } },
          el('span', {
            className: 'tkey',
            textContent: `${e.key} · ${e.table} · ${e.lang.toUpperCase()}${e.field === 'say' ? ` · ${at('admin.texts.spoken_as')}` : ''}`,
          }),
          el('span', { className: 'twas', textContent: e.to }),
          btn(
            at('admin.texts.revert'),
            'texts-revert-orphan',
            () => {
              const id = editId(e);
              this.setStore({
                ...this.store,
                edits: this.store.edits.filter((x) => editId(x) !== id),
              });
              this.renderOrphans();
            },
            'tsmall',
          ),
        ),
      ),
    );
  }

  private renderPage(): void {
    const from = this.page * PAGE_SIZE;
    const rows = this.shown.slice(from, from + PAGE_SIZE);
    this.list.replaceChildren(
      ...(rows.length === 0
        ? [el('p', { className: 'muted', textContent: at('admin.texts.no_match') })]
        : rows.map((l) => this.row(l))),
    );
    this.range.textContent = fill(at('admin.texts.shown'), {
      from: rows.length === 0 ? 0 : from + 1,
      to: from + rows.length,
      n: this.shown.length,
    });
    const pages = Math.ceil(this.shown.length / PAGE_SIZE);
    const prev = btn(at('admin.texts.prev'), 'texts-prev', () => {
      this.goPage(this.page - 1);
    });
    const next = btn(at('admin.texts.next'), 'texts-next', () => {
      this.goPage(this.page + 1);
    });
    prev.disabled = this.page === 0;
    next.disabled = this.page >= pages - 1;
    this.pager.replaceChildren(
      prev,
      el('span', {
        className: 'muted',
        textContent: `${String(Math.min(this.page + 1, Math.max(pages, 1)))} / ${String(Math.max(pages, 1))}`,
      }),
      next,
    );
    this.renderCounts();
  }

  private goPage(p: number): void {
    this.page = Math.max(0, p);
    this.editing = null;
    this.renderPage();
    this.root.scrollTo({ top: 0 });
  }

  // --- rows -----------------------------------------------------------------------------------

  private langs(): readonly Language[] {
    return this.lang === 'all' ? LANGUAGES : [this.lang];
  }

  private row(line: TextLine): HTMLElement {
    const changed = isChanged(line, this.edits);
    const meta = el(
      'div',
      { className: 'tmeta' },
      el('span', { className: 'tkey', textContent: line.key }),
      el('span', { textContent: `· ${groupLabel(line.group)}` }),
      ...(line.table === 'names'
        ? [el('span', { className: 'tbadge', textContent: at('admin.texts.table.names') })]
        : []),
      ...(line.voiced
        ? [
            el('span', {
              className: 'tbadge voiced',
              textContent: `🔊 ${at('admin.texts.voiced')}`,
            }),
          ]
        : []),
      ...(changed
        ? [el('span', { className: 'tbadge edit', textContent: `✎ ${at('admin.texts.edited')}` })]
        : []),
    );
    const langs = this.langs();
    const cells = el('div', { className: 'tcells' });
    cells.style.setProperty('--n', String(langs.length));
    for (const lang of langs) cells.append(this.cell(line, lang));
    return el(
      'div',
      { className: changed ? 'trow changed' : 'trow', dataset: { line: line.id } },
      meta,
      cells,
    );
  }

  private refreshRow(line: TextLine): void {
    const old = this.list.querySelector(`[data-line="${CSS.escape(line.id)}"]`);
    old?.replaceWith(this.row(line));
    this.renderCounts();
  }

  private cell(line: TextLine, lang: Language): HTMLElement {
    const voiceLang = VOICE_LANGUAGES.find((v) => v === lang);
    const head = el('div', { className: 'tlang' }, lang.toUpperCase());
    if (line.voiced && voiceLang !== undefined) head.append(this.playButton(line, voiceLang));
    const cell = el('div', { className: 'tcell', dataset: { lang } }, head);
    // The Afrikaans-names table has no Afrikaans column (Afrikaans keeps its own text).
    if (line.text[lang] === undefined) {
      cell.append(el('span', { className: 'muted', textContent: '—' }));
      return cell;
    }
    cell.append(this.field(line, lang, 'text'));
    if (line.voiced && voiceLang !== undefined) {
      const has =
        currentOf(line, lang, 'say', this.edits) !== '' ||
        this.edits.has(editId({ table: line.table, key: line.key, lang, field: 'say' })) ||
        this.editing === editId({ table: line.table, key: line.key, lang, field: 'say' });
      if (has)
        cell.append(
          el('span', { className: 'tsaylabel', textContent: at('admin.texts.spoken_as') }),
          this.field(line, lang, 'say'),
        );
      else
        cell.append(
          btn(
            at('admin.texts.add_spoken'),
            'texts-add-say',
            () => {
              this.startEdit(line, lang, 'say');
            },
            'tsmall',
          ),
        );
    }
    return cell;
  }

  /** One field: its text as a tap-to-edit button, or the open editor. */
  private field(line: TextLine, lang: Language, field: TextField): HTMLElement {
    const id = editId({ table: line.table, key: line.key, lang, field });
    if (this.editing === id) return this.editor(line, lang, field);
    const edited = this.edits.has(id);
    const value = currentOf(line, lang, field, this.edits);
    const wrap = el('div', { className: 'tcell' });
    const b = btn(
      value === '' ? at('admin.texts.empty') : value,
      field === 'text' ? 'texts-edit' : 'texts-edit-say',
      () => {
        this.startEdit(line, lang, field);
      },
      `${field === 'text' ? 'ttext' : 'tsay'}${edited ? ' edited' : ''}`,
    );
    b.dataset['lang'] = lang;
    wrap.append(b);
    if (edited && this.stale.has(id)) {
      // Made over an older text: show the text the game has now; keep the edit or revert it.
      const now = originalOf(line, lang, field);
      wrap.append(
        el('span', {
          className: 'terr',
          dataset: { role: 'texts-stale' },
          textContent: fill(at('admin.texts.now_says'), {
            text: now === '' ? at('admin.texts.empty') : now,
          }),
        }),
        el(
          'div',
          { className: 'row' },
          btn(
            at('admin.texts.keep_mine'),
            'texts-keep',
            () => {
              this.stale.delete(id);
              this.setStore({
                ...this.store,
                edits: rebaseEdit(this.store.edits, line, lang, field),
              });
              this.refreshRow(line);
            },
            'tsmall',
          ),
          btn(
            at('admin.texts.revert'),
            'texts-revert-stale',
            () => {
              this.stale.delete(id);
              this.setStore({
                ...this.store,
                edits: withoutEdit(this.store.edits, line, lang, field),
              });
              this.refreshRow(line);
            },
            'tsmall',
          ),
        ),
      );
    } else if (edited) {
      const was = originalOf(line, lang, field);
      wrap.append(
        el('span', {
          className: 'twas',
          textContent: fill(at('admin.texts.was'), {
            text: was === '' ? at('admin.texts.empty') : was,
          }),
        }),
      );
    }
    return wrap;
  }

  private startEdit(line: TextLine, lang: Language, field: TextField): void {
    const before = this.editing;
    this.editing = editId({ table: line.table, key: line.key, lang, field });
    this.error = null;
    if (before !== null) {
      const prev = this.byId.get(before.split('|').slice(0, 2).join('|'));
      if (prev !== undefined && prev !== line) this.refreshRow(prev);
    }
    this.refreshRow(line);
    const ta = this.list.querySelector<HTMLTextAreaElement>('textarea[name=texts-edit]');
    ta?.focus({ preventScroll: true });
    // The whole box (text and buttons) in view, not just the text.
    ta?.closest('[data-editing]')?.scrollIntoView({ block: 'nearest' });
  }

  private editor(line: TextLine, lang: Language, field: TextField): HTMLElement {
    const id = editId({ table: line.table, key: line.key, lang, field });
    const ta = el('textarea', {
      name: 'texts-edit',
      value: currentOf(line, lang, field, this.edits),
      rows: 3,
    });
    ta.setAttribute('aria-label', `${line.key} · ${lang.toUpperCase()}`);
    const err = el('div', {
      className: 'terr',
      dataset: { role: 'texts-error' },
      textContent: this.error ?? '',
    });
    const close = (): void => {
      this.editing = null;
      this.error = null;
      this.refreshRow(line);
    };
    const save = btn(at('admin.texts.save'), 'texts-save', () => {
      const to = ta.value;
      const problem = this.problem(line, lang, field, to);
      if (problem !== null) {
        this.error = problem;
        err.textContent = problem;
        this.republish();
        return;
      }
      this.stale.delete(id);
      this.setStore({ ...this.store, edits: withEdit(this.store.edits, line, lang, field, to) });
      close();
    });
    const cancel = btn(at('admin.texts.cancel'), 'texts-cancel', close);
    const revert = btn(at('admin.texts.revert'), 'texts-revert', () => {
      this.stale.delete(id);
      this.setStore({ ...this.store, edits: withoutEdit(this.store.edits, line, lang, field) });
      close();
    });
    revert.disabled = !this.edits.has(id);
    const buttons = el('div', { className: 'row' }, save, cancel, revert);
    // Phones: keep Save / Cancel above the on-screen keyboard (it shrinks the visual viewport).
    const reveal = (): void => {
      if (buttons.isConnected) buttons.scrollIntoView({ block: 'nearest' });
    };
    ta.addEventListener('focus', () => {
      setTimeout(reveal, 300);
    });
    const vv = window.visualViewport;
    if (vv !== null) {
      const onResize = (): void => {
        if (!buttons.isConnected) vv.removeEventListener('resize', onResize);
        else if (document.activeElement === ta) reveal();
      };
      vv.addEventListener('resize', onResize);
    }
    return el('div', { className: 'tcell', dataset: { editing: id } }, ta, err, buttons);
  }

  /** Why an edit can't be saved (a dropped or added placeholder, an empty line), or null. */
  private problem(line: TextLine, lang: Language, field: TextField, to: string): string | null {
    // A `say` line is checked against what it replaces (its old `say`, else the text).
    const base =
      field === 'say' && originalOf(line, lang, 'say') === ''
        ? originalOf(line, lang, 'text')
        : originalOf(line, lang, field);
    if (field === 'text' && to.trim() === '') return at('admin.texts.empty_text');
    if (field === 'say' && to.trim() === '') return null;
    const c = checkTokens(base, to);
    if (c.ok) return null;
    const names = (list: readonly string[]): string =>
      list.map((t) => (t === '\n' ? at('admin.texts.line_break') : t)).join(', ');
    return [
      ...(c.missing.length > 0
        ? [fill(at('admin.texts.missing'), { list: names(c.missing) })]
        : []),
      ...(c.extra.length > 0 ? [fill(at('admin.texts.extra'), { list: names(c.extra) })] : []),
    ].join(' ');
  }

  // --- clips ----------------------------------------------------------------------------------

  private playButton(line: TextLine, lang: (typeof VOICE_LANGUAGES)[number]): HTMLElement {
    const key = voiceKey(lang, line.key);
    // Until the voice index is in, ▶ shows (a tap then says "no clip" if it has none).
    if (this.clips !== null && this.clips.audio[key] === undefined)
      return el('span', {
        className: 'tnoclip',
        dataset: { clip: key },
        textContent: at('admin.texts.no_clip'),
      });
    const b = btn(
      `▶ ${lang.toUpperCase()}`,
      'texts-play',
      () => {
        void this.play(key, b);
      },
      'tplay',
    );
    b.dataset['clip'] = key;
    b.setAttribute('aria-label', fill(at('admin.texts.play'), { lang: lang.toUpperCase() }));
    return b;
  }

  private async play(key: string, b: HTMLButtonElement): Promise<void> {
    const audio = this.deps.audio;
    // The tap is a gesture: audio may start now.
    audio?.unlock();
    const index = this.clips ?? (await loadVoiceIndex());
    this.clips = index;
    const entry = index?.audio[key];
    let result: 'played' | 'missing' | 'failed' = 'missing';
    if (entry !== undefined) {
      const ref = audio?.fileFormat() === 'ogg' ? entry.ogg : entry.mp3;
      try {
        const res = await fetch(ref.path);
        const bytes = res.ok ? await res.arrayBuffer() : null;
        result =
          bytes !== null && audio !== null && (await playOn(audio, bytes)) ? 'played' : 'failed';
      } catch {
        result = 'failed';
      }
    }
    this.played = { key, result };
    if (result !== 'played')
      b.textContent = at(result === 'missing' ? 'admin.texts.no_clip' : 'admin.texts.clip_failed');
    this.republish();
  }

  // --- export ---------------------------------------------------------------------------------

  private exportText(): string {
    const out = exportEdits(
      this.lines,
      this.store.edits,
      this.deps.build,
      new Date().toISOString(),
    );
    const text = `${JSON.stringify(out, null, 2)}\n`;
    this.lastExport = text;
    this.republish();
    return text;
  }

  private say(msg: string): void {
    this.toast.textContent = msg;
  }

  private download(): void {
    if (this.store.edits.length === 0) {
      this.say(at('admin.texts.nothing'));
      return;
    }
    const text = this.exportText();
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = el('a', { href: url, download: exportFileName(new Date().toISOString()) });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 10_000);
  }

  private async copy(): Promise<void> {
    if (this.store.edits.length === 0) {
      this.say(at('admin.texts.nothing'));
      return;
    }
    const text = this.exportText();
    try {
      await navigator.clipboard.writeText(text);
      this.say(at('admin.texts.copied'));
    } catch {
      // Some embeds block the clipboard: the file's text to copy by hand.
      this.say(at('admin.texts.copy_failed'));
      const box = el('textarea', { className: 'texport', value: text, readOnly: true });
      this.root.querySelector('.texport')?.remove();
      this.list.before(box);
      box.select();
    }
  }

  private async share(): Promise<void> {
    if (this.store.edits.length === 0) {
      this.say(at('admin.texts.nothing'));
      return;
    }
    const text = this.exportText();
    const name = exportFileName(new Date().toISOString());
    try {
      const file = new File([text], name, { type: 'application/json' });
      const data: ShareData = { files: [file], title: name };
      if (!navigator.canShare(data)) throw new Error('no file sharing');
      await navigator.share(data);
      this.say(at('admin.texts.shared'));
    } catch (e) {
      // The owner closing the share sheet is not a failure.
      if (!(e instanceof DOMException && e.name === 'AbortError'))
        this.say(at('admin.texts.share_failed'));
    }
  }
}
