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
