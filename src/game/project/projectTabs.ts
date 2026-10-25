// D-045 Project overview: the five tabs (Overview, Roadmap, History, Requests, Ideas) built from
// a checked, sanitised project log. Pure DOM building: the selections and orders come from
// src/meta/projectLog.ts (unit-tested), chrome strings from the page's i18n tables, the log's
// text as textContent. Lives in the page's lazy chunk.
import {
  checklistProgress,
  findJob,
  formatNamibia,
  groupJobs,
  jobGroup,
  jobTimes,
  latestActivity,
  newestFirst,
  nextUp,
  openNeeds,
  recentlyDone,
  settledNeeds,
  suggestionGroups,
  type Activity,
  type ActivityKind,
  type HistoryStage,
  type Job,
  type JobGroup,
  type JobStatus,
  type JobTime,
  type NeedKind,
  type NeedsYou,
  type ProjectLog,
  type ProjectRequest,
  type Suggestion,
  type SuggestionStatus,
} from '../../meta/projectLog';
import {
  button,
  chip,
  el,
  gallery,
  linkEl,
  linksRow,
  para,
  prLinks,
  type ShowImage,
} from './projectDom';
import { pf, pt, type ProjectKey } from './projectI18n';

export const TABS = ['overview', 'roadmap', 'history', 'requests', 'ideas'] as const;
export type TabId = (typeof TABS)[number];

export const TAB_KEYS: Record<TabId, ProjectKey> = {
  overview: 'project.tab_overview',
  roadmap: 'project.tab_roadmap',
  history: 'project.tab_history',
  requests: 'project.tab_requests',
  ideas: 'project.tab_ideas',
};

const STATUS_KEYS: Record<JobStatus, ProjectKey> = {
  done: 'project.status_done',
  review: 'project.status_review',
  running: 'project.status_running',
  blocked: 'project.status_blocked',
  next: 'project.status_next',
  later: 'project.status_later',
};
const GROUP_KEYS: Record<JobGroup, ProjectKey> = {
  done: 'project.group_done',
  active: 'project.group_active',
  planned: 'project.group_planned',
};
const KIND_KEYS: Record<NeedKind, ProjectKey> = {
  decision: 'project.kind_decision',
  feedback: 'project.kind_feedback',
  question: 'project.kind_question',
  check: 'project.kind_check',
};
const ACTIVITY_KEYS: Record<ActivityKind, ProjectKey> = {
  merge: 'project.activity_merge',
  screenshots: 'project.activity_screenshots',
  tests: 'project.activity_tests',
  request: 'project.activity_request',
  decision: 'project.activity_decision',
  note: 'project.activity_note',
};
const IDEA_KEYS: Record<SuggestionStatus, ProjectKey> = {
  idea: 'project.idea_idea',
  queued: 'project.idea_queued',
  done: 'project.idea_done',
  declined: 'project.idea_declined',
};
const TIME_KEYS: Record<JobTime['key'], ProjectKey> = {
  merged: 'project.merged',
  started: 'project.started',
  eta: 'project.eta',
  expected: 'project.expected',
  expected_from: 'project.expected_from',
};

export interface ViewContext {
  readonly log: ProjectLog;
  /** Opens the lightbox on a picture of a set. */
  readonly show: ShowImage;
}

export function renderTab(tab: TabId, ctx: ViewContext): HTMLElement {
  switch (tab) {
    case 'overview':
      return overview(ctx);
    case 'roadmap':
      return roadmap(ctx);
    case 'history':
      return history(ctx);
    case 'requests':
      return requests(ctx);
    case 'ideas':
      return ideas(ctx);
  }
}

// --- shared pieces ----------------------------------------------------------------------------

function section(title: string, role: string, cls = ''): HTMLElement {
  return el('section', { className: cls, dataset: { role } }, el('h2', { textContent: title }));
}

function empty(key: ProjectKey): HTMLElement {
  return el('p', { className: 'muted empty', textContent: pt(key) });
}

const statusChip = (s: JobStatus): HTMLElement => chip(pt(STATUS_KEYS[s]), `s-${s}`);
const versionChip = (job: Job): HTMLElement => chip(job.id, 'ver');

/** "merged 25 Oct, 18:56 · build 1.6.0" (and who, for jobs not done). */
function whenText(job: Job, withOwner: boolean): string {
  const parts = jobTimes(job).map((t) => pf(TIME_KEYS[t.key], { when: t.when }));
  if (job.version !== undefined) parts.push(pf('project.in_build', { version: job.version }));
  if (withOwner && job.owner !== undefined) parts.push(pf('project.owner', { who: job.owner }));
  return parts.join(' · ');
}

/** "v1.8 · Blikkies" for a job id (the id itself when the log has no such job). */
function jobRef(log: ProjectLog, id: string): string {
  const j = findJob(log, id);
  return j === undefined ? id : `${j.id} · ${j.title}`;
}

/** A job named by a request or idea: its version, title and status. */
function jobBadge(log: ProjectLog, id: string | undefined): HTMLElement[] {
  if (id === undefined) return [];
  const j = findJob(log, id);
  if (j === undefined) return [el('div', { className: 'jref muted', textContent: id })];
  return [
    el(
      'div',
      { className: 'jref', dataset: { job: j.id } },
      versionChip(j),
      el('span', { className: 't', textContent: j.title }),
      statusChip(j.status),
    ),
  ];
}

function progressBar(done: number, total: number): HTMLElement {
  const bar = el('span', { className: 'bar' }, el('i'));
  const fill = bar.firstElementChild;
  if (fill instanceof HTMLElement) fill.style.width = `${String((done / total) * 100)}%`;
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', String(total));
  bar.setAttribute('aria-valuenow', String(done));
  return el(
    'div',
    { className: 'prog', dataset: { role: 'progress' } },
    bar,
    el('span', { className: 'pn', textContent: pf('project.progress', { done, total }) }),
  );
}

function checklist(job: Job): HTMLElement[] {
  const list = job.checklist ?? [];
  if (list.length === 0) return [];
  return [
    el(
      'ul',
      { className: 'check', dataset: { role: 'checklist' } },
      ...list.map((c) =>
        el(
          'li',
          { className: c.done ? 'on' : '' },
          el('span', { className: 'box', textContent: c.done ? '✓' : '' }),
          el('span', { className: 'txt', textContent: c.text }),
          ...(c.at === undefined
            ? []
            : [el('span', { className: 'at', textContent: formatNamibia(c.at) })]),
        ),
      ),
    ),
  ];
}

/** A <details> with a counted summary line (closed by default). */
function fold(summary: string, role: string, ...body: Node[]): HTMLDetailsElement {
  return el(
    'details',
    { className: 'fold', dataset: { role } },
    el('summary', { textContent: summary }),
    ...body,
  );
}

// --- Overview -----------------------------------------------------------------------------------

function overview(ctx: ViewContext): HTMLElement {
  const { log } = ctx;
  const cur = log.current;
  const build =
    cur.deployed === undefined
      ? pf('project.current', { version: cur.version, commit: cur.commit })
      : pf('project.deployed', {
          version: cur.version,
          commit: cur.commit,
          when: formatNamibia(cur.deployed),
        });
  const summary = el(
    'div',
    { className: 'card summary', dataset: { role: 'summary' } },
    para(log.summary),
    el('p', { className: 'muted', textContent: `${build} ${pf('project.by', { who: log.by })}` }),
  );
  const colA = el('div', { className: 'col' }, needs(ctx), now(ctx), activity(ctx));
  const colB = el(
    'div',
    { className: 'col' },
    upNext(ctx),
    lastDone(ctx),
    ...numbers(ctx),
    ...links(ctx),
  );
  return el('div', { className: 'tabview' }, summary, el('div', { className: 'ov' }, colA, colB));
}

function needs(ctx: ViewContext): HTMLElement {
  const open = openNeeds(ctx.log);
  const settled = settledNeeds(ctx.log);
  const badge = el('span', {
    className: open.length === 0 ? 'badge zero' : 'badge',
    textContent: open.length === 0 ? '✓' : String(open.length),
    dataset: { role: 'needs-count', n: String(open.length) },
  });
  badge.setAttribute('aria-label', pf('project.needs_open', { n: open.length }));
  const s = el(
    'section',
    { className: 'needs o1', dataset: { role: 'needs' } },
    el('h2', {}, pt('project.needs_you'), badge),
  );
  if (open.length === 0) s.append(empty('project.needs_none'));
  for (const n of open) s.append(needCard(n, ctx));
  if (settled.length > 0)
    s.append(
      fold(
        pf('project.settled', { n: settled.length }),
        'settled',
        ...settled.map((n) => needCard(n, ctx)),
      ),
    );
  return s;
}

function needCard(n: NeedsYou, ctx: ViewContext): HTMLElement {
  const card = el('article', {
    className: `need${n.status === 'open' ? '' : ' closed'}`,
    dataset: { need: n.id, status: n.status },
  });
  card.append(
    el(
      'div',
      { className: 'nhead' },
      chip(pt(KIND_KEYS[n.kind]), `k-${n.kind}`),
      el('h3', {
        textContent: n.title,
      }),
    ),
  );
  if (n.detail !== '') card.append(para(n.detail));
  if (n.options !== undefined && n.options.length > 0)
    card.append(
      el('div', { className: 'label', textContent: pt('project.options') }),
      el('ol', { className: 'opts' }, ...n.options.map((o) => el('li', { textContent: o }))),
    );
  if (n.answer !== undefined)
    card.append(
      el('p', { className: 'answer', textContent: pf('project.answer', { text: n.answer }) }),
    );
  else if (n.status === 'dropped') card.append(chip(pt('project.dropped'), 's-later'));
  const meta = [pf('project.asked', { when: formatNamibia(n.asked) })];
  if (n.answered !== undefined)
    meta.push(pf('project.answered', { when: formatNamibia(n.answered) }));
  if (n.blocks !== undefined) meta.push(pf('project.blocks', { job: jobRef(ctx.log, n.blocks) }));
  card.append(
    el('div', { className: 'muted meta-line', textContent: meta.join(' · ') }),
    ...linksRow(n.links),
    ...gallery(n.images ?? [], ctx.show, n.title, 'gallery small'),
  );
  return card;
}

function now(ctx: ViewContext): HTMLElement {
  const active = groupJobs(ctx.log.jobs).active;
  const s = section(pt('project.now_building'), 'now', 'o2');
  if (active.length === 0) s.append(empty('project.nothing_running'));
  for (const job of active) s.append(activeCard(job, ctx));
  return s;
}

function activeCard(job: Job, ctx: ViewContext): HTMLElement {
  const card = el('article', {
    className: `card job s-${job.status}`,
    dataset: { job: job.id, status: job.status },
  });
  card.append(
    el(
      'div',
      { className: 'jline' },
      versionChip(job),
      el('h3', { className: 't', textContent: job.title }),
      statusChip(job.status),
    ),
  );
  const p = checklistProgress(job);
  if (p !== null) card.append(progressBar(p.done, p.total));
  const hasEta = jobTimes(job).some((t) => t.key === 'eta');
  card.append(
    el('div', {
      className: 'when',
      textContent: whenText(job, true),
      dataset: { role: hasEta ? 'eta' : 'when' },
    }),
  );
  if (job.summary !== undefined && job.status === 'blocked')
    card.append(para(job.summary, 'small'));
  const refs = [...prLinks(job.prs), ...(job.links ?? []).map((l) => linkEl(l))];
  if (refs.length > 0) card.append(el('div', { className: 'links' }, ...refs));
  if (p !== null)
    card.append(
      fold(
        pf('project.checklist', { done: p.done, total: p.total }),
        'checklist-fold',
        ...checklist(job),
      ),
    );
  // Work-in-progress pictures as the supervisor publishes them.
  card.append(...gallery(job.images ?? [], ctx.show, job.title, 'gallery small'));
  return card;
}

/** One line per job: tick (done) or version, title, then its dates. */
function jobLine(job: Job): HTMLElement {
  const done = job.status === 'done';
  return el(
    'div',
    { className: 'jl', dataset: { job: job.id, status: job.status } },
    el('span', { className: done ? 'tick on' : 'tick', textContent: done ? '✓' : '' }),
    el(
      'div',
      { className: 'jlb' },
      el(
        'div',
        { className: 'jline' },
        versionChip(job),
        el('span', { className: 't', textContent: job.title }),
      ),
      // PR numbers as text here: their links are on the Roadmap (a line of links is no tap target).
      el('div', {
        className: 'when',
        textContent: [whenText(job, false), ...(job.prs ?? []).map((n) => `#${String(n)}`)]
          .filter((x) => x !== '')
          .join(' · '),
      }),
    ),
  );
}

function upNext(ctx: ViewContext): HTMLElement {
  const list = nextUp(ctx.log.jobs);
  const s = section(pt('project.next_up'), 'next', 'o3');
  if (list.length === 0) s.append(empty('project.nothing_planned'));
  else s.append(el('div', { className: 'card list' }, ...list.map((j) => jobLine(j))));
  return s;
}

function lastDone(ctx: ViewContext): HTMLElement {
  const list = recentlyDone(ctx.log.jobs);
  const s = section(pt('project.recently_done'), 'done', 'o4');
  if (list.length > 0)
    s.append(el('div', { className: 'card list' }, ...list.map((j) => jobLine(j))));
  return s;
}

function numbers(ctx: ViewContext): HTMLElement[] {
  if (ctx.log.numbers.length === 0) return [];
  const s = section(pt('project.numbers'), 'numbers', 'o5');
  s.append(
    el(
      'div',
      { className: 'nums' },
      ...ctx.log.numbers.map((n) =>
        el(
          'div',
          { className: 'num' },
          el('div', { className: 'v', textContent: n.value }),
          el('div', { className: 'l', textContent: n.label }),
          ...(n.note === undefined ? [] : [el('div', { className: 'n', textContent: n.note })]),
        ),
      ),
    ),
  );
  return [s];
}

function links(ctx: ViewContext): HTMLElement[] {
  if (ctx.log.links.length === 0) return [];
  const s = section(pt('project.links'), 'links', 'o6');
  s.append(...linksRow(ctx.log.links));
  return [s];
}

function activity(ctx: ViewContext): HTMLElement {
  const list = latestActivity(ctx.log);
  const s = section(pt('project.activity'), 'activity', 'o7');
  if (list.length === 0) return s;
  s.append(el('ul', { className: 'acts-list' }, ...list.map((a) => activityItem(a, ctx))));
  return s;
}

function activityItem(a: Activity, ctx: ViewContext): HTMLElement {
  return el(
    'li',
    { className: 'act', dataset: { kind: a.kind } },
    el(
      'div',
      { className: 'ahead' },
      el('span', { className: 'at', textContent: formatNamibia(a.at) }),
      chip(pt(ACTIVITY_KEYS[a.kind]), `a-${a.kind}`),
    ),
    para(a.text),
    ...linksRow(a.links),
    ...gallery(a.images ?? [], ctx.show, a.text, 'gallery small'),
  );
}

// --- Roadmap ------------------------------------------------------------------------------------

let rowIds = 0;

function roadmap(ctx: ViewContext): HTMLElement {
  const g = groupJobs(ctx.log.jobs);
  const view = el('div', { className: 'tabview' });
  for (const group of ['done', 'active', 'planned'] as const) {
    const jobs = g[group];
    view.append(
      el(
        'section',
        { className: `rgroup g-${group}`, dataset: { role: `group-${group}` } },
        el(
          'h2',
          {},
          pt(GROUP_KEYS[group]),
          el('span', { className: 'count', textContent: String(jobs.length) }),
        ),
        ...(jobs.length === 0 ? [empty('project.empty')] : jobs.map((j) => jobRow(j, ctx))),
      ),
    );
  }
  return view;
}

function jobRow(job: Job, ctx: ViewContext): HTMLElement {
  const id = `tm-project-job-${String(++rowIds)}`;
  const done = job.status === 'done';
  const more = el('div', { className: 'jmore', id, hidden: true });
  let built = false;
  const toggle = button(
    [
      // Two parts that share a line on wide screens and stack on narrow ones.
      el(
        'span',
        { className: 'l1' },
        el('span', { className: 'arrow', textContent: '▸' }),
        el('span', {
          className: done ? 'tick on' : `tick ${jobGroup(job.status)}`,
          textContent: done ? '✓' : '',
        }),
        versionChip(job),
        el('span', { className: 't', textContent: job.title }),
      ),
      el(
        'span',
        { className: 'l2' },
        statusChip(job.status),
        el('span', { className: 'when', textContent: whenText(job, false) }),
      ),
    ],
    'expand',
    () => {
      if (!built) {
        built = true;
        more.append(...jobDetails(job, ctx));
      }
      more.hidden = !more.hidden;
      toggle.setAttribute('aria-expanded', String(!more.hidden));
    },
    'jt',
  );
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', id);
  return el(
    'div',
    { className: `jrow s-${job.status}`, dataset: { job: job.id, status: job.status } },
    el('div', { className: 'jhead' }, toggle, ...prLinks(job.prs)),
    more,
  );
}

function jobDetails(job: Job, ctx: ViewContext): Node[] {
  const out: Node[] = [];
  if (job.summary !== undefined) out.push(para(job.summary));
  const p = checklistProgress(job);
  if (p !== null) out.push(progressBar(p.done, p.total), ...checklist(job));
  if (job.tests !== undefined)
    out.push(
      el('div', { className: 'label', textContent: pt('project.tests') }),
      para(job.tests, 'small'),
    );
  const facts = [
    whenText(job, true),
    ...(job.phase === undefined ? [] : [job.phase]),
    ...(job.requestedBy === undefined
      ? []
      : [pf('project.requested_by', { who: job.requestedBy })]),
  ].filter((x) => x !== '');
  if (facts.length > 0)
    out.push(el('div', { className: 'muted meta-line', textContent: facts.join(' · ') }));
  out.push(...linksRow(job.links), ...gallery(job.images ?? [], ctx.show, job.title));
  return out;
}

// --- History ------------------------------------------------------------------------------------

function history(ctx: ViewContext): HTMLElement {
  const { log } = ctx;
  const view = el('div', { className: 'tabview' });
  if (log.history.length === 0) view.append(empty('project.history_empty'));
  newestFirst(log.history).forEach((stage, i) => {
    view.append(stageCard(stage, i, ctx));
  });
  if (log.evolution.length > 0) {
    const s = section(pt('project.evolution'), 'evolution');
    s.append(...gallery(log.evolution, ctx.show, pt('project.evolution'), 'strip'));
    view.append(s);
  }
  if (log.decisions.length > 0)
    view.append(
      fold(
        pf('project.decisions', { n: log.decisions.length }),
        'decisions',
        el(
          'dl',
          { className: 'defs' },
          ...log.decisions.flatMap((d) => [
            el('dt', { textContent: d.id }),
            el('dd', { textContent: d.text }),
          ]),
        ),
      ),
    );
  if (log.glossary.length > 0)
    view.append(
      fold(
        pf('project.glossary', { n: log.glossary.length }),
        'glossary',
        el(
          'dl',
          { className: 'defs' },
          ...log.glossary.flatMap((g) => [
            el('dt', { textContent: g.term }),
            el('dd', { textContent: g.meaning }),
          ]),
        ),
      ),
    );
  return view;
}

function stageCard(stage: HistoryStage, i: number, ctx: ViewContext): HTMLElement {
  const meta = [
    stage.when,
    ...(stage.prs === undefined ? [] : [stage.prs]),
    ...(stage.decision === undefined ? [] : [pf('project.decision_ref', { id: stage.decision })]),
  ];
  const card = el(
    'article',
    { className: 'card hstage', dataset: { stage: String(i) } },
    el('h3', { textContent: stage.title }),
    el('div', { className: 'muted meta-line', textContent: meta.join(' · ') }),
    para(stage.intro),
  );
  if (stage.bullets.length > 0)
    card.append(
      el('ul', { className: 'bul' }, ...stage.bullets.map((b) => el('li', { textContent: b }))),
    );
  const fb = stage.feedback ?? [];
  if (fb.length > 0)
    card.append(
      fold(
        `${stage.feedbackLabel ?? pt('project.feedback')} (${String(fb.length)})`,
        'feedback',
        el('ul', { className: 'bul' }, ...fb.map((b) => el('li', { textContent: b }))),
      ),
    );
  card.append(...gallery(stage.images, ctx.show, stage.title));
  return card;
}

// --- Requests -----------------------------------------------------------------------------------

function requests(ctx: ViewContext): HTMLElement {
  const view = el('div', { className: 'tabview' });
  if (ctx.log.requests.length === 0) view.append(empty('project.requests_empty'));
  view.append(...newestFirst(ctx.log.requests).map((r) => requestCard(r, ctx)));
  return view;
}

function requestCard(r: ProjectRequest, ctx: ViewContext): HTMLElement {
  return el(
    'article',
    { className: 'card req' },
    el('div', { className: 'muted', textContent: r.date }),
    el('blockquote', { className: 'pl', textContent: r.text }),
    el(
      'div',
      { className: 'outcome' },
      el('span', { className: 'arrow', textContent: '→' }),
      el('span', { className: 'pl', textContent: r.outcome }),
    ),
    ...jobBadge(ctx.log, r.job),
  );
}

// --- Ideas --------------------------------------------------------------------------------------

function ideas(ctx: ViewContext): HTMLElement {
  const view = el('div', { className: 'tabview' });
  const groups = suggestionGroups(ctx.log.suggestions);
  if (groups.length === 0) view.append(empty('project.ideas_empty'));
  for (const g of groups)
    view.append(
      el(
        'section',
        { className: `igroup i-${g.status}`, dataset: { role: `ideas-${g.status}` } },
        el(
          'h2',
          {},
          pt(IDEA_KEYS[g.status]),
          el('span', { className: 'count', textContent: String(g.items.length) }),
        ),
        ...g.items.map((s) => ideaCard(s, ctx)),
      ),
    );
  return view;
}

function ideaCard(s: Suggestion, ctx: ViewContext): HTMLElement {
  return el(
    'article',
    { className: `card idea i-${s.status}`, dataset: { idea: s.id } },
    el('h3', { textContent: s.title }),
    ...(s.detail === '' ? [] : [para(s.detail)]),
    el('div', {
      className: 'muted',
      textContent: pf('project.from', { who: s.from, when: formatNamibia(s.date) }),
    }),
    ...jobBadge(ctx.log, s.job),
  );
}
