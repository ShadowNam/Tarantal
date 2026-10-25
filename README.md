# project-log (data branch)

Live data for the admin page's **Project overview** (D-045). The page reads
`https://raw.githubusercontent.com/ShadowNam/Tarantal/project-log/project.json`.

- `project.json` — what the page reads. Generated; don't edit by hand.
- `live.json` — the hand-kept parts: summary, needs-you items, per-job checklists, suggestions,
  activity, extra requests and decisions. Edited by the supervisor (Claude) at check-ins, merges
  and screenshot rounds.
- `tools/build.py` — builds `project.json` from `live.json`, the build board's state and the
  history data on `main` (`docs/history/history-data.cjs`).
- `img/` — images that aren't on `main` yet (work-in-progress pictures).

No CI runs on this branch, so updates go live within ~5 minutes (the CDN cache) without a deploy.
