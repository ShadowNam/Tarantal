# Tarantal Madness — Build Plan (milestones for Claude Code)

How to use: run one milestone per session with `/milestone <n>` (skill in `.claude/skills/milestone`).
Start each milestone in **plan mode**, approve the plan, let Claude implement, then require the
evidence listed under *Done when*. Clear context between milestones: `/clear` locally, a new
session in Claude Code cloud sessions (they don't support `/clear`).

Every milestone ends with:
1. `npm run check` green (typecheck, lint, unit tests, content validation).
2. Evidence pasted: test output, screenshots from Playwright (desktop + mobile landscape), and for
   gameplay milestones a short note of what was playtested by hand.
3. The `playtest-reviewer` subagent run against the milestone's acceptance criteria; fix only gaps
   that affect correctness or stated requirements.
4. Docs updated if a rule changed; decision logged in `docs/05-DECISIONS-AND-RESEARCH.md`.

---

## Approved improvement rollout — 2 Nov 2026 (D-072)

Requested by the product owner: add the six improvement ideas to the plan and roll them out.
These stages extend existing systems, with local saves and the current share-link model.
Package versions are assigned when releases are cut; the stage IDs below are stable.

| Stage | Player outcome | First release scope | Status |
| --- | --- | --- | --- |
| R1 Living field guide | Looking around rewards curiosity | Eight existing tree/colony residents; real on-screen sightings unlock illustrated facts and Oupa notes in a paged journal | Validated; ready for review |
| R2 Memorable shots | Difficult shots receive clear recognition | Prioritized, rate-limited horizon/long-shot and double-hit callouts, plus the hunt's standout moment at the tally; existing whole-flock stamp and braai story stay | Validated; ready for review |
| R3 Oupa's coaching | Players can learn what to improve | An optional journal lesson page and one contextual after-hunt suggestion for newer players, respecting Oupa's off setting | Validated; ready for review |
| R4 Personal challenges | Every hunt offers a reachable next goal | Best score, qualified accuracy, whole flocks and clean bags compared only on matching biome/map/gun/sight/rules; suggested next targets | Validated; ready for review |
| R5 Friendly competition | Shared hunts become an ongoing rivalry | Keep results against accepted friend challenge links in a bounded local rival notebook; allow rematches through the existing link format | Validated; ready for review |
| R6 Personal Skiet-Skuur | Achievements become keepsakes | Earn cosmetic plaques from discoveries and hunt achievements, choose a plaque and display it in the shed; no gameplay bonuses | Validated; ready for review |

**Validation completed:** 241 test files / 2,002 tests pass; 56 content files validate.
The browser matrix passes 11 checks with four device-gated skips across desktop Chromium,
Pixel 7 and iPhone 14 landscape. Initial download: 2.91 MB gzip. Independent review gaps
were repaired. These stages await merge and deployment; this is not a live-release claim.

**Acceptance gates for every stage:** `npm run check`; old-save recovery; no changes to sim,
scoring, official Daily attempt rules or golden replays; localized text in en/af/de/nl; keyboard
and touch paths; safe layout and screenshots on desktop, Pixel 7 and iPhone 14 landscape;
first download ≤ 3 MB gzip and existing lazy-group limits. An independent playtest review checks
the rollout diff. Admin, capture and training hunts cannot earn journal records or trophies.

**R1:** sightings count only when delivered resident sprites are visible on screen; each species
is saved once at a completed normal hunt, with pictures loaded lazily and released with the
journal. Locked pages offer a habitat hint. A failed picture download leaves a usable text card.

**R2–R3:** use the existing HUD banner/score/audio language; never add a large flash or duplicate
whole-flock effects. FTUE and urgent gameplay notices win. Coaching is optional, short and
selected from the actual result. Final voice recording follows finalized text; new notes and
coaching are captions in this release.

**R4:** a one-shot hunt cannot set an accuracy record. Goals show the setup they apply to and
never compare different weapons, sights, bonus maps, layouts or content versions. Practice
Dailies cannot overwrite records. Goals award cosmetic keepsakes only.

**R5:** reuse validated challenge links; record a personal best per shared setup/target and cap
history size. A changed-content challenge remains playable with the existing warning, but is
not recorded as a fair rivalry win. These are friendly shared claims, not verified world scores.

**R6:** locked plaques explain their requirement. Selecting a locked plaque does nothing. Old
saves start with an empty collection, and clearing data removes the collection.

**Later expansions, outside this first release:** new cameo species/art beyond the residents
already present, a weekly shared Season Run, hosted friend groups and server-verified scores,
photographic keepsakes, full cabin decoration placement and voiced versions of the new notes.
Store publishing and paid voice services keep their existing release requirements.

---

## Startup and visual follow-up — 3 Nov 2026 (D-073)

Product-owner request: English by default, with a remembered English / Afrikaans / Deutsch
selector on loading and title screens. Keep language changes usable when storage is blocked.
Translate English catchphrases and regenerate the 45 affected recorded English lines.
Refine baboon anatomy and fine detail in both Standard and HD, preserving poses and hitboxes.
Implementation is ready; browser and full-check evidence is recorded in the admin progress sheet.
Release status remains awaiting merge and deployment.

## Review of the current checkout — 2 Nov 2026

This checkout is package 1.15.0 on `v112-brakkie`; the feature label v1.12 refers to Brakkie,
not the package version. M0–M10 and the later features through Brakkie are implemented. The local
`origin/project-log` snapshot is dated 1 Nov and still calls Brakkie running; it is planning
context, not evidence of the currently deployed version.

Follow-up audit: D-071 repairs failed storage removals/clears and memory namespace isolation.
The Privacy screen now reports rejected deletions instead of immediately reloading old data.
Persistent deletion still requires the browser to allow it; the fallback protects this session.
Follow-up `npm run check` passes: 238 test files, 1,987 tests and all 55 content files valid.
Browser verification: 12 focused checks pass across desktop Chromium, Pixel 7 and iPhone 14
WebKit emulation; three cases are skipped by their existing device/browser gates. The checks
cover rejected and successful privacy deletion, corrupt-save recovery, blocked storage and PWA
offline loading where supported. The new warning's screenshots were reviewed on all three
landscape profiles; after the active-save preservation refinement, all three rejected-deletion
browser tests pass again. The rebuilt download still passes the strict size gate at 2.90 MB gzip.

Priority order after this review:

1. **Finish validation and repair concrete gaps first.** D-070 fills the Harvest's four missing
   audio beds; local lint/format checks now exclude ignored scratch output in `tmp/`.
2. **Next feature: v1.13 veld cameos and field-guide entries.** The saved project log lists
   warthogs, baboons, springbok, elephants, ostrich and dung beetle cameos. Tree residents' field
   guide entries are also explicitly deferred here and in GDD §11.1b. Several of those animals
   already have systems or scenery: reconcile those implementations before adding duplicates.
3. **Final Oupa voices after the text is settled.** The saved plan calls for an en/af/de sample
   first and speech-to-text checks. Final voice selection and access to the chosen service remain
   external inputs.
4. **Production assets and device release checks.** The asset audit still marks art/audio as
   interim; its normal report passing does not satisfy the strict final-asset release gate.
   Real-device playtests, native-language review and store accounts/signing/listings remain
   release work. Android's test APK is already implemented; iOS and production store releases
   are separate work. The backlog below is not a list of unimplemented core milestones.

Verification for the review fixes: `npm run check` passes (238 test files, 1,982 tests; all 55
content files valid with no warnings). The production build and `npm run size -- --strict` pass:
initial download 2.90 MB gzip, Harvest standard group 1,220.1 KB gzip against its 1.5 MB limit.
The asset audit passes in report mode: 648 interim keys and one runtime placeholder (the mirage).
The strict final-asset gate remains unmet. Focused boot/fullscreen and Harvest intro-to-results
checks pass on desktop Chromium, Pixel 7 Chromium and iPhone 14 WebKit emulation (one inapplicable
Pixel fullscreen test skipped). Harvest audio delivery/playback is asserted on both Chromium
profiles; Linux WebKit lacks codecs, so real-iPhone audio remains a device check.

Do not infer a merge, deployment or successful full browser/performance matrix from this review;
those need their own evidence.

---

## M0 — Scaffold and guardrails
**Goal:** an empty but production-shaped repo that enforces the architecture from day one.

Scope
- Vite + TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) + Phaser 4
  (exact version pin, ≥ 4.2.1) + Zod + Vitest + Playwright + ESLint + Prettier.
- Folder layout from `02-TECH-ARCHITECTURE.md §2` with placeholder `index.ts` files.
- ESLint restrictions for `src/sim/**`: no `phaser` imports, no DOM globals, no `Math.random`,
  `Date`, `performance`.
- npm scripts: `dev`, `build`, `preview`, `test`, `test:e2e`, `lint`, `typecheck`,
  `content:validate`, `check` (= typecheck + lint + test + content:validate), `size`, and
  `golden:update` (regenerates golden replay expectations; a stub that exits 0 until M1 adds replays).
- `tools/validate-content.ts` validating the JSON already in `content/` with Zod schemas in
  `src/content/schemas.ts` (write schemas to match the existing files). References to content that
  arrives in later milestones (the three non-Karoo biome files until M8, Notaboek challenge ids
  until M5, charm `spawnEvent` ids until M6) are reported as **warnings**; `--strict` (used in CI
  from M8 on) turns them into errors.
- Phaser boot with one scene showing "Tarantal Madness — M0" at design height 1080, EXPAND-style
  scaling, safe-area aware; portrait shows a rotate-device card.
- GitHub Actions workflow running `npm ci && npm run check && npm run build && npm run size`.
- Copy the Phaser 4 AI skills into `.claude/skills/` if not already present (see README).

Done when
- `npm run check` passes; `npm run content:validate` reports all files valid.
- Playwright smoke test boots the game in desktop Chromium, WebKit, Pixel 7 and iPhone 14 landscape
  emulation and finds the canvas; portrait emulation shows the rotate card.
- A deliberate `Math.random()` in `src/sim/` fails lint (then remove it).

Prompt
> Run milestone M0 from docs/04-BUILD-PLAN.md. Read CLAUDE.md and docs/02-TECH-ARCHITECTURE.md
> first. Use plan mode. Verify Phaser 4 APIs against the Phaser skills in .claude/skills before
> using them. Finish with the evidence listed under "Done when".

---

## M1 — Deterministic sim core (headless, no graphics)
**Goal:** the whole Classic hunt can run in Node from (seed, content, commands) → result.

Scope
- `rng.ts` (splitmix32 seeding + sfc32, named streams), `detmath.ts`, `clock.ts` (60 Hz ticks).
- `Sim.ts` contract from Tech §3.1 (incl. `inputKind`); viewport-independent camera and plane
  geometry from Tech §3.3 (`camera.ts` exports the one tap → plane-position function).
- Weapon state (8-shell belt, reload timing, empty click), pellet pattern, front-to-back hit tests
  with hitbox ellipses, occluders.
- Simple fly-over birds (no flocks yet) on all three planes, spawned by a minimal director.
- Scoring pipeline exactly as GDD §5.3 incl. Frenzy, Twee Vlieë, Stampede; penalties.
- Typed events; `InputLog` encode/decode; `replay/verify.ts`.
- Unit tests: RNG reproducibility, stream independence, detmath error bounds, pipeline golden
  table (≥ 20 cases incl. the GDD §9 example = +80, and a charm-order case where swapping two charms
  changes the award), hit rule (`min(pelletsToBag, weapon.pellets)`), belt/reload timing,
  camera geometry (tap at screen centre/edges maps to the expected plane x at both camera ends),
  determinism (same seed + log ⇒ identical event hash, run twice).

Done when
- `npx tsx tools/run-hunt.ts --seed 42 --bot random` prints a hunt result in < 1 s.
- Golden replay test passes; changing a pipeline constant fails it.
- `src/sim` has zero imports outside `src/sim` and `src/content` types.

---

## M2 — Playable Classic hunt (placeholder art)
**Goal:** the core loop feels good on desktop and phone with procedural placeholders.

Scope
- `ProceduralAssetFactory`: placeholder tarentaal (round body, dots, blue head, casque), parallax
  layers (6), props, shells, reticle, feathers — drawn at runtime, swappable via `AssetManifest`.
- Hunt scene renders sim snapshots with interpolation; ParallaxView with camera scroll factors.
- InputMapper: desktop (mouse, RMB/Space reload, A/D + edge pan), touch (tap/drag/flick-down,
  shell-belt tap), aim-assist radii by plane, pan inertia. Context menu suppressed.
- HUD: timer, score + pops (`10 ×2 → +20`), Frenzy meter, shell belt, RELOAD prompt.
- Juice pass 1: muzzle flash, gun kick, shake (toggle), feather burst, POOF bubble, hit-stop.
- Placeholder audio via a tiny Web Audio synth (shot, click, poof, kek) — real assets later.
- Tally screen with score, accuracy, hits by plane, rank title; [Again] restarts in one tap.
- Debug overlay (F1 / `?debug=1`): FPS, tick, hitboxes, bird states; `?seed=` URL param.

Done when
- From page load to first shot ≤ 3 s on desktop; a full 90 s hunt is playable on a real phone.
- 60 fps on desktop and medium tier phone profile (Playwright perf smoke, 4× CPU throttle).
- E2E: start → 20 taps across the screen → wait for end → tally visible, on all four device profiles.
- Screenshots of HUD at 16:9, 19.5:9 and 4:3 attached.

---

## M3 — The Flock (signature mechanic) + juice pass 2
**Goal:** guineafowl behave like guineafowl and the flush-and-blast loop is fun.

Scope
- `Flock` FSM with threats and the 1.5 s escalation window exactly as GDD §6.1–6.2 (forage → alert →
  run → flush → settle/exit; window expiry calms ALERT → FORAGE), boids steering, staggered steep
  take-offs, glide, landing; radii and timings from content.
- Behaviour multipliers (+0 / +0.5 / +1.0), Whole-Flock bonus + slow-mo, near pop-ups.
- Director pacing keyframes (warm-up / build / Stampede) from biome JSON.
- Vuvuzela gadget (2 charges in Classic).
- Juice: synchronized KEK-KEK bubbles, flush music sting, wing-shot banner, whole-flock stamp.
- Balance bot v1 (`tools/balance-sim.ts`): `random`, `plinker` and `competent` bots as defined in
  GDD §13.8, over 500 seeds → report (mean, p15, p50, p85 score; wing-shot share; whole-flock rate).

Done when
- Unit tests for every FSM transition and threat source; golden replay updated intentionally.
- Balance report shows: competent bot scores 2 500–4 500 in Classic Karoo (Bosveldjagter band);
  the plinker bot scores ≥ 25 % less than the competent bot (proves escalation matters) while still
  beating the random bot (proves plinking is a valid, safer style).
- Hand playtest note: "spook → chase → flush → wipe" achieved at least once in 3 hunts.

---

## M4 — Karoo biome complete (content-driven)
**Goal:** the MVP biome is a real level built entirely from `content/biomes/karoo-autumn.json`.

Scope
- Biome loader: layers, props, occluders, secrets, events, omen, pacing, spawn tables.
- Secrets: windpomp (4 blades → reservoir flush), bakkie spare wheel (alarm), potjie (+5 s), fence
  bell (meerkat spotter). Secret hint glints (replaced in 1.9.8 by tell animals, D-061).
- Penalties: Kwêvoël (with ⛔ first-sighting badge), crop sprayer. Hadeda event.
- Omen: Karoo wind (bird speed ±, far-shot drift, wind sock), dust devils that flush on contact.
- Generaal Tarentaal appearance (pot knock-off, then bag) once per Classic hunt.
- Supply crates ×2 per hunt (windows are fractions of hunt length) with Chilli Biltong, Boeretroos,
  Bush Buckshot, Meerkat Spotter, and the two crate weapons **Voorlaaier** and **Mielie-Masjien**
  (needed later by the Haelstorm charm and Padstal rentals in M6).

Done when
- Removing a secret from the JSON removes it from the game with no code change.
- Content validation catches a broken cross-reference (test proves it).
- Every secret and penalty covered by a sim unit test.

---

## M5 — Meta, persistence, menus, FTUE
**Goal:** a complete game loop around the hunt.

Scope
- `storage.ts` (throw-safe, memory fallback), `SaveData` v1 + migrations framework + tests.
- Title, Skiet-Skuur (loadout, Bird Book v0, Notaboek v0, settings), Pause, Settings (audio sliders,
  shake/flash reduction, aim assist, left-handed, language, quality tier override).
- Rank titles, per-biome bests, Bird Book pages for creatures/secrets seen.
- FTUE "Oupa se Les" scripted per GDD §16 with telemetry hooks.
- i18n with `en` and `af` string files (no hard-coded player-facing text — lint rule or test).
- PWA: manifest, service worker (offline after first load), iOS "Add to Home Screen" banner (no
  fullscreen button on iPhone), visibility/pause/mute handling, WebGL context-loss recovery test.

Done when
- Closing the tab mid-menu and reopening restores settings and progress; corrupted save falls back
  safely (test).
- FTUE completes on phone and desktop without reading anything longer than one line.
- PWA installability verified: a Playwright test confirms the manifest (name, icons, `display`,
  `start_url`) is served and the service worker registers and serves the game offline after one
  load; spot-check with Chrome DevTools → Application → Manifest on the deployed preview.
  (Lighthouse no longer has a PWA category, so don't rely on it.)

---

## M6 — Season Run (roguelite)
**Goal:** the "one more run" engine.

Scope
- Run state machine (GDD §13), quotas from `content/run.json`, Omen hunts, Boss Hunts with Boss
  Rules. **Until M8 adds the other biomes, every season runs on the Karoo biome as a stand-in**
  (a `biomeFallback` in the run loader, logged as a warning); the four Boss Rules are implemented
  now and applied to the Generaal as stand-in boss where the real boss doesn't exist yet.
- Charm effect interpreter (Tech §3.8) + all 24 launch charms from `content/charms.json`; slot order
  changes results and players can reorder charms; Fluitjie replaces the Vuvuzela while equipped.
- Doppies economy, Padstal shop (offers, reroll, sell), consumables, temporary weapon rentals
  (Voorlaaier, Mielie-Masjien from M4).
- Run save/resume after every Padstal; run summary; Notaboek unlocks widening the charm pool.
- Balance bot v2 plays full runs with charm policies `none` and `synergy` (GDD §13.8).

Done when
- Each charm has at least one unit test proving its effect on sim state or on the scoring breakdown
  (scoring charms via the pipeline; ammo/economy/world charms via sim state and events).
- A full 12-hunt run is completable (bot) and resumable after reload (e2e).
- Balance report for Herfs and Winter (Karoo stand-in) is within ±10 points of the GDD §13.8
  targets; quotas in `content/run.json` updated via `/tune`. Lente/Somer targets are checked in M8.

---

## M7 — Daily Hunt, share card, challenge links
Scope: daily seed (Tech §12), first-attempt rule, streak + weekly freeze, share text/emoji grid +
`navigator.share`/clipboard fallback, challenge URL encode/decode + "beat this" intro card, analytics
events.
Done when: the same daily seed + replay produces an identical event hash in Node (Vitest), Chromium
and WebKit (Playwright), with both `inputKind` values; challenge link round-trips; share text
snapshot test; viewport width has no effect on the result (same replay at 1440, 1920 and 2520 wide).

---

## M8 — Remaining biomes and arsenal
Scope: Bushveld Winter, Okavango Spring, Kalahari Summer (JSON + placeholder art first), their
secrets, omens, bosses (Ou Grys, Kuifkop Koning, Die Stormvoël with photosensitivity-safe flashes);
weapons Windbuks, Kettie (delayed hitscan + drop + wind), Plaas-Pomp (interruptible reload);
creature variants (wit, lavendel, kuifkop). Remove the M6 Karoo stand-in; run the validator with
`--strict` in CI from now on.
Done when: each biome passes its own Classic balance report; each weapon has sim tests; Season Run
plays through all four real seasons; full Season Run pass rates are within ±10 points of every row
of the GDD §13.8 table (quotas tuned via `/tune`).

---

## M9 — Platform, performance, accessibility, localisation
Scope: PlatformAdapter implementations (web, Poki, CrazyGames) behind `VITE_PLATFORM`; ad breaks only
between hunts, audio muted during ads; QualityManager tiers + benchmark; lazy biome bundles; size
budget enforcement; accessibility checklist (GDD §18.3); `de` + `nl` strings; crash/error reporting
hook; privacy screen.
Done when: initial download ≤ 5 MB compressed (size report); Poki and CrazyGames QA tools pass;
low-tier profile holds ≥ 50 fps; all accessibility toggles tested.

---

## M10 — Final art and audio integration → soft launch
Scope: swap placeholders for human-authored atlases/Spine rigs and recorded audio through the
`AssetManifest`; final juice tuning; marketing capture mode (`?capture=1`: hides HUD, fixed seed,
slow-mo on keypress) for trailers/GIFs; store/portal page assets.
Done when: no placeholder assets remain (asset audit script); visual regression screenshots approved;
portal soft launch submitted.

**Status (21 Oct 2026, v1.0.0, D-027):** everything that code can do is built. That covers:
- the asset pipeline and the final/placeholder switch, proven with stand-ins;
- `assets:audit` with its `--strict` gate;
- recorded audio with fallback, per-biome music and ambience, voice and ducking;
- the juice pass;
- capture mode;
- self-hosted fonts and visual baselines;
- portal renders and the submission kit (`docs/07-PORTAL-SUBMISSION.md`);
- `npm run release`.

Open, because they need people:
- art and audio delivered per `docs/06-ASSET-DELIVERY.md`, until `assets:audit --strict` passes;
- the visual baselines re-recorded and approved after the swap;
- the portal accounts and the soft-launch submission (done by the product owner).

---

## v1.1–v1.4 — Long range, sights and daily maps (approved 22 Oct 2026)
The design is in `docs/08-PROPOSAL-LONG-RANGE-AND-DAILY-MAPS.md`; each milestone moves its part of
it into the GDD (and Tech doc when the sim changes) with a decision entry. They run in order, after
graphics pass 2 (D-029 style interim art), one build job each, 1–2 PRs per job (D-030). The product
owner approves the look (before/after screenshots) before a milestone merges.

## v1.1 — Gun feel: ammo display, crosshairs, interim sound effects
Scope: per-gun ammo on the HUD, realistic not cartoony (12-gauge shells, diabolo pellets, stones,
paper cartridges, mielie kernels; .22 and rifle rounds arrive with their guns in v1.3); a crosshair
per gun that shows its spread (ring, dot, Kettie drop mark, wide ring, jitter); interim code-made
sound effects for every `sfx/*` key plus per-biome music (calm/build/stampede) and ambience beds,
through the existing `AudioDirector` recorded-audio path (origin `interim`, replaceable by delivered
files). Screen and audio only: no sim change, golden replays unchanged.
Done when: every primary and crate gun shows its own ammo and crosshair in Playwright screenshots on
desktop, Pixel 7 and iPhone 14 landscape (both states: full and partly spent); mute rules (first
gesture, `visibilitychange`, pause, ads) still pass; `assets:audit` lists the new keys as interim;
initial download ≤ 3 MB gzip on all three builds.

## v1.2 — Day-of-week maps and bonus map Verder
Scope: seven layouts per biome, one per UTC weekday (light/time of day, prop and secret positions,
flock feeding spots and fly-over routes, weather), as content; Classic and the Daily Hunt play the
day's layout; the map id travels with the seed in replays, challenge links and the share card (old
links keep their map); bonus map **Verder** unlocked by beating the map's quota, reset daily, with
its own best score (saved through `src/meta/storage.ts`).
Done when: all 28 layouts pass content validation and a per-layout balance report; a replay and a
challenge link reproduce the same map on desktop and mobile; golden replays updated with the reason
in the commit; Playwright screenshots of each Karoo weekday layout; the unlock/reset is unit-tested
across a UTC midnight.

## v1.3 — Long range: the Ver plane, sights and zoom, Die Twee-Twee
Scope: a fourth sim plane **Ver** (scale 0.10, 50 points; shotgun pellets and Kettie stones fall
short); rifles fire with hold to zoom, release to fire (hip shot on an early release, cancel by
right-click or sliding onto the ammo display); sight types iron 1.5× / peep 2× / small scope 4× with
raise times and sway (own RNG stream, breath-hold settle after ~0.5 s for ~3 s); raising the sight
and the zoom level are recorded commands, and a zoomed tap maps to the same world point on every
screen (Tech §3.3); **Die Twee-Twee** (.22 bolt-action, 5 rounds, sights fitted in the Skiet-Skuur,
upgrades from Notaboek challenges and ranks); bonus maps **Nog Verder** and **Die Verste**.
Done when: sim tests for the Ver plane, hold/release, hip shot, cancel and sway; golden replays
updated on purpose; replay of a zoomed hunt identical on desktop and mobile viewports; balance
reports before and after; medium tier holds 60 fps while scoped; Playwright screenshots of each
sight picture on desktop and both phones.

## v1.3x — Training ground (Skietbaan), admin only (24 Oct 2026, D-037)
Scope: a playtest tool on the admin page: any gun (locked ones too, the .22 per sight) in any
biome at near / middle / far / Ver against a paper target, a standing bird, a fly-over or a small
flock, through the real sim (mode `range`: no clock, score, Frenzy or penalties, an endless
reserve), with per gun × distance stats (hits, pellets per shot, group size and centre on paper)
and a copyable report. Web builds only, lazy-loaded, never touches a save (GDD §12.1, Tech §8.3).
Done when: range-mode determinism, spawn program, hit and group maths tested; content validation
covers the range and its spots; e2e on desktop, Pixel 7 and iPhone 14 landscape (the .22 with the
small scope at Ver, the Dubbelloop on paper, the save byte-identical, no button without
`?admin=1`); portal builds carry no range code; first download growth only the main-bundle hooks;
screenshots in `docs/art-preview/compare/skietbaan-*.png`.

## v1.4 — Die Langloop and the Namibië pack
Scope: **Die Langloop** (long-range rifle, 3 rounds, variable scope 3–9×, alerts every flock,
unlocked by reaching Die Verste); the **Namibië** biome (Etosha salt pan with mirages, quiver trees,
Namib dunes, a far waterhole; mostly far and Ver birds), lazy-loaded like the other biomes, with its
weekday layouts, omen, secret and interim art and sound.
Done when: the biome passes its Classic balance report; its lazy chunk ≤ 1.5 MB gzip and the first
download still ≤ 3 MB; Langloop sim tests and balance report; Playwright screenshots on desktop and
both phones.
**Part A done (PR #60, D-038):** the #56 scoped drawing cost fix; Die Langloop with its
variable-scope zoom input, alert-all-flocks rule, unlock, Skiet-Skuur card, interim art and sound;
sim, input and e2e tests; `docs/balance/v1.4-langloop.md`; screenshots in
`docs/art-preview/compare/v14-*.png`. First download 2 963.7 KB gzip (2.89 MB). Part B (Namibië)
follows in its own PR.
**Part B done (PR #64, D-039):**
- The camelthorn and the family nest redrawn in layers at 2× (the Kalahari picks them up), approved
  by the product owner on 24 Oct.
- The angry weavers.
- **The Namibië area pack:** Classic only, unlocked by Die Verste, with the title's area picker;
  the mirage omen; seven weekday layouts, all with Ver open; bonus maps, a secret, interim art and
  sound.
- **Tests:** sim, unlock and e2e tests; `docs/balance/v1.4-namibie.md`; a perf test for the mirage
  and the weavers on the Pixel 7 profile.
- **Screenshots:** `docs/art-preview/compare/v14-camelthorn-*.png` and `v14-namibie-*.png`.

---

## v1.7 — Meerkat colonies on the desert maps (25 Oct 2026, D-044)

Colonies of 4–8 meerkats in 3–5 burrows on every Kalahari and Namibië map, run by the sim. They
peek, stand sentinel, forage, sunbathe, dash between burrows and dive. They react to shots, the
Langloop and raptor alarms; an alarm alerts the nearest flock. A shot meerkat costs −10 and
scolds. The Familiefoto secret, and the Spotter out of a burrow.
**Done when:**
- sim and e2e tests pass;
- golden replays are re-recorded;
- the balance sweep is within ±5 % on every desert map;
- the art and sounds are in the lazy desert group (each chunk ≤ 1.5 MB, first download ≤ 3 MB);
- the screenshot spec is written;
- the docs and D-044 are written.

## After v1.0 (v1.x backlog)
Leaderboards with server replay validation (`server/`), weekly seeded Season Run, Endless mode,
ghost replays of top hunts, charm pack 2, gamepad, Capacitor iOS/Android builds, Steam desktop
wrapper, data-only mod loader UI. (The Namibië biome pack moved to v1.4.)

**Android test app (1.9.5, D-058, built):** a Capacitor APK for friends, built and signed (TEST-ONLY
key) by `.github/workflows/android.yml`, offered at `/android/` on the Pages test build
(docs/ANDROID-TEST-APP.md). Done when: the `android` workflow passes on the PR and uploads
`tarantal-madness-<version>.apk`; every asset is inside the APK (no download after install);
landscape, immersive, keep-awake in a hunt, back button pauses and steps back; the web first
download is unchanged (≤ 3 MB) and `npm run size -- --strict` passes for web, Poki and
CrazyGames; unit tests for the adapter, versionCode and back button; e2e of `dist-android/` on
Pixel 7. *Next:* the Play Store release (the product owner's developer account and private upload
key, an App Bundle, the store listing) and the iPhone app (after an Apple developer account).

**Idea (1.9.3, D-056, not built):** a carved makalani nut as a Notaboek reward or a charm.
Carving the ivory-hard kernel into key rings and ornaments (oryx, elephants, cheetahs) is a
well-known Namibian craft; it would tie the Okavango's nuts to the meta game.

**v1.13 field guide (1.9.4, D-057):** the trees' residents (bushbaby, tree squirrel, barn owl,
yellow-billed hornbill, red-billed buffalo weaver, wild bees, the sociable weavers' pygmy falcon
and the rosy-faced lovebirds) become "Did you know?" entries in the field guide, seen once they
have shown themselves in a hunt (sources: docs/05 §3 "Baobab life and sociable-weaver colonies").
