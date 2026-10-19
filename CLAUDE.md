# Tarantal Madness

Browser arcade shooter: a Moorhuhn-style panning shooting gallery set in Southern Africa, starring
the helmeted guineafowl ("tarentaal"). Desktop + mobile browsers first (web portals, PWA); app-store
and Steam wrappers later. Signature mechanics: realistic **flock behaviour** (forage → alert → run →
flush) and a 4-season roguelite **Season Run**.

## Where the truth lives (read the relevant one before a task; don't load all of them)
- Game design, rules, modes, numbers' intent: `docs/01-GAME-DESIGN.md`
- Architecture, sim contract, platform rules: `docs/02-TECH-ARCHITECTURE.md`
- Art direction, sprite/animation specs, audio: `docs/03-ART-AUDIO-BIBLE.md`
- Milestones + acceptance criteria: `docs/04-BUILD-PLAN.md`
- Decision log + sources: `docs/05-DECISIONS-AND-RESEARCH.md`
- Tuning values: `content/*.json` — these win over numbers quoted in docs.
If docs and code disagree, stop and ask. When a rule changes, update the doc in the same change and
add a decision entry.

## Stack
- **Phaser 4** (exact pin, ≥ 4.2.1), TypeScript strict, Vite, Zod, Vitest, Playwright, ESLint, Prettier.
- IMPORTANT: this is Phaser **4**, not Phaser 3. Remembered v3 code is often wrong: FX and masks are
  now Filters, tint colour and tint mode are separate, the pipeline system is gone. Check the Phaser
  skills in `.claude/skills/` before using an API you haven't used in this repo.

## Commands
- `npm run dev` — local dev server (add `?debug=1&seed=42` for the overlay and a fixed seed)
- `npm run check` — typecheck + lint + unit tests + content validation. Must pass before "done".
- `npm run test` — Vitest · `npm run test:e2e` — Playwright (desktop + mobile profiles)
- `npm run content:validate` — Zod-validate `content/` incl. cross-references
- `npm run build` / `npm run size` — production build / download-size budget check
- `npx tsx tools/balance-sim.ts --seeds 500` — bot score distributions (from M3)

## Architecture rules
1. `src/sim/` is pure, deterministic TypeScript. It advances in fixed 60 Hz ticks from
   (seed, content, commands). No Phaser, DOM, `window`, timers, `Date`, `performance`,
   `Math.random`, or async in `src/sim/`. Details: `.claude/rules/sim.md`.
2. `src/game/` (Phaser) renders sim snapshots and turns input into `Command`s. It never mutates
   sim state.
3. All tunables and content are JSON in `content/`, typed via Zod schemas in
   `src/content/schemas.ts` (types via `z.infer`, never duplicated by hand). No magic numbers in systems.
4. Gameplay events flow through the typed event stream from the sim; audio, FX, UI and analytics
   subscribe to it.
5. Platform specifics (Poki, CrazyGames, PWA, Capacitor) only behind `src/platform/PlatformAdapter.ts`.
6. Player-facing text only via i18n keys (`src/i18n/*.json`). Code identifiers are English;
   Afrikaans flavour lives in content and strings.

## Code conventions
- No `any`; no non-null `!` without a comment saying why it is safe.
- Named exports only. Classes in PascalCase files; modules in camelCase files.
- Units: design px (1080-tall design space), sim time in ticks; convert only at boundaries.
- Small pure functions in the sim; tests sit next to code as `*.test.ts`.
- Conventional commits, one logical change per commit.

## Mobile and web rules
- Pointer Events only; canvas `touch-action: none`; no browser zoom, scroll or long-press menus.
- iPhone Safari has no element Fullscreen API: never show a fullscreen button there; use the PWA
  "Add to Home Screen" banner.
- Audio only starts after the first user gesture; mute on `visibilitychange`, pause and ads.
- `localStorage` can throw: always go through `src/meta/storage.ts`.
- Budgets: first playable ≤ 5 MB compressed (hard fail 8 MB); 60 fps on the medium tier; sim
  `step()` ≤ 1.5 ms with 60 birds.
- Every input or HUD change is checked in Playwright on desktop and on Pixel 7 + iPhone 14
  landscape emulation, with screenshots.

## Workflow
- The user starts each milestone with `/milestone <n>`; for any milestone work, follow that skill's
  steps (`.claude/skills/milestone/SKILL.md`) and the milestone's "Done when" list.
- Use plan mode for anything touching more than ~3 files.
- A task is done only when `npm run check` passes and you have shown evidence (test output,
  screenshots, or a replay hash) — not when it "looks done".
- At milestone end, run the `playtest-reviewer` subagent on the diff and fix gaps that affect
  correctness or the acceptance criteria (ignore style nits).
- Changing sim behaviour on purpose: update golden replays with `npm run golden:update` and say why
  in the commit message.
- Tuning or balance requests: use the `tune` skill (edits `content/`, re-runs validation and the
  balance sim, reports before/after).

## Gotchas
- Screen taps map to a different x on each parallax plane:
  `planeX = (cx − 960) × scrollFactor + 960 + dx` (`dx` = px from screen centre). The camera lives in
  the sim, and the device's viewport width never enters the sim — that keeps replays and the Daily
  Hunt identical on every device (Tech §3.3).
- `Math.sin/cos/atan2/exp/pow` differ across JS engines — use `src/sim/detmath.ts` inside the sim.
- Use named RNG streams (`rng.stream('spawns')` etc.); never share one stream across systems.
- Poki: initial download target < 8 MB, works in incognito, mobile controls on tablets, only the
  portal's ads, mute during ads. CrazyGames mobile homepage: initial ≤ 20 MB.
- Full-screen/large flashes (lightning, Voorlaaier, Stampede pulses): no more than 3 per second;
  muzzle flashes stay small local sprites; honour "reduce flashes".
- No real brand names or logos in art or strings; never use "Moorhuhn"/"Crazy Chicken" in copy.

## When compacting
Preserve: current milestone and its unmet acceptance criteria, files changed, commands that verify
the work, and any decision not yet written to `docs/05-DECISIONS-AND-RESEARCH.md`.
