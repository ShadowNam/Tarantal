# Project log (the admin page's Project overview)

The playtest admin page (`?admin=1` on the test build or `npm run dev`) has a **Project overview**
button. It shows the product owner where the build stands: what needs their answer, what is being
built and when it lands, the roadmap, the history with its pictures, their requests and the ideas.
`?admin=1&project=1` opens it directly (a bookmark). Decision D-045, Tech §8.4.

The page reads **one JSON file** that the supervisor (Claude) keeps up to date.

## Where it lives

- Branch **`project-log`** of `ShadowNam/Tarantal`, file **`project.json`** at its root.
- The page loads
  `https://raw.githubusercontent.com/ShadowNam/Tarantal/project-log/project.json?t=<now>`.
  GitHub's CDN may still answer with a copy up to about 5 minutes old.
- No CI runs on that branch and nothing is deployed: a push shows on the page within minutes, on
  the live test build and on every open admin page (press Refresh).
- The branch holds only this file (an orphan branch). Never merge it into `main`.

## How the supervisor updates it

1. Edit `project.json` in a worktree of the branch
   (`git fetch origin project-log && git worktree add ../tarantal-project-log project-log`), or
   straight through the GitHub contents API.
2. Check it the way the page reads it:
   ```bash
   npm run project:check -- path/to/project.json
   ```
   It prints the first schema problem (and fails), or a summary, plus warnings for links or
   pictures the page will drop and job references that match no job.
3. Commit and push to `project-log`:
   ```bash
   git -C ../tarantal-project-log add project.json
   git -C ../tarantal-project-log commit -m "chore(project-log): <what changed>"
   git -C ../tarantal-project-log push origin project-log
   ```
   To create the branch the first time: `git switch --orphan project-log`, add only
   `project.json`, commit, `git push -u origin project-log`.

Update it whenever something changes for the product owner: a job starts, finishes or slips; a
question is asked or answered; screenshots or test results are published (add them to `activity`
and to the job's `images`); a request comes in.

## Preview another copy

`?projectData=<url>` makes the page read another file, for example a draft on another branch:

```
https://shadownam.github.io/Tarantal/?admin=1&project=1&projectData=https://raw.githubusercontent.com/ShadowNam/Tarantal/my-branch/project.json
```

The URL must be https on an allowed host (below), and a `raw.githubusercontent.com` file must
belong to the ShadowNam account (that host serves anyone's files: a crafted link must not show the
product owner a fake status); otherwise the page ignores it and reads the published file. URL-encode it if it has its own `?` or `&`.

## Format (schema 1)

The Zod schema is `src/meta/projectLog.ts`; a complete, realistic example is
[`tests/e2e/fixtures/project-log.json`](../../tests/e2e/fixtures/project-log.json).

```ts
ProjectLog = {
  schema: 1,
  updated: ISO, by: string,                // when and by whom the file was last written
  summary: string,                         // a short paragraph: where we are now
  current: { version: string, commit: string, deployed?: ISO },   // what the test build runs
  links: Link[],                           // test build, admin page, build board, status doc, GitHub
  numbers: { label: string, value: string, note?: string }[],
  needsYou: NeedsYou[],                    // questions, decisions, feedback the product owner owes
  jobs: Job[],                             // every build step, in order (done → running → planned)
  suggestions: Suggestion[],
  requests: { date: string, text: string, outcome: string, job?: string }[],
  activity: { at: ISO, kind: 'merge'|'screenshots'|'tests'|'request'|'decision'|'note',
              text: string, links?: Link[], images?: Img[] }[],
  history: { title: string, when: string, prs?: string, decision?: string, intro: string,
             bullets: string[], feedbackLabel?: string, feedback?: string[], images: Img[] }[],
  evolution: Img[],
  decisions: { id: string, text: string }[],
  glossary: { term: string, meaning: string }[],
}
NeedsYou = { id: string, kind: 'decision'|'feedback'|'question'|'check', title: string,
             detail: string, asked: ISO, status: 'open'|'answered'|'dropped', options?: string[],
             answer?: string, answered?: ISO, blocks?: string, links?: Link[], images?: Img[] }
Job = { id: string, version?: string, title: string, phase?: string,
        status: 'done'|'review'|'running'|'blocked'|'next'|'later',
        start?: ISO, end?: ISO, estimate?: boolean, owner?: string, prs?: number[],
        summary?: string, requestedBy?: string,
        checklist?: { text: string, done: boolean, at?: ISO }[], tests?: string,
        images?: Img[], links?: Link[] }
Suggestion = { id: string, title: string, detail: string, from: string, date: ISO,
               status: 'idea'|'queued'|'done'|'declined', job?: string }
Link = { label: string, url: string }
Img = { src: string, caption: string, full?: string }
```

### Rules

- **Times (`ISO`)** are UTC like `2026-10-25T16:56:00Z` (seconds optional; an offset such as
  `+02:00` is accepted). The page shows them in Namibia time (UTC+2), e.g. "25 Oct, 18:56".
  `requests[].date` and `history[].when` are display text, written as the product owner should
  read them.
- **Required:** `schema`, `updated`, `by`, `summary`, `current`, `jobs`, `needsYou`. The other
  lists may be left out (read as empty). Unknown fields are ignored, so new fields can be added
  before the page uses them.
- **Jobs** are in build order. `id` is short and stable (`v1.7`, `v1.7b`); `version` is the build
  it lands in (`1.7.0`, shown as "build 1.7.0"). For `done` jobs `start`/`end` are the real start
  and merge; for the others they are the estimate ("expected 26 Oct, 02:30–06:00"; a running job's
  `end` shows as "expected 25 Oct, ~21:00"). `prs` are pull request numbers (linked to GitHub).
  `review`, `running` and `blocked` are "In progress"; `next` and `later` are "Planned" (Next up
  shows the next three, `next` before `later`). A checklist gives the progress bar ("7 of 9").
- **Needs you:** `open` items are counted on the Overview tab and shown newest first; answered or
  dropped ones fold away under "Answered and closed". `blocks` is the id of the job that waits.
  `options` are listed A, B, C… so the product owner can answer with a letter.
- **References:** `needsYou[].blocks`, `requests[].job` and `suggestions[].job` name a job by its
  `id` (the page shows its version, title and status); an unknown id shows as plain text.
- **Order:** keep `requests` and `history` oldest first (append new ones at the end); the page
  shows them newest first. `activity` and `suggestions` are sorted by their times.
- **Links and pictures** must be absolute **https** URLs on `github.com`,
  `raw.githubusercontent.com`, `shadownam.github.io` or `claude.ai`; anything else is dropped
  silently. Pictures are usually committed images, e.g.
  `https://raw.githubusercontent.com/ShadowNam/Tarantal/main/docs/history/img/v16-windmill.jpg` or
  `…/main/docs/art-preview/compare/<name>.png`. `full` is an optional larger picture for the
  lightbox. A picture that does not load shows its caption instead.
- **Text** is plain text (no HTML or Markdown); line breaks in `summary`, `detail`, `intro` and
  similar fields are kept. Write it in English for the product owner; the page's own labels are
  translated.
- If the file cannot be read, the page shows "The project log could not be read" and the first
  problem (for example `jobs[3].status: Invalid option …`), and the last good copy on that device.
