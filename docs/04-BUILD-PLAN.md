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
  bell (meerkat spotter). Secret hint glints.
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

## After v1.0 (v1.x backlog)
Leaderboards with server replay validation (`server/`), weekly seeded Season Run, Endless mode,
ghost replays of top hunts, Namibië biome pack, charm pack 2, gamepad, Capacitor iOS/Android builds,
Steam desktop wrapper, data-only mod loader UI.
