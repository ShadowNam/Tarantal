#!/usr/bin/env python3
"""Builds project.json for the admin page's Project overview (D-045).

Inputs: the build board (board/state.json + gen.py's milestones.json), the history data on
origin/main (docs/history/history-data.cjs) and live.json (needs-you, suggestions, activity,
per-job details). Output: project.json, published on the `project-log` branch.

Usage: python3 build.py --board <board dir> --live <live.json> --out <project.json>
"""
import argparse, json, os, re, subprocess, sys, tempfile

REPO = '/home/user/Tarantal'
RAW = 'https://raw.githubusercontent.com/ShadowNam/Tarantal'
GH = 'https://github.com/ShadowNam/Tarantal'


def history_data():
    src = subprocess.run(['git', '-C', REPO, 'show', 'origin/main:docs/history/history-data.cjs'],
                         capture_output=True, text=True, check=True).stdout
    with tempfile.NamedTemporaryFile('w', suffix='.cjs', delete=False) as f:
        f.write(src)
        path = f.name
    try:
        out = subprocess.run(['node', '-e', 'process.stdout.write(JSON.stringify(require(process.argv[1])))', path],
                             capture_output=True, text=True, check=True).stdout
    finally:
        os.unlink(path)
    return json.loads(out)


def hist_img(name, caption):
    return {'src': f'{RAW}/main/docs/history/img/{name}.jpg', 'caption': caption}


MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']


def to_namibia(text):
    """'24 Oct, 12:05' / '25 Oct 2026, 04:39' (UTC, as the history doc writes them) → Namibia time."""
    import datetime as dt

    def sub(m):
        day, mon, year, hh, mm = m.group(1), m.group(2), m.group(3), m.group(4), m.group(5)
        t = dt.datetime(int(year or 2026), MONTHS.index(mon) + 1, int(day), int(hh), int(mm)) + dt.timedelta(hours=2)
        y = f' {t.year},' if year else ','
        return f'{t.day} {MONTHS[t.month - 1]}{y} {t.hour:02d}:{t.minute:02d}'
    return re.sub(r'(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?: (\d{4}))?, (\d{2}):(\d{2})', sub, text or '')


def prs_of(label):
    """'#1', '#7–#9', '#10, #11', 'PR #71: …' → [ints]"""
    out = []
    for a, b in re.findall(r'#(\d+)(?:\s*[–-]\s*#(\d+))?', label or ''):
        if b:
            out.extend(range(int(a), int(b) + 1))
        else:
            out.append(int(a))
    return out


def job_id(step):
    if step.startswith('Project overview'):
        return 'project-overview'
    m = re.match(r'^(M\d+)\b', step)
    if m:
        return m.group(1)
    m = re.match(r'^(v\d+\.\d+(?:\.\d+)?[a-z]?(?: [AB]\b)?)', step)
    if m:
        return m.group(1)
    return re.sub(r'[^a-z0-9]+', '-', step.lower()).strip('-')[:40]


def version_of(jid, step):
    if jid == 'M10' or step.startswith('M10'):
        return '1.0.0'
    m = re.match(r'^v(\d+)\.(\d+)(?:\.(\d+))?([a-z])?', jid)
    if not m:
        return None
    major, minor, patch, letter = m.groups()
    if patch is not None:
        return f'{major}.{minor}.{patch}'
    p = 0 if letter is None else ord(letter) - ord('a')
    return f'{major}.{minor}.{p}'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--board', required=True)
    ap.add_argument('--live', required=True)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()

    live = json.load(open(a.live))
    rows = json.load(open(os.path.join(a.board, 'milestones.json')))
    state = json.load(open(os.path.join(a.board, 'state.json')))
    h = history_data()

    # History stages, newest first in the page (the page sorts; keep source order here).
    history = []
    stage_imgs = []  # (prs, images, intro)
    for st in h['stages']:
        imgs = [hist_img(i['img'], i['caption']) for i in st.get('images', [])]
        history.append({k: v for k, v in {
            'title': st['title'], 'when': to_namibia(st.get('when', '')), 'prs': st.get('prs'),
            'decision': st.get('decision'), 'intro': st.get('intro', ''),
            'bullets': st.get('bullets', []), 'feedbackLabel': st.get('feedbackLabel'),
            'feedback': st.get('feedback'), 'images': imgs,
        }.items() if v is not None})
        stage_imgs.append((set(prs_of(st.get('prs', ''))), imgs, st.get('intro', '')))

    open_by_step = {o['step']: o for o in state.get('open', [])}
    jobs = []
    for r in rows:
        step = r['step']
        jid = job_id(step)
        extra = live.get('jobs', {}).get(jid, {})
        prs = prs_of(r.get('prs', ''))
        if r['status'] != 'done':
            prs = prs or prs_of(open_by_step.get(step, {}).get('prlabel', ''))
        status = {'done': 'done', 'running': 'running', 'next': 'next'}.get(r['status'], 'later')
        job = {
            'id': jid,
            'title': step,
            'phase': r.get('phase'),
            'status': extra.get('status', status),
            'start': r.get('start'),
            'end': r.get('end'),
            'estimate': r['status'] != 'done',
            'prs': prs,
        }
        v = extra.get('version', version_of(jid, step))
        if v:
            job['version'] = v
        imgs = []
        summary = None
        for sp, si, intro in stage_imgs:
            if sp and sp & set(prs) and r['status'] == 'done':
                imgs.extend(si)
                summary = summary or intro
        if summary and 'summary' not in extra:
            job['summary'] = summary
        if imgs and 'images' not in extra:
            job['images'] = imgs[:6]
        for k in ('summary', 'owner', 'checklist', 'tests', 'images', 'links', 'requestedBy', 'title', 'start', 'end'):
            if k in extra:
                job[k] = extra[k]
        if r['status'] != 'done' and open_by_step.get(step, {}).get('prlabel') and 'summary' not in job:
            job['summary'] = open_by_step[step]['prlabel']
        jobs.append({k: v for k, v in job.items() if v not in (None, [], '')})

    requests = [{'date': to_namibia(d), 'text': t, 'outcome': o} for d, t, o in h['requests']]
    requests += live.get('extraRequests', [])
    decisions = [{'id': i, 'text': t} for i, t in h['decisions']] + live.get('extraDecisions', [])
    out = {
        'schema': 1,
        'updated': live['updated'],
        'by': 'Claude',
        'summary': live['summary'],
        'current': live['current'],
        'links': live['links'],
        'numbers': live.get('numbers') or [{'label': l, 'value': v} for l, v in h['numbers']],
        'needsYou': live.get('needsYou', []),
        'jobs': jobs,
        'suggestions': live.get('suggestions', []),
        'requests': requests,
        'activity': sorted(live.get('activity', []), key=lambda x: x['at'], reverse=True),
        'history': history,
        'evolution': [hist_img(e['img'], e['caption']) for e in h.get('evolution', [])],
        'decisions': decisions,
        'glossary': [{'term': t, 'meaning': m} for t, m in h.get('glossary', [])],
    }
    # Basic checks (the page's Zod schema is the real gate).
    allowed = ('https://github.com/', 'https://raw.githubusercontent.com/', 'https://shadownam.github.io/', 'https://claude.ai/')
    def walk(x, path='$'):
        if isinstance(x, dict):
            for k, v in x.items():
                if k in ('url', 'src', 'full') and isinstance(v, str) and not v.startswith(allowed):
                    sys.exit(f'bad url at {path}.{k}: {v}')
                walk(v, f'{path}.{k}')
        elif isinstance(x, list):
            for i, v in enumerate(x):
                walk(v, f'{path}[{i}]')
    walk(out)
    json.dump(out, open(a.out, 'w'), ensure_ascii=False, indent=1)
    print(f"project.json: {len(jobs)} jobs ({sum(j['status']=='done' for j in jobs)} done), "
          f"{len(out['needsYou'])} needs-you, {len(history)} stages, {len(out['activity'])} activity, "
          f"{os.path.getsize(a.out)//1024} KB")


if __name__ == '__main__':
    main()
