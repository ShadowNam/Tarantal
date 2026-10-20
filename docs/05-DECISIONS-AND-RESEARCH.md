# Tarantal Madness — Decisions & Research Log

Append new decisions at the bottom (`D-0xx`). Never rewrite history; supersede instead.

## 1. What changed from the Gemini spec, and why

| Gemini spec | Decision | Reason |
|---|---|---|
| Phaser 3 (v3.80+) | **Phaser 4** (≥ 4.2.1) | Phaser 4.0.0 shipped 10 Apr 2026 (rebuilt renderer, Filters, GPU layers, built-in AI-agent skills); 4.2.1 is current on phaser.io; Spine's v4 runtime needs ≥ 4.2.1 |
| 1920×1080 fixed, `Scale.FIT` | Design **height** 1080, flexible width 4:3–21:9 with a viewport-independent camera | Modern phones are ~19.5:9; FIT letterboxes them. Portals want full-screen coverage on mobile; tablets are 4:3 |
| Phaser-coupled game logic | **Deterministic pure-TS sim core** | Enables daily seeds, replays, golden tests, balance bots, server-validated leaderboards, future renderer swaps and mods |
| "Tarantal" random flyers | **Flock behaviour** as the signature mechanic | Real guineafowl run in flocks and flush only when pressed — gives a skill layer Moorhuhn lacks and makes the setting matter |
| Single 90 s mode | Classic **+ Season Run roguelite + Daily Hunt + challenge links** | Retention: run-based build-crafting ("one more run") + shared daily seed and frictionless sharing |
| 13+ weapons | **4 launch weapons + Vuvuzela + 2 crate weapons**; rest parked | Each weapon must change how you treat the flock; fewer, deeper tools |
| Loadout shop paid with points | Shed = loadout/collection; **unlocks from challenges** | Avoids grind and pay-to-skip pressure; Balatro-style "widen the pool, not the power" |
| Generaal as armoured hulk (one image) | **Pot-helmet bird** on the shared rig | Readability as a bird, cheaper (skin on one rig), matches 3 of 4 images |
| Over-and-under default gun | **Side-by-side Dubbelloop** | Matches every gameplay mock-up; reads better first-person |
| Okavango jacarandas, Karoo baobabs/giraffes, hanging weaver balls | **Biome-accurate flora/fauna** | Authenticity is a pillar; locals will notice. Jacaranda is a South American listed invader |
| Season order Summer→Spring | Run order **Herfs → Winter → Lente → Somer** | Follows the South African guineafowl hunting season (historically ~April–July) and ends on the summer storm finale |
| "Climax" windmill, real-looking bakkie | Fictional badges | Trademark hygiene |
| "Tarentaal Verschrikker" | "Tarentaal-Verskrikker" | Afrikaans spelling (sk, not sch) |

Kept as-is: name *Tarantal Madness*; 90 s Classic; 8-shell belt; 5/10/25 distance scoring; parallax
panning; 4 seasons/biomes; Kettie ×2 / Windbuks ×1.5 identities; Chilli Biltong, Boeretroos,
Bush Buckshot, Meerkat Spotter; Kwêvoël penalty; windpomp & spare-wheel secrets; Bakkie Tally;
rank titles; procedural placeholder assets first; asset manifest for hot-swapping art.

## 2. Decision records

**D-001 Engine:** Phaser 4 + TypeScript + Vite. Alternatives (PixiJS, Godot web, Unity WebGL,
Construct/GameMaker) rejected — see Tech §1.
**D-002 Sim/render split** with fixed 60 Hz deterministic core; transcendental math via `detmath`.
**D-003 Data-driven content** (JSON + Zod); `contentHash` gates leaderboards; mods data-only in v1.
**D-004 Landscape only** in v1 with a rotate card in portrait. Risk: portal portrait traffic — revisit
after Poki/CrazyGames tests (a portrait "tall sky" layout is possible later).
**D-005 Mobile input:** tap = fire at finger, horizontal drag = pan, flick-down / belt tap = reload;
optional tilt-to-look; touch aim assist by plane.
**D-006 No element fullscreen on iPhone:** PWA + Add-to-Home-Screen banner instead.
**D-007 Monetisation:** portal ads only between hunts + optional rewarded; premium wrapper builds later;
no loot boxes, no paid currency, no energy.
**D-008 Art direction B (inked comic) locked;** AI images are reference only; final assets human-
authored with sources kept.
**D-009 Spine** recommended for character animation (skins for variants/bosses); frame-by-frame fallback.
**D-010 Budget:** first playable ≤ 5 MB compressed (Poki target < 8 MB); lazy-load other biomes.
**D-011 Name:** keep *Tarantal Madness*. "Tarantal" is an attested South African English spelling of
*tarentaal*; use *Tarentaal* in Afrikaans in-game text. International players may misread it as
"tarantula" — use a subtitle in stores ("Guineafowl Mayhem in the African Bush"). Run a proper
trademark search before launch (a quick web search found no game with this name; that is not a
clearance).
**D-012 Viewport-independent sim:** fire commands carry `dx` from screen centre; camera range and
layer geometry use a fixed 1920 reference + 300 px bleed (Tech §3.3); `inputKind` is part of
`SimConfig` and the replay. Found in internal review: otherwise Daily/replays differ per device.
**D-013 Flock tempo rule:** one threat per shot per flock, 1.5 s escalation window, window expiry
calms ALERT → FORAGE. Makes patient plinking and fast escalation both valid styles.
**D-014 Charm order matters:** charms apply left → right (add then multiply in sequence), system
multipliers last — Balatro-style ordering decisions.
**D-015 Single Stampede source + fractional windows:** `scoring.json → stampede.lastSeconds`; all
content windows are fractions of hunt length so 60 s and 90 s hunts share biome data.
**D-016 Build order:** crate weapons move to M4; M6 runs all seasons on a Karoo stand-in until M8.
**D-017 M0 toolchain and scaling (19 Oct 2026):** exact pins — Phaser 4.2.1, TypeScript 6.0.3
(typescript-eslint 8.72 supports TS < 6.1, so not TS 7 yet), Vite 8, Zod 4, Vitest 5, Playwright 1.56.1
(matches the Chromium preinstalled in Claude Code cloud sessions; bump together with the browsers).
The flexible width (Tech §5) uses `Scale.FIT` + `setGameSize(designSizeFor(viewport))` in
`src/game/layout.ts`, not Phaser's `EXPAND`, because `EXPAND` grows the *height* on 4:3 screens
instead of narrowing the width to 1440. Real WebKit runs in GitHub Actions; a sandbox without WebKit
runs the WebKit profiles on Chromium emulation (local only — CI requires WebKit). The sim purity
lint rules are guarded by `tools/simLintGuard.test.ts`. After the M0 review the guard is an allowlist:
only exact `Math` members pass in `src/sim` (no `**`, `hypot`, `log2`, …), `globalThis`/`self`/
`crypto`/`process` and Phaser subpath imports are banned, `detmath.ts` has no exemption, and
`src/sim` gets a second typecheck without DOM/Node types (`tsconfig.sim.json`).

**D-018 M1 sim rules (19 Oct 2026):** decisions made while building the deterministic core.
(1) *Frenzy timing:* a shot's bags score with the streak **including** that shot, so the 3rd
consecutive bagging shot is the first at ×1.5; a shot that only hits a non-target bags nothing and
resets the streak; empty clicks and reloads don't. (2) *Occlusion within a plane:* layers are walked
front to back by scroll factor; on a plane layer its birds stand in front of its props, and a
layer's props block every layer behind it (a per-bird "behind cover" flag comes with Ou Grys in M8).
Within a plane the higher bird id is in front; the renderer draws birds in id order to match.
Occluder sizes are design px on their layer (not scaled by plane); pellet spread is screen px.
(3) *Near plane in M1* = pop-ups (rise/stare/duck, hittable until they duck, behaviour `forage`);
mid/far = fly-overs (`flying`). Pop-ups appear within `popupDefaults.spawnHalfWidthPx` of the
screen centre, which uses only the sim's camera, never the viewport. (4) *Replay compression:* the
sim encodes InputLogs as delta-tick varint bytes + base64url; deflate needs async browser/Node APIs
the sim can't use, so it is added at the share/challenge-link boundary in M7. (5) Score is not
clamped at 0. (6) New content homes: `content/modes.json` (Classic/Daily hunt length, weapon, biome),
`birds.json → flyoverDefaults/popupDefaults`, `biome.pacing.stampede` (surge rates). World geometry
(R = 3200, 1920 reference width, 300 px bleed) is fixed in `src/sim/world.ts`; validation checks
plane layer scroll factors and `panoramaWidth` against it. (7) Golden replays run on the live
`content/`, so any tuning change needs `npm run golden:update`. (8) Deferred: wind drift (M4 omen),
Kettie projectiles (M8; the sim rejects projectile weapons until then), flocks/Whole Flock wiring and
the Vuvuzela (M3), secrets, crates, kwêvoël perch and boss spawns (M3/M4). Sim test files may use
`Math.*` as a reference (lint guard proves every other sim rule still applies to them).
(9) *Command gate:* `src/sim/commands.ts` is the one filter for the sim and the replay recorder —
non-finite values are dropped, positions are quantised to 0.5 and clamped to a real screen
(|dx| ≤ 1260, 0 ≤ sy ≤ 1080, camera to its range), and `huntSeconds` must be a multiple of 0.5, so
every accepted command is encodable and replays identically. (10) Kept in code as structure rather
than tuning: the spawn-credit jitter (0.5–1.5 of the mean interval), 50/50 entry side and facing, and
non-targets going down to a single pellet. Move them to `birds.json` if tuning ever needs them.

**D-019 M2 game-layer rules (20 Oct 2026):** decisions made while building the playable Classic
hunt. (1) *Feel tuning* (gestures, pan, juice, HUD, loop cap, particle budget) lives in
`content/client/feel.json`: Zod-validated, outside the sim `ContentBundle`/`contentHash`, so tuning
feel never invalidates replays. (2) *Input and audio* bypass Phaser: Pointer Events + keys in
`InputMapper`, Web Audio placeholder synth in `AudioDirector` (Phaser `input` and `audio` disabled).
(3) *Clock:* the runner follows `performance.now()`; Phaser's frame delta is smoothed/capped and would
stretch the hunt. The 5-steps-per-frame cap stays (Tech §3.2), so below 12 fps the hunt runs slower
than real time instead of skipping. Scene-clock timers must not touch objects a tween destroys
(tweens follow real time, the clock follows the smoothed delta — this crashed the loop at 4 fps).
(4) *Start card:* the first tap starts the hunt without firing, unlocks audio and fixes `inputKind`
from its pointer type; [Again] restarts with one tap the same way. (5) *Snapshot:* `BirdView.ground`
(pop-up grass line) is a render-only field; no event or outcome changes, golden replays untouched.
(6) *Placeholders:* non-targets always carry the ⛔ badge until persistence (M5) can limit it to the
first sighting; screen shake defaults off under `prefers-reduced-motion` and is toggled on the tally
until the Settings screen (M5). `?seed=` fixes every hunt's seed; `?huntSeconds=` works only in
dev/e2e builds. (7) *Evidence on software GL:* headless CI and this sandbox rasterise WebGL with
SwiftShader (an empty WebGL page can't hold 60 fps there). The perf smoke therefore always asserts the
CPU cost per frame (≤ 16.7 ms at 4× throttle) and asserts real 60 fps only with `PERF_STRICT=1` on a
machine with a GPU. "Load → first shot" is measured inside the page (ready + start-tap latency +
fire-tap latency) so slow harness round trips don't count. Playwright trace screenshots are off: each
is a full-canvas GPU readback that stalls software WebGL.

**D-020 M3 flock rules and balance (20 Oct 2026):** decisions made while building the flock and
tuning Classic Karoo. (1) *Late threat in RUN:* every escalation step needs a threat inside the
window opened by the previous one; a threat reaching a RUNNING flock after its window closed
reopens the window and restarts the 4–7 s calm timer but does not flush. (2) *Whole Flock* is
possible only until the flock first calms down (ALERT → FORAGE or SETTLE) or a member exits — GDD
§6.4 "before it settles" read as "before it calms down". Without this a plinker earned 3.3 whole
flocks per hunt by picking off a foraging flock that never leaves; the bonus rewards escalation.
(3) *Vuvuzela "visible"* = any member within the 1920-px reference view around the screen centre
(device-independent, Tech §3.3). Charges: Classic and Daily 2; Season Run uses the same until the
run state owns gadgets (M6). (4) *Events:* one `flockStateChanged {from, to, cause, plane, x, y}`
instead of separate alerted/flushed events (charm triggers `flockAlerted`/`flockFlushed` map to
`to` in M6), plus `flockSpawned`, `flockThreatened {source}`, `flockWiped`, `flockRemoved`,
`gadgetUsed`, `gadgetDenied`; `targetBagged` carries `flockId`. (5) *RNG:* flock spawns use the new
stream `flocks`; FSM timings and steering use `flockNoise`. (6) *Flight is a fountain:* a flushed
bird keeps its take-off heading (crosses at fly·cos θ while climbing, glide·cos θ while gliding);
accelerating to full fly speed sent 4.6 of ~8 birds per flush off the panorama. (7) *Kept in code
as structure:* ground depth speed ½, placement retries (8 tries, 30-tick retry), smallest flock
worth spawning (3), the climb blend clamp. Flock tunables (incl. new `startInViewPx`,
`alertShuffleMul`, `landRunSpeedMul`, `fleeLookAheadPx`, `runZigzag`, `boids.separationRadiusPx`,
`boids.turnRate`, `forageWanderPx`, `forageGoalMs`, `landRunMs`, `glideSinkPxPerSec`,
`spawnSpreadPx`, `spawnSpacingPx`, `pacing.stampede.flockState`) are in content; files stay
`version: 1` because no content has shipped. (8) *Balance bots:* plinker and competent share one
player model (`tools/humanBots.ts`); the M3 gate is measured with a mouse (`pointer`), touch is
reported. (9) *Tuning (tune commits):* Twee Vlieë +50/+150/+300 → +15/+40/+80 (it was half of every
score once dense flocks existed); Whole Flock +15 → +30 per bird; boids separation 1.4 → 3 with
radius 240, spawn spread 450; Karoo pacing: one mid flock at a time and no far flocks (with two
flocks or a far flock on screen plinking never cost time and scored as much as escalating; far
standing birds were Twee Vlieë farms), fly-overs 3→6/min (Stampede 10). Result, 500 seeds: see the
M3 PR. Follow-up: touch scores run ~16 % above pointer because the GDD §18.2 aim-assist radii are
large next to 110-px mid birds — revisit with the adjustable aim assist (M9). (10) *Slow-mo* is a
HuntRunner time scale like hit-stop (sim ticks and replays unaffected). (11) *Evidence on this
box:* the flock e2e fires its taps from inside the page (Playwright round trips cost ~130 ticks on
software GL, longer than the escalation window); WebKit cannot open pages here, so local iPhone 14
screenshots come from Chromium emulating the device — CI runs real WebKit.

## 3. Research notes (with sources)

**Moorhuhn / Crazy Chicken**
- Began as a Johnnie Walker advergame (1998–99) by Art Department and Witan; went viral partly
  because the ~2 MB game could be emailed. Registered trademarks now held by ak tronic Software &
  Services; 2025 remasters by Higgs Games (Moorhuhn 2 at $7.99, rated E10+).
- Core: 90 s rounds; points by distance (farthest birds 25); hidden secret targets, bonus-time
  objects, penalty targets (planes, zeppelins); late-round hits worth more in Moorhuhn 2.
- Sources: [Wikipedia — Crazy Chicken](https://en.wikipedia.org/wiki/Crazy_Chicken) ·
  [Giant Bomb — The Original Moorhuhn Hunt](https://giantbomb.com/wiki/Games/The_Original_Moorhuhn_Hunt) ·
  [Steam — Moorhuhn 2](https://store.steampowered.com/sub/1187934) ·
  [Nintendo — Moorhuhn 2](https://www.nintendo.com/games/detail/moorhuhn-2-switch) ·
  [Deku Deals — Moorhuhn 2](https://www.dekudeals.com/items/moorhuhn-2) ·
  [Home of the Underdogs — Moorhuhn Jagd 2](https://www.homeoftheunderdogs.net/game.php?id=2112)

**Helmeted guineafowl behaviour**
- Gregarious; flocks of ~25 outside breeding (6–20 commonly seen); terrestrial; prefer to run rather
  than fly when alarmed; when pressed burst from cover in steep flight with "kek-kek" alarm calls;
  roost communally in trees. Afrikaans: *Gewone Tarentaal*; crested guineafowl: *Kuifkoptarentaal*.
  DSAE lists *tarantal* as a South African English variant spelling; historical hunting season
  April–July.
- Sources: [Wikipedia — Helmeted guineafowl](https://en.wikipedia.org/wiki/Helmeted_guinea_fowl) ·
  [NZ Birds Online — Helmeted guineafowl](https://nzbirdsonline.org.nz/species/helmeted-guineafowl) ·
  [DSAE — tarentaal](https://dsae.co.za/entry/tarentaal/e07080) ·
  [Roberts VII names (UCT)](https://science.uct.ac.za/media/197450)

**Engine & platforms**
- Phaser 4: [v4.0.0 release](https://github.com/phaserjs/phaser/releases/tag/v4.0.0) ·
  [Phaser 4 releases list](https://phaser.io/download/phaser4) ·
  [spine-phaser-v4 + Mesh2D](https://esotericsoftware.com/blog/phaser-mesh2d-in-spine-phaser-v4)
- Godot/Unity web trade-offs: [Godot web export docs](https://docs.godotengine.org/en/stable//tutorials/export/exporting_for_web.html) ·
  [Godot vs Unity for web (2026)](https://app.cinevva.com/guides/godot-vs-unity-web-games)
- Portals: [Poki requirements](https://sdk.poki.com/new-requirements) ·
  [CrazyGames technical requirements](https://docs.crazygames.com/requirements/technical) ·
  [How to get on Poki (2026 guide)](https://app.cinevva.com/guides/publish-game-poki) ·
  [Portal size budgets overview](https://www.summerengine.com/make-great-games/publish-an-html5-game)
- iPhone fullscreen: [WebKit bug 206854](https://www2.webkit.org/show_bug.cgi?id=206854) ·
  [Apple Developer Forums thread](https://developer.apple.com/forums/thread/133248?page=2)
- DeviceOrientation permission on iOS: [OpenReplay guide](https://blog.openreplay.com/understanding-device-orientation-api/)

**Design references**
- Balatro as the model for "one more run" build-crafting and ethical (no microtransaction) compulsion:
  [Mechanics of Magic critical play](https://mechanicsofmagic.com/2026/05/22/critical-play-on-games-of-chance-and-addiction-balatro/)
- Game feel: Jan Willem Nijman, "The Art of Screenshake" (2013); Jonasson & Purho, "Juice it or lose
  it" (2012) — classic talks on feedback/juice.

**Legal**
- AI-generated assets and copyright / platform disclosure:
  [Promise Legal — AI game assets 2026](https://blog.promise.legal/ai-game-assets-copyright-steam-disclosure-2026/) ·
  [Perkins Coie — AI visual content in games](https://legacy.perkinscoie.com/insights/article/copyright-ai-generated-visual-content-video-games)
- Jacaranda invasive status: [Wikipedia](https://en.wikipedia.org/wiki/Jacaranda_mimosifolia) ·
  [Stellenbosch Botanical Garden](https://sun.gardenexplorer.org/taxon-1837.aspx)

**Claude Code practice** (applied in `CLAUDE.md`, `.claude/`):
[Memory & CLAUDE.md](https://code.claude.com/docs/en/memory) ·
[Best practices](https://code.claude.com/docs/en/best-practices) — CLAUDE.md under ~200 lines,
path-scoped rules in `.claude/rules/`, skills for repeatable workflows, a fresh-context reviewer
subagent, verification Claude can run itself, plan mode for multi-file work.

## 4. Open questions for the product owner
1. Portrait support in v1? (Default: no.)
2. Primary launch market and languages beyond EN/AF/DE/NL?
3. Budget for a human illustrator, animator, voice actor and composer (art bible §9–10)?
4. Which portal first: Poki (curated, strict size) or CrazyGames (open basic launch)?
5. Keep the hunting framing for all markets, or offer a "camera safari" reskin for sensitive markets?
