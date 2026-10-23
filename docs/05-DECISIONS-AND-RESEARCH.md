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
possible only until the flock calms down after losing a bird (ALERT → FORAGE), SETTLES, or a
member exits — GDD §6.4 "before it settles" read as "before it calms down". Without this a plinker
earned 3.3 whole flocks per hunt by picking off a foraging flock that never leaves; the bonus
rewards escalation. A flock that was only spooked (hadeda, stray shot) keeps its chance.
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
large next to 110-px mid birds — revisit with the adjustable aim assist (M9). (12) *Window length:* the escalation window opens on the threat's tick and its first countdown is
skipped, so a follow-up on any of the next 90 ticks (the full 1.5 s) escalates. (13) *Crouched
flushed birds* (0–300 ms stagger before take-off) score as flying (+1.0, GDD §5.3 "flushed").
(14) *Stampede direction:* every flock forced by the Stampede (live or newly spawned) runs toward
the screen centre, so the mass run crosses the player's view instead of leaving it. (10) *Slow-mo*
is a
HuntRunner time scale like hit-stop (sim ticks and replays unaffected). (11) *Evidence on this
box:* the flock e2e fires its taps from inside the page (Playwright round trips cost ~130 ticks on
software GL, longer than the escalation window); WebKit cannot open pages here, so local iPhone 14
screenshots come from Chromium emulating the device — CI runs real WebKit.

**D-021 M4 Karoo biome rules (20 Oct 2026):** decisions made while building the content-driven
Karoo. (1) *Omen:* `modes.json → omen` per mode — Classic **off** (purist, and the balance gate is
measured there), Daily **on** (GDD §12 "same … omen" for everyone); `ModeConfig.omen` overrides
it (Season Run omen hunts in M6; `?omen=1/0` in dev/e2e builds). (2) *Windpomp:* all 4 marked
blades within `windowSeconds` 8 of the first, else the marks reset. Secrets pay once per hunt
unless their JSON has `cooldownSeconds` (the fence bell, every 30 s); single-hit secrets must say
`oncePerHunt` or `cooldownSeconds` (schema). (3) *Bots:* plinker and competent shoot visible crates
and the boss; only the competent bot shoots visible secret parts, and only with nothing better in
view (it finds them all: ~6 secrets/hunt incl. 3 bells — a knowing player). (4) *Frenzy:* a shot
that only hits a secret part or a crate neither extends nor resets the streak and is not a Miss.
(5) *Data-driven secrets:* parts are shapes in `props[].secret` (multi-hit parts may orbit a
`rotor`); rewards are generic (`points`, `event` label, `at` prop, `reaction {effect, scope}`,
`flushBirds`, `addTimeSeconds`, `powerup`, `barkKey`) — the old code-specific `effect:
allHiddenJump` became `reaction: flush/all`. No system knows a secret, prop or event by id;
world events dispatch through `WORLD_EVENT_HANDLERS` by handler kind. Tests prove removing a
secret (or its prop) from the JSON removes it and adding one to another prop works. (6) *Burst
flock:* the windpomp's 12 birds burst out already flushing and can't earn Whole Flock — the bonus
rewards escalation (D-020). Without this the competent bot wiped it 0.93×/hunt for +360 and left
the band (4 727). (7) *Bonus time:* moves the end and a Stampede that hasn't started; pacing and
the event schedule keep the original length. (8) *Crate weapons:* replace the primary (its belt is
kept) until used up; Voorlaaier reloads 2.5 s after each shot; Mielie-Masjien's 10 s run from
pickup; a new crate weapon replaces the old. Chilli Biltong = hold to auto-fire at the gun's
cooldown, no shells used, a running reload is cancelled. Boeretroos steps birds and flocks every
other tick (half rate, exact and deterministic; renders at 30 Hz motion for 10 s). A shell
power-up counts the shots after the one that picked it up; picking a power-up up again refreshes
it. (9) *Hold-to-fire input:* only while the snapshot says `weapon.holdToFire`; on touch a held
finger aims instead of panning and the screen edges pan. (10) *Placement:* crates drop into view
(±600 px of the centre at spawn); dust devils start in view on the upwind side; the kwêvoël flies
in from off screen to its perch; the Generaal appears at the bakkie's perch point and roams ±320 px.
(11) *Placeholders:* the windpomp's rotor is now the secret's own sprite (the prop art keeps a
tail vane); the ⛔ call-out for a first sighting is per hunt until persistence (M5). (12) *New
streams:* `secrets`, `crates`, `omen`, `perch`, `boss`. (13) *Evidence on this box:* local
Playwright repeatedly cut turns off, so the full e2e suite (incl. the new `karoo.spec.ts`) is left
to GitHub CI; `karoo.spec.ts` passed here on desktop, Pixel 7 and iPhone 14 (Chromium emulation)
before that. (14) *Balance* (Classic Karoo, 500 seeds, pointer), mean / p15 / p85:

| bot | pre-M4 | M4, omen off | M4, omen on |
|---|---|---|---|
| random | 238 / 105 / 360 | 267 / 120 / 405 | 255 / 120 / 405 |
| plinker | 2 184 / 1 675 / 2 722 | 2 408 / 1 863 / 2 897 | 2 566 / 1 995 / 3 167 |
| competent | 3 695 / 2 991 / 4 385 | 4 180 / 3 520 / 4 883 | 4 243 / 3 532 / 4 931 |

Plinker is 42.4 % (off) / 39.5 % (on) below competent; all M3 gates pass, no content tuning needed.
(15) *Review fixes:* a pellet's impact (threats, `pelletImpact.dx`) is where it landed, so a far
shot's drift moves its alert point too; a shot that knocks armour off while also hitting a secret or
crate is a normal Frenzy shot (only a shot that damages nothing keeps the streak); dust devils honour
`flushOnContact` (false = one threat). Bush Buckshot also widens and counts crate-weapon shots (the
Voorlaaier goes to 750 px — a deliberate combo). Follow-ups: a perch/boss event is skipped if the
screen already holds `maxBirdsOnScreen`; Chilli Biltong's red edge glow is not drawn yet; golden
replays don't exercise `fireHold*` (unit tests do).

**D-022 M5 meta, persistence, menus and FTUE (20 Oct 2026):** decisions made while building the
game loop around the hunt. (1) *Save:* `SaveData` v1 under `tm.save.v1` (Tech §11). Each section,
and each field of an object section, is validated alone, so damage falls back locally; non-JSON
text is kept as `tm.save.corrupt`; a newer-version save is read but never overwritten; v0 = the M2
key `tm.settings.screenShake` (migrated, then removed). All access stays in `src/meta/storage.ts`,
which runs from memory when localStorage throws. (2) *Meta content outside the hash:*
`content/meta/notaboek.json` (8 starter challenges; `bag_50_far` → Windbuks, `whole_flock_x3` →
Kettie, both counted over all hunts) is validated and cross-checked but, like `feel.json`, not in
the sim bundle or `contentHash` — progression never changes a hunt. The Kettie shows as unlocked
but can't be equipped until M8 projectiles. (3) *Aim assist in the sim:* `SimConfig.aimAssist`
(off / low / standard) multiplies the touch radii by `scoring.json aimAssistLevels` (0 / 0.5 / 1);
mouse stays 0. InputLog **v2** writes an aim-assist byte after the input kind (v1 still decodes as
standard). (4) *FTUE as a sim mode:* `ftue` (appended to the replay mode table) in `modes.json` —
60 s Karoo, 0.6× fly-over/pop-up rates, +40 px hit radius until the first bag (every plane and
input kind, also on penalty creatures — a follow-up), no Stampede/crates/boss by their mode
filters. Bles's spook (skipped if a flock already ran) and the forced flush are beats at 1/3 and
1/2 of the hunt, fractions like every content window (D-015), so short e2e lessons keep them; new
event `tutorialBeat`. Presentation (windpomp hint at 0.67, banner time, 52-character prompt cap)
is in `feel.json`. One line at a time: while an FTUE prompt shows, HUD banners are held (the ⛔
call-out still shows — it is a safety signal). Skip returns to the title and counts the lesson
as seen. (5) *Golden replays* were re-recorded twice (aimAssistLevels and the ftue mode changed
`contentHash`); every existing case kept its event hash, count and score; new cases
`classic-7-aim-touch-lowassist` and `ftue-3-aim-touch`. (6) *⛔ first sighting* = the creature is
not in the Bird Book yet (GDD §7). The Bird Book records perching creatures only when they land and
call, the same rule as the HUD call-out (review fix), so an off-screen kwêvoël never hides its own
badge. (7) *Settings reach the game* through one live `prefs` object (`src/game/prefs.ts`, updated
in place on save change), the AudioDirector's master/SFX/music buses (the flush sting and Stampede
cue are the music bus until stems land) and SimConfig. Quality tiers only cut particles; glints
show on every tier (review fix: they are the only reveal of single-hit secrets). Reduce flashes
dims the muzzle flash and glints and drops the red empty-belt flash. (8) *PlatformAdapter* gains
`onAdChange`, `capabilities()` and `requestFullscreen()`; the `web` adapter keeps analytics on the
device (no endpoint until a privacy review, M9) and registers the service worker in production
builds. Fullscreen button only where the API works and never on iPhone; the iPhone gets a one-time
Add to Home Screen banner at the top edge (at the bottom it covered the title buttons). (9) *PWA:*
`tools/serviceWorker.ts` generates `sw.js` from the build's file list (content-hashed cache name);
navigations are network-first with the cached `index.html` as the offline fallback. Icons are
placeholders from `tools/make-icons.ts` until M10 art. (10) *i18n guard:* an ESLint
`no-restricted-syntax` rule in `src/game`, `src/platform` and `main.ts` rejects word-bearing
literals passed as on-screen text (add.text, setText, drawButton, banners, textContent,
aria-label/title); `tools/i18nLintGuard.test.ts` proves it. Afrikaans strings are a draft for the
native-speaker review (Appendix A). (11) *Evidence on this box:* WebKit is installed but lacks
system libraries, so `PW_NO_WEBKIT=1` runs the iPhone profiles on Chromium emulation locally (CI
unaffected); headless Chromium needs `LD_LIBRARY_PATH=~/.local/pw-deps/...`. CI e2e: limit 60 min,
desktop-chromium and pixel7-landscape in two shards. (12) *Follow-ups:* the first-hit bonus should
skip non-targets; text size and captions (M9); a real Bles sprite (now a "WOEF! WOEF!" bubble).

**D-023 M6 Season Run (20 Oct 2026):** decisions made while building the roguelite run.
(1) *Everything a run changes is in the replay:* `ModeConfig.season` (charms in slot order, hunt
kind, boss, consumables, rental, run shell bonus); pause-screen reordering is a recorded
`charmOrder` command; InputLog **v3** adds the season block (v1/v2 still decode). (2) *Charm
interpreter:* passives fold into stats; bag effects become `Modifier`s in slot order, then listed
order (GDD §5.3); `addMultForHunt` builds up per charm and applies at that charm's slot; other
actions are queued, never nested. Validation rejects scoring actions off `bag`, stat actions off
`passive` and conditions on `passive`. Randomness: `charms` (extra kwêvoël visits) and the new stream `lightning`
(Stormvoël rule); hunt and Padstal seeds are `fnv1a32` of the run seed and the position, and the
Padstal draws from its `shop` stream. (3) *Charm
readings:* Fluitjie has no charge limit, only its 6 s cooldown (the Vuvuzela keeps 2 charges);
Haelstorm's every-8th-primary-shot blast fires with Voorlaaier stats on a normal shell; Rooi
Patrone = the shot fired from a full belt, Laaste Patroon = the shot that empties it — primary
shells only (no index for crate weapons or Chilli Biltong); Konsertina fires once per shot when the
Frenzy streak reaches a multiple of 10 and refills up to the belt size; Geheime Resep drops the
streak to the previous tier's `atStreak` (to 0 from the first tier); Boeretroos-Fles slows the
creatures **in the sim** like the Boeretroos power-up (not a HuntRunner time scale), so bots and
replays see it and the hunt clock keeps running; Kwêvoël se Seën adds round(mean × (mul − 1)) visits
timed from the `charms` stream, so the base event schedule is unchanged; Generaal se Pot's shell
lasts the whole run (run state), even if the charm is sold; `tick:every:N` fires on ticks N, 2N …
(not tick 0). (4) *Boss Rules* apply to whatever boss stands in (the Generaal until M8): the rule
comes from the season's boss creature; a boss hunt always schedules the biome's boss event. Boss
rules beat charms: Stil Loop does not cancel the Generaal's "every miss alerts all flocks". The
Generaal's rule threatens each flock once per shot (GDD §6.1): flocks the miss already threatened
are skipped (review fix — a near miss sent a foraging flock straight to RUN). Ou Grys's "ground
shots score 0" is a final `bossRule` ×0 breakdown step; bosses are exempt when the season's boss is
(`exemptFromOwnBossRule`); "ground" here is anything not flying (run included: "wing shots only"),
while Grondwerk's "ground bags" stays forage/alert as in `charms.json`. A shot whose bags were all
ground bags under Ou Grys also pays no Twee Vlieë or Whole Flock (`bonusAwarded` award 0, no charm
trigger) — otherwise a Voorlaaier into a foraging flock still scored big (review fix, our call). Lightning every 2.5–5 s (`run.json`), ≤ 2 per second.
(5) *Economy:* interest counts the doppies held when the hunt ended, before its payout; a failed
hunt pays nothing; white-tarentaal doppies only exist in Season Run hunts (Classic events
unchanged). Padstal charm offers are rarity-weighted (`charms.json → offerWeights` 6/4/2/1), only
from the pool, never a charm you own; a reroll redraws every offer and its price restarts at each
Padstal; the rental lasts the next hunt only, set off from its own slot (the one after the
consumables). Crate weapons have no unlock yet, so the rental offer is always there ("if
unlocked" in GDD §13.5 waits for a rental unlock, if one is ever added). (6) *Unlocks:* Notaboek rewards gain `{type: charm}`; Hele Swerm, Oupa se Kaart and
Geheime Resep start locked (whole flock ×5, 10 secrets, 4 000 in one hunt). (7) *Stand-ins:*
`run.json → biomeFallback` (Karoo) for seasons whose biome isn't loaded (logged by the run loader).
(8) *Balance:* a season's pass rate = of the runs that reach it, the share that clear all three
hunts. The `synergy` policy commits to the archetype of its first charm (the strongest charm on
every offer gave 95 % in Winter, far from a real archetype build). Quotas tuned with the starter
pool, competent bot, pointer: Herfs 1 950 / 2 100 / 2 250, Winter 2 350 / 2 350 / 2 150 (the
boss hunt lowered from 2 250 after the Ou Grys bonus fix). Seeds 1–500 / 501–1000: Herfs none
83.0 / 82.4 % (target ~85), synergy 92.4 / 89.8 % (~95); Winter none 49.2 / 48.8 % (~50),
synergy 82.0 / 82.4 % (~80). (9) *Golden replays* re-recorded on
purpose (content hash, log v3); every existing case kept its event hash, count and score; new
cases `season-herfs-boss-competent`, `season-winter-omen-competent`,
`season-stormvoel-boss-competent`. (10) *Run UI (PR 2/2):* the title and the tally open the run
(`[Continue run]` when one is saved); the run uses the Skiet-Skuur gun if it is equippable. The
Padstal and the pause screen share one charm row: drag a card to a new slot, tap it to pick it for
selling (Padstal), ←/→ moves the focused card on keys; a mid-hunt reorder is a recorded
`charmOrder` and the run keeps it. Consumables and the rental sit beside the gadget (tap/click, or
1/2/3). Stormvoël darkness: 86 % dark between flashes, clear during a flash (45 % with "reduce
flashes"). Closing the tab mid-hunt replays that hunt from its card with the same seed (like
Balatro's round restart). Dev/e2e builds take `?quotaMul=` (0 = every hunt passes) so the
12-hunt e2e stays short. (11) *Follow-ups:* `rewardedRetryPerRun` needs the portal
rewarded-ad flow (M9); Lente/Somer quotas and the real bosses come with their biomes (M8); a
charm's `addPoints`/`addMult` on non-bag triggers is rejected rather than given a meaning.

**D-024 M7 Daily Hunt, share card, challenge links (21 Oct 2026):** decisions made while building
the daily layer. (1) *No sim change:* the Daily already existed as a sim mode (`modes.json →
daily`, omen on, no charms or ad boosts — D-021); the replay format stays **v3**. Date → seed
happens in `src/meta/daily.ts`; `Date.now()` is read only in the game layer. (2) *Seed bytes:* the
first 4 SHA-256 bytes big-endian; the UTC calendar (day number, `YYYY-MM-DD`, ISO week) is integer
arithmetic, tested against `Date` for every day 1970–2100. (3) *Meta content outside the hash:*
`content/meta/daily.json` (epoch, rotation, streak milestones, grid thresholds, link limits) is
validated and cross-checked but not in the bundle or `contentHash`, so tuning it never changes a
daily seed. Epoch = 2026-10-21 is a **placeholder** for the launch date. (4) *Rotation:*
`biomeRotation[day mod n]` over the biomes that are playable (only Karoo until M8); none → the
`modes.json` daily biome. (5) *Weapon:* the Daily uses the Skiet-Skuur gun (GDD §13.7 "equip
weapon for Classic/Daily"; GDD §12 fixes only seed, biome, omen and crates). (6) *First attempt:*
claimed when the daily hunt **starts**; quitting or closing the tab uses it up (it counts for the
streak, with no score), so a bad start can't be retried. A clock moved back never opens a second
official attempt. Practice changes no streak, share card, daily best, Classic best or rank.
(7) *Freeze:* each missed day needs the unused freeze of its own ISO week (GDD §15 text).
(8) *Cosmetics:* streak milestones (3/7/30/100) are save ids with names until cosmetic art exists
(M10). (9) *Share grid:* five equal parts of the planned hunt (bonus time adds to the last part),
coloured by accuracy (bagging shots ÷ shots, the `hitShots` rule): 🟩 ≥ 0.6, 🟨 ≥ 0.3, else ⬛.
The score is grouped with no-break spaces ("2 840"); rank names on the card have their own short
keys (`share.rank.*`: the tally's English gloss is dropped). The en line keeps the GDD's "hele
swerm" flavour. (10) *Share:* text and link go to `navigator.share` apart (some targets append the
url themselves); a closed sheet is `cancelled` with no clipboard fallback. (11) *Challenge links:*
optional `n` (daily number, for the card) and `h` (8 hex of `contentHash`; a mismatch still plays
with a warning) join the Tech §12 fields; `by` loses control and bidi-override characters and is
cut to 24 graphemes. A challenge lends its gun for that hunt even if the recipient hasn't unlocked
it; guns the sim can't play (Kettie until M8), crate weapons and gadgets are rejected, like unknown
biomes. **No deflate:** a link holds ~110 bytes of JSON and no replay, so `CompressionStream`
would save almost nothing and make decoding async; deflate stays for shared replays (D-018).
(12) *Golden replays:* `golden:update` was re-run only to add `daily-2026-10-21-competent-pointer`
and `daily-2026-10-21-aim-touch` (seed = `dailySeed('2026-10-21', contentHash)`); every existing
case kept its log, hash, count and score. (13) *UI (PR 2/2):* the title's bottom row is Skiet-Skuur
· **Daily #n** · Season Run · Settings, with one line above Daily (new today / streak and "freeze
ready" / played → practice); a new player's title still shows only START (GDD §16), so the Daily
appears after the lesson. A challenge link opened by a new player plays the challenge straight
away; the FTUE stays pending for their next START. The "beat this" card (`ChallengeScene`) shows
before the title; a bad link shows the title with one line. The HUD tag (`DAILY #n`, `PRACTICE ·
DAILY #n`, `BEAT n`) sits in the Season Run quota slot under the score (run hunts have no tag),
drawn once at setup — under the pause button it collided with the big banners. Tally: tag
top-left, [Share] top-right (Classic, the official daily, and Classic challenges; never practice),
the challenge verdict and streak news first in the news line. [Again] after a daily replays the
same daily as practice; after a challenge, the same challenge. Practice dailies count for stats and
the Notaboek but not for the rank (`applyHunt` `ranked`). (14) *Test hooks:* `?today=YYYY-MM-DD`
fixes the UTC day and `window.__TM_TOOLS__` replays a log in the page (dev/e2e builds only).
(15) *Evidence on this box:* port 4173 was held by another checkout's preview server, so the local
run used a scratch config on 4174 (CI unaffected); `daily.spec.ts` (4 tests, ~2.5 min on software
GL) stays in the shared shards. (16) *Follow-ups:* streak cosmetics have no art yet (M10); the
share card is text only (an image card is v1.x); `by` (sender name) is never set by this build —
there is no player name yet; set the real `epoch` before launch.
(17) *Review fixes:* a day before the epoch (number ≤ 0) shares a link without `n` and never
blocks the tally (building the share line can't throw); a daily challenge counts as today's
official daily only when both seed **and** biome match today; a daily challenge to any other day
never moves the rank. Content caps `historyDays` ≤ 400 and `freezeWeeksKept` ≤ 60 match the save
caps. *Known limit (M9):* the `?e2e` test hooks (`today`, `huntSeconds`, `omen`, `quotaMul`) work
in production builds, so a player can bend their own local streak and bests; this was already true
for Classic bests. M9 should gate the hooks out of portal builds or give them their own save
namespace (the e2e specs read `tm.save.v1` directly, so that needs a spec change too). No trust is
placed in local results (Tech §12), so this only affects the player's own save.

**D-025 M8 Remaining biomes and arsenal (21 Oct 2026):** decisions made while building the three
remaining biomes, their bosses and the launch arsenal. Shipped as a stack of PRs (A arsenal,
B Bushveld, C Okavango, D Kalahari, E stand-in removal + Season Run tuning); each part adds here.
*PR A — arsenal.* (1) *Kettie = delayed hitscan* (Tech §3.4): three depth bands by scroll factor,
the stone flies to the world point under the tap for the camera at fire time, each band is tested
at its own travel time against what stands there then; drop and wind (far band) on arrival. The
whole resolution (Frenzy, miss, Generaal's "every miss alerts all flocks", charm `shot`/`miss`
triggers) happens at landing. A stone still in the air at the hunt end is dropped (a shot, not a
miss). No new command or RNG stream; the replay stays **v3**. `fire()` was split into trigger +
`resolveShot` with hitscan shots resolving in the same tick: every golden replay kept its event
hash. (2) *Kuifkop Koning × Kettie:* "reload takes twice as long" doubles the Kettie's draw (its
fire cooldown), because it has no belt to reload — the GDD's Mag/reload column lists "∞ / 0.35 s
draw". (3) *Plaas-Pomp tuned:* with the GDD's 0.35 s per shell and 48 px spread the competent bot
scored 5 924 vs the Dubbelloop's 4 134 (500 seeds) — the interruptible reload never cost time and
the tight spread hit 77 % vs 60 %. Now 0.7 s per shell and 60 px: 4 306 (plinker 33 % below).
Weapons Windbuks 3 039 and Kettie 4 713 (200 seeds) are left as they are: the Windbuks's silence
and far ×1.5 pay off in biomes with far flocks, and the Kettie needs leading that bots do better
than people (human check). (4) *Bots* lead Kettie stones by the travel time and aim above the
drop; hitscan aims are unchanged. (5) *Daily golden seeds pinned:* the M7 daily cases derived
their seed from `contentHash`, so every content edit changed their event hash; they now keep the
M7 seed (1286298468), and `daily.spec.ts` still checks the browser derives the same daily seed as
Node. (6) *Placeholders:* gun art for the three primaries (`placeholder/arsenalArt.ts`; shared
canvas primitives moved to `placeholder/draw.ts`), a stone sprite drawn from the gun to the aim
point (it follows the world as you pan; the mid plane stands in for depth), a Kettie draw meter
in the belt slot and per-shell reloads fading the next shell in. (7) *Golden replays:* re-recorded
for the content hash only, every existing case kept its event hash, count and score; new cases
`classic-21-kettie-competent-pointer`, `classic-22-windbuks-competent-touch`,
`classic-23-pomp-competent-pointer`, `season-kuifkop-boss-pomp-competent`.
*PR B — Winter · Bushveld.* (8) *Twist vs omen:* GDD §11's "Gameplay twist" column is on in every
mode; the "Omen" column is weather in omen hunts and the Daily (Classic stays purist, D-021).
Bushveld: 60 % of flocks run instead of flying (a running-only flock, drawn from the new `twist`
stream, never takes wing from shots; the Vuvuzela and secrets still flush it — "60 % of flocks
run rather than fly" read as escalation only). (9) *Glare is drawn only:* a band on one side of
the screen, the side drawn from the omen stream so every device shows the same; no sim rule (our
call — GDD gives none; the bots can't be dazzled, so omen on/off balance is identical and the
feel is a human check). (10) *Secrets:* the dassie is a new `nearMiss` kind (radius 120 px on the
mid layer; pellets pass the dassie itself); the boulder is `singleHit` with `hitsRequired: 3`
(hits over any shots, no window); "flushes hidden birds" = a 6-bird burst at the boulder (no Whole
Flock, D-021). The baobab pod flushes flocks within 500 px. (11) *Ou Grys:* hidden/peek between
three boulders (hide 1.5–2.6 s, peek 1.2–2 s, stay 14–18 s, 2 hits, 4 pellets); his route is drawn
once from the `boss` stream; a hit sends him to the next cover. D-018's per-bird "behind cover"
flag is the `hidden` phase (not hittable, not drawn). (12) *Rendering many biomes:* the game drew
one biome (`ctx.biome`, one manifest, `playableBiomes = [karoo]`). Now a biome is playable when it
has placeholder art registered; manifests are built on first use and `HuntScene` swaps its views
when a hunt's biome differs from the title's (Daily rotation, challenges, the run). Textures of a
new biome are drawn when its first hunt starts (lazy, D-010). `?biome=` (dev/e2e) plays Classic
in another biome. The Bird Book lists every playable biome's secrets. (13) *Daily rotation:* it
already picks up new playable biomes; 2026-10-21 (day 20747, odd) is now a Bushveld daily, so
`daily.spec` checks the rotation's biome and an omen flag instead of the Karoo's wind.
(14) *Balance (Classic Bushveld, 500 seeds, pointer)*, mean / p15 / p85: random 242 / 105 / 380,
plinker 2 195 / 1 755 / 2 665, competent 4 015 / 3 381 / 4 631 — all M3 gates pass (plinker 45 %
below competent); Karoo's pacing unchanged. (15) *Golden replays:* every existing case kept its
event hash; new `classic-31-bushveld-competent-pointer`, `daily-32-bushveld-aim-touch`,
`season-winter-boss-bushveld-competent`. Tests that took `content.biomes[0]` as the Karoo now find
it by id (biomes sort by file name, Bushveld first).
*PR C — Lente · Okavango.* (16) *Splash:* "shots near water splash-alert" = water zones on the
mid layer (data, drawn by the renderer from the same zones); a pellet that stops on nothing over
water threatens flocks within 320 px that the shot didn't already threaten. It is the water's
noise, not the gun's, so the silent Windbuks and Stil Loop still splash (our call: otherwise the
twist does nothing to the stealth builds it is meant to test). (17) *Sun-showers:* the GDD names
no rule; rain muffles shots (alert radius × 0.6), showers every 8–14 s for 5–9 s, drawn from the
omen stream — a window to plink closer. (18) *Kuifkop:* appears only through the new
`kuifkopHop` event (3–4 per hunt), not in flocks; hides in a reed bed (not hittable), peeks
0.8–1.3 s, hops 0.5–0.7 s in plain view to another bed (scored as a runner, +0.5). Kuifkop Koning
uses the same route with 3 hits; a hit sends him into the reeds. The hippo's "yawn" is its secret
(no separate scheduled yawn). The fish eagle gets its own event id `fishEagle`; the crop sprayer
stays on the farm biomes. (19) *Balance (Classic Okavango, 500 seeds, pointer)*, mean / p15 /
p85, omen off: random 318 / 160 / 455, plinker 2 803 / 2 230 / 3 380, competent 4 164 / 3 464 /
4 921 (plinker 32.7 % below); omen on: competent 4 145, plinker 2 817 — all M3 gates pass.
(20) *Golden replays:* every existing case kept its event hash; new
`classic-41-okavango-competent-pointer`, `daily-42-okavango-aim-touch`,
`classic-43-okavango-windbuks-competent-pointer`, `season-lente-boss-okavango-competent`.
*PR D — Somer · Kalahari.* (21) *Heat → storm:* the omen splits at 55 % of the hunt. Haze is in
the sim (far birds and their hitboxes wobble ±14 px), not a filter, so "what you see is what you
hit" holds. The storm's rain makes every flock running-only ("rain makes flocks run not fly"
read the same way as the Bushveld twist). (22) *One lightning timeline:* boss-rule flashes keep
their M6 schedule (its golden kept its hash); storm flashes and the Stormvoël's own flashes come
from the new `storm` stream at run time; any flash closer than `60 / min(cap)` ticks to the last
is dropped, so two sources can never add up past the cap (2/s, under the ≤ 3/s rule).
(23) *Die Stormvoël:* "far→mid" = two passes across the sky: far first, then back across the mid
sky (a new bird keeping his `hitsLeft`; a bird's plane stays immutable). Hittable only while lit
(`lightningOnly`). In Classic/Daily he brings his own flashes at his rule's cadence (run.json
`darkExceptLightning`); the screen goes dark only under the boss rule. "Giant shadow" = a dark
silhouette with glowing eyes; the render box for birds widened 20 px for his head (render only).
(24) *Weaver nest:* "don't shoot it, −10" = a `penalty` secret reward: points off on each hit
(2 s cooldown), a `secretPenalty` event, not a secret found and no Frenzy change (a shot that only
hits a secret part leaves the streak, D-021). Bots leave it alone. (25) *Strict validator:* with
all four biome files present the validator passes `--strict` with no warnings (CI switch in PR E).
(26) *Balance (Classic Kalahari, 500 seeds, pointer)*, mean / p15 / p85, omen off: random 297 /
120 / 465, plinker 2 161 / 1 617 / 2 721, competent 3 885 / 3 184 / 4 663 (plinker 44 % below);
omen on: competent 3 892, plinker 1 995 — all M3 gates pass. (27) *Golden replays:* every
existing case kept its event hash; new `classic-51-kalahari-competent-pointer`,
`daily-52-kalahari-aim-touch`, `daily-53-kalahari-kettie-competent-pointer`,
`season-somer-boss-kalahari-competent`.
*Review fixes (on D, after #14).* (R1) *End-of-hunt pause:* the 900 ms pause before the tally was
a Phaser `delayedCall`; the scene clock follows the smoothed, capped frame delta, so at ~300 ms
frames (software GL in CI) it took ~15 s, and with four real-biome seasons the 12-hunt e2e passed
10 min. It now runs on `performance.now()` like the hunt clock (D-019): hunt end → run tally went
from 17.5–27 s to 3.5–3.9 s locally, the 12-hunt test from > 10 min (CI) to 4.9 min (local).
Auto-started hunts (Season Run, [Again], challenges) also build their own biome's views directly
instead of the home biome's first (that was cheap, ~4 ms — textures already stay cached across
hunts). (R2) *Hippo:* it and the water beside it were on dry grass between the splash zones; the
second channel now spans x≈1815–3715. (R3) *Hops:* any-cover hops in 0.5–0.7 s crossed up to
3 000 px (unhittable); hopping routes now go to the adjacent cover by x and each hop lasts
distance / `hopPxPerSec` (kuifkop 520, Koning 480), at least `hopMs`. Ou Grys's hidden route is
unchanged. Classic Okavango competent 4 211 (was 4 164), gates pass. (R4) *Kettie and reload
charms:* Snelhand's `reloadSpeedMul` now shortens the Kettie's draw, as Kuifkop Koning doubles it.
(R5) *Daily biome:* `rotation[day mod length]` for every client; a client that can't draw that
biome plays the `modes.json` daily biome (indexing the playable subset gave different clients
different biomes for one Daily #). (R6) *Small:* the Generaal's miss alert uses the shot's camera
(a Kettie stone lands later); the splash FX sits on the mid layer at the world point; storm
overlays resize only on a size change and hide at alpha 0; kuifkop is hop-only (`flock` and its
unused `spawnWeight` dropped); the unused `omen.visual.shimmer` flag is gone (the haze is in the
sim). New tests: flash cap with two sources at once; a stone lands at its fire-time world point
after a pan.
*PR E — stand-in removed, strict validator, Season Run tuning.* (28) *Stand-in gone:*
`run.json → biomeFallback` is removed; a season whose biome file is missing is a content error and
the run engine throws. `run.json` stays `version: 1` — content ships inside the build, so no saved
content needs a migration (same reasoning as D-020). CI runs `content:validate -- --strict` after
`npm run check`. (29) *Season sim:* judges all eight §13.8 rows (±10 points) and plays all 12
hunts by default; `season-*.spec.ts` share the season e2e jobs. (30) *Quotas (tune):* the M6
Winter quotas failed on the real Bushveld (18.1 % / 56.9 %); the Lente/Somer placeholders
(4 500–20 000) assumed charm builds multiply scores several times, but the `synergy` bot's builds
add ~20–30 %, so nobody passed Lente. Tuned (competent, pointer, 500 runs per policy):

| season | policy | target | seeds 1–500 | seeds 501–1000 |
|---|---|---|---|---|
| Herfs | none / synergy | ~85 / ~95 % | 83.0 / 92.4 % | 82.4 / 89.8 % |
| Winter | none / synergy | ~50 / ~80 % | 47.0 / 80.1 % | 47.8 / 80.2 % |
| Lente | none / synergy | ≤ 10 / ~60 % | 10.8 / 61.6 % | 8.6 / 57.8 % |
| Somer | none / synergy | ~0 / ~35 % | 0.0 / 32.9 % | 0.0 / 39.4 % |

After the review fixes (hippo, adjacent hops, R2–R3) the same quotas give Lente 12.8 / 64.1 % and
7.6 / 63.6 %, Somer 0.0 / 34.6 % and 0.0 / 39.7 % — every row still within ±10.

Winter 2 150 / 2 200 / 1 750, Lente 2 600 / 2 650 / 2 150, Somer 2 950 / 3 000 / 2 800. The
policies now separate by where the quotas sit in each biome's score spread, not by quota size.
*Follow-up:* if charms are meant to compound (GDD §13.2 "outpaces raw skill"), charm power and the
synergy bot need a pass before quotas can climb; few runs reach Somer with `none` (17–21), so its
row is noisy. (31) *Proof the run plays the real seasons:* the full-run bot test checks the 12
hunts' biomes are the four seasons' own; `season-real.spec.ts` resumes runs saved at Lente and at
Somer and checks their hunts play on the Okavango and the Kalahari. The Daily rotation covers all
four biomes on four consecutive days (unit test). (32) *Stack upkeep:* my GDD Bushveld note had
split the §11.1 table; fixed on the Bushveld branch after #13 merged and carried forward by
merges (the fix reaches main with #14).

**D-026 M9 Platform, performance, accessibility, localisation (21 Oct 2026):** decisions made in
M9, shipped as a linear stack of PRs (A platform, B quality + size, C accessibility, D de/nl,
E touch aim assist). *PR A — platform adapters, ads, error hook, privacy:* (1) *Adapters:*
`web`, `poki`, `crazygames` share `src/platform/local.ts` (analytics and error reports kept in
memory on the device, one-at-a-time ads through `AdGate`, share, capabilities). `VITE_PLATFORM`
is read with dot access so Vite inlines it and the minifier drops the other adapters: a Poki
build holds no CrazyGames SDK URL and vice versa (checked with grep on each build). Unknown
values fail the build (`vite.config.ts`) and boot. (2) *SDK loading:* each portal's own script
from its own host (Poki `game-cdn.poki.com/scripts/v2/poki-sdk.js`, CrazyGames
`sdk.crazygames.com/crazygames-sdk-v3.js`), injected in `init()`, which main.ts now awaits
(bounded by `feel.json platform.sdkTimeoutMs`) so challenge links can be read through the portal.
Blocked/failed/timed-out SDK = the game runs without ads or rewards; CrazyGames `environment:
'disabled'` counts as no SDK (its calls throw there). APIs as documented on 21 Oct 2026 (Poki
HTML5 guide; CrazyGames SDK v3 intro, video ads, game module). (3) *Interface additions*
(Tech §8): `rewardedAvailable()`, `launchParam(name)` (Poki `getURLParam`, CrazyGames
`getInviteParam`, else the page URL), `onPortalMute(fn)` (CrazyGames `settings.muteAudio`
wins over the in-game volume: AudioDirector mute reason `portal`), `reportError(report)` and
`pwa` (portal builds: no service worker, no manifest, no "Add to Home Screen" banner; no
fullscreen button either — the portal page has its own). `shareUrl` stays synchronous: Poki's
`shareableURL({})` is fetched once at init and challenge links become `<poki page>?gdc=<c>`
(read back by `getURLParam('c')`); CrazyGames uses `inviteLink({c})`. *Needs an account to
verify:* the real Poki link format. (4) *Sharing on portals:* clipboard only (no native share
sheet), since an outside share sheet leads players off the portal; `canShowExternalLinks` is
false on both. (5) *Ads only between hunts* (`src/game/ads/AdBreaks.ts`): a commercial break when
the player leaves a screen for the next hunt (tally [Again], the run's hunt card, the title's
START, a challenge's accept), never before the first hunt of the page (time to first shot,
GDD §16) and never right after a rewarded ad (Poki resets its timer after one too). The portals
cap the real rate. While an ad covers the game the AudioDirector is muted (`onAdChange`) and every
Menu ignores pointers and keys (`setMenuInputGate`, Poki rule). `AdGate` gives up after
`platform.adTimeoutMs` so a stuck SDK can't hang the game. Gameplay start/stop now also wrap the
pause menu (both portals ask for it), deduplicated in the adapters. Loading: `loadingProgress(0)`
at boot, `1` when the title is up (Poki `gameLoadingFinished` once; CrazyGames
`loadingStart/Stop`, re-opened for later loads). (6) *Rewarded ads (GDD §19):* "Oupa se tweede
kans" on the run tally of a lost run replays the lost hunt from the run as it was before it (same
seed, run record restored), `run.json rewardedRetryPerRun` times per run, this session only (a
closed tab keeps the loss); "double Doppies" on a paid run tally pays that hunt's Doppies once
more, once per hunt. Both are shown only when `rewardedAvailable()` and say "▶ Ad" before the tap
(Poki rule). The Daily Hunt and Classic offer none. Usage lives in a new save section `runAds`
(seed, retries, doubled hunts; reset at run start), outside the sim's `RunState`. The one sim
addition is the pure `bonusDoppies(run)` in `src/sim/run` (unit-tested; no golden replay
changes: the sim's hunt path is untouched). (7) *Error hook:* `window` errors and unhandled
rejections → `PlatformAdapter.reportError`; messages trimmed, every URL cut to its file name (no
origin, path, query or hash: challenge links and portal session ids never ride along), top stack
frames only, capped and de-duplicated per page (`feel.json platform`). Neither portal SDK takes
error reports, so reports stay on the device (debug overlay, e2e hook) on every platform, with
an `error` analytics record. (8) *Privacy screen* (Settings → Privacy): what is stored on the
device, what is sent (web: nothing; portals: the site's own service runs ads and statistics
under its own policy — the portal is not named, per the no-brand-names rule), no personal data,
and [Clear my data] (tap twice) which removes every `tm.` key in the current namespace and
reloads as a new player. *Needs a person:* legal check of the text. (9) *Test hooks (D-024
known limit closed):* portal builds compile the hooks out unless built with `VITE_TEST_HOOKS=1`
(CI's portal e2e builds; `grep __TM_TOOLS__` finds nothing in `dist-poki`/`dist-crazygames`);
in any build `?e2e` switches storage to the `tm.e2e.` namespace, so a test link never bends a
player's own save. The specs read `tm.e2e.save.v1`. (10) *Tests:* adapters against fake SDKs
(unit), `tests/e2e/platform.spec.ts` against fake SDK scripts served by `page.route()` in place
of the portals' URLs (CI jobs: desktop poki, desktop crazygames, Pixel poki); `REAL_SDK=1` runs it
against the real SDKs' localhost modes (by hand: it needs the network).
*PR A review fixes:* (10a) *Ad request race (must):* the menus were locked only once the SDK
called `onStart`, so during the request (0.5–2 s) a second tap could start a hunt under the coming
ad, or leave for the title. Now `afterBreak` and `AdBreaks.beforeHunt` are single-flight (a second
request joins or is dropped), menus are locked from the request on (`isAdBusy()` on the adapter
plus `AdBreaks.busy`), the run's HUNT!/Menu have a press guard, and the title's Shed/Settings
don't open once START is pressed. `platform.spec.ts` races [Again]×2 + [Menu] and HUNT!×2 + Menu
against a fake SDK that takes 1.5 s to start the ad: one break, one hunt start each (it fails
without the fixes: 4 starts instead of 3). (10b) *Ad timeout:* `adTimeoutMs` now covers only the
request (until the SDK starts the ad), paused while the tab is hidden; a long ad, or one watched
after a tab switch, ends when the SDK says so, and a watched rewarded ad is granted.
(10c) *Boot:* one deadline (`sdkTimeoutMs`) for the SDK script + init together; Poki
`shareableURL` and CrazyGames `hasAdblock` no longer block boot (filled in later; until then the
page URL is used for links and an ad request under an adblocker simply errors). (10d) *Smaller:*
error reports strip URLs with a ':' in the query, protocol-relative and bare-host URLs, and report
only the type of non-Error rejections; a rewarded request with no ad shown (no SDK, no fill) no
longer skips the next break; portal builds drop the unreferenced `manifest.webmanifest`; CI also
runs the portal spec on iPhone 14 landscape (WebKit).
*PR B — quality tiers, benchmark, lazy biomes, size budget:* (11) *Benchmark:* 90 frames after a
15-frame warm-up, rAF to rAF, only while the title is on screen and the tab visible (paused
otherwise, so nothing runs per frame outside the title); gaps over 1 s don't count. Result →
`SaveData.device` (new section, defaults, no migration) and `perf_sample` analytics; "auto"
follows the saved tier from the next page on. e2e runs skip it unless `?bench=1` so the specs keep
a fixed tier. Thresholds are first guesses in `feel.json` (*needs a person:* real devices).
(12) *Render scale (Tech §5) implemented, not deferred:* Phaser 4 has no resolution setting, so the
canvas is the design size × `renderScale` and each scene camera zooms by it (`fitCamera`);
scenes lay out in design px through `designSize()`. Text is drawn at design size and scaled, so it
is a little softer on low/medium. (13) *Filters:* medium + high get a soft camera vignette, high a
bloom. The vignette is a small look change on medium (the tier table lists it); low has none.
(14) *Layer merge:* low draws `far_ridge` on `far_veld` (`feel.json mergeLayers`), stretched by the
two core widths so it still spans the panorama; only layers without props, planes or water may
merge (all four biomes' far ridges qualify). (15) *Antialias off on low,* fixed at boot from the
saved tier (WebGL can't switch it live). (16) *Lazy biome bundles:* Karoo (home) art is in the
initial bundle, the other three are `import()` chunks loaded when a hunt there first starts; their
content JSON stays initial (the sim, `contentHash`, the Daily rotation). Today's chunks are small
(procedural placeholders: ~5 KB gzip together); M10's atlases use the same loader. (17) *Size gate:*
`size-check` splits initial (entry + static imports + non-chunk files, from Vite's manifest) from
lazy; CI runs `--strict` (fails above 5 MB initial) on all three builds; > 8 MB always fails.
Measured (gzip): web initial 0.48 MB + lazy 0.005 MB; Poki and CrazyGames builds the same ±1 KB.
(18) *Low tier ≥ 50 fps — method:* this box and CI have no GPU (SwiftShader, D-019), where frames
come at 3–4 per second and each also runs up to 5 catch-up sim ticks a phone at 50 fps never runs.
The asserted figure is the CPU cost of one frame at 50 fps = (CPU per frame − sim time per frame)
+ 1.2 × sim tick cost, on the Pixel 7 profile at 6× CPU throttle (DevTools' low-end mobile),
quality forced low, 20 s hunt with taps and reloads; budget 20 ms. First run: 26.1–26.9 ms
(fail). A CPU profile showed ~8 ms/frame in Phaser re-tessellating the HUD's `Graphics` rounded
rects every frame, ~0.5 ms in `getComputedStyle` (safe area read every frame) and text re-renders
on kills; render scale and off-screen culling barely moved it (the cost is CPU, not fill).
(19) *Fixes, all tiers:* HUD panels, bars, chips and the pause icon are cached rounded-rectangle
shapes (geometry only rebuilt on resize), the Vuvuzela button is baked to a texture when its look
changes, the safe area is computed once per layout, off-screen parallax art is hidden. After:
low tier **18.4 ms** at 6× (raw CPU per frame 20.9 ms incl. catch-up ticks, sim tick 0.66 ms);
the medium perf smoke on the Pixel profile went from 16.0 to **12.4 ms** CPU/frame at 4×.
*Needs a person:* fps on a real low-end Android phone and an older iPhone with quality low/auto.
*Follow-up:* score pops and "POOF!" create a Text per kill (canvas render + upload); a pooled or
bitmap-font version would cut the rest. `feel.json` gains fields without a `version` bump: no
content has shipped and the client file has no older readers.
*PR C — accessibility checklist (GDD §18.3):* (20) *New settings* (`SaveData.settings`, each
field validated on its own, so old saves get the defaults, all off): `textSize` normal/large,
`highContrast`, `captions`, `colourBlind`, `holdToFire`. Settings is split into two pages with
tabs (←/→ on a tab turns the page); every id the older specs tap stays on page 1. (21) *Hold to
fire* is input-only: a weapon without its own hold gets one `fire` on press, then a `fire` at the
held position each tick the gun is ready (loaded, not reloading, no cooldown), so it never
empty-clicks and the sim and replays are untouched (ordinary commands). Weapons with a native
hold keep their `fireHold*` commands. (22) *Text size* scales menus, tally, captions, prompts and
world call-outs by `largeTextScale` (1.25); the HUD timer, score, frenzy label, chips and gadget
numbers stay put (fixed signs). Text made before a change restyles when its screen rebuilds (the
Settings screen rebuilds at once). (23) *High contrast* = black outline at 0.2 × font size on light
text; dark text on light plates gets none (it smeared). (24) *Captions* mirror the AudioDirector's
event → sound map (`src/game/audio/captions.ts`); cues already in words on screen (POOF!, score
pops, the stamp) get none. Shown whatever the volume, bottom centre, ≤ 3 lines, a repeat only
extends the line. (25) *Colour-blind aid* = the ⛔ badge on every don't-shoot creature at every
sighting (shape + icon, never colour alone); without it the badge shows until the first sighting
as before. Other colour signals already pair with text or shape (belt flash + RELOAD!, frenzy
colour + ×N, stampede timer colour + banner). (26) *Toggle → test:* screen shake, reduce flashes,
left-handed, quality, text size, contrast, captions, colour-blind, hold to fire → `prefs.test.ts`;
aim assist → sim tests (`aimAssistLevels`, golden `…-lowassist`); text size/contrast →
`textLook.test.ts`; captions → `captions.test.ts` + `a11y.spec.ts` (a reload is captioned in a
hunt); hold to fire → `InputMapper.test.ts` + `a11y.spec.ts` (one held press fires repeatedly);
keyboard-only menus incl. the new page and privacy → `a11y.spec.ts` + `menus.spec.ts`; pause
anywhere → `menus.spec.ts`; large-flash cap → content validation (`maxFlashesPerSecond`);
language → `persistence.spec.ts`. *Needs a person:* a screen-reader and keyboard-only pass, and
a colour-blind player's look at the don't-shoot creatures.
*PR C addition — Padstal clarity (user feedback: "couldn't tell what the screen is for"):*
(26a) a first-visit explainer card (Doppies, charms and slot order, consumables, the rental gun,
quota = run over), dismissed once into `SaveData.notices` (`padstal_help`) and reopenable from a
"?" button; (26b) an offer the player can't buy says why on the card ("need N more", "slots full",
"consumable slots full", "already renting") instead of only greying out; (26c) row labels "For
sale" and "Your charms (drag to reorder)"; (26d) empty slots read "Consumables: empty, empty" and
"Rental gun: none" (was "— | No rental"). Strings in en/af here, de/nl on PR D.
`season-run.spec.ts` checks the card on the first visit only, not after a reload, and reopens it
with "?" (screenshots `season-padstal-help-*`, `season-padstal-*`, desktop + Pixel 7).
*PR C review fixes:* (26e) *Hold to fire on touch* fired on every touch and broke drag-pan and
flick-reload. A finger now stays a tap/drag/flick gesture until it has been still (< 12 px) for
`input.touchHoldMs` (180 ms); only then does it become the hold (first shot at once, then each
ready tick). A tap before that fires once; moving first makes it a drag or flick. The Settings
hold doesn't edge-pan (a weapon's own hold still does). Unit tests use `pointerType: 'touch'`;
`a11y.spec.ts` checks hold/drag/flick on Pixel 7 landscape. (26f) *Blocker note:* moved off the
24 px price line (squeezed to ~5 CSS px on a phone) onto its own wrapped plate above the price.
(26g) *Help card* is sized from its measured text and steps the font down (28 → 18 px) if even
the tallest card can't hold it; the test asserts the text ends above the button. (26h) *Large
text on the tally:* title, score, rows and rank stamp keep their size (fixed slots of the slate;
scaled they overlapped on phones); the tag, news line and buttons scale. The Padstal's "For sale"
label moved below the large title. (26i) e2e-only `?doppies=N` (a run with N Doppies and no pay)
to show blocked offers. `padstal.spec.ts`: blocked cards on iPhone 14 + Pixel 7 landscape, the
help card with large text on desktop at 4:3 and iPhone 14, and a Pixel 7 pass with large text +
high contrast (Settings ×2, Padstal, tally).
*PR D — de + nl:* (27) *Languages:* `de.json` and `nl.json` (366 keys each), machine-quality
first pass written for this game, **flagged for native review**; Afrikaans completed (the 28
missing keys: four Boss Rules translated, charm names are Afrikaans in every language). Language
setting Auto / English / Afrikaans / Deutsch / Nederlands (names in their own language);
`pickLanguage` maps `de-*` and `nl-*`. (28) *Kept in Afrikaans in every language:* Oupa, tarentaal,
Skiet-Skuur, Padstal, Doppies, Notaboek, weapon, boss, charm and rank names, barks (Mooi skoot!
…). Translated: Season Run (Saison-Lauf / Seizoensrun), Daily Hunt (Tagesjagd / Dagjacht),
Frenzy (Rausch / Razernij), quota (Soll / quotum), charm (Talisman / charm). (29) *Validation:*
`content:validate` reads every `src/i18n/<lang>.json` and fails on a missing key, a key English
lacks, an empty string or `{placeholders}` that differ (`src/content/i18nCheck.ts`, unit-tested;
proven by deleting `tally.again` from nl.json → `content: FAILED`). Content-derived keys are
already checked against English by crossRefs, so every key the game can ask for exists in every
language. FTUE prompts stay ≤ `maxPromptChars` in all four (unit test). (30) *Glyphs:* the UI font
is the system font until M10's self-hosted display font, which must include ä ö ü ß (art bible
§6 list). (31) *Native review notes from the first pass:* de — Rausch vs Raserei, "Bakkie-Bilanz",
"LADEN!", "Freeze"/"Challenge" left in English, bird names Graulärmvogel/Schreiseeadler,
"TATÜ-TATA!" for the car alarm, "Weiter" for skip; nl — kwêvoël and visarend names, "Baas" for
boss, "charm" kept, "bevriezing" for the streak freeze, "Opnieuw" for reroll, invented item names
(Bos-hagel, Stokstaartjes-spotter). *Review fixes:* the English left in de (Challenge,
Freeze) is now "Herausforderung" and "Serienschutz"; in af "Frenzy" is "Waansin" and the rank
"Bosveld-legende" (as on the share card). The validator also fails when `LANGUAGES` in
`i18n.ts` and the `src/i18n/<lang>.json` files differ (checked by removing `nl` from the list →
`content: FAILED`). `i18n.spec.ts` screenshots the Padstal (help card and shop) in de and nl;
`padstal.spec.ts` runs en and de.
*PR E — touch aim assist (carry-over from M8):* (32) *Cause:* the GDD §18.2 radii grew every
pellet's target, so a shotgun shot on touch dropped two birds much more often (competent bot,
Karoo: Twee Vlieë 20.4/hunt touch vs 16.4 pointer) and the touch competent mean was 4 643–4 705,
over the 4 500 cap on every biome. Cutting the radii barely helped (0.5×: Karoo 4 504, still
over), because the multi-hit came from the growth on every pellet, not from its size. (33) *Fix
(sim):* touch pellets resolve at the real hitboxes; only a shot with no pellet on a bird uses the
assist, on the aim point alone (`assistSnap` in `hitTest.ts`), and snaps the pattern onto that
bird. The GDD radii are unchanged. The Kettie (one stone, per band) is unchanged. Pointer shots
never reach the new path: **every pointer golden replay keeps its event hash**; the 9 touch cases
(`daily-2026-aim-touch`, `classic-7-aim-touch-lowassist`, `ftue-3-aim-touch`,
`season-winter-omen-competent`, `classic-22-windbuks-competent-touch`,
`daily-32/42/52-…-aim-touch`, `daily-2026-10-21-aim-touch`) were re-recorded with
`golden:update`. `contentHash` is unchanged (no content change), so Daily seeds are too.
(34) *Balance after* (balance-sim, 200 seeds, touch; competent / plinker mean, plinker gap),
re-run after the review fixes (33a): Karoo 4 214 / 2 483 (41.1 %), Bushveld 4 027 / 2 249
(44.2 %), Okavango 4 111 / 2 969 (27.8 %), Kalahari 3 896 / 2 185 (43.9 %): every M3 gate passes
on touch, competent ≤ 4 500 everywhere. Touch is within ~1–3 % of pointer (Karoo pointer 4 147).
(33a) *Review fixes:* the snap never lands on, or reaches past, a don't-shoot creature or a
helper (`HitBird.snappable`: targets and bosses only); the snapped pattern is kept only if it hits
the bird it snapped to; a shot whose pellets hit a crate or a secret part counts as a hit and is
never snapped. The decision is the pure `resolvePattern` in `hitTest.ts`. `Sim.test.ts`: a touch
near-miss is rescued, the same mouse miss isn't, a near-miss beside a hadeda costs nothing (it
fails without the fix), a crate hit with a bird inside the assist radius is kept. Re-recorded
with `golden:update`: only `daily-32-bushveld-aim-touch` changed; every pointer case is
byte-identical.
*Needs a person:* how touch feels on a real phone (the assist should catch near misses without
feeling sticky).

**D-027 M10 Final art and audio integration → soft launch (21 Oct 2026):** decisions made in M10,
shipped as a linear stack of PRs (A asset pipeline, B audit, C audio, D juice, E capture mode,
F visual regression, G portal assets, H release). No human-made art or recorded audio exists yet,
so M10 builds the path that delivered files take into the game, and proves it with stand-ins.
*PR A — asset pipeline and manifest switch:* (1) *Index, not generated code:* Tech §10 planned a
generated `assetManifest.ts`; instead `tools/pack-atlases.ts` (`npm run assets:pack`) writes
`public/assets/asset-index.json` (Zod schema `src/game/assets/assetIndex.ts`). The game fetches it
at boot (`feel.json assets.indexTimeoutMs`). A delivery is then data only, so art drops in without
a code change or a rebuild of the code. A missing index (404, or an SPA server's HTML), an invalid
index, or any file that fails or times out (`assets.fileTimeoutMs`) leaves that key on its
placeholder; a layer is all-or-nothing (all its tiles or none), and so is a bird's atlas set.
(2) *Manifest:* every key now has a status (`final`/`placeholder`). `AssetManifest.loadFinal`
decodes files with plain DOM loading before a scene installs textures, and `install()` adds final
images under the same key, so views are unchanged. The test hook shows `assets.byBiome` and
`assets.recorded`. (3) *Formats:* PNG (pngjs, pure JS), not WebP as Tech §10 said: no native
encoder is needed, and the size budget has room (WebP is a v1.x option). Audio is Ogg Vorbis plus
MP3, not m4a as Tech §7 said: MP3 plays everywhere including Safari, and the WASM encoders
(`wasm-media-encoders`, devDependency) have no AAC. The browser gets Ogg only where
`canPlayType` answers "probably", otherwise MP3. Loudness is measured with a BS.1770-4 meter in
TypeScript (`tools/assets/loudness.ts`; its K-weighting matches the standard's 48 kHz table and
reads −23.0 LUFS for the −20 dBFS 997 Hz reference). Targets are music −16, voice −16, SFX −14 and
ambience −20 LUFS (ambience isn't in the bible: it sits under the music), all with a −1 dBTP
ceiling that wins over the target. (4) *Birds:* frame-by-frame atlases only, no Spine runtime in
v1. The runtime is about 300 KB and carries its own licence; a Spine rig is exported to frames
per skin. Frames use the placeholder's bird box (620 × 400, origin (310, 230)), so delivered art
lines up with the hitboxes. The tool makes @1x (box × plane scale) and @2x sets; the high tier
loads @2x, fixed for the page load. Bird atlases are Phaser multi-page atlases (≤ 2048² per page
at @1x, ≤ 4096² at @2x). By default the near atlas holds only the pop-up clips (`peek`, `alert`,
`hit_poof`, `tumble`), because all 11 clips at 620 × 400 need four pages. `birdClips.ts` maps
sim motion and phase to a §3.4 clip, with a fallback chain down to the placeholder frames.
Delivered clips drop the placeholder's drawn bob and lean. `hit_poof` plays once where a bird is
bagged. (5) *Sprites and layers stay one texture per key/tile:* Phaser 4 batches several textures
per draw call, so props, UI and FX need no shared atlas page for v1. A delivered sprite should
match its placeholder's size (the pack tool warns otherwise). Layers are delivered full width at
design px and cut into 2048 px tiles. (6) *Groups and the size budget:* each file belongs to
`common` or one biome (a key only one biome uses loads with it). The index's `initialGroups`
(common + the home biome) are in the first download. `size-check` and the service worker treat
the other biomes' files as lazy: they're not precached, and are cached on first use. (7)
*Stand-ins:* `tools/make-standins.ts` (`npm run assets:standins`) draws a magenta tarentaal stamped
"STAND-IN" (all 11 clips), the Karoo `mid` layer and two synthesised SFX (shot, poof), and packs
them with the real pipeline into `tests/fixtures/standin-assets/` (committed, about 1.7 MB). They
are never in a build: `tests/e2e/assets.spec.ts` serves them with `page.route`, and
`STANDIN=1 npm run dev` serves them from the dev server. (8) *Recorded SFX:* `AudioDirector`
plays a decoded recording when one was delivered and keeps the synth for every other sound
(music and ambience arrive in PR C). Delivery spec for artists: `docs/06-ASSET-DELIVERY.md`.
*PR B — asset audit:* `tools/asset-audit.ts` (`npm run assets:audit`) lists all 126 keys today
(65 textures, 24 layers, 17 bird × plane sets, 20 sounds), each with its status, size (delivered
bytes, or the placeholder's drawn size) and where it is used. A use is a file outside the
placeholder factory and the key tables that names the key: its `TEX` constant, a biome file's
`"asset"` for props and layers, the creature id in `content/birds.json` for birds, the weapon id
plus a `gunKey()` caller for guns, `this.play('<id>'` for SFX. It always fails on:
- a placeholder key nothing uses;
- a `TEX` constant with no manifest entry;
- an index entry for a key the game doesn't have;
- a file under `public/assets/` the index doesn't reference;
- an index file missing on disk.

`--strict` also fails while any placeholder remains: it is the launch gate. CI runs report mode
until the art lands.
*PR C — audio:* (1) *Recorded first, synth as fallback:* every SFX key plays its decoded
recording when one was delivered, otherwise the synth. Nothing decodes before the first gesture.
(2) *Music per biome* (`music.ts`): the three stems of the bible start together and loop in sync.
They crossfade by intensity: calm by default; build for a fleeing flock (run or flush) or Frenzy
at `buildAtFrenzy` (×2, tier 2); stampede while the Stampede is active. Rising is immediate;
calming waits `stemHoldMs` so short lulls don't make it flutter. A missing stem falls back to the
next calmer one. A biome change fades the old set out and the new one in. The ambience loop sits
on the SFX bus: it's environment, so it follows the effects slider. With no music delivered
there is no music, and the synth flush sting and Stampede cue stay (D-027 A: no synth music
loop). (3) *Voice and ducking were cheap, so they're in:*
- Settings gets a **voice** slider (the bible's music / effects / voice). Language moves to the
  right column to make room.
- `SaveData` needs no migration: a missing field takes its default, field by field.
- The voice keys are the five existing secret barks (`voice/<barkKey>`), and the HUD banner is
  the subtitle.
- At most one bark per `barkGapMs` (6 s), none during the tally count-up, and music ducks −6 dB
  under each one.
- The bible's ~40 launch barks need triggers first, so they're a follow-up.

All numbers are in `feel.json audio`, including `masterLevel`, which was a constant. (4) *Mute
rules kept:* first gesture, hidden tab (the context suspends too; mid-hunt the pause menu opens,
so audio stays muted until Resume), pause, ads and the portal mute. (5) *Tests:* the Web Audio
fake `tools/fakeAudio.ts`; `music.test.ts` covers sync start, crossfade, fallback, biome fade and
hold; `AudioDirector.test.ts` covers format choice, recorded over synth, mute reasons, music
after decode, and bark gap, tally and duck. The e2e `audio.spec.ts` uses stand-in Karoo stems and
ambience added to the stand-in delivery, and runs on Chromium only (it reads Web Audio state
through the hook; Linux WebKit may lack the codecs).
*PR D — juice pass:* (1) *What "final tuning" means without a playtest:* the GDD §17 numbers
(hit-stop 20/45 ms, 12–20 feathers, dubbelloop shake 4 px / 90 ms, pops 60 px / 600 ms) stay as
specified. The pass moves the remaining hard-coded juice numbers into `feel.json`: the tally
pacing (`tally.*`) and the Frenzy punch (`juice.frenzyPunch*`). It also adds the GDD §17 moments
that were missing:
- tally count-up ticks and the rank stamp thud (new synth SFX `tick` and `thud`, deliverable as
  recordings like every SFX);
- the Stampede's sky tint and ground rumble (`juice.stampede`).

Retuning by feel is left to the real-device check. (2) *Screen shake:* the per-weapon shake lives
in `weapons.json`, which is part of the `contentHash`. Moving it would change the Daily seeds and
challenge links, so it stays there, and `juice.shakeScale` (1) scales it on the client. The
Stampede rumble also follows Settings → screen shake. (3) *Flash limit:* `FlashLimiter` +
`FlashGate` (`src/game/view/flashLimit.ts`) give every large-area flash source (the storm's
lightning light, the Stormvoël's lit darkness) one shared budget of
`accessibility.maxLargeFlashesPerSec` (schema max 3). A refused strike stays dark for its whole
length. This is a backstop on top of the content's ≤ 2/s lightning. The Stampede tint is one
steady fade, not a flash; "reduce flashes" dims it by `reducedFlashAlpha`. Muzzle flashes stay
small local sprites. (4) Pointer goldens and Daily seeds are byte-identical: no sim or bundle
content changed.
*PR E — capture mode:* (1) *Gate:* the same as the test hooks (no separate flag): web and dev
builds, or a portal build made with `VITE_TEST_HOOKS=1`. In a shipped Poki or CrazyGames build
it is compiled out (v1.0.1 wording: the capture class's own field `speedIndex` is in `dist`
but not in `dist-poki`; a grep for `KeyF` or `capture.` proves nothing — Phaser has `isKeyFrame`,
and the i18n tables carry `capture.hint` in every build). The GitHub Pages web build has it, which is where trailers are captured.
(2) *Behaviour:*
- It hides the hunt HUD and the reticle; `&gun=0` also hides the gun.
- It fixes the seed (`feel.json capture.seed` 42, unless `?seed=` is given).
- S cycles 1 / ½ / ¼ speed, F freezes, and C sweeps the camera end to end. S, F and C are unused
  game keys.

Speed scales how real time feeds `HuntRunner` (`timeScale`), the hunt scene's tweens and
animations; particles keep real time. Pause and hunt end behave as usual. (3) *Own save:* capture
plays on `tm.capture.*` (the e2e namespace wins if both are set), so a trailer session never
changes a player's bests, streak or Notaboek.
*PR F — fonts and visual regression:* (1) *Fonts first:* OFL Baloo 2 (600, 800) and Bangers are
self-hosted, subset to the four language files plus the bible §6 letters (`tools/make-fonts.ts`,
about 42 KB, counted in the initial download). Baloo 2 is every UI text; weight 900 maps to the
800 file. Bangers is used only for the onomatopoeia bubbles (KEK!, POOF!), because the menus' fit
logic is tuned to a rounded sans. Glyphs the fonts lack (★ ⛔ ▶ ✓ ⎙) fall back to the system font
per glyph. Phaser draws text to canvases once, so `main.ts` waits for the fonts
(`assets.fontTimeoutMs` 2.5 s) before the game boots; on timeout the system font is used, as
before. This also makes the screenshots match across machines. (2) *Baselines:*
- Seven screens on desktop-chromium and pixel7-landscape: title, a hunt held at tick 300, tally,
  Padstal, both Settings pages and privacy.
- The hunt uses seed 42 and a new e2e-only `?holdAt=<tick>`: `HuntRunner` stops the sim at
  exactly that tick, so birds and HUD are identical every run.
- Every boot pins `?today=` so the Daily number on the title doesn't change.
- The PWA worker is blocked.
- Tolerance: `maxDiffPixelRatio` 0.02, colour threshold 0.25, which survives SwiftShader.
- Baselines live in `tests/e2e/visual-baselines/` (`__screenshots__` is gitignored), and Linux CI
  is the reference platform.
- CI runs them in the existing e2e matrix (the spec skips the other profiles).
- After the art swap: `--update-snapshots`, review the diff, commit (`docs/06` §7).
*PR G — portal assets:* `tools/portal-shots.ts` (`npm run portal:shots`) renders from the web
build into `release/portal-assets/` (gitignored, never uploaded):
- **Background:** a capture-mode frame (seed 42, held at tick 300, no HUD or gun, 2×).
- **CrazyGames covers:** 1920×1080, 800×1200 and 800×800. They carry the title in Bangers,
  because CrazyGames wants the title only.
- **Poki thumbnails:** 628 and 1256 px squares with no text, because Poki says "skip titles".
- **Screenshots:** three 1920×1080 shots (title, hunt, tally).

Sizes and rules are from each portal's docs as of 21 Oct 2026. The animated Poki thumbnail and
CrazyGames' preview videos need a screen recording, so they're listed for a person. The
`?capture=1` keys make that easy. Store text in en/af/de/nl, the controls blurb, tags and a
checklist per portal are in `docs/07-PORTAL-SUBMISSION.md`. The checklists cover build and folder,
the QA tool (Poki Inspector event log; CrazyGames preview), the SDK events the adapters actually
fire, mobile and tablet, incognito, ad blocker and size. Neither text names another game series
or a real brand.
*PR H — release:*
- The version is 1.0.0 (`package.json`), injected as `__APP_VERSION__` by Vite `define`, and
  shown as "Version 1.0.0" top-right on Settings → Privacy (i18n key `privacy.version`, four
  languages).
- There is no build id on screen: a per-commit id would break that screen's visual baseline on
  every commit.
- `CHANGELOG.md` covers v1.0.0.
- `npm run release` (`tools/release.ts`) runs all three builds, each through `size --strict`, then
  the asset audit in report mode. It zips each build into `release/` (gitignored), with
  `index.html` at the root and no `.vite/` metadata.
- The zips come from a small built-in writer (`tools/zip.ts`, deflate + CRC32, fixed timestamps):
  this box has no `zip`, and a dependency wasn't worth it. Python's `zipfile` validates them.
- Nothing is uploaded.
*Review fixes (playtest-reviewer on the whole M10 diff):*
- **Capture save:** a fresh capture save started the tutorial hunt, whose prompts capture mode
  hides. `captureSave` now marks the tutorial done there, and an e2e boots the live path
  without `ftue=0`. (Fixed in E.)
- **Capture freeze:** a freeze or slow-mo no longer leaks to the next hunt; the game-wide
  animation speed resets on shutdown and between hunts. No shake or rumble while slowed or
  frozen. (E)
- **Music start:** the music starts once per decoded batch, not once per stem; per-stem
  refreshes restarted the stems up to four times. (C)
- **Boot and retries:** boot no longer waits on recordings, since nothing plays before the first
  tap. A failed or timed-out file is forgotten rather than cached as null. (A)
- **Size and the service worker:** `size-check` counts the larger of each Ogg/MP3 pair and the
  @2x atlas set where one exists, the worst case one player downloads, and lists the twins
  apart. The service worker caches recordings on first play instead of precaching both
  formats. (A)
*Second review (two independent reviews of A–H):*
- **Corrupt atlases (A, must-fix):** a partial or corrupt bird atlas no longer crashes the hunt.
  `checkBirdAtlas` requires a `frames` object on every page and drops any clip naming a frame no
  page has, so its fallback plays; with no usable clip the bird stays on its placeholder.
  `BirdView` plays a clip only when its animation has frames. `startFrame` staggers looping
  clips only, and `hit_poof` always plays once. Unit tests and two e2e cases (corrupt atlas JSON,
  a clip missing a frame).
- **Capture is unranked (E, must-fix):** slow motion and freeze would inflate a score, and the
  capture save allows unlimited fresh Daily attempts. `DailyFlow.unranked` therefore makes every
  Daily practice and offers no share card or challenge link. The title shows no Daily entry,
  `?c=` links are ignored, and the install banner is hidden.
- **Not cheap: `?e2e` on the web build.** It keeps official dailies, because the Daily e2e specs
  rely on them. Remaining risk: someone could run `?e2e` on the public build to get fresh Daily
  attempts. The test hooks' `?seed`/`?huntSeconds` already make those hunts non-comparable.
  Logged as a follow-up: gate e2e dailies behind a build flag.
- **Audit (B):** a delivered bird plane must resolve every clip `clipFor` can ask for there
  (only pop-ups on the near plane), or the audit fails.
- **Audio (C):**
  - `StemHold` restarts its hold on every frame at or above the current stem, so there is no
    flutter, and a new hunt resets to calm.
  - Only the current biome's music and ambience stay decoded; compressed bytes are kept so a
    revisit can decode again. Effects drop their bytes once decoded.
  - An undecodable Ogg retries its MP3 twin.
- **Juice (D):**
  - `FlashLimiter` merges starts within `flashMergeMs` (50 ms), so one strike lighting two
    overlays costs one slot.
  - The tint and rumble decisions are now pure functions with tests, and the tint re-reads
    "reduce flashes" during a Stampede.
  - The tally tick and thud are tested against every mute reason.
  - `docs/06` lists `sfx/tick` and `sfx/thud`.
- **Fonts and holds (F):** the font subset keeps `−`, `•`, `ʼ` and the symbols `src/game` writes,
  and `?holdAt` also freezes tweens and animations.
- **Smaller fixes:**
  - G: `portal:shots` pins the high tier.
  - H: `npm run release` reports a failed build instead of throwing.
  - A: only a 404 or an HTML page means "no asset index", and the foraging spell length moved to
    `feel.json`.
*Needs a person:* the illustrator, animator and sound designer deliver per
`docs/06-ASSET-DELIVERY.md`.

**D-028 v1.0.1 cleanup (22 Oct 2026):** six follow-ups to D-025 … D-027, shipped as one linear
stack of PRs merged bottom-up (`v101-daily-gate` ← `v101-epoch` ← `v101-score-pops` ←
`v101-capture-hint` ← `v101-barks` ← `v101-charm-balance`): D-028, the CHANGELOG, the HUD, `feel.json`
and the i18n files are shared by most of them, so separate PRs from main would conflict at every
merge. Only the last PR (charm balance) changes `contentHash` and the golden replays; it also bumps
the version to 1.0.1.
*§1 — `?e2e` Daily gate (D-027 follow-up):* (1) *Flag:* the existing build flag
`VITE_TEST_HOOKS=1` now means "CI e2e build" on every platform: Playwright's builds set it
(`playwright.config.ts buildEnv`), Pages (`pages.yml`) and `npm run release` never do. No second
flag: the portal e2e builds already carry it, and one meaning is easier to audit. (2) *Rule:*
`officialResultsAllowed` (`src/game/testHooks.ts`): a page records official results unless it has
`?e2e` on a build without the flag; the dev server and Vitest keep them (never public). (3) *Public
`?e2e` = capture's unranked path:* `DailyFlow.unranked` makes the Daily practice (no attempt, streak
or best saved) and offers no [Share] on any tally, Classic included (a Classic share is a
challenge link, and `?seed`/`?huntSeconds` would make it fake); `?c=` challenge links are not
opened. Unlike capture, the title keeps its Daily button, styled as played, with the status line
"Test link · practice only" (`title.daily_unranked`, 4 languages). (4) *Proof:* unit tests on the
policy; `tests/e2e/daily-public.spec.ts` runs only with `E2E_BUILD=public` (the build Pages ships)
in its own CI job (desktop Chromium), and every other e2e run ignores it; `daily.spec.ts` keeps
passing on the flagged CI build. (5) *Portal shots:* `npm run portal:shots` builds with the flag
so the store title and tally look as a player sees them; `npm run release` rebuilds `dist/`
without it before zipping.
(6) *Review fixes (#31):* `npm run release` refuses to build when `VITE_TEST_HOOKS` is set in the
environment or a production `.env` file (`.env`, `.env.local`, `.env.production`,
`.env.production.local`); Playwright never reuses a running preview server for an
`E2E_BUILD=public` or portal run (it could be the other build). *Known limit:* clearing
`localStorage` or opening a private window still gives a player another official Daily attempt;
a client-only game can't prevent that (the same holds for every client-side streak), and the gate
only stops a public link from handing out unlimited ones.

*§2 — Daily epoch:* (1) *One value:* `content/meta/daily.json → epoch` stays the placeholder
2026-10-21 (a person picks the launch date). Two fields join it: `epochPlaceholder: true` (the
person sets it to false with the real date) and `epochMaxAgeDays: 7` (the pre-launch limit, a
number in content, not in the tool). (2) *No copies:* `content:validate` scans non-test `.ts` in
`src/` and `tools/` for the epoch's date (`tools/epochCheck.ts findEpochCopies`) and fails on a
hit. `tools/goldenCases.ts` is allowed: its Daily replays are pinned to the day they were recorded,
which only equals the placeholder by chance, and renaming them would change the golden file.
Tests that meant "Daily #1" now read `meta.epoch` (DailyFlow, daily, daily.spec's title test);
tests of a fixed day's seed keep their literal day. `portal:shots` uses the epoch as its `?today=`
so the store title shows Daily #1. (3) *Release check:* `npm run release` prints `epoch: WARNING`
while `epochPlaceholder` is true, plus a second line when the epoch lies more than
`epochMaxAgeDays` before the build date; `npm run release -- --strict` turns them into a failure.
*Interpretation:* the age check runs only while the epoch is a placeholder. A confirmed epoch
ages by one day every day, so checking it would fail every release from the eighth day after
launch; the person who confirms the date is the check.
(4) *Review fixes (#31):* the copy scan also covers `tests/` (non-unit-test `.ts`): the visual
baselines and `daily-public.spec.ts` had `today=2026-10-21`, and the title baseline shows
"Daily #1" only because that day is the epoch — with the real date set it would show another
number and fail on every profile at launch. They now read `meta.epoch`. The allowlist is per line,
not per file: only the `daily-<date>-…` case names in `tools/goldenCases.ts` and `GOLDEN_DAY` in
`daily.spec.ts` (the golden Daily replays are pinned to their recording day); the goldenCases
comment no longer spells the date. A confirmed epoch (`epochPlaceholder: false`) is checked too:
more than `epochMaxAgeDays` before or after the build day is an issue (a typo such as 2062 or
2025), which `--strict` fails; `--allow-epoch-gap` accepts it for releases after the launch, or
a portal build submitted well before it.

*§4 — Pooled score pops (D-026 follow-up):* (1) *BitmapText, built at runtime:* every bag made a
world pop and a HUD-stack pop as Phaser `Text` (canvas render + texture upload, again when "10 ×2"
resolves to "+20") and a POOF label. The pops use Baloo 2 (the font they already used, not
Bangers: changing face would change the look and the baselines), so `src/game/ui/popFont.ts` draws
the pop characters (`popGlyphs.ts POP_CHARS`: digits, K, M, signs, ×, spaces) once into two
canvas-texture atlases — the outline and a white fill — and registers them as bitmap fonts. No
build step and no download. A pop is a pooled pair of BitmapTexts in a container (`PopPool`); the
fill is tinted to the pop colour. Two layers rather than one: with one, each glyph's outline would
overdraw its neighbour's fill. The atlas is keyed by the Settings text size and contrast and is
rebuilt when they change. A string with a character outside the atlas falls back to the old Text
path (format.ts never produces one; a unit test checks the formats). (2) *POOF:* its label text
rarely changes, so the bubble and label are pooled as they are; Phaser's `setText` re-renders only
when the text differs (a language switch). (3) *Measured:* `perf.spec.ts` "score pop A/B" makes
rounds of 20 world pops each way plus control rounds, in one page at 4× throttle on the Pixel 7
profile (test-only `__TM_TOOLS__.popBench`). Per pop: on the kill frame 6.0 ms (Text) vs 0.58 ms
(BitmapText); canvas text draws 6 vs 0; texture uploads 4 vs 0; CPU over the pop's life 5.0 vs
4.5 ms. So the per-kill spike — the stutter — is about 10× smaller, and the steady draw cost while
a pop shows is about the same. The test asserts the deterministic counts only. *Interpretation:* the
existing smoke test (4×) bags nothing (score 0) and so can't show pops, and on this shared
software-GL box (load 8–17) its CPU average varies ±15 % from run to run: before 14.7/14.8/16.9 ms,
after 16.4/16.4. The low-tier test (6×) fails its 20 ms budget on this box before (22.7/23.2/27.5)
and after (26.4/23.2) alike; CI is the reference. A same-page A/B is the only comparison here that
load can't skew. (4) *Hook:* `pops: { shown, created }` (`pops.spec.ts`: 19 pops from 5 objects). Visual
baselines are unchanged; no pop is on a baseline frame.
(5) *Review fixes (#33):* *Late web font (must-fix):* `loadFonts` gives up after
`fontTimeoutMs`; a pop atlas drawn before Baloo 2 arrived stayed in the system face all session,
where a `Text` made later picked the font up. `fontReady.ts` now tells, per CSS font, whether it
has loaded (`document.fonts.check`, sticky once true), and the atlas key (`popAtlas.ts`) and the
pooled POOF label's look include that state: a late font gets exactly one rebuild and the stale
labels are remade. The HUD also rebuilds on `document.fonts` `loadingdone`, so the rebuild happens
before the next pop. The atlas logic moved into Phaser-free `popAtlas.ts` (cache and texture
manager injected); unit tests use a fake `document.fonts` (drawn before ready, rebuilt once
after). *Start-up build (should-fix):* `HudScene.create()` builds the atlas, and again when Settings
change the text size or contrast, so no bag pays for it. *Old looks:* the atlases of looks older
than the previous one are removed (the previous one stays: a pop on screen may still use it).

*§5 — Capture-mode hint:* (1) *What:* the first hunt frame in capture mode shows "S slow ·
F freeze · C pan" (`capture.hint`, en/af/de/nl; the key letters stay S/F/C in every language,
they are physical keys) at the top centre, where the hidden HUD leaves the frame empty. It shows
`feel.json capture.hintMs` (3 s), fades over `hintFadeMs` (0.6 s) and is then destroyed, so no
frame captured after that can contain it. Once per page (`CaptureState.hintDone`). (2) *Clock:* it
runs on real frame time, not hunt time (slow motion and freeze scale the hunt, its tweens and
animations; a freeze must not keep the hint up), but each frame counts at most `hintMaxStepMs`
(100 ms): the first hunt frames can stall for seconds while shaders compile on a slow device, and
the hint would otherwise be used up before it was drawn (it was, under software GL). Phaser's
`game.loop.delta` is smoothed toward 16 ms and was not usable: the hunt's own real frame delta is
used. (3) *Portals:* the hint is drawn only when `ctx.capture` exists, which a portal release build
never creates (capture is compiled out, D-027: `speedIndex`, a field only the capture class has,
is in `dist` 4× and in `dist-poki` 0×; the `capture.hint` i18n key is in both, being a string
table entry, which is why a grep for `capture.` is no proof); the gate's unit tests stand. (4) *Proof:*
`capture.spec.ts` "key hint" (shown, then gone while frozen; screenshots of both) and unit tests of
the fade (`captureHintAlpha`).

*§3 — Oupa's barks (D-027 follow-up):* (1) *Where it lives:* `src/game/audio/barks.ts`
`BarkDirector`, in the presentation layer, not the sim: a bark changes nothing in a hunt, so it
reads the typed sim event stream (plus what the HUD knows: the run's quota, the clock, the save's
last hunt day) and may use wall-clock time. Replays, golden hashes and `contentHash` are untouched
(`feel.json` is outside the bundle). (2) *Triggers* (22, `feel.json barks.triggers`): first hunt of
the UTC day, boss intro (`birdSpawned` motion boss), Stampede, whole flock, Twee Vlieë, quota met
(the score crosses the run quota), kwêvoël hit (its own line, bible "Los die kwêvoël uit!"), other
non-target hits, last `lastSeconds` (10 s), top Frenzy tier, `bagStreak` (3) shots in a row that
bagged (a two-bird shot counts once), `missStreak` (4) misses, empty click, rain, crate,
`idleSeconds` (8 s) without a shot, a flush; on the tally after the count-up: new best (score > 0),
top rank ("Bosveld Legend!"), bottom rank with shots fired ("Stadsjapie…"); on the run tally: quota
missed, run won. Each has a priority (the highest wins a frame), a cooldownMs, and lines said in
turn (no randomness, so tests are exact). (3) *Rate:* one bark per `audio.barkGapMs` (6 s, the
bible's number; one value shared with the AudioDirector's own guard). A trigger the gap blocks is
dropped, except idle, last seconds and quota met, which hold until said. (4) *Lines:* 38 new plus
"Kos is reg!" reused = 39 (bible ~40), with the bible's lines; signature Afrikaans phrases ("Mooi
skoot, my kind!", "Ag nee man!", "Twee vlieë met een klap!", "Laai, laai, laai!", "Die hele
swerm!") stay Afrikaans in every language, as the M8 secret barks do; the rest are translated.
`content:validate` checks every line is an i18n key. (5) *Bubble = subtitle and caption
(interpretation of "read by captions"):* the bubble shows whatever the captions setting and the
volume (bible: "all subtitled"; text now, voice later), so it is the caption; captions.ts gets no
second copy. Speaker tag "Oupa" (`ui.oupa`). (6) *Placement:* HUD slot `hudLayout().bark`: left
column under the chips, the Frenzy bar's width (long banners already shrink to stay clear of that
column), 150 px tall (text shrinks to fit); unit-tested against every HUD rect at 16:9, 19.5:9, 4:3,
mirrored or not; e2e-checked against score, belt, pause, timer, gadget. Never interactive: a tap on
it is a shot (e2e). Tallies: beside the panel when the margin is ≥ 300 px, else the panel's
top-right corner beside the title (4:3); there it can brush the run tally's centred header — a
cosmetic overlap on narrow screens only. (7) *Never:* in Oupa se Les (it has its own prompts), in
capture mode (footage), over the tally count-up. (8) *Voice:* each line is `voice/<line>`: a silent
placeholder in every biome manifest (common group), played by `AudioDirector.bark()` once delivered
(music ducks −6 dB). The asset audit counts a voice key as used when a feel.json `lines` array names
it (187 keys, 0 problems); docs/06 lists all 39 with trigger and EN/AF text. (9) *Save:* a new
section `barks: { lastHuntDay }` (older saves get the default, no migration). (10) *Tests:* director
unit tests (streaks, priority, gap, cooldown, lasting triggers, kwêvoël), layout tests,
`barks.spec.ts` (bubble rect clear of the HUD, tap-through, af text, none in the FTUE) on desktop,
Pixel 7 and iPhone 14 landscape; `?holdAt` now also freezes the HUD's tweens so the bubble can be
screenshotted (a Playwright round trip here outlasts its 2.8 s). Visual baselines unchanged.
(11) *Review fixes (#37):* the af quota line was "Wys nou af" ("afwys" = refuse): now "Dis die
kwota! Nou kan jy spog."; de "Jetzt läuft's!" and "Soll erfüllt!" (as `run.quota_met`). The
voice key `bark.twee_vlieë` is now `bark.twee_vliee`, and bark keys are ASCII-only (schema): the
key is the recording's file name, and a non-ASCII name changes under macOS NFD or zip
normalisation, so the recording would never be found. *Secrets first:* a secret's own bark
(biome content, said with its HUD banner) went straight to the AudioDirector, whose own 6 s timer
could silence it after a generic bark, and its banner could share the screen with a bubble. Now
the BarkDirector is the only gap clock (Phaser time): a frame with a secret bark claims the gap
first (`BarkDirector.secret`) and hides a generic bubble, and `AudioDirector.bark()` keeps no timer
(only one Oupa voice at a time: a new line stops the one playing; mute and the tally count-up
still apply). *Lasting:* `boss` and `stampede` wait out the gap like `quotaMet`; on the run tally,
`quotaMissed` and `runWon` retry once the gap ends (`waitMs`; the timer dies if the screen moves
on).

*§6 — Charm balance (D-025 follow-up):* (1) *Measured:* `npm run balance -- --run --seeds 500` on
seeds 1–500 and again on 501–1000 (competent bot, 60 s hunts). Every §13.8 row is within ±10
points on both sets:

| Season | none (target) | none 1… / 501… | synergy (target) | synergy 1… / 501… |
|---|---|---|---|---|
| Herfs | ~85 % | 83.0 / 82.4 % | ~95 % | 92.4 / 89.8 % |
| Winter | ~50 % | 47.0 / 47.8 % | ~80 % | 80.1 / 80.2 % |
| Lente | ≤ 10 % | 12.8 / 7.6 % | ~60 % | 64.1 / 63.6 % |
| Somer | ~0 % | 0.0 / 0.0 % (25 / 15 runs reach it) | ~35 % | 34.6 / 39.7 % |

The baseline's 100-seed quick run showed Lente-synergy at 73 % (a FAIL); at 500 seeds that was
sampling noise. "Few runs reach Somer without good charms" is the design (§13.8: `none` ~0 %).
(2) *Compounding — decision: keep it as it is.* The scoring pipeline (§5.3) already compounds:
+Mult charms add, ×Mult charms multiply each other and the Frenzy/Stampede multipliers, in slot
order (the synergy bot puts +Mult before ×Mult). Median hunt score, synergy ÷ none: Herfs hunts 2–3
+19 % / +22 %, Winter +20 / +31 / +24 %, Lente +24 / +37 / +21 %, Somer hunt 10 +27 % — the lead
grows as the build grows, and the pass-rate gap follows the targets (+9 → +33 → +51 → +35 points vs
+10/+30/+50/+35). That gap is if anything understated: the `none` runs that reach the later
seasons are the lucky ones. So §13.2's "outpaces raw skill by season 3" holds, and stronger
compounding would push Lente/Somer synergy past their targets. (3) *No content changed:* no golden
replay changes and `contentHash` is unchanged. (4) *Version:* 1.0.1 (`package.json`, the zip names
in docs/07, the version line on Settings → Privacy); CHANGELOG `[1.0.1]`.

**D-029 Graphics pass 1: interim guns and tarentaal (22 Oct 2026):** the user chose *option C*: a
much better **code-drawn interim** art set now, human illustrator art later, swapped in key by key
through the M10 pipeline. This pass covers the six first-person guns and the tarentaal with its
variants. Stack of PRs: `gfx1-generator` (A) ← `gfx1-guns` (B) ← `gfx1-tarentaal` (C); the v1.0.1
stack (D-028) runs in parallel and is merged in when it lands. Sim, `content/` and golden replays
are untouched: art never changes hitboxes or gameplay.
*§1 — Authoring as source files:* (1) *Route:* `tools/art/` builds SVG strings from pure
functions (pose + palette → markup) and rasterises them with `@resvg/resvg-js` (devDependency;
Rust/tiny-skia, no GPU and no browser, so it runs the same on this box and in CI). Seeded PRNG for
dots and grain; hand-drawn line wobble is an `feTurbulence` + `feDisplacementMap` filter.
Rejected: Playwright's Chromium (slow start, GPU-path differences) and `@napi-rs/canvas` (another
native canvas for no gain over SVG). (2) *Output:* `npm run art:interim` writes `art-source/`
exactly as a human delivery would (docs/06): same folders, frame boxes, origins, clip names and
`rig.json`, masters at 2× the @1x frame. `npm run assets:pack` then packs them unchanged. A folder
whose `rig.json` is not marked interim is a human delivery and the generator never touches it.
(3) *Constants:* palettes (the bible's exact hex), dot fields, wobble, clip sets and gun colours
live in `tools/art/config.json` (Zod-checked), **not** `content/`, so `contentHash` is
unchanged. Line weights come from `content/scoring.json planes.lineWeightPx` and the body/head
sizes from `content/birds.json` hitboxes (read only). Shape coordinates stay in the drawing code,
as in the runtime placeholder factory. (4) *Masters are palette PNGs* (≤ 256 colours): the art is
regenerated from code, so the generator is the real source; this keeps `art-source/` about 4×
smaller in git.
*§2 — Interim, not final:* (1) *Provenance:* `rig.json` and sprite sidecars take
`"origin": "interim"`; the pack tool copies it into each asset-index entry (absent = final).
(2) *Audit:* `npm run assets:audit` lists three groups — FINAL, INTERIM, PLACEHOLDER — and
`--strict` (the launch gate) fails while any interim **or** placeholder key remains. The game's
test hook reports `interim` as a status too. (3) *Legal note (bible §2):* the US Copyright Office
(Jan 2025) found wholly AI-generated material not copyrightable, and Steam and the app stores
require AI-content disclosure. The interim set is drawn by code written for this repo (no image
model, no traced references), so it carries no AI-art disclosure duty; it is still not the
launch art: final characters should be human-authored with source files kept as evidence of
authorship, which is why `--strict` fails on interim keys.
*§3 — Pipeline additions (also useful to the illustrator):* (1) *Per-plane bird masters*
(`birds/<creature>/planes/<plane>/<clip>/NN.png`) replace the shared master on that plane:
line weight by depth (bible §1.4) and the far plane's fewer, larger dots are drawn, not scaled.
(2) *No trimmed atlas frames:* trimming (opaque bounds, Phaser trimmed-frame JSON) was built
first, then dropped: in-game, Phaser 4.2.1 drew trimmed frames played through an animation with
the neighbouring frames' pixels (flock birds grew extra heads); static `setTexture` frames were
fine, so the gun previews hid it. Untrimmed frames render correctly. Cost: more atlas area (20
pages of ≤ 2048², ~200 MB of GPU texture memory when everything is installed). Revisit with a
Phaser upgrade or a repro upstream. (3) `encode: "png8"` and `x2: false` rig options.
(4) *Animated gun rigs:* `guns/<weaponId>/{idle,fire,reload,flash}/NN.png` + `rig.json`
(grip `originX/Y`, muzzle `tipX/Y`, per-clip fps/loop) in a new optional `guns` section of the
asset index (older indexes still parse). The frame box stays the placeholder's 420 × 520 with the
grip at the bottom centre and the muzzle at (210, 20), so `WeaponView`'s layout, lean, kick and
flash position are unchanged; a single-image `sprites/gun/<id>.png` delivery still works.
*§4 — @1x only:* the canvas is design size × `renderScale`, and `renderScale` ≤ 1 on every tier
with no camera zoom above 1, so a @1x frame is already drawn 1 texture px : 1 canvas px on the
high tier. A @2x set would add no visible detail but count 4× in the size budget (worst-case
twin) and GPU memory. Interim rigs set `x2: false`; the 2× masters stay in `art-source/` so a
later render-scale change only needs a re-pack.
*§5 — Size levers, in order:* palette PNG pages, @1x only, variants drawing only the clips they
play and leaning on the runtime fallback chain (docs/06 §3), and lossy WebP only if still over
(not needed). Measured: the full tarentaal (3 planes, 140 frames) packs to 0.78 MB; the six guns
0.56 MB. *Initial download (gzip, `npm run size -- --strict`):* web, Poki and CrazyGames
**0.55 MB → 2.86 MB** of the 5 MB budget; lazy 0.005 → 0.20 MB (the Okavango-only Kuifkop).
*§6 — Look (review, 22 Oct):* (1) *Dots:* smaller, varied in size and position, densest on the
back and thinning toward the belly and tail (no "polka-dot ball"); seeded per creature, not per
frame, so they don't jump between frames. Slimmer legs. (2) *Generaal:* his rusty blue enamel pot
is the separate `fx/pot` sprite (interim, `sprites/fx/pot.png`, origin seated over the head) that
BirdView shows until the CLANG knock-off (Fx spins it away); the bird itself has a stub casque
(`stubCasque` part) that only shows once the pot is gone. The variants sheet shows both looks.
(3) *Kuifkop Koning:* bottle-cap crown ~1.5× larger, brighter gold with a pale rim. (4) *Guns:*
3/4 view leaning 5° toward the screen centre; geometry widened 1.4× about the barrel line by
scaling path x coordinates (resvg has no non-scaling strokes, so a plain SVG scale would fatten
the outlines); trigger guards; muzzle at box y = 80 (rig `tipX/tipY`) leaves headroom for smoke
and the Voorlaaier's ramrod. Flashes stay small local sprites; `reduce flashes` dims them.
*§7 — Perf (M9 method, Pixel 7 profile, low tier, 6× throttle; frame cost at 50 fps):* the same
build with the asset index hidden (`PERF_PLACEHOLDERS=1`) **25.8 ms**, with the interim art
**23.9 ms** — no measurable cost (animated atlas sprites replace drawn placeholder frames). Both
are over the 20 ms budget on this run because the box was loaded (load average 11 on 6 cores;
D-026 measured 18.4 ms on a quiet box). *Needs a person:* fps and memory on a real low-end Android
and an older iPhone (GPU texture memory above).
*§8 — Evidence:* `docs/art-preview/` (contact sheets, hitbox fit, variants, guns and flashes;
`compare/` before | after in-game on desktop-chromium and pixel7-landscape: pop-up, mid and far
fly-overs, flock forage and flush, the Generaal, `?debug=1` hitboxes, each gun idle / mid-recoil /
reload), from `ART_PREVIEW=1 npx playwright test tests/e2e/art-preview.spec.ts`. The hunt visual
baselines were re-recorded. Golden replays and `contentHash` are unchanged (sim and `content/`
untouched).
*§9 — Review round 2 (22 Oct): fixes before merge.* (1) *Birds read grey in the game:* the
mid-plane dots (as small as ~1.2 screen px, ~19 % of the body) blurred into a grey haze. Now
fewer, crisper dots (≥ ~2 screen px on every plane, ~9 % at mid), a subtler back highlight, the
face outline 1.35× the plane's ink, wattles 1.35× with a full ink line, far sky tint 20 → 15 %
(bible range 15–25 %, mid none). Plumage stays the bible's `#2E2F45` / `#1F2033`.
`docs/art-preview/contrast.{png,json}` puts every bird on the Karoo veld, soil and sky with its
silhouette and the WCAG contrast of its average colour (tarentaal mid vs veld 4.9 → 5.6 : 1; far
2.8 : 1; `tarentaal_wit` is white by design, 1.6 : 1 on the veld). (2) *The shotgun read as a
stubby revolver:* the long guns (Dubbelloop, Pomp, Voorlaaier, Windbuks) now point into the scene
at −22° with the stock bottom right and the barrels running up-left toward the screen centre,
converging in perspective; muzzle 500 px from the grip again; per-gun pose in
`tools/art/config.json guns.poses`; rig `tipX/tipY` follow it. (3) *Size and graphics memory:*
frames of a clip are cropped to the clip's common opaque area and carry a Phaser `pivot` (safe,
unlike trimmed frames); near-identical frames are packed once; each plane packs only the clips it
plays (near: `peek` + `hit_poof`; the reserved `tumble` is drawn for the sheets but not packed);
`rig.json group` puts wit, lavendel, the Generaal and every gun but the Dubbelloop in a **late**
group (downloads after the first download settles, while the title is up; placeholders until
then), Ou Grys with the Bushveld,
Kuifkop and Koning with the Okavango; bird and gun atlases go to the GPU on first use, the
first-download birds at hunt start (not mid-hunt). *Results:* first download (gzip, all three
builds) 0.55 → 2.86 → **1.09 MB**; late + biome groups 1.4 MB. Texture memory at the end of a
20 s Karoo hunt, low tier, Pixel 7 profile (test hook `textureBytes`, every texture incl.
placeholders and layers): 43.7 MB without the art, 101.7 → **93.7 MB** with it. The low tier
already loads @1x only (no @2x sets exist). Frame cost at 50 fps (M9 method, 6× throttle) on this
loaded box (load average 8–11 on 6 cores) spread 23.9–30.8 ms with the art and 24.8–26.0 ms
without across runs; differences are within the box's noise, and none meet the 20 ms budget here
(D-026's 18.4 ms was a quiet box). *Needs a person:* fps and memory on a real low-end Android and
an older iPhone. (4) *Reviewer fixes:* a reload that starts while the fire clip plays (every
Voorlaaier shot) now begins when the fire clip ends; a fire clip with no reload clip settles on
idle; @2x gun rigs draw at `rig.scale`; a final gun rig's provenance wins over an interim gun
image; gun masters smaller than the box are an error, not a silent skip; the generator never
overwrites a sidecar it can't read; the fit test covers every packed tarentaal frame on every
plane (it caught a takeoff wing and poof feathers clipping the frame edge).
*§10 — Final review (22 Oct):* (1) frame merging now needs every channel of every pixel within
±2 (the earlier "0.4 % may differ by any amount, the rest by ≤ 24" merged a Voorlaaier ramrod
stroke, a Windbuks puff, a Dubbelloop reload step and every bird's peek glance); exact repeats
(alert hold, peek 01/03, Pomp reload 04) still pack once. (2) A late gun rig arriving for the
weapon already in hand keeps the reload state and clip position. (3) The knocked-off pot starts
from the head pot's origin (no jump at the CLANG). *Follow-up (not in this pass):* left-handed
mode (`prefs.leftHanded`) moves the gun to the left but doesn't mirror it: the interim long guns
lean toward the screen centre from the right, so a left-handed player sees them lean outward.
Mirror the gun sprite (scaleX −1, tip x mirrored) when left-handed.

**D-030 Faster delivery: CI lanes and working rules (22 Oct 2026).** The product owner found
the build loop too slow. Measured on a 16-job CI run (48 min wall clock): installing browsers and
their system packages took 1–22 min per job, jobs queued up to 20 min for free runners (stacked
PRs pushed several 16-job runs at once), and the slowest test shards took 17–18 min. Idle gaps
between agent turns (a turn ends mid-task, nothing restarts it until the next hourly check) cost
more than any of these. Decisions: (1) *CI lanes.* Pull requests into `main` run the **quick
lane**: check/build/size, desktop Chromium in 4 shards, Pixel 7 landscape in 3, iPhone 14
landscape on WebKit, without the Season Run and perf timing specs. Push to `main`, the nightly
run, a manual run and a PR labelled `full-ci` run the **full lane** (every profile, Season Run,
perf, portal and public-build jobs, desktop WebKit in 2 shards). A PR merges on a green quick
lane; a red full lane on `main` is fixed forward at once. PRs whose base isn't `main` (stacked)
don't run CI until retargeted, which re-triggers it. (2) *Playwright image.* E2E jobs run in
`mcr.microsoft.com/playwright:v<version>-noble`; its tag must equal `@playwright/test` in
`package.json`. (3) *Working rules for agent tasks.* One or two PRs per job instead of a stack
of five to eight; one review at the end of a job, not one per part; check-ins every ~20 min
instead of hourly, and a cut-off turn is restarted at once. `E2E_SKIP` now takes
comma-separated globs. *Fix (23 Oct):* a PR description edit or an unrelated label runs no jobs,
but it shared the PR's concurrency group and cancelled the quick lane in progress (#43); such
events now get their own `-noop` group. *Fix (23 Oct, later):* the Pixel 7 low-tier perf test
failed on `main` three times in a day (21.3–22.0 ms against 20 ms; median frame 18.7 ms, p95
49 ms) with no change in the hunt's code path. Its shard ran it on one worker while the other
worker ran the perf smoke and the score-pop A/B, so three throttled, software-rendered pages
shared the runner's CPU. In the full lane the perf specs now run alone, one job per profile
(desktop Chromium, Pixel 7 landscape) with one worker, and the other shards skip them. The
budget is unchanged. *Visual baselines recorded in CI (23 Oct, approved by the product owner):*
nobody re-records `tests/e2e/visual-baselines/` on their own machine any more. Another machine
(an ARM Mac, a different GPU) renders a little differently, and the Playwright container was the
heaviest memory step on the build server, which ran out of memory twice in graphics pass 3. The
*Visual baselines* workflow (`.github/workflows/visual-baselines.yml`) records them in the same
`mcr.microsoft.com/playwright` image as the e2e jobs, one job per baseline profile, with
`--update-snapshots=changed` (only screens past the tolerance, or with no baseline yet, are
written). It commits them to the PR branch as `github-actions[bot]` and starts the quick lane on
that commit, because a push made with the workflow token starts no workflows. Start it by
labelling the PR `update-baselines` (the label is removed when the run ends) or by hand with the
branch name; it refuses `main` and stops if the branch moved while it recorded. Agents say in the
PR which screens changed on purpose and pull before their next push; the reviewer checks the image
diff. A manual CI run can now pick `lane: quick`.

**D-031 Graphics pass 2: interim landscapes, props, other creatures and effects (22 Oct
2026).** The product owner approved a second code-drawn interim pass (same route as D-029, human
art later): every remaining runtime-drawn *visual* placeholder. Audio is out of scope. Two PRs
(D-030): `gfx2-karoo` (the home biome and everything shared, in the first download) and
`gfx2-biomes` (Bushveld, Kalahari, Okavango; lazy per biome). Sim, `content/` and golden replays
are untouched.
*§1 — Generator:* new `tools/art/` modules on the D-029 route (SVG → resvg → palette PNG):
`scenery.ts` (mesas, koppies, bossies, grass tufts, stones, posts and wire, clouds, tree blobs),
`landscape.ts` (layer and prop rendering), `biomes/<biome>.ts` (one plan per biome: six layers
+ its props), `sprites.ts` (shared FX/UI), `flyers.ts` (non-targets and the Stormvoël),
`scenePreview.ts` + `scenerySheets.ts` (docs only). `npm run art:interim -- --only
scenery|sprites|flyers [--biome <id>] [--sheets]`. Palettes live in `tools/art/config.json
scenery` (bible §4.2 / §6 hex values plus derived tones), never in `content/`.
*§2 — Pipeline:* a layer sidecar (`layers/<biome>/<id>.json`) now also takes `origin`
("interim") and `encode` ("png8"), like sprite sidecars; the asset index already had a
provenance field for layers. The parallax renderer and its tiling are unchanged.
*§3 — Interpretation calls:* (1) *Look:* flat fills + one shadow + one highlight, light from the
upper left; aerial perspective by layer (`scenery.haze`: far ridge 30 %, far veld 18 % toward the
horizon colour, ink lightened with it); ink 2 / 2 / 4 / 6 / 6 px for far ridge / far veld / mid /
near / foreground (bible §1.4); grass and bossies are inked round their silhouette only, so thin
blades keep their colour. (2) *No paper grain* (bible §1.2 asks for "subtle"): grain costs palette
PNGs most of their compression; dry-grass hatching gives the texture instead. (3) *Sky:* a smooth
vertical gradient (rows compress to almost nothing), thin high streaks only in the flyer band, low
cumulus banks behind the mesas. (4) *Prop boxes:* every prop keeps its placeholder texture size and
origin except the **windpomp**, whose texture is wider (170 → 310 px, origin moved in the
sidecar) so its tail vane is drawn where the kwêvoël perches (`perch.ox −150`); its occluder,
rotor and secret geometry are unchanged (the pack tool's size warning is expected). (5) *Crate:*
a stencilled shell symbol instead of the placeholder's red cross (a protected emblem) or Oupa's
initials (no text in art, bible §1.7). (6) *`fx/flash`* is drawn: it is still the muzzle flash of
any gun whose rig has no flash clip (late guns before they arrive). It stays a small local sprite;
"reduce flashes" dims it as before. `omen/glare` stays a steady soft band, not a flash. (7)
*`fx/grass_tuft`* is one key for every biome, so it uses neutral dry grass on the Karoo near-ground
colour. (8) *Flyers draw only what the game plays:* hadeda and crop-sprayer `flap`; visarend
`flap` + `glide`; kwêvoël `alert` (perched; crest up, then "KWÊ" beak open) + `flap`; Stormvoël
`flap` + `hit_poof` (only targets get the bag poof). Each also has a one-frame `forage_walk` hold
pose: the game never asks a flyer for it, but it ends every fallback chain, so the audit's
"incomplete bird" rule holds and no state can drop to placeholder frames; identical frames pack
once. The Stormvoël loads with the `late` group, visarend with the Okavango. (9) *Silhouettes*
(bible §1.6): ibis bill and trailing legs (hadeda), biplane (sprayer), crest + long tail
(kwêvoël), white head + white wedge tail on broad wings (visarend), giant casqued guineafowl with
glowing eyes and a cold rim light (Stormvoël).
*§3b — The other biomes (part B):* each biome has its own `tools/art/biomes/<biome>.ts` plan
and palette, sharing the Karoo's shapes and line rules but clearly distinct in season and light.
*Bushveld winter:* a cold dawn sky warming to peach at the horizon, frost mist lying on the far
veld, orange granite domes with exfoliation sheets and boulder koppies, a mopane tree line and
far baobabs, tiny giraffe silhouettes, pale straw grass, frost on the near tufts; props: a
leafless baobab (the pod hangs on a stalk at the content's part position), the dassie peeking
over its koppie, granite boulders (one split, its crack is the secret), red winter aloes.
*Kalahari summer:* hot blue sky with the thunderstorm **kept low** behind the dunes (sunlit
lobed thunderheads, dark flat base, rain shafts), so the flyer band stays light and navy birds
keep their contrast (bible §1.5); red dunes with lit and lee faces, gemsbok on a crest, wind
ripples, flat-topped camelthorns; props: a camelthorn holding a sociable-weaver haystack nest
(nest-chamber holes underneath), a signpost with a painted windpomp pictogram and an arrow (no
text, bible §1.7), a dead camelthorn with its branch stub, dune-grass tussocks with seed heads.
*Okavango spring:* fresh blue sky with spring cumulus, tree islands of jackalberry and ilala
palms on a flat horizon, green floodplain with glinting channels, a muddy wet strip where the
splash zones' water sits, lily pads; props: reed beds (Phragmites with plumes), a mokoro pole
with a red cloth flag, a sausage tree with hanging fruit and dark red flowers, a submerged
hippo (eyes, ears, nostrils, back), a lily pad with a reed frog and a pink lily, papyrus
clumps. No jacarandas (bible §2).
*§4 — Tests:* `tools/art/scenery.test.ts`: every flyer frame stays inside the bird box and
covers its body hitbox; every shared sprite and prop is drawn at the placeholder's size and
origin with its occluder inside the art; every layer comes out at the delivered width and its plan's height; renders are
deterministic. The pipeline test covers the layer sidecar (provenance, `top`, palette tiles).
*§6 — Budgets (part A, measured):* first download (gzip, `npm run size -- --strict`) web
1.11 → **1.69 MB**, Poki and CrazyGames 1.68 MB (cap for this pass 3.0 MB, hard budget 5 MB);
**1.89 MB** after the look review (§7).
GPU texture memory at the end of a 20 s Karoo hunt, low tier, Pixel 7 profile (test hook
`textureBytes`, every texture; `compare/gfx2-texture-memory.json`): 94.0 → **107.7 MB**, inside
Tech §15's 128 MB for the low tier (the bible sets no number). Most of the *increase* is the
full-resolution sky layer (2680 × 1080 × 4 B ≈ 11.0 MB of the 13.7 MB). No new per-frame work: the same parallax tiles, sprites and atlases are
drawn; only their pixels changed. Audit: 18 → **66 interim**, 169 → **121 placeholder** keys (the
rest are audio, out of scope). Golden replay `8ab8e33970ccd89f` unchanged, no diff in `src/sim/`
or `content/`. `art:interim` + `assets:pack` run twice give byte-identical `art-source/` and
`public/assets/`. Hunt visual baselines re-recorded in `mcr.microsoft.com/playwright:v1.56.1-noble`.
*§6b — Budgets (part B):* first download unchanged by part B (**1.89 MB** gzip after the look
review, §7; the asset index grows by 2 KB). Lazy chunks per biome (gzip, incl. its birds):
Bushveld 0.86, Kalahari 0.63, Okavango 1.00 MB (cap 1.5 MB each). Audit with both parts: **106
interim, 81 placeholder** keys (every remaining placeholder is audio). *GPU texture memory on
the low tier (final review):* `AssetManifest.install` only ever added textures and the title
installs the Karoo, so a hunt in another biome held two biomes of scenery: measured from the
title (Pixel 7 profile, test hook `textureBytes`) Bushveld 136.8, Kalahari 129.2, Okavango
147.3 MB, and a 12-hunt Season Run 144.9 MB (boss, late and biome-only bird atlases piled up
too), over Tech §15's 128 MB. Fix: on every manifest swap HuntScene calls
`AssetManifest.release(textures, next, anims)`, which removes the old manifest's textures that
`next` doesn't use (its layers, props and biome-only placeholders) and every bird atlas `next`
won't prewarm at hunt start (with those atlases' animations, recreated on first use). Shared
UI/FX, guns and first-download birds stay; decoded images stay cached, so `install()` /
`ensureBird()` re-add anything that comes back. Unit test: switching biome removes the old
biome's scenery keys and keeps the shared ones (`AssetManifest.test.ts`). *Measured after the
fix* (low tier, Pixel 7, `docs/art-preview/compare/gfx2-texture-memory-{biomes,season}.json`):
hunt from the title — Karoo 91.5, Bushveld 100.6, Kalahari 93.0, Okavango **111.1 MB**; Season
Run (12 hunts, one page) peak **126.9 MB** (the Okavango boss hunt; Karoo 93–110, Bushveld 108,
Okavango 119–127, Kalahari 92–101). All under 128 MB, the Season Run peak with 1.1 MB to spare:
if later art grows, a half-resolution sky on the low tier (≈ 8 MB per biome) is the next lever.
*§7 — Look review (22 Oct, user on the first Karoo look: "fix the grass, bushes and sky"):*
(1) *Grass:* `tools/art/vegetation.ts` has seven tuft shapes (fan, upright, clump, wispy,
windswept, seeding, sparse) in weighted straw-gold, bleached and grey-green tones, placed by
`grassField` in irregular seeded clusters (1–5 tufts, random gaps with some long empty
stretches; never a grid), with stones, forked twigs and lone dry stalks mixed in. Blades grow out
of the ground (nothing inked below the base line) and are inked round the tuft's silhouette only.
Foreground clumps mix shapes and heights (70–210 px) with a few tall seed heads; `fx/grass_tuft`
is one mixed clump (tips kept inside its 30 px headroom). (2) *Bushes:* `shrub` draws low, twiggy
shrubs from many small leaf lobes with a dashed (broken) ink outline at the plane's weight, bare
twigs through the crown and at the base, one shadow and one highlight, a second colour that only
shifts the hue, and four shapes (dome, wide, tall, sparse) in grey-green, olive and some autumn
brown; far-veld ones are 3–10 px, thinly inked and hazed. (3) *Sky:* `tools/art/skies.ts`: a
smooth gradient (deeper blue at the top to warm pale gold at the horizon) packed as a
**full-colour PNG** (the layer plan's `encode: 'png'`; a palette PNG banded) at about 100 KB;
soft flat-bottomed cumulus (blurred edges, lit top to a cooler base, no ink) banked low over
the horizon and a few small ones just under the flyer band; three to five faint high streaks.
The flyer band (skyBand 80–420) holds only those faint streaks. (4) *Props stay inside their
textures:* a new test fails if any prop's art touches its texture's left, right or top edge
(the fence bell's wires excepted: they join the mid fence). It caught the aloe candles, the
potjie's steam and the windpomp and reservoir pipes and shadows, all fixed. First download
1.69 → **1.89 MB** gzip (the full-colour sky and the denser ground cover).
*§7b — Look review, the other biomes:* all three use the shared grass, shrubs and soft sky
(`tools/art/biomes/common.ts`: mid scrub, near grass, foreground clumps; each biome's palette
names the straw / bleached / grey-green grass and its shrub colours). *Kalahari:* the dark band
behind the dunes (the old storm clouds, the same navy as the birds, so far flocks vanished) is
now a few distant thunderheads: one soft lumpy tower each with an anvil and faint rain shafts,
grey-violet and **lighter than the birds** (far bird vs storm 2.6–3.7 : 1, was 1.1 : 1; vs the
veld 2.8 : 1, D-029). The sociable-weaver nest is a lumpy, shaggy haystack of straws hanging in
the camelthorn's canopy (bulging sides, a sagging belly with a fringe of loose straws and the
chamber entrances; branches run into it, the crown sits over it; GDD §11). *Okavango:* soft
cumulus; the sausage-tree crown is nine leaf clusters on visible limbs; the lily pad is a
centred pad with its notch. Lazy chunks (gzip): Bushveld 0.86, Kalahari 0.63, Okavango
1.00 MB (cap 1.5 MB each).
*§5 — Evidence:* `docs/art-preview/` `sprites.png`, `flyers.png`, `scenery-<biome>-{props,layers,pan}.png`
(the pan sheets stamp real interim birds on their lanes: contrast check, bible §1.5);
`compare/gfx2-*.png` before (main) | after in-game on desktop-chromium and pixel7-landscape (part
B adds one hunt view per biome: `gfx2-{bushveld,kalahari,okavango}-*.png`), from
`ART_PREVIEW=1 npx playwright test tests/e2e/art-preview-gfx2.spec.ts`.

**D-032 v1.1 Gun feel: ammo display, crosshairs, interim sound (23 Oct 2026):** the first step of
the approved long-range plan (`08-PROPOSAL-LONG-RANGE-AND-DAILY-MAPS.md`, "Ammo display and
crosshairs per gun"); rules in GDD §17.1 and §18.2. Screen and audio only: no file in `src/sim/`
or the sim content changed, golden replays unchanged, `npm run hunt -- --seed 42 --bot aim` hash
`8ab8e33970ccd89f` as on main. Two PRs (D-030): `v1.1-ammo-crosshairs`, then `v1.1-audio` on it.
Interpretations:
(1) *Data, not code:* each gun's ammo display, crosshair and sounds are one entry in
`content/client/feel.json → guns` (client file, outside the content hash). Ammo types name their
size, spacing and what a fired round leaves (`spent: sprite | gone`); displays are a `belt` (one
round per magazine slot or crate shot), a `pile` (unlimited: Kettie) or a `hopper` (timed crate
gun: Mielie-Masjien, the kernel level follows the time left inside the texture's `fillBand`).
Textures are `ui/ammo/<type>` and `ui/ammo/<type>_spent`; a runtime placeholder is drawn for every
type from its size and two colours, so the .22 and rifle rounds (v1.3) need a data entry and an
interim drawing only. `content:validate` checks every weapon has a look that fits it (a pile only
for unlimited ammo, a hopper only for a timed crate gun, a "spread" ring only with spreadPx > 0, a
drop line only with a projectile, known sound ids). A unit test adds a .22 as data only.
(2) *Realistic, not cartoony (product owner):* the interim ammo (`tools/art/ammo.ts`) has no ink
outline: gradient shading, specular streaks, contact shadows and material texture (hull
extrusion lines, galvanised spangle, stone grain, paper crinkles), drawn at 4× and kept as
full-colour PNG (a palette PNG banded the gradients). 12-gauge shells: red plastic hull, brass
head; spent: dull hull with the star crimp opened. Windbuks: lead diabolos (waisted, hollow
skirt); review: "too small and dark" → 50 × 64 px, bright lead with a light rim. Kettie: river
stones in a 3-2 pile. Voorlaaier: review: "white candles" → brown kraft-paper twists with the lead
ball out of the top and a twisted tail; spent: torn open, powder-stained. Mielie-Masjien: a
galvanised hopper with a sight glass full of kernels. The old shared `ui/shell`, `ui/shell_empty`
and `ui/reticle` keys are gone.
(3) *Crosshairs show the spread:* built from shape parts as Phaser Shapes (no texture memory, no
per-frame tessellation): a ring whose radius is the weapon's `spreadPx` — pellets land in a disc
of that radius on every plane, so the ring is honest (Dubbelloop 70, Pomp 60: tighter, Voorlaaier
300 with a hand-cut wobble and gaps, Mielie-Masjien 60 with a ±5 px jitter); Windbuks a fine dot
with a 16 px ring; Kettie a V with a drop line marking the stone's drop at the mid and far bands
(`projectile.dropPx`, the near 4 px is too small to mark). A dark keyline under every line keeps
it readable on sky and veld. `guns.crosshairStyles` holds colours and line weight only: the
Skiet-Skuur's crosshair styles (later) pick a style and keep the shape.
(4) *Touch offset crosshair:* GDD §18.2 listed an "offset reticle" that was never built; the brief
asked to keep it working, so it is built now as Settings → "Offset crosshair (touch)", off by
default: the crosshair shows 70 px above the finger while it is down and the tap (or hold) fires
there. The InputMapper only moves the point it already puts in the fire command (`dx`, `sy`), so
replays, Daily and challenges are unaffected; aim assist works around that point. Saves without
the field fall back to off (per-field defaults).
(5) *Interim sound:* `npm run audio:interim` (`tools/audio/`, a small deterministic DSP kit:
seeded noise, filters, Karplus-Strong plucks, struck bars, a Schroeder reverb) writes WAV masters
with a `{ "origin": "interim" }` sidecar into `art-source/audio/`, the same path a sound
designer's delivery takes; `assets:pack` reads the sidecar and the audit lists 46 INTERIM sounds.
30 effects: the 22 existing keys plus each gun's own shot and reload (`shotPomp`, `shotWindbuks`,
`shotKettie`, `shotVoorlaaier`, `shotMielie`, `rackPomp`, `cockWindbuks`, `ramrod`), chosen per
gun by `guns.weapons.<id>.sfx` (shot, reload start, each shell, reload end); the synth stays the
fallback for each key. Music: per biome three stems of the same 8 bars at 120 bpm (16 s seamless
loops; the reverb tail is folded round), Karoo fingerpicked guitar in D, Bushveld marimba in G,
Kalahari kalimba in A minor, Okavango guitar with marimba answers in F; calm = the instrument,
build adds bass, shaker and kick, stampede doubles the pattern with clap and drums. Ambience:
Karoo wind and birds, Bushveld wind, cicadas and birds, Kalahari dry wind and insects, Okavango
water, frogs and reed birds. Voices stay text bubbles. Mute rules are the AudioDirector's, unchanged
(first gesture, hidden tab, pause, ads); e2e proves the shipped files play after the first gesture
and go silent on a hidden tab.
*Loudness* (asset index, after the pack's normalising, art bible §10): music stems −16.0 LUFS
(peaks −2.8 … −9.0 dBTP), ambience −20.0 LUFS (−2.9 … −4.9 dBTP), effects −14 LUFS where the
−1 dBTP ceiling allows (alarm, sting, tick, ting, vuvuzela, whoosh, powerup, kek, kwe); short
transients are held at the ceiling and come out quieter, as docs/06 §5 allows (shot −20.4, click
−22.1, shotWindbuks −23.4 LUFS). Lengths: effects 0.03–1.8 s, stems 16 s, beds 16 s.
(6) *Budgets:* sample rates were lowered to fit (music 22.05 kHz, ambience 16 kHz, mono): at
32 kHz Okavango's chunk came to 1.50 MB. Measured (gzip, the larger of each Ogg/MP3 pair counted):
first download **2.60 MB** web (was 1.89), poki and crazygames within 4 KB; lazy chunks Bushveld
**1.33**, Kalahari **1.05**, Okavango **1.43**, late 1.03 MB. `npm run size` now reports each
lazy chunk and `--strict` fails one over 1.5 MB (`tools/sizeBudget.ts lazyGroups`). Low-tier
texture memory (Pixel 7, `textureBytes`): per biome 91.5 / 100.6 / 93.0 / 111.1 MB and the
Season Run peak **126.9 MB**, unchanged from D-031 (the ammo textures, ~156 KB, replace the old
shell and reticle textures, ~159 KB; crosshairs are shapes). Decoded audio is not texture memory:
only the biome on screen keeps decoded music (M10), ~2 MB for three mono 16 s stems.
(7) *Evidence:* `docs/art-preview/compare/v1.1-<gun>-<full|part>-<desktop-chromium|pixel7-landscape>.png`
(before: main played for real, every gun showed the same red shells and reticle; after: the
gun's own ammo and crosshair, from the e2e preview hook on a held frame);
`tests/e2e/gun-look.spec.ts` checks every gun, full and partly spent, on desktop, Pixel 7 and
iPhone 14 landscape (locally on Chromium emulation; CI runs WebKit), real Windbuks play, and the offset crosshair; visual baselines re-recorded in
`mcr.microsoft.com/playwright:v1.56.1-noble`; `v1.1-texture-memory-{biomes,season}.json`.
(8) *Playtest review fixes:* a crate gun reloads without events, so the Voorlaaier's ramrod is an
`afterShot` sound (900 ms after a shot that leaves rounds); a bigger magazine (the Season Run's
bandolier charm) packs the belt's rounds closer instead of spilling off the slate (also in
left-handed mode); the crosshair ring follows the active power-ups' spread multiplier (Bush
Buckshot ×2.5), exactly as the sim fires; infinite ammo (Chilli Biltong) shows a full belt and no
RELOAD prompt; aiming keeps a crosshair style's opacity.

**D-033 v1.2 Day-of-week maps and bonus map Verder (23 Oct 2026):** the second step of the
approved plan (`08-PROPOSAL-LONG-RANGE-AND-DAILY-MAPS.md`); rules in GDD §11.5, Tech §3.10–3.11
(InputLog v4, maps), §11 (`bonusMaps` save) and §12 (link fields). Two PRs (D-030):
`v1.2-weekday-maps` (content, sim, replay v4, links, light), `v1.2-verder` on it (unlock, reset,
best, title, tuning, reports, previews). Interpretations:
(1) *A map is the biome plus overrides.* Layouts and the bonus map are data in each biome file
(`layouts`, exactly mon..sun; `bonusMaps`), resolved by one pure function (`src/sim/maps.ts`) so
the sim, the views and the tools agree. Biome files keep `version: 1`: the fields are additive,
every content file ships with the build and there is no older content to migrate.
(2) *Old replays and links keep their map.* No layout = the plain biome. InputLog v4 appends the
map after the mode block; v1–v3 logs decode without one. Challenge links get optional `l`/`b`
(still `v: 1`); a link without them plays the plain biome. All 26 pre-v1.2 golden replays kept
their event hashes and scores when the content changed; 5 map cases were added
(Karoo thu/fri/sat, mon+Verder, a Bushveld wed Daily).
(3) *Who plays a layout:* Classic and the Daily (the brief). The Season Run and the FTUE play the
plain biome so their quotas, bosses and the lesson stay as tuned.
(4) *Weather:* a layout says `calm`, `default` or `omen`. Calm beats the Daily's omen-on default
(D-021) — "still air" on Monday is for everyone; an explicit `mode.omen` (e2e/dev) still wins.
(5) *Feeding spots:* the warm-up flock forages on the spot where it is in view, later flocks
there only while it is out of view (a flock never pops into sight); otherwise the old
placement runs. Each layout opens the pan at `cameraStartU`, a little off its spot (look review:
the first flock foraged in the same screen spot every day). *Routes* are lane
weights, sky bands and an optional fixed direction (the coin is still drawn).
(6) *Dusk "worth more"* is a base-points multiplier (×1.15 after tuning), applied before the
pipeline so the breakdown and charms are unchanged.
(7) *Light without textures:* multiply tints per layer and flat haze rectangles under each
plane's birds; presets live in the client feel file (outside `contentHash`). First review found
the dusk sky too dark for fly-overs (screenshot median plumage:sky contrast 1.39 vs 3.22 plain):
the second look review asked for a light that differs at a glance each day and a real dusk
(deep blue top, orange-pink glow behind the koppies, warm ground, cool foreground, no veil).
Light presets gained banded sky glows (haze `top`/`bottom` on the sky layer) and `clouds`
(Phaser ellipse clusters at fixed positions, no textures). `tools/sky-contrast.ts` (and its
test) keep every map ≥ 80 % of its plain sky's contrast in the fly-over band; the preview spec
checks screenshots against ≥ 80 % of the plain map (Karoo desktop: plain 3.20, Mon 3.69,
Tue 2.84, Wed 2.95, Thu 3.02, Fri 2.69, Sat 3.19, Sun 3.40, Verder 2.98; Pixel 7 within 0.05).
(8) *The quota that unlocks Verder* is the biome's Season Run plain-hunt quota (`run.json`
`quotas[huntPattern.indexOf('plain')]`, Karoo 1 950), the "same number the Season Run uses".
Classic and Daily hunts (practice too) on **today's** layout **in the Classic biome** count (the
title and Verder start there; review: a Bushveld Daily said "unlocked" for a map the title could
never start); a challenge to another day's map doesn't. The unlock is for the UTC day the hunt started and is dropped if the hunt ends after
midnight. Capture mode and `?e2e` on a public build unlock nothing (unranked).
(9) *Verder is harder, as the proposal says, not just further.* As first written (mid + far
flocks) bots scored +28 % (far birds pay 25). Tuned to one far flock, fly-overs mid 1 : far 3 and
×0.8, pop-ups ×0.35, base points ×0.8: competent mean −5 … −26 % vs the plain biome, plinker
quota pass 0–31 % (plain 13–73 %); after the opening-view change (5) the layouts sit within
−9 … +14 % and Verder −2 … −22 %. Its own best lives in `bonusMaps.bests`; it never moves the
Classic best but counts for rank titles. A Verder challenge link plays without the unlock.
(10) *Review fixes:* a bonus map in a link needs a Classic layout (`badShape` otherwise); the
title moves its START block up so Verder never reaches the bottom row on a phone's safe area;
two original InputLog v3 logs (Classic, Season) are frozen as fixtures that must replay to
their recorded hashes (`src/sim/replay/golden/v3-fixtures.json`).
(11) *Budgets:* initial download +5.8 KB gzip (2 658.3 → 2 664.1 KB web; Poki/CrazyGames
2 660.2/2 660.3 KB), lazy chunks unchanged (Okavango 1 463.1 KB), low-tier texture memory per
biome identical to v1.1 (no new textures; the Season Run plays no layout, so its 126.9 MB peak
is unchanged by construction).

**D-034 v1.2x Playtest admin page (23 Oct 2026):** the product owner asked for "an ADMIN url that
I can activate in my browser that enables access to all the levels to test them … an admin page
that lets me select a level, review and test them one by one and give feedback".
(1) *Entry:* `?admin=1` opens the Admin scene instead of the title, only where the
PlatformAdapter says so (`adminPage`: web true, Poki and CrazyGames false; `adminPageInBuild()`
answers before the adapter exists, because the admin save must be chosen before the save loads).
Portal builds show the normal title (unit test + `platform.spec.ts`).
(2) *Own save:* admin pages use the storage namespace `admin.` (`tm.admin.*`, `tm.e2e.admin.*`
under `?e2e`), like capture mode (D-027): admin hunts write only that save, so the player's
bests, unlocks, streak and run are never touched. Every admin hunt is also unranked (practice
Daily, no share or challenge link, no Verder unlock). The review save (`tm.admin.review`,
Zod-checked, damaged → empty) holds per-entry status (not reviewed / OK / needs work), a 1–5
rating and notes (≤ 4 000 chars), the shared options and the last hunt's seed and gun per entry.
(3) *List from content:* each playable biome plain, its seven weekday layouts and its bonus
maps; the Daily (with a date picker); each Season Run hunt (season × hunt pattern). New layouts
and bonus maps appear on their own.
(4) *Play = reload:* [Play] stores the entry and options and reloads with `&play=1`; boot applies
them the way the e2e parameters are applied (biome, layout, bonus, seed, length, omen, Daily
date) plus two content changes: Season quotas × multiplier and a forced event (at least once, in
the first 5–30 % of the hunt, any mode, omen or not). Reloading keeps the content transforms out
of the running game and runs the hunt through the normal code paths. The play card asks for one
tap so audio may start. A crate gun is never a primary: Classic and Daily drop it in the first
crate (the `?crate=` path), a Season Run rents it. A Season Run entry starts a fresh run on the
admin save and jumps to that hunt (`RunFlow.jumpTo`).
(5) *Way back:* the tally swaps [Season Run] for [Back to admin]; Menu, Quit and the run's title
button come back to the play card, which has [Back to admin].
(6) *Feedback out, no backend:* "Copy report" (markdown of every reviewed entry; if the clipboard
is blocked the text is shown to copy by hand) and per entry "Send to GitHub", a prefilled
`github.com/ShadowNam/Tarantal/issues/new?labels=playtest` link with map id, mode, gun, seed,
build SHA (`__BUILD_SHA__`: `GITHUB_SHA` on CI, else git), user agent, viewport and notes, cut so
the URL stays ≤ 7 000 chars. Screenshots are attached on GitHub.
(7) *UI:* a DOM panel over the canvas (native selects, date input, textarea and touch scrolling;
`touch-action: pan-y` on its scroll areas), i18n keys `admin.*` (English text in every table:
admin is a tool for the team). Checked on desktop and Pixel 7 landscape (`admin.spec.ts`).

**D-035 v1.2x Graphics pass 3: semi-realistic guns, birds, bakkie and mountains (23 Oct 2026):**
the product owner's notes: "the farm house seems half cut, layers issue. Also the mountains can't
all be flat, look at mountains in Namibia and make more interesting. The car detail needs to be
better. And the detail on the guns needs a more realistic touch, they look too cartoony, the same
applies for the birds. I see there is even a bird that has no texture at all." Art direction
change, art bible §1.1: guns, birds, vehicles and mountains move from cartoon toward
semi-realistic (realistic proportions and materials, painterly shading, fine detail, thinner and
softer outlines); UI, FX and tone stay comic. Provenance stays `interim` (code-drawn,
`npm run art:interim`).
(1) *Farmhouse cut in half:* the far-veld textures were cropped at y = 548 while the Karoo
farmhouse's trees reached y ≈ 500, so the trees (and Bushveld mopane, Kalahari camelthorns,
Okavango palms) lost their tops and the house read as half a building. The far-veld window moves
to 464–696 in every biome (same 232 px; the mid layer is opaque from y = 662), the farmstead is
redrawn standing on the ground line (stoep, corrugated roof, chimney, yard wall, a path to the
track, a tank stand, contact shadows), and trees are leaf masses on their own base. Foreground
grass tips fade over 28 px instead of a hard cut. Guard: `tools/art/edgeAudit.test.ts` fails when
any layer's top row or a scenery prop's top/left/right edge holds art.
(2) *Mountains:* `tools/art/mountains.ts` (inselberg, massif with ravines, strata ridge, koppie
with scree, boulder heap, mesa with talus and horizontal strata), fractal skylines, gradients,
cracks, exfoliation sheets, gullies and aerial perspective. Karoo: mesas, koppies and a hazy
massif range; Bushveld: granite inselbergs and boulder koppies; Kalahari: an escarpment-like
range behind the dunes; Okavango: low Tsodilo-like hills in the haze.
(3) *Bakkie:* an old single-cab pickup with no badge: panel gaps and swage line, door, chrome
handle and keyhole, mirror, sky reflections in the glass, slatted grille, round headlight,
indicators, tail lights, chrome bumpers, roll bar, tie-down hooks, treaded tyres on steel rims,
dust, mud, dents and rust. The spare wheel (the secret, unchanged hit area) hangs on a bracket on
the outside of the bin by the tailgate, leaning back 6°, so its whole hit ellipse shows the wheel
(review of #49: drawn inside the bin, 58 % of the ellipse was plain panel).
(4) *Guns:* outlines first 0.42 × the near weight and tinted (superseded in round 2, see (8):
0.25 × and no dark contours at all), less wobble; metal with a rounded-surface
gradient, specular line and edge wear; finer wood grain with figure; finer checkering with a cut
border; slotted screws and a rear sling swivel; a slim Dubbelloop splinter fore-end and finer
engraving; a slim grooved pump slide; bark and glossy tubing on the Kettie. The Skiet-Skuur's gun
cards now show each gun: its idle frame is cropped from the decoded atlas page onto a small canvas
about the card's height (≈ 0.1–0.3 MB) and removed with the scene; no gun atlas goes to the GPU
for it. (The first version uploaded each gun's whole atlas, 4–16 MB each; the review of #49
measured the open shed after a Karoo hunt at 116.9 MB on the low tier, and past 128 MB after a
crate-gun hunt. Now: 101.0 MB with the shed open after a Karoo hunt, hunt end 99.8 MB,
`gfx3-texture-memory-shed.json`.) If the late group is still downloading, the Guns tab rebuilds
once when it lands. The HUD's ammo belt keeps the v1.1 ammo (D-032).
(5) *Birds:* the guineafowl rig gets a small bare head (first 0.66, final 0.48 × the head hitbox
radius, see (8); hitboxes are unchanged, so the headshot area is about 4× the visible head — a
generous target, left as it is: changing it is a sim change), red skin behind the ridged casque, a slim neck with a barred collar, a realistic eye,
a horn bill, slate plumage under a radial light, finer spots at near and mid (far keeps a few
large ones), barred wing feathers, feather scallops at near, slimmer scaled legs, and thinner
soft outlines (first near 0.55, mid 0.65, far 0.85; final 0.45 / 0.5 / 0.85 in a darker slate of
the bird's own shadow, see (8)). Variants and bosses follow. Every flyer part gets
a gradient, a feather-edge pattern and a soft outline. **The bird with no texture was the
kwêvoël on the mid plane** (a flat grey silhouette, 15.7 KB): it is now a textured grey
go-away-bird. The audit of every creature on every plane is `docs/art-preview/compare/gfx3-creatures.png`.
(6) *Budgets (measured):* first download 2 900.6 KB gzip web (v1.2: 2 664.9 KB; under 3 MB);
lazy chunks Bushveld 1 434.2, Kalahari 1 103.8, late 1 437.1, Okavango 1 531.0 KB (≤ 1.5 MB:
Okavango's hazed back tree line keeps the simple crown, its hills drop the strata kind, mid-plane
spots stay at spacing 21, scallops only at near, no brushing lines on gun metal — each one was
measured). Texture sizes are unchanged except the Windbuks atlas (2048 × 1024 → 2048 × 512), so
the low-tier peak cannot rise; per biome on the low tier (Pixel 7): Karoo 91.5, Bushveld 100.6,
Kalahari 93.0, Okavango 111.1 MB, identical to v1.2 (`gfx3-texture-memory-biomes.json`); the
Season Run peak stays 126.9 MB by construction. Bird readability: the plumage is `#2C303C`
(`#363B4A` was tried and lost ~15 % of the sky contrast), so the plain maps' median fly-over
contrast is at or above v1.2's and every map keeps ≥ 82 % of its plain map
(`tools/sky-contrast.ts`, `gfx3-sky-contrast.txt`). `art:interim` + `assets:pack` twice are
byte-identical (1 130 files).
(8) *Round 2 (the product owner's look review, 23 Oct: "still cartoony"):* guns lose every dark
contour (outlines 0.25 × the near weight; parts edged in a 22 % darker shade of their own
material, detail strokes in their material's shade), get dense fine grain with figure
bands, an edge-darkening stain and a varnish highlight, tubular blued barrels worn grey at the
edges with a long soft specular and a fine vent rib (less saturated steel), a pistol-grip curve,
comb line and rubber butt pad, a slim forged trigger guard, a slim grooved Pomp slide, and soft
contact shadows (receiver on wrist, barrels on fore-end). The guineafowl becomes a humped egg with
a head of ~1/6 body length kept inside the content head circle (`content/birds.json` unchanged;
crouch poses squash a little less so the body still covers its ellipse; `tools/art/fit.test.ts`
passes; head 0.48 × the hit radius, outlines 0.45 / 0.5 / 0.85 × the plane weight), slate edges,
no wing outline, a small round eye in a pale ring, ringed spots denser
toward the neck, slimmer grey-black legs. Koppies are rounded and lopsided, strata ridges are
cuestas, one landmark spire at most (Kalahari); Kalahari dunes get a sinuous crest, slip face,
graded slopes and ripples. Budgets after round 2 and the #49 review fixes: first download 2 914.6 KB gzip web (Poki
2 911.0, CrazyGames 2 911.1); lazy Bushveld 1 429.3, Kalahari 1 125.3, late 1 436.4, Okavango
1 516.5 KB; texture sizes unchanged;
sky contrast unchanged (plain maps 6.50–8.49, every map ≥ 82 % of its plain one); `art:interim` +
`assets:pack` twice byte-identical (1 130 files). Full-size crops: `gfx3-full-dubbelloop.png`,
`gfx3-full-tarentaal-near.png`.
(7) *Evidence:* `docs/art-preview/compare/gfx3-*.png` (before | after, desktop-chromium and
pixel7-landscape): `gfx3-farmhouse`, `gfx3-mountains-{karoo,bushveld,kalahari,okavango}`,
`gfx3-bakkie`, `gfx3-gun-<id>`, `gfx3-shed`, `gfx3-tarentaal-{near,mid,far}`, `gfx3-flyover`,
whole frames `gfx3-*-centre` / `gfx3-karoo-right`; sprite sheets `gfx3-creatures.png`,
`gfx3-tarentaal-sprites.png`, `gfx3-fixed-bird-kwevoel.png`. Recorded with
`tests/e2e/art-preview-gfx3.spec.ts` (on demand, `ART_PREVIEW=1 GFX3_VARIANT=before|after`).

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
