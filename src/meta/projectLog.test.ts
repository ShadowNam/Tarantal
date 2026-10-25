import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checklistProgress,
  decodeCache,
  encodeCache,
  findJob,
  formatApprox,
  formatNamibia,
  formatWindow,
  groupJobs,
  jobTimes,
  latestActivity,
  namibiaParts,
  newestFirst,
  nextUp,
  openNeeds,
  parseProjectLog,
  PROJECT_LOG_URL,
  projectDataUrl,
  pullUrl,
  readProjectLog,
  recentlyDone,
  safeUrl,
  sanitizeLog,
  settledNeeds,
  suggestionGroups,
  withCacheBuster,
  type Job,
  type ProjectLog,
} from './projectLog';

const FIXTURE = join(import.meta.dirname, '../../tests/e2e/fixtures/project-log.json');
const text = readFileSync(FIXTURE, 'utf8');
const raw = JSON.parse(text) as Record<string, unknown>;

function fixture(): ProjectLog {
  const r = parseProjectLog(text);
  if (!r.ok) throw new Error(r.issue);
  return r.log;
}

/** A copy of the raw fixture with one change (deep enough for these tests). */
function patched(fn: (o: Record<string, unknown>) => void): unknown {
  const o = JSON.parse(text) as Record<string, unknown>;
  fn(o);
  return o;
}

/** Item `i` of a list in a patched copy (throws if the fixture lacks it). */
function item(o: Record<string, unknown>, list: string, i: number): Record<string, unknown> {
  const x = (o[list] as Record<string, unknown>[] | undefined)?.[i];
  if (x === undefined) throw new Error(`the fixture has no ${list}[${String(i)}]`);
  return x;
}

const job = (over: Partial<Job>): Job => ({ id: 'j', title: 'T', status: 'next', ...over });

describe('schema', () => {
  it('accepts the e2e fixture', () => {
    const log = fixture();
    expect(log.schema).toBe(1);
    expect(log.jobs.length).toBeGreaterThan(8);
    expect(log.history).toHaveLength(2);
    expect(log.current.commit).toBe('4bd39f1');
  });

  it('tolerates unknown extra fields', () => {
    const r = readProjectLog(
      patched((o) => {
        o['futureField'] = { x: 1 };
        item(o, 'jobs', 0)['colour'] = 'green';
      }),
    );
    expect(r.ok).toBe(true);
  });

  it('reads left-out secondary lists as empty', () => {
    const lists = ['links', 'numbers', 'suggestions', 'requests', 'activity', 'history'];
    const kept = Object.fromEntries(
      Object.entries(raw).filter(
        ([k]) => !lists.includes(k) && !['evolution', 'decisions', 'glossary'].includes(k),
      ),
    );
    const r = readProjectLog(kept);
    expect(r.ok && r.log.history.length === 0 && r.log.glossary.length === 0).toBe(true);
  });

  it('rejects a bad job status with the path of the problem', () => {
    const r = readProjectLog(
      patched((o) => {
        item(o, 'jobs', 2)['status'] = 'finished';
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issue).toMatch(/^jobs\[2\]\.status: /);
  });

  it('rejects a bad needs-you kind and status, and a bad suggestion status', () => {
    const bad = [
      patched((o) => {
        item(o, 'needsYou', 0)['kind'] = 'wish';
      }),
      patched((o) => {
        item(o, 'needsYou', 0)['status'] = 'closed';
      }),
      patched((o) => {
        item(o, 'suggestions', 0)['status'] = 'maybe';
      }),
      patched((o) => {
        item(o, 'activity', 0)['kind'] = 'party';
      }),
    ];
    for (const b of bad) expect(readProjectLog(b).ok).toBe(false);
  });

  it('rejects missing fields', () => {
    const missing = [
      patched((o) => {
        delete o['updated'];
      }),
      patched((o) => {
        delete o['jobs'];
      }),
      patched((o) => {
        delete o['needsYou'];
      }),
      patched((o) => {
        delete o['current'];
      }),
      patched((o) => {
        delete item(o, 'jobs', 0)['title'];
      }),
      patched((o) => {
        delete item(o, 'history', 0)['images'];
      }),
    ];
    for (const m of missing) expect(readProjectLog(m).ok).toBe(false);
    const r = readProjectLog(missing[0]);
    if (!r.ok) expect(r.issue).toMatch(/^updated: /);
  });

  it('rejects another schema version, non-UTC times and non-JSON', () => {
    expect(readProjectLog({ ...raw, schema: 2 }).ok).toBe(false);
    expect(readProjectLog({ ...raw, updated: '2026-10-25 18:20' }).ok).toBe(false);
    expect(readProjectLog({ ...raw, updated: '2026-10-25T18:20:00' }).ok).toBe(false);
    expect(readProjectLog({ ...raw, updated: '2026-10-25T18:20Z' }).ok).toBe(true);
    expect(readProjectLog({ ...raw, updated: '2026-10-25T20:20:00+02:00' }).ok).toBe(true);
    const r = parseProjectLog('<html>404</html>');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issue).toMatch(/^not JSON/);
  });
});

describe('URL allowlist', () => {
  it('keeps https links on the allowed hosts', () => {
    for (const u of [
      'https://github.com/ShadowNam/Tarantal/pull/70',
      'https://raw.githubusercontent.com/ShadowNam/Tarantal/main/docs/history/img/evo-1-v100.jpg',
      'https://shadownam.github.io/Tarantal/?admin=1',
      'https://claude.ai/artifact/abc',
    ])
      expect(safeUrl(u)).toBe(u);
  });

  it('drops other hosts, other schemes, credentials, ports and look-alikes', () => {
    for (const u of [
      'http://github.com/ShadowNam/Tarantal',
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
      'https://example.com/x.png',
      'https://github.com.evil.example/x',
      'https://evilgithub.com/x',
      'https://github.com@evil.example/x',
      'https://user:pw@github.com/x',
      'https://github.com:8443/x',
      'https://gist.github.com/x',
      '//github.com/x',
      'not a url',
      '',
    ])
      expect(safeUrl(u), u).toBeNull();
  });

  it('sanitizeLog drops unsafe links and images everywhere, keeps the rest', () => {
    const log = fixture();
    expect(log.links.map((l) => l.label)).not.toContain('Not allowed (dropped)');
    expect(log.links).toHaveLength(5);
    const dirty = sanitizeLog({
      ...log,
      evolution: [
        { src: 'https://example.com/a.png', caption: 'gone' },
        { src: 'https://github.com/a.png', caption: 'kept', full: 'http://github.com/a.png' },
      ],
      jobs: [job({ links: [{ label: 'x', url: 'ftp://github.com/' }], images: [] })],
      needsYou: [
        {
          id: 'n',
          kind: 'check',
          title: 't',
          detail: '',
          asked: '2026-10-25T10:00:00Z',
          status: 'open',
          images: [{ src: 'https://claude.ai/i.png', caption: 'c', full: 'https://claude.ai/f' }],
        },
      ],
    });
    expect(dirty.evolution).toEqual([{ src: 'https://github.com/a.png', caption: 'kept' }]);
    expect(dirty.jobs[0]?.links).toEqual([]);
    expect(dirty.jobs[0]?.images).toEqual([]);
    expect(dirty.needsYou[0]?.images?.[0]?.full).toBe('https://claude.ai/f');
    expect(dirty.needsYou[0]?.links).toBeUndefined();
  });

  it('?projectData= overrides the URL only for an allowed host', () => {
    expect(projectDataUrl('')).toBe(PROJECT_LOG_URL);
    expect(projectDataUrl('?admin=1&project=1')).toBe(PROJECT_LOG_URL);
    const other = 'https://raw.githubusercontent.com/ShadowNam/Tarantal/preview/project.json';
    expect(projectDataUrl(`?projectData=${encodeURIComponent(other)}`)).toBe(other);
    expect(projectDataUrl('?projectData=https%3A%2F%2Fexample.com%2Fp.json')).toBe(PROJECT_LOG_URL);
    // raw.githubusercontent.com serves anyone's files: only the ShadowNam account's count.
    const theirs = 'https://raw.githubusercontent.com/someone/fake/main/project.json';
    expect(projectDataUrl(`?projectData=${encodeURIComponent(theirs)}`)).toBe(PROJECT_LOG_URL);
    const pages = 'https://shadownam.github.io/Tarantal/preview/project.json';
    expect(projectDataUrl(`?projectData=${pages}`)).toBe(pages);
    expect(projectDataUrl('?projectData=http%3A%2F%2Fgithub.com%2Fp.json')).toBe(PROJECT_LOG_URL);
  });

  it('adds a cache-buster and makes PR links', () => {
    expect(withCacheBuster(PROJECT_LOG_URL, 1761400000123.7)).toBe(
      `${PROJECT_LOG_URL}?t=1761400000123`,
    );
    expect(withCacheBuster('https://github.com/p.json?a=1&t=5', 9)).toBe(
      'https://github.com/p.json?a=1&t=9',
    );
    expect(pullUrl(72)).toBe('https://github.com/ShadowNam/Tarantal/pull/72');
  });
});

describe('Namibia time', () => {
  it('formats UTC times in Africa/Windhoek (UTC+2)', () => {
    expect(formatNamibia('2026-10-25T16:56:00Z')).toBe('25 Oct, 18:56');
    expect(formatNamibia('2026-10-25T22:30:00Z')).toBe('26 Oct, 00:30');
    expect(formatNamibia('2026-10-25T18:56:00+02:00')).toBe('25 Oct, 18:56');
    expect(formatNamibia('2026-07-01T06:05:00Z')).toBe('1 Jul, 08:05');
    expect(namibiaParts('2026-10-25T19:00:00Z')).toEqual({ day: '25 Oct', time: '21:00' });
    expect(formatNamibia('soon')).toBe('soon');
  });

  it('formats estimates and windows', () => {
    expect(formatApprox('2026-10-25T19:00:00Z')).toBe('25 Oct, ~21:00');
    expect(formatWindow('2026-10-26T00:30:00Z', '2026-10-26T04:00:00Z')).toBe(
      '26 Oct, 02:30–06:00',
    );
    expect(formatWindow('2026-10-26T20:00:00Z', '2026-10-27T01:00:00Z')).toBe(
      '26 Oct, 22:00 – 27 Oct, 03:00',
    );
  });

  it('words a job by its status', () => {
    expect(jobTimes(job({ status: 'done', end: '2026-10-25T16:56:00Z' }))).toEqual([
      { key: 'merged', when: '25 Oct, 18:56' },
    ]);
    expect(jobTimes(job({ status: 'done', start: '2026-10-25T16:56:00Z' }))).toEqual([
      { key: 'started', when: '25 Oct, 18:56' },
    ]);
    expect(
      jobTimes(
        job({ status: 'running', start: '2026-10-25T18:05:00Z', end: '2026-10-25T19:00:00Z' }),
      ),
    ).toEqual([
      { key: 'started', when: '25 Oct, 20:05' },
      { key: 'eta', when: '25 Oct, ~21:00' },
    ]);
    expect(
      jobTimes(job({ status: 'next', start: '2026-10-26T00:30:00Z', end: '2026-10-26T04:00:00Z' })),
    ).toEqual([{ key: 'expected', when: '26 Oct, 02:30–06:00' }]);
    expect(jobTimes(job({ status: 'later', start: '2026-10-26T00:30:00Z' }))).toEqual([
      { key: 'expected_from', when: '26 Oct, 02:30' },
    ]);
    expect(jobTimes(job({ status: 'blocked' }))).toEqual([]);
  });
});

describe('selections and orders', () => {
  const log = fixture();

  it('open needs-you items, newest first; settled ones apart', () => {
    expect(openNeeds(log).map((n) => n.id)).toEqual(['n-meerkat-look', 'n-blikkies-cans']);
    expect(settledNeeds(log).map((n) => n.id)).toEqual(['n-fresh-load']);
  });

  it('groups jobs by status in file order', () => {
    const g = groupJobs(log.jobs);
    expect(g.done.map((j) => j.id)).toEqual(['v1.3', 'range', 'v1.5', 'v1.6', 'hist-v1.6']);
    expect(g.active.map((j) => j.id)).toEqual(['v1.6b', 'v1.7c', 'v1.7', 'v1.8']);
    expect(g.planned.map((j) => j.id)).toEqual(['v1.7b', 'v1.9', 'v1.10', 'feesdae']);
  });

  it('checklist progress', () => {
    expect(checklistProgress(findJob(log, 'v1.7c') ?? job({}))).toEqual({ done: 7, total: 9 });
    expect(checklistProgress(job({}))).toBeNull();
    expect(checklistProgress(job({ checklist: [] }))).toBeNull();
  });

  it('next up: the next jobs first, then later ones', () => {
    expect(nextUp(log.jobs).map((j) => j.id)).toEqual(['v1.7b', 'v1.9', 'v1.10']);
    const jobs = [job({ id: 'a', status: 'later' }), job({ id: 'b', status: 'next' })];
    expect(nextUp(jobs, 3).map((j) => j.id)).toEqual(['b', 'a']);
  });

  it('recently done: the latest merges first, at most five', () => {
    expect(recentlyDone(log.jobs).map((j) => j.id)).toEqual([
      'hist-v1.6',
      'v1.6',
      'v1.5',
      'range',
      'v1.3',
    ]);
    const jobs = [
      job({ id: 'old', status: 'done', end: '2026-10-20T10:00:00Z' }),
      job({ id: 'none1', status: 'done' }),
      job({ id: 'new', status: 'done', end: '2026-10-25T10:00:00Z' }),
      job({ id: 'none2', status: 'done' }),
    ];
    expect(recentlyDone(jobs, 2).map((j) => j.id)).toEqual(['new', 'old']);
    expect(recentlyDone(jobs, 4).map((j) => j.id)).toEqual(['new', 'old', 'none2', 'none1']);
  });

  it('latest activity, newest first, capped', () => {
    const a = latestActivity(log, 3);
    expect(a.map((x) => x.kind)).toEqual(['request', 'tests', 'note']);
    expect(latestActivity(log).length).toBe(log.activity.length);
  });

  it('requests and history newest first; suggestions grouped by status', () => {
    expect(newestFirst(log.requests)[0]?.job).toBe('v1.7c');
    expect(newestFirst(log.history)[0]?.decision).toBe('D-042');
    expect(log.requests[0]?.date).toBe('23 Oct, 11:50'); // the file stays oldest first
    const g = suggestionGroups(log.suggestions);
    expect(g.map((x) => x.status)).toEqual(['idea', 'queued', 'done', 'declined']);
    expect(g[0]?.items.map((s) => s.id)).toEqual(['s-night', 's-bow']);
    expect(suggestionGroups([])).toEqual([]);
  });

  it('finds jobs by id', () => {
    expect(findJob(log, 'v1.8')?.status).toBe('blocked');
    expect(findJob(log, 'nope')).toBeUndefined();
    expect(findJob(log, undefined)).toBeUndefined();
  });
});

describe('offline copy', () => {
  it('round-trips the last good log with its time', () => {
    const c = decodeCache(encodeCache('2026-10-25T18:30:00Z', raw));
    expect(c?.savedAt).toBe('2026-10-25T18:30:00Z');
    expect(c?.log.jobs).toHaveLength(fixture().jobs.length);
  });

  it('ignores a missing, damaged or outdated copy', () => {
    expect(decodeCache(null)).toBeNull();
    expect(decodeCache('{')).toBeNull();
    expect(decodeCache('null')).toBeNull();
    expect(
      decodeCache(JSON.stringify({ v: 2, savedAt: '2026-10-25T18:30:00Z', data: raw })),
    ).toBeNull();
    expect(decodeCache(encodeCache('yesterday', raw))).toBeNull();
    expect(decodeCache(encodeCache('2026-10-25T18:30:00Z', { ...raw, schema: 9 }))).toBeNull();
  });
});
