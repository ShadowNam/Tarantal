# Prints a gun × map table of competent means from a namibie-sweep.sh JSONL file.
import json, sys
rows = []
for l in open(sys.argv[1]):
    if not l.startswith('{'):
        continue
    try:
        rows.append(json.loads(l))
    except ValueError:
        print('FAILED RUN:', l[:60].strip(), file=sys.stderr)
los = ["dubbelloop:", "pomp:", "windbuks:", "kettie:", "twee_twee:iron", "twee_twee:peep", "twee_twee:scope_small", "langloop:scope_var"]
names = ["Dubbelloop", "Pomp", "Windbuks", "Kettie", ".22 iron", ".22 peep", ".22 scope", "Langloop"]
t = {}
for r in rows:
    try:
        t.setdefault(r['map'], {})[r['loadout']] = r['report']['summaries'][0]['mean']
    except Exception:
        pass
print('| Map | ' + ' | '.join(names) + ' | Worst |')
print('|---' * (len(names) + 2) + '|')
for m, v in t.items():
    vals = [v.get(l) for l in los]
    worst = max((x for x in vals if x is not None), default=0)
    cells = [('**%d**' % round(x) if x is not None and x > 4500 else ('%d' % round(x) if x is not None else '–')) for x in vals]
    print('| %s | %s | %d |' % (m, ' | '.join(cells), round(worst)))
