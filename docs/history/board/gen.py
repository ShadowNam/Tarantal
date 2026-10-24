# Builds the build board's data files (milestones.json, v13.json, numbers.json) from the merge history
# on origin/main plus state.json (steps done, running and next; the current job's checklist; figures).
# Usage: python3 docs/history/board/gen.py   (REPO=<path> to point at another checkout)
import json, subprocess, re, sys, os
from datetime import datetime, timezone, timedelta
OUT=os.path.dirname(os.path.abspath(__file__))
REPO=os.environ.get('REPO') or os.path.abspath(os.path.join(OUT,'..','..','..'))
state=json.load(open(os.path.join(OUT,'state.json')))
def git(*a): return subprocess.run(['git','-C',REPO,*a],capture_output=True,text=True,check=True).stdout
def utc(s): return datetime.fromisoformat(s).astimezone(timezone.utc)
prs={}
for line in git('log','--first-parent','--merges','origin/main','--format=%H|%cI|%s').splitlines():
    h,t,s=line.split('|',2); m=re.findall(r'#(\d+)',s)
    if not m: continue
    n=int(m[-1]); first=git('log','--format=%aI','--reverse',f'{h}^1..{h}^2').splitlines()
    prs[n]={'first':utc(first[0]) if first else utc(t),'merged':utc(t)}
init=utc(git('log','--reverse','--format=%aI','origin/main').splitlines()[0])
fmt=lambda d: d.strftime('%-d %b %H:%M')
rows=[]
for i,st in enumerate(state['done']):
    ps=[p for p in st['prs'] if p in prs]
    start=init if st.get('fromInit') else min(prs[p]['first'] for p in ps)
    end=max(prs[p]['merged'] for p in ps)
    h=(end-start).total_seconds()/3600
    rows.append({'order':i+1,'phase':st['phase'],'step':st['step'],'status':'done','start':start.isoformat().replace('+00:00','Z'),
      'end':end.isoformat().replace('+00:00','Z'),'hours':round(h,1),'prs':st['prlabel'],
      'when':f"{fmt(start)} – {fmt(end)}",'took':f"{h:.1f} h"})
for st in state['open']:
    s=utc(st['start']); e=utc(st['end']); h=(e-s).total_seconds()/3600
    rows.append({'order':len(rows)+1,'phase':st['phase'],'step':st['step'],'status':st['status'],'start':s.isoformat().replace('+00:00','Z'),
      'end':e.isoformat().replace('+00:00','Z'),'hours':round(h,1),'prs':st.get('prlabel',''),
      'when':(f"started {fmt(s)}, done ≈ {fmt(e)}" if st['status']=='running' else f"≈ {fmt(s)} – {fmt(e)}"),
      'took':(f"≈ {h:.0f} h (est.)")})
asof=state['asOf']
json.dump([dict(r, asOf=asof) for r in rows],open(os.path.join(OUT,'milestones.json'),'w'),ensure_ascii=False,indent=1)
json.dump([dict(r, asOf=asof) for r in state['checklist']],open(os.path.join(OUT,'v13.json'),'w'),ensure_ascii=False,indent=1)
nums=[{'metric':'PRs merged','value':len(prs),'note':f"#1 to #{max(prs)}"},
      {'metric':'Commits on main','value':int(git('rev-list','--count','origin/main').strip()),'note':'every change, all checked by CI'}]+state['numbers']
json.dump([dict(r, asOf=asof) for r in nums],open(os.path.join(OUT,'numbers.json'),'w'),ensure_ascii=False,indent=1)
print(len(rows),'steps;',len(prs),'PRs; asOf',asof)
