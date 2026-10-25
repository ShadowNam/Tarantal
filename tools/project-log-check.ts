// D-045: checks a project log file (docs/project/README.md) the way the admin page's Project
// overview reads it, before the supervisor pushes it to the `project-log` branch:
//   npm run project:check -- path/to/project.json
// Prints the first schema problem (exit 1), or what the page will show, including links and
// pictures it will drop because their host is not on the allowlist.
import { readFileSync } from 'node:fs';
import { findJob, groupJobs, openNeeds, parseProjectLog, safeUrl } from '../src/meta/projectLog';

const file = process.argv[2];
if (file === undefined) {
  console.error('usage: npm run project:check -- <project.json>');
  process.exit(2);
}
const text = readFileSync(file, 'utf8');
const r = parseProjectLog(text);
if (!r.ok) {
  console.error(`project log: FAILED — ${r.issue}`);
  process.exit(1);
}

/** Every link url and picture src/full in the raw file that the page will drop. */
function dropped(v: unknown, path: string, out: string[]): void {
  if (Array.isArray(v))
    v.forEach((x: unknown, i) => {
      dropped(x, `${path}[${String(i)}]`, out);
    });
  else if (typeof v === 'object' && v !== null)
    for (const [k, x] of Object.entries(v)) {
      if ((k === 'url' || k === 'src' || k === 'full') && typeof x === 'string') {
        if (safeUrl(x) === null) out.push(`${path}.${k}: ${x}`);
      } else dropped(x, `${path}.${k}`, out);
    }
}

const raw: unknown = JSON.parse(text);
const off: string[] = [];
dropped(raw, '', off);
const log = r.log;
const g = groupJobs(log.jobs);
console.log(`project log: OK — updated ${log.updated} by ${log.by}`);
console.log(
  `  jobs: ${String(g.done.length)} done, ${String(g.active.length)} in progress, ${String(g.planned.length)} planned`,
);
console.log(`  needs you: ${String(openNeeds(log).length)} open of ${String(log.needsYou.length)}`);
console.log(
  `  ${String(log.history.length)} history stages, ${String(log.activity.length)} activity entries, ${String(log.suggestions.length)} suggestions, ${String(log.requests.length)} requests`,
);
for (const o of off)
  console.warn(`  ⚠ dropped (not https on an allowed host): ${o.replace(/^\./, '')}`);
// Job references the page shows as plain text when no job has that id.
const refs = [
  ...log.needsYou.map((n) => [`needsYou ${n.id}.blocks`, n.blocks] as const),
  ...log.requests.map((q, i) => [`requests[${String(i)}].job`, q.job] as const),
  ...log.suggestions.map((s) => [`suggestions ${s.id}.job`, s.job] as const),
];
for (const [where, id] of refs)
  if (id !== undefined && findJob(log, id) === undefined)
    console.warn(`  ⚠ ${where}: no job with id "${id}" (shown as text)`);
const ids = log.jobs.map((j) => j.id);
for (const id of new Set(ids.filter((x, i) => ids.indexOf(x) !== i)))
  console.warn(`  ⚠ job id "${id}" is used more than once`);
