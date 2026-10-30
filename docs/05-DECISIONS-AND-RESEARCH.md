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
that commit, because a push made with the workflow token starts no workflows (GitHub may list a
CI run "awaiting approval" for the bot's push; ignore it, the started quick lane is the real
one). Start it by
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

**D-036 v1.3 Long range: the Ver plane, sights and zoom, Die Twee-Twee (23 Oct 2026):** builds
the v1.3 part of the approved proposal (docs/08, 22 Oct). Rules now in GDD §5.2, §10.6 (and §10.1,
§11.5 with PR B) and Tech §3.3, §3.4, §3.10, §6.
(1) *Ver plane:* `scoring.planes.ver` = scale 0.10, base 50, scroll factor 0.22 (between the far
ridge 0.15 and the far veld 0.35, so its birds stand on a strip at the foot of the ridge, y
552–566), aim assist 6 px, line weight 1. Each biome has a `ver_veld` layer and Ver lanes; a map
shows them only with `ver: true` (`resolveMap` drops the layer otherwise), so every existing map,
replay and challenge link is unchanged. The guineafowl and its two rare variants may stand on it.
(2) *Reach:* `reachesVer` on a primary (rifles). Everything else falls short — the proposal says
"shotgun pellets and slingshot stones"; the air rifle too ("cannot reach Ver"), and crate guns,
by default. Implemented as "the Ver slice is not tested", not as a range limit, so props and
secrets behind the far plane behave exactly as before.
(3) *Hold to zoom, release to fire:* new commands `aimStart/aimMove/aimRelease/aimCancel/zoom`
rather than reusing `fireHold*` (they mean hold-to-fire for crate guns and Chilli Biltong, and old
replays must keep their meaning). The aim is in unzoomed screen px, so the zoom is a pure view and
a zoomed shot is device-independent (Tech §3.3). A press and release in the same tick is a hip
shot; a release during the bolt fires nothing (`aimEnded: blocked`) — defaulted: simplest and
readable; a queued shot would fire later than the player let go. Raising is allowed during a
reload; the release is then blocked.
(4) *Sights (content `weapons.json → sights`):* iron 1.5×/0.15 s, peep 2×/0.2 s, small scope
4×/0.3 s (the proposal's numbers); sway amplitudes 2.5 / 2 / 3.5 unzoomed px, loops of 2.6–3.2 s,
breath hold after 0.5 s for 3 s at ×0.25 / ×0.2 / ×0.15, then growing to ×2.2–2.5 over 1.5 s
(starting points; the balance sim decides with the Twee-Twee). Sway is drawn from its own stream
`sway` (two numbers per raise), so aiming never changes another system's randomness (unit test:
the same bird events with and without raising and cancelling the sight).
(5) *Zoom view:* the world layers (and the world's screen effects) are scaled around the aim
point; the gun, crosshair, sight picture and full-screen overlays are not. No second camera (the
proposal allowed one): one transform per layer costs nothing at 60 fps. The centre clamp keeps
the zoomed view inside the unzoomed screen, so layer culling and the 300 px bleed stay valid.
(6) *Pictures and Ver art:* sight pictures are placeholders drawn on canvases (no download) and
interim SVG art (tools/art/sights.ts, D-035 look: blued steel lit from the upper left, edges in a
darker shade of the material, the rear sight and peep out of focus, coated glass with a
reflection). Ver birds reuse the far atlas (the mid atlas once zoomed past the far frames' size)
scaled to 0.10 with a haze tint — no new bird atlases. The Ver strips and sight pictures form a new
lazy asset group `ver` that downloads in the background like `late` (279.6 KB gzip in PR A; 395.5 KB
with PR B's .22 gun atlas), so the first download (2 920.7 KB web in PR A; 2 940.7 KB gzip with PR B,
57.4 % of the 5 MB budget: the .22's sounds, rimfire ammo images and strings stay in the first
download, about 20 KB) and the Okavango chunk (1 516.6 KB) don't grow. Low-tier layer merges
never cross a plane layer (the far ridge stays behind Ver birds).
(7) *Memory fix (before the feature):* gun atlases were never released, so the title after a hunt
that showed both crate guns kept every rig. Leaving a hunt now drops every gun atlas but the
equipped gun's; it re-uploads on demand. Low tier, Pixel 7: title 124.5 → 100.5 MB, Skiet-Skuur
opened from it 125.0 → 101.0 MB (`tests/e2e/memory.spec.ts`, < 128 MB).
(8) *Golden replays:* re-recorded with content hash and log v5 only; all 31 event hashes, event
counts and scores are unchanged (no current map opens Ver and no current gun has a sight).
(9) *Die Twee-Twee (PR B):* 5 rounds, 1.2 s magazine, 0.4 s bolt (fire cooldown), one bullet, no
spread, hip spread 36 px, alert radius 180 ("fairly quiet": every shot can alert flocks near the
impact), wind sensitivity 0.6, ×1.5 on the Ver plane, reaches Ver. Unlock "Unlock Nog Verder
once" as a Notaboek challenge (new metric `bonusUnlocks` with a `bonus` filter; the bonus-map
unlock is recorded before the hunt log is applied, so the .22 is ready for the first Nog Verder
hunt). Interim art: a slim blued barrel, round receiver, bolt that lifts and draws back as the
case flicks out, small box magazine, walnut stock; .22 rimfire ammo; a sharp crack and the bolt
(synth fallbacks and interim recordings). The gun atlas joins the `ver` chunk (late is nearly full).
(10) *Sight unlocks (defaulted):* iron from the start; the peep for 10 Ver birds (Notaboek, new
metric `baggedVer`, reward type `sight`); the small scope at Bosveldjagter (rank). The Skiet-Skuur
fits a sight per rifle (save `loadout.sights`, `unlocks.sights`, defaults for older saves); the
hunt carries it (`ModeConfig.sight`), challenge links lend it (`s`), the admin page can pick any
sight that fits. Note: the order is not iron → peep → scope for most players. Bosveldjagter is an
early rank (a competent Classic hunt reaches it), while 10 Ver birds take a few Nog Verder hunts
with the iron sights, so the scope often arrives before the peep. That is acceptable: the scope is
slower to raise and sways more, so the peep stays useful on Nog Verder, and Die Verste needs the
scope anyway.
(11) *Nog Verder and Die Verste:* in every biome, after Verder in the unlock chain, both with
`ver: true` (table in GDD §11.5). **Die Verste needs a scoped rifle** (as the proposal says;
review of v1.3 reversed the first default, which let any gun in): the map has `needsScope: true`
and starts only when the Classic gun carries a sight whose picture is `scope` (the Skiet-Skuur
fit, or the admin page's). Otherwise the title shows its button greyed out with "Needs a rifle
with a scope" inside it (`title.needs_scope`, four languages) and a tap does nothing; the hunt
start checks the same rule. A player can unlock Die Verste before the scope (Bosveldjagter): the
unlock still lasts the day, and the button says what is missing. The title shows one button per
bonus map open today.
(12) *Bots:* `tools/rifleBot.ts` wraps every bot: with a rifle in hand a wanted shot becomes raise
→ track the nearest target's body (error σ ÷ zoom) → release (plinker and random as soon as the
sight is up; competent and aim wait for the breath to settle on far and Ver targets and hold off
for the wind; nobody can cancel the sway). All bots skip planes their gun can't reach (a
shotgun bot fired ~160 wasted shots at Ver birds per Nog Verder hunt before). Guns without
sights are unchanged, so every existing golden and balance number holds.
(13) *Balance (500 seeds, competent / plinker, `docs/balance/v1.3-long-range.md`):* unchanged guns
and maps are identical to main 5aa4f31 (Classic Dubbelloop 4 180 / 2 407, Monday Verder 3 649 /
1 684). Review of v1.3 found two bot faults that hid the .22's real level: the rifle bot lowered
its sight for anything that wasn't a bird (no crates, no secret parts), and a free shot held a
point while the sight came up, so a moving crate or part had gone. With the bot fixed, the .22 out-scored the
shotguns on Classic, so it was tuned: scoreMul near ×0.75, mid ×0.75 (far ×1, Ver ×1.5). Classic
now: iron 3 971 / 2 680, peep 3 849 / 2 648, scope 3 620 / 2 654, below Dubbelloop 4 180 and Pomp
4 306, and every M3 gate passes for every gun (the plinker is 27–33 % below the competent bot with
the .22). Bonus maps: the first pass (points ×0.75 / ×0.65) gave a scoped Nog Verder 5 040 and Die
Verste 5 476 at 100 seeds, a score farm for rank titles (bonus-map hunts count for ranks, §11.5),
over the 4 500 cap. So **Nog Verder pays ×0.6 and Die Verste ×0.46**: the scoped .22 then scores
about what a competent Classic hunt with the Dubbelloop does (worth the hardest unlocks, no
farm). Final, competent / plinker: Nog Verder Dubbelloop 2 789 / 1 121, Pomp 2 230 / 1 352,
Windbuks 804 / 489, Kettie 1 108 / 477, .22 iron 3 319 / 865, peep 3 852 / 781, scope 4 441 / 683;
Die Verste scoped .22 4 291 / 504 (the only gun it takes, (11)). Competent ≤ 4 500 on every map
and gun. The plinker struggles at range (12–22 % accuracy: it neither waits for the breath nor holds
off for the wind), which is the skill gap the proposal wants.
(14) *Golden replays (PR B):* re-recorded on purpose for the content (the .22, sight unlocks, the
two bonus maps), then for the bot fix and the tuning (13). The 31 existing event hashes, counts
and scores are unchanged. Three new ones: the .22 with iron sights on Nog Verder (competent,
pointer); the scoped .22 on Die Verste (aim bot, touch; Die Verste can't start with iron sights
any more); the Pomp on a Bushveld Nog Verder, whose pellets fall short of the Ver birds.
`golden:update` formats its output with Prettier, so lint passes as written.
(15) *Evidence (PR B):* zoomed replays: the two rifle goldens give their Node event hash in
desktop Chromium, the Pixel 7 profile and real WebKit (iPhone 14, CI), and a scoped .22 hunt
played in each replays to the same events in Node (`tests/e2e/longrange.spec.ts`). Low-tier
texture memory (Pixel 7): scoped Nog Verder 88.7 MB, the title after it 105.6 MB; after a
crate-gun hunt 120.6 / title 105.6 / Skiet-Skuur 106.2 MB (`memory.spec.ts`, all < 128). Frame
cost, medium tier, 4× CPU throttle, same-page A/B over three rounds (open view → scope raised,
layer art culled to the zoomed view): our CPU time per frame, median, Pixel 7 17.6 → 17.8 ms,
desktop 19.7 → 21.0 ms. The perf smoke (a plain Classic hunt) measured 19.4 ms average on the same
loaded box (load ≈ 9) at the same time, so the absolute figures are the machine's, not the scope's.
**Not fully evidenced:** the real frame time under the software rasterizer rises 30–40 % when
scoped (Pixel 7 475 → 655 ms, desktop 422 → 539 ms median): zooming into the horizon stretches the
thin far layers over the whole screen (more pixels to fill). On a GPU that fill is small, but this
server has no GPU, so "60 fps scoped on the medium tier" needs a run on a real medium-tier device
(follow-up; `ART_PREVIEW=1 PERF_STRICT=1` on a GPU machine). Sight pictures before | after on desktop, Pixel 7 and
iPhone 14 landscape (local Chromium emulation of the device): `docs/art-preview/compare/
v1.3-sight-{iron,peep,scope_small}-<project>.png`, the Skiet-Skuur `v1.3-shed-<project>.png`. CI perf shards (4-core runners, SwiftShader, 4× throttle): `perf.spec.ts` has a scoped phase,
the .22 with its scope on Nog Verder, with the same method and CPU budget as the smoke. CPU per
frame, p50 / p95: Pixel 7 open 7.3 / 14.9 ms, scoped 6.8 / 10.9; desktop open 8.1 / 15.2, scoped 8.0 /
12.3 (budget 16.7 average). Real frame time looked like 3.2× on Pixel 7 (131 → 417 ms) against
1.5× on desktop (270 → 408). That was a tier mismatch, not the scope: a 4-core runner puts the
coarse-pointer Pixel 7 profile on the low tier (render scale 0.67, no vignette, merged far
layers), and the scoped phase forced medium. It now uses the same auto tier as the smoke and both
reports print the tier (`PERF_CORES=4` reproduces CI's tier locally). The hunt camera has no
fixed-size draw while zoomed: no filter, mask or render texture beyond the tier's vignette, and
SightView's fills are clipped to the screen. The remaining ~1.5× is overdraw: zooming into the
horizon stretches the stacked far layers and haze bands over the whole screen.

**D-037 v1.3x Training ground (Skietbaan), admin only (24 Oct 2026):** on 23 Oct the product owner
asked for "a Training ground to test different guns, near and far". It is a playtest tool, so it
lives on the admin page (D-034) and nowhere else. Rules are in GDD §12.1 and Tech §8.3.
(1) *Gating:* it is reached only through the admin page's button, so only on builds whose
adapter has `adminPage` (web). The code is a lazy chunk whose `import()` the portal builds
compile out (guard on the raw `VITE_PLATFORM` flag, checked against the adapters by a unit test
and by `size-check`, which fails a portal build carrying range code). Why: the portals never get
a playtest tool, and players never download it.
(2) *Real sim:* the range is mode `range` in the sim, not a mock-up, so spread, sway, hip shots,
reach, occluding props and touch aim assist are what a hunt gives. It has no clock, score,
Frenzy, penalties or weather, because those add pressure and noise, not information. The
reserve is endless but reloads stay, because the reload rhythm is part of how a gun feels. A
crate gun is re-armed when spent. The targets are a deterministic spawn program for the chosen
plane. Paper spots, the standing-bird spot, fly-over heights, the range's half-width, flock size,
respawn delay and paper size are content (`modes.range`). The program is injected
(`SimConfig.rangeProgram`) so its code loads with the chunk.
(3) *Never touches the save:* unranked, with no unlocks, Notaboek, bests, Daily, rank or Bird Book
entries. No hunt log, admin-save write, ad cadence or analytics. Stats live in memory for the
page's session. The e2e test proves localStorage is byte-identical before and after a session.
(4) *Content hash:* `modes.range` is left out of `contentHash`, so adding or tuning the range
re-seeds no Daily and marks no challenge link or golden replay as stale. Range sessions are never
replay logs.
(5) *Stats:* kept per gun × distance × target, because a paper hit and a bird hit are different
questions. A shot is a hit when a pellet lands on the target, which is the same as a hunt's bag
at `pelletsToBag` 1. Groups are measured from each shot's own aim point (a rifle's before the
sway, so the sway shows in the group) over the newest 20 paper impacts: mean radius, extreme
spread, and the centre's offset. Percentages are of the guineafowl's body width at that distance
(2 × hitbox rx × plane scale), so "a group of 40 % at far" reads directly as "most shots would
hit".
(6) *Strings:* all through i18n keys in en/af/de/nl, in the range's own tables
(`src/i18n/range/`), so they ship with the chunk. `content:validate` checks them like `src/i18n`.
(7) *Size:* the first download grows by **1.1 KB gzip, 2 940.7 → 2 941.8 KB**. That is the range
hooks that must be in the main bundle: the sim's `range` mode branches and paper hit-test, the
`modes.range` content and schema, the HuntScene and HUD wiring, the admin button and its string.
The setup page, stats, paper drawing, spawn program and strings (8.7 KB gzip) are lazy. Without
moving `main.ts` off top-level await, Rolldown split the entry in two and added another 1.3 KB;
it now merges the shared modules back. Portal builds: 2 937.8 KB (Poki), 2 937.9 KB (CrazyGames),
no range code.
*Update 24 Oct (mixed targets, plates, hit feedback):* after trying the range, the product owner
asked for "more targets: an option to randomize different targets at different distances, from
close to far, so one can test. Even if it's way too far for the Kettie, all the targets must be
available. And the targets must react when hit", and confirmed "mixed targets at all distances".
(a) *Every distance for every gun:* Ver is no longer a disabled chip; a note says the shots fall
short. The reach rule is unchanged, so what you see is what a hunt does; those misses are
counted as "short", because "I missed" and "it can't get there" are different answers.
(b) *Mixed course:* All + Mixed sets out every kind on every plane at once, laid out from the
seed (`range` stream; Shuffle = a new seed), so a tester compares distances in one session.
A hit counts for the target it put the most pellets on, a miss for the target nearest the aim
point on screen: that is the target the player meant. (c) *Steel plates:* a hit you can hear
and see at any distance, the way real ranges confirm hits. (d) *Feedback* comes only from sim
events (`plateHit`, `rangeOutcome`), so it can never disagree with the stats. HIT markers are
sized in screen terms, not by the plane, so they read at Ver. All flashes are local and dimmed
under "reduce flashes". (e) *Size:* the plate art and sounds are interim (D-029) in a lazy
`range` asset group; the target-picking code lives in the lazy range program. The first
download grew by 868 bytes gzip (2 941.8 → 2 942.7 KB); the Skietbaan chunk is 13.8 KB gzip
(was 9.1 KB) plus 43.6 KB of range assets loaded with it.

**D-038 v1.4 part A: the scoped drawing cost (#56) and Die Langloop (24 Oct 2026):** the plan
is `docs/08-PROPOSAL-LONG-RANGE-AND-DAILY-MAPS.md` (the Langloop row and the ammo/crosshair table).
Rules are in GDD §10.1 and §10.6 and Tech §3.3–3.4.
(1) *#56, a zoomed view draws only what can show:* while a sight is up, ParallaxView skips layer
rows outside the zoomed view, outside a ring sight's square once it is fully up (the sight fill
and the ring cover the rest), and behind nearer opaque bands. The picture is unchanged (an e2e
test shoots a frozen scoped frame with the culling on and off). The result is the ratio: on the
CI Pixel 7 profile, scoped / open real frame time went from **1.33× to 0.78×** (desktop was 1.26×
before). The absolute times of those two runs (open hunt 177 → 88 ms, scoped .22 on Nog Verder
456 → 140 ms, open Nog Verder 344 → 179 ms) also include runner-to-runner variance: the open-view
path did not change, so its drop is not the fix's doing.
Why: on a phone the scope made the game slower exactly when the player needs it steady.
*For a later look:* a Ver map's open view still costs about **2× a plain map** (179 vs 88 ms on
the Pixel 7 profile), because it draws the extra Ver plane and its haze. It is not blocking, but
it is the next thing to profile.
(2) *Die Langloop:* a generic long-range rifle with a farm name, not a real model. 3 rounds,
1.5 s magazine change, 0.8 s bolt; hold to raise the scope, release to fire; reaches Ver.
Its numbers live in `content/weapons.json`. Why: the .22 is the quiet, patient rifle; the
Langloop is the one loud, precise shot at the furthest birds.
(3) *Variable scope:* 3× / 6× / 9× (`scope_var`), stepped with the wheel, + / − or the touch
buttons beside the ammo. Each step is a recorded `zoom` command with an integer step, so a zoomed
shot names the same world point on every screen and replays exactly. A step while the sight is
up applies at once and keeps the aim point. Higher steps sway more (`swayPerStep` 1.75); the
breath hold settles hardest (×0.12). The picture is the scope ring with a fine cross and range
marks below the centre.
(4) *Very loud:* every shot alerts every flock (`alertsAllFlocks`), once per flock per shot.
Why: it is the price of the reach and the ×2; after one shot the whole veld is awake, so a
player picks the bird before pressing. windSensitivity 0.5 uses the existing wind model.
(5) *Score:* ×2 on the Ver plane; near and mid ×0.65 (tuned from ×0.5,
`docs/balance/v1.4-langloop.md`). Classic competent 2 537, below the Dubbelloop (4 180), the
Pomp (4 306) and the .22 (3 620–3 971); Nog Verder 4 082 and Die Verste 3 976, under the 4 500
cap. The M3 "plinker ≥ 25 % below competent" check fails on Classic (9 %), because the loud shot
removes the competent player's flock play; the gun is not meant for plain maps.
*Trade-off, recorded on purpose:* on the Ver maps the scoped .22 still out-scores the Langloop
(Die Verste 4 291 vs 3 976; 4 114 at 9×) and bags more Ver birds per hunt (22.1 vs 18.3). The
Langloop cannot pass the .22 on Nog Verder without breaking the 4 500 cap (Ver ×2.3 gives
4 506). Its edge is ×2 per Ver bird and the steadier 9× picture for a person, which the bot does
not model. So docs/08's "the only Ver specialist" reads as "the Ver specialist by feel, not by
the bots' score". Making it win on Die Verste would mean lowering the .22's Ver numbers: a v1.3
balance change for its own PR, if the product owner wants it.
(6) *Unlock:* the first time the player unlocks Die Verste in any area (Notaboek challenge
`unlock_die_verste`, metric `bonusUnlocks` with `bonus: dieVerste`); it is saved through
`src/meta/storage.ts` like every other unlock. A save that already reached Die Verste before
v1.4 (a best on it, or unlocked today, in any area) counts too: its next hunt grants the
Langloop (`bonusReached` in `src/meta/progress.ts`, for one-off bonus-unlock challenges).
(7) *Look and sound:* ammo is brass rifle cartridges with pointed copper bullets, an empty case
when spent; the crosshair is a thin cross. The gun art, the cartridges and the shot sound are
interim (D-029) and listed so in `assets:audit`. The gun sits in the lazy Ver asset group like
the .22. The Skiet-Skuur lists it from content and now sizes its cards so both rifles' sight rows
fit; the Skietbaan lists it (its gun list comes from content).
(8) *Size:* the first download is **2 963.7 KB gzip** (2.89 MB), up 21 KB from 2 942.7 KB (the
shot sound in the common group, the cartridge sprites, the code); Poki 2 959.7 KB, CrazyGames
2 959.8 KB, no range code in either.

**D-039 v1.4 part B: the Namibië pack, the camelthorn and the angry weavers (24 Oct 2026):** the
plan is `docs/04-BUILD-PLAN.md` §v1.4 and `docs/08-PROPOSAL-LONG-RANGE-AND-DAILY-MAPS.md` ("The
Namibië pack"). Rules are in GDD §11 (Namibië) and Tech §3 / §5; the look is in the art bible §4.
(1) *The camelthorn and the family nest first, at a higher bar:* the product owner's 24 Oct note
("the graphics of that nest is terrible") led to `tools/art/camelthorn.ts`, which draws the trees
in layers. **Trees:** furrowed bark lit and shaded on every limb; zig-zag limbs with rounded forks
tapering into twigs; an umbrella crown of 30–60 feathery clumps with sky between them; grey
half-moon pods; dappled shade. **Nest:** a domed haystack with a lower second lobe, a soft ragged
change from the grey-brown roof to the golden sides, 2 000+ straws following the form, a hanging
fringe, and 10–20 entrance holes in the underside (3:1 foreshortened ovals in the lower quarter).
Limbs pass through the nest and clumps grow over its top. The plain variants (young, mature
umbrella, old half-dead) were approved at checkpoint 1, the nest tree after a second round.
**The product owner approved the camelthorn and the family nest on 24 Oct, 16:00.** Props can now
be drawn at 2× (`master: 2`): `assets:pack` keeps 2× on near and mid, packs far and Ver at 1×, and
writes a display `scale` into the asset index. The Kalahari's `weaver_camelthorn`,
`dead_camelthorn` and far-veld camelthorns use the new drawing; their content geometry is
unchanged. Why: these are the most looked-at props, and the Langloop's 3–9× scope magnifies them.
(2) *Angry weavers (rendering only):* the nest's existing `secretPenalty` event (−10, 2 s cooldown)
starts a burst of sociable weavers (`src/game/view/WeaverView.ts`): 8–15 on a near nest, 6–9 on
mid, fewer on far and Ver (`feel.json juice.weavers`). They pour out of the holes, swirl, a few
dart at the camera, and settle back after about 3.8 s; another hit while they are out keeps them
out. A nest is any penalty secret with the weavers' bark. Paths are a pure function of the prop
id, the event tick and the sim tick (`weaverFlight.ts`), so replays and `?holdAt` frames draw the
same birds. A pool caps the sprites at 36. The chatter goes through the AudioDirector. The two
sprite frames (≈1.6 KB each) and the sound (≈20 KB ogg) are tiny and shared, so they sit in the
common group, not the Kalahari chunk.
(3) *Namibië is an area pack outside the Season Run (Classic only):* the GDD lists it as a future
biome pack, and the Season Run is four fixed seasons with one biome each; it isn't in the Daily
rotation either. A new optional `biome.area` (`unlockBonus`, `quota`) marks it. It unlocks for good
once Die Verste is reached in any area, unlocked for the day or played (`src/meta/areas.ts`), and
is stored in a new save section `areas` (older saves get the default). There was no player-facing
area picker, so the title gains an **[Area: …]** button. It opens one card per Classic area: the
Karoo, and Namibië, locked with how to unlock it. Classic hunts, the title's best, today's map and
the bonus maps then follow the chosen area.
(4) *Who sees a locked area:* the Shed's bird book lists a locked area's secrets only once it is
unlocked (`unlockedBiomes()`). The Daily, challenge links (a shared hunt plays the same for anyone
who opens it), the admin page and the dev `?biome=` keep every playable biome. **The Skietbaan is
an admin-page tool on its own save; it offers every playable biome, like admin hunts. If the range
ever becomes player-facing, it must use `unlockedBiomes()`.**
(5) *The mirage (omen):* far and Ver birds shimmer sideways all hunt (12 px far, 5 px Ver, with
their hitboxes), on in the Tuesday and Thursday layouts and the bonus maps. It uses the Kalahari
haze code path, and the snapshot says when it is on. The renderer draws a few soft strips over the
pan that breathe on sim time (a ≥ 3 s cycle, never a flash). They are still with "reduce flashes"
or reduced motion, and fewer on the low tier. Their measured cost with the weavers out is
0.66 ms a frame at 4× throttle (Pixel 7 profile).
(6) *Built for long range:* every weekday layout opens the Ver plane, with a waterhole flock on it.
Since Namibië's own pacing has Ver flocks, a map without the Ver plane now drops them as well; the
season biomes have none, so their maps are unchanged. Balance (`docs/balance/v1.4-namibie.md`):
every gun and sight was measured on the seven weekday maps and on Saturday's three bonus maps.
- **The review found** the scoped .22 at 5 125–6 418 competent (over the 4 500 cap), and the peep
  and the Langloop over it on Friday, Saturday and Verder: the waterhole flock gives a rifle
  14–19 Ver birds a hunt.
- **Why not `pointsMul`:** a global cut big enough for the .22 would push the Dubbelloop out of
  the Classic band.
- **The fix:** a new map field, **`planePointsMul`** (per-plane multipliers on base points, the
  layout's × the bonus map's, on top of `pointsMul`). It cuts only the Ver plane: weekday Ver
  ×0.5–0.72 (Friday, which also has Ver fly-overs, and Saturday lowest) and Verder ×0.8.
- **Now** (200 seeds, every gun and sight, table in the balance report) every cell is under
  4 500. The scoped .22 is the strongest, just under the cap (Sunday 4 421, Tuesday 4 409), and
  the shotguns, which can't reach Ver, stay in the band. Saturday's Ver multiplier was lowered
  from ×0.55 to ×0.50 for a margin: the scoped .22 there went from 4 490 to 4 337 (re-measured at
  de2d746).
- **Bonus maps** are well under the cap: Saturday's Verder 4 234, Nog Verder 3 089, Die Verste
  2 324.
- The weekday layouts still score ×0.75 (dusk ×0.9). The area quota is 3 000.
- **Golden replays:** two Namibië cases were added. After the tuning only the Tuesday Langloop
  case changed its result (3 634 → 3 274); every other replay kept its events and score.
(7) *Size:* the first download is **3 000.3 KB gzip** (2.93 MB), up 37 KB from 2 963.7 KB (the
area code and strings, the content file, and the weaver sprites and chatter in the common group).
Poki 2 996.2 KB, CrazyGames 2 996.3 KB. The Namibië chunk is **1 445.1 KB gzip** and the Kalahari
1 498.5 KB, both under the 1.5 MB cap. Low-tier texture memory for a Kalahari hunt is 103.4 MB
(it was 93 MB; the budget is 128 MB).

**D-040 Skietbaan: clean steel gongs with lasting hit marks (24 Oct 2026):** the product owner
(24 Oct, ~17:45): "The metal gongs need to be clean. And when shot, the shot should be visible and
stay visible during the session. I want to see consistency." Rules: GDD §12.1; look: art bible
§5.1; code: Tech §8.3. Rendering only — no sim change. The golden replays were re-recorded once, only because
the content hash moved (`markSize` in weapons.json); every case kept its events and score.
(1) *What was wrong:* the plate art baked 14 random grey "old hit" pocks into the face, so it
looked dirty before the first shot and real hits could not be told from fake ones; a plate hit
only swung the plate (on the wall clock) and drew nothing; paper drew only the newest
`GROUP_IMPACTS = 20` holes, so older ones vanished mid-session; the frame was flat rectangles.
(2) *Clean plate:* `range/plate` is redrawn at 2× (disc radius 200 texture px), freshly painted
(an even off-white face, soft light from the upper left), a clean bevelled steel rim and clean
chains; `range/plate_frame` is new: camelthorn timber posts and crossbar at the v1.4 bar.
(3) *Marks from the sim's impacts:* one mark per `paperHit`/`plateHit`, at that point, sized by
the gun's `markSize` in `content/weapons.json` (`pellet` / `rifle` / `heavy`; unset: `pellet` for
a multi-pellet gun, else `rifle` — the Langloop and the Kettie say `heavy`) and the plane, shaped from the range session, shot id, tick
and pellet index (no per-frame random; detmath trig; the session number keeps marks from
repeating the shapes of an earlier session, whose shot ids and ticks restart). Plate marks are drawn in the plate's swinging frame; the swing
and the newest mark's 1.25 s glint run on the snapshot tick, so `?holdAt` holds them.
(4) *One rule for paper and steel:* every hit stays for the Skietbaan visit, per (area, course, distance,
kind, target index), through gun swaps, the scope and setup switches; leaving the Skietbaan clears
them, and Repaint / New paper / Fresh targets clears them on purpose. `GROUP_IMPACTS` now only
bounds the group-size stats.
- **Why a visit, not the page:** the product owner asked for "the session"; a visit is what a
  shooter sees as one session at the range, and coming back to fresh paint matches a real range.
- **Why the target index in the key:** the mixed course has several plates per plane; the index
  (by the sim's order) keeps each one's marks, and offsets over the radius keep marks on the face
  when a Shuffle moves the target.
- **Why the course in the key (review):** without it the mixed course's near plate shared marks
  with the near plate course, and "Fresh targets" on the mixed course wiped the plate course's
  marks. Each course (`mixed`, or the single course's target kind) now keeps its own.
(5) *Cost:* marks are baked into `DynamicTexture`s, ≤ 400 per target (past it the oldest 50 go
and the target re-bakes once), so the per-frame cost is one image per target however many hits.
Mipmaps can only be switched on game-wide in Phaser 4 (every power-of-two texture would change,
and every visual baseline), so each target keeps its own small chain: level 0 sized for the 9×
scope (≤ 1 024 px: a near plate is about 1:1 up to 4×, softer beyond; far and Ver stay sharp at 9×), each lower level a half-size box filter of the one above; the view shows the
level with ≥ 1 texel per screen pixel. Every level, the plate art and the frame filter LINEAR, also on the low
tier (whose antialias-off default is NEAREST).
*Review (25 Oct, v1.5 CI):* a switch never froze the page (the CI trace of the timed-out run
shows the mid course up in 0.8 s and no step over 7.5 s; the test simply outran its timeout, and
a third of its time went on serialising the whole test hook). The bake was still wasteful, so:
level 0 is the only texture made at once; a smaller level is made and rebuilt only when the zoom
shows it, once per bake (a hit was 7 render passes, now 1 + the level shown); only new marks are
drawn, at most `MARKS_PER_FRAME` (120) a frame, so a re-bake of 400 marks spreads over 4 frames.
`MarkSurface.test.ts` counts the work with a fake scene; the hook's `range.bake` (render passes
since the course started, slowest bake, bake textures alive) is checked after every switch in the
25-hits e2e test (≤ 8 passes, < 2 s, ≤ 7 textures). Same pixels: no screen changes.
(6) *Tests:* unit (`rangeMarks.test.ts`): marks at the impact points, deterministic shapes (one
pinned), 25 hits all stay, per-target keys, Repaint and leaving clear, the cap holds and keeps the
newest, target indices, the newest glint, the sim-time swing. e2e (`skietbaan.spec.ts`, CI): 25
air-rifle hits on a near plate → 25 marks baked; still 25 after a gun swap and after mid and back;
Repaint → 0; leaving and coming back → 0; a `?holdAt` frame with marks is the same twice.
Previews: `tests/e2e/art-preview-gongs.spec.ts` (ART_PREVIEW=1).
(7) *Size:* the first download is **3 000.7 KB gzip** (D-039 recorded 3 000.3 KB); nothing new
loads with it. The Skietbaan chunk is 17.1 KB gzip. The lazy `range` group's art is the plate at
67.8 KB gzip (was 31.3 KB at 1×) and the new frame at 20.1 KB. `assets:audit` lists both as
interim. No visual.spec screen shows the range, so no baselines change.

**D-041 v1.5 Languages: text, voice and names for every audience (25 Oct 2026):** the product
owner (24 Oct): "I want options to have game and voice either German, English, Afrikaans. And
text. Adjust also names accordingly, as the game needs to cater for multiple audiences."
Presentation only: no sim, content or replay change (content hash and golden replays unchanged).
(0) *What the code had:* text in en/af/de/nl through Settings → Language (Auto / English /
Afrikaans / Deutsch / Nederlands); every language showed the Afrikaans names; Oupa's lines were
text only — 39 trigger lines plus 5 secret barks (44 keys, not 43), with a voice volume already
in Settings and `voice/<key>` placeholders waiting for recordings.
(1) *Two settings* (GDD §18.3): **Text language** as before, Dutch kept; new **Voice language**
(Same as text / English / Afrikaans / Deutsch). Dutch text on "Same as text" speaks Afrikaans (the
closest; the hint says so). Captions, speech bubbles, share cards, the Daily share text and the
tally follow the text. Saved in `SettingsSchema` (`voiceLanguage`, `afrikaansNames`); an old save
loads them as "same" and off field by field, a damaged value falls back alone (tests in
save.test.ts) — no version bump needed, the field-level salvage is the migration.
(2) *Names* (`docs/i18n-names.md`, checked row by row against the language files by
names.test.ts): English, German and Dutch get their own names for guns, crate guns, bonus maps,
the Skiet-Skuur, Notaboek, Padstal, doppies, creatures, secrets, charms, ranks, seasons and the
whole-flock stamp; Afrikaans keeps its names; place names stay (Namibië → Namibia). Oupa's spoken
lines keep his Afrikaans exclamations. The **Afrikaans names** toggle (off by default) uses
`src/i18n/flavour/afNames.json`, the pre-v1.5 text of every renamed key (names and the sentences
that use them), in t() and tIn() (so share text follows it). A test scans every en/de string for
Afrikaans name words; exceptions are allow-listed with a reason (bark.*, fx.*, admin.*, and
"Windleser", which is good German). German Season Run: "Saisonjagd" (review). No new glyphs, so the
fonts are unchanged.
- **Why per-key flavour text, not name placeholders inside sentences:** it restores exactly what
  players saw before v1.5, including grammar around the name, with no new syntax in the strings.
(3) *Voice* (art bible §10.1): one pack per voice language, asset group `voice-<lang>`, loaded by
`src/game/audio/voicePack.ts` only for the chosen language, after the first gesture, never at
voice volume 0; the AudioDirector plays `voice/<lang>/<line>` (muted before the gesture, when
hidden, paused and in ads; music ducks under it; one line at a time; none over the tally count-up)
and keeps one language's buffers. Interim lines are offline TTS (`npm run audio:voice`), `origin:
interim` in assets:audit: **en** Kokoro-82M v1.0 (Apache-2.0) via kokoro-onnx (MIT), voices
bm_george 0.7 + am_fenrir 0.3; **af** the same voice reading eSpeak NG's Afrikaans phonemes (no
commercially usable Afrikaans neural model exists: MMS-TTS is CC BY-NC, XTTS is CPML, Piper has
none); **de** Thorsten-Voice/Kokoro (Apache-2.0, CC0 data) via kokoro (Apache-2.0). Rejected: Piper
voices fine-tuned from lessac (research licence) or ryan (CC BY-NC-SA), and every NC model.
No paid service, account or key; models download from public URLs, pinned by SHA-256. Oupa's
delivery: slower (0.90–0.94) and lower (−1.5 / −2 semitones), Afrikaans words in en/de lines read
with Afrikaans phonemes, IPA fixes for "Ouma" and the weavers' "tsk".
- **Why a separate pack per language and not in the first download:** the first download was
  3 000.7 KB of 3 072 KB; a pack is 0.6–0.8 MB.
*Review fixes:* the first gesture anywhere starts the pack, and a bark whose line is still
loading waits up to `audio.barkWaitMs` (1.5 s) and plays if it arrives in time. Files that failed
are retried on a later bark, at most 3 fetch rounds per language. `VoicePacks` keeps no bytes,
and the voice fetch skips finalLoader's page-long cache, so a voice language left behind leaves
nothing in memory.
(4) *Sizes* (`npm run size -- --strict`, gzip, the larger twin counted): first download **3 013.5 KB**
(+12.8 KB: the name strings, the flavour table and the voice code; no audio); Poki 3 009.4 KB,
CrazyGames 3 009.5 KB. Lazy voice groups: voice-en 614.2 KB, voice-af 666.5 KB, voice-de 803.6 KB
(Ogg alone: 575 / 613 / 794 KB). The service worker caches them on first use.
(5) *Tests:* unit — save fields, voiceLanguageFor, names scan + doc table + toggle + all four
tables complete, share text in de and with the toggle, AudioDirector per-language voice and
volume 0, voice packs per language and a file for every key in every language; e2e (CI,
languages.spec.ts) — Deutsch text shows German gun names in the Skiet-Skuur, Afrikaans voice with
English text fetches only the af pack and captions in English, voice volume 0 fetches nothing,
the toggle with English text shows the Afrikaans gun names. Previews:
`tests/e2e/art-preview-v15.spec.ts` (ART_PREVIEW=1). visual.spec screens change on purpose
(Settings, and any screen showing a renamed name): re-recorded in CI.
(6) *Open:* final human or premium voices are the product owner's decision (docs/06 §5 "How to
deliver final voice packs" — a delivered WAV replaces the interim line per key); German and Dutch
names want a native review (as D-026).

**D-042 v1.6 veld art pass: trees, shrubs, fruit and distant animals on every map (25 Oct
2026):** the product owner (24 Oct): better graphics for the terrain on all maps (trees, bushes,
grass, fruit), with the v1.4 camelthorn and family nest (D-039) as the bar; and (24 Oct, ~22:35
Namibia time) after testing the Skietbaan: the far animals "look like rough shapes, not animals"
(the giraffes). Still interim art (D-031) in the D-035 style, replaceable key by key. Rendering
only: no sim, content-rule or replay change (content hash and golden replays unchanged).
(1) *One plant kit* (`tools/art/flora.ts`): the camelthorn's limb and clump drawing (its helpers
exported from `camelthorn.ts`, its own output unchanged) grown into a tree engine with crown
shapes (umbrella, round, oval, spread, vase, irregular), leaf styles (feathery, leafy, butterfly)
and bark styles (furrowed, smooth with folds, flaky plates), plus pods, pompoms, thorns, round and
hanging fruit, layered veld shrubs (renosterbos, ganna, mopane scrub, driedoring) and seed-head
grass tufts. Far trees are a few ragged clumps with a lit cap and plain limbs (no dabs: they
cost bytes and can't be seen). Species in `tools/art/species.ts`; layer and prop contexts get
`tint()` (the plane's aerial haze for any colour).
(2) *Per biome* (bible §4.2, each species checked against "Biome-accurate flora/fauna"):
**Karoo** sweet thorns (pompoms, sickle pods, white thorns) on the mid plane and in far stands
instead of the lollipop trees, renosterbos/ganna mounds, golden seed-head tufts. **Bushveld** the
kremetart prop redrawn at 2× (pods on stalks; the secret pod and the perch kept), a marula with
fallen yellow fruit and winter mopane (olive and copper butterfly leaves) on the mid plane, far
mopane/marula/baobabs, mopane scrub, pale seed-head grass. **Okavango** the sausage-tree prop
redrawn (a bare branch at the content perch), jackalberries and ilala palms on the mid plane and
the far islands, finer papyrus, feathery reeds, pointed water lilies. **Kalahari** (the v1.4
camelthorns and nest kept) grey pods in the shade, shepherd's trees, Bushman grass with silvery
plumes, driedoring. **Namibië** quiver trees in yellow winter flower (props, and new ones on the
mid and far planes outside the waterhole sightline), !nara hummocks with melons on the dune edge.
To fit the mid-plane trees the interim mid layers start higher (docs/06 §4).
(3) *Distant animals* (`tools/art/fauna.ts`): one quadruped rig (sloping back, haunches, jointed
legs, neck and head by pose) with species proportions and markings (giraffe, springbok, gemsbok,
elephant, zebra, blue wildebeest, red lechwe) and the ostrich, in three poses (grazing, walking,
head up), a lit back, shaded belly and far legs, a soft ground shadow, no ink. They replace the
Bushveld giraffes, the Kalahari crest gemsbok and the Namibië waterhole drinkers, and new herds
stand on every far veld. They are drawn at their plane's size into the layer (no sprite scaling);
the scope still magnifies the layer texture as before.
(4) *Budgets* (`npm run size -- --strict`, gzip): first download **3 046.2 KB** (2.97 MB; was
3 014.1 KB; limit 3 MB = 3 072 KB); Poki 3 042.0 KB, CrazyGames 3 042.1 KB. Lazy biome chunks
(limit 1.5 MB = 1 536 KB): Bushveld 1 517.3 KB, Okavango 1 532.7 KB (was 1 516.5), Kalahari
1 483.9 KB (was 1 498.6), Namibië 1 427.4 KB (was 1 442.6). Paid for by smaller palettes on the
busy interim layers and big props (96–128 colours, `LayerPlan.colours` / `PropPlan.colours`,
`encodePng8(img, colours)`) and a 256-colour Okavango sky (no visible banding; was full colour,
D-031). Low-tier texture memory grows by the taller mid layers (about +3 to +4.5 MB a biome) and
the 2× baobab (about +5 MB in the Bushveld): measured by memory.spec / the v1.6 preview run (CI and
the supervisor), budget 128 MB.
- **Why smaller palettes and not fewer trees:** the brief says not to drop near-plane detail
  first; flat inked art loses almost nothing at 96–128 colours (checked on close-ups), and it
  frees ~8 % of each layer.
(5) *Previews:* `tests/e2e/art-preview-v16.spec.ts` (ART_PREVIEW=1, V16_VARIANT=before|after):
per biome the centre view, the main tree close up, the far plane at 2× and the far animals through
the Langloop's scope in the Skietbaan, on desktop, Pixel 7 and iPhone 14 landscape →
`docs/art-preview/compare/v16-veld-*.png`. visual.spec screens change on purpose (all seven show
the Karoo): title, settings-sound, settings-access, privacy, hunt, tally, padstal.
(6) *Names:* no new player-facing names (no new Bird Book entries). i18n: seven new UI keys in
each language for the art gate and the build stamp (`ui.loading_area`, `ui.art_failed`,
`ui.retry`, `ui.update_ready`, `ui.update_reload`, `stamp.art_ok`, `stamp.art_missing`; items 7
and 11), and `ui.update_dismiss` (item 13).
*Review round (25 Oct: the product owner's live test, the supervisor's look notes).* Rendering
only for the art; no sim, content-rule or replay change.
(7) *Placeholder art on the live build* (Kalahari Skietbaan, Brave; a hard reload fixed it).
Causes: the worker served the asset index cache-first, so after a deploy a running page held an
index whose lazy files the host no longer had; a slow index fetch left the whole session on
placeholders; failed files fell back silently. Fix: a bounded index retry, a per-biome art gate
(`missingFinal`, `ensureArt()` with `feel.assets.artRetries` retries, the index fetched again
each time), a veil with the area's name and then a Retry/Back message (a DOM panel at boot);
placeholders only with `?art=placeholder` on dev and test builds; index and HTML network first
in the worker, failed answers never cached, a Reload bar when a new deploy takes over; failed
files named in the console and the test hook; the debug overlay's art line. Nothing in the load
path reads pixels back or calls a third party (Brave Shields). Tech §10.
(8) *The scope's pale ring* was the procedural placeholder sight (a pale lens edge): the sight
pictures come with the late Ver group, and a placeholder drawn by the title's manifest was never
swapped. Rifle hunts and the Skietbaan now wait for the late group, and `upgrade()` replaces a
drawn sight placeholder whichever manifest drew it. The scope looks like main's (same file).
(9) *Windpomp* (bible §4.2 review round): the wheel always shows (20 sails, one every 18°, so the
secret's marks at 0°/90°/180°/270° each sit on a sail; redrawn from the owner's reference photos:
free sail tips, no outer rim, two rings across the sails, weathered and rusty, 6 sails lost in no
pattern, 1 bent, 1 torn, never a marked one), the tower at 2×, the head turns into the omen wind and the wheel
spins on sim time (`windpompMotion.ts`, unit-tested); the live secret keeps the sim's rotor
exactly. The Kalahari sign stands by a smaller windpomp; far windpomps have a bladed wheel.
(10) *Dassie and rocks, giraffes, far animals, dead tree, far trees, clouds*: bible §4.2 review
round. The far animals became 3× sprites (crisp in the scope, solid, haze as tint, never alpha);
the Bushveld granite palette went grey-ochre.
(11) *Build stamp*: `v1.6.0 · <sha> · <UTC time> · <area> · <day> · art ok` on the title, hunts and
the Skietbaan (web; bottom edge between the items row and the belt), in Settings and the pause
menu (every build), the admin page, the reports and the boot console; i18n for the area, day and
art status; unit and e2e tests; visual baselines use `?stamp=0`. The version is 1.6.0.
(12) *Budgets after the round* (`npm run size -- --strict`, gzip): first download **3 032.1 KB**
(2.96 MB of 3 MB); Poki 3 027.7 KB, CrazyGames 3 027.8 KB. Biome chunks: Bushveld 1 490.0,
Okavango 1 509.5, Kalahari 1 438.8, Namibië 1 373.5 KB (limit 1 536); Ver 537.8 KB. Paid for by
the gradient-only skies (the clouds are 5 KB sprites; every sky is a 256-colour palette) and
smaller palettes on busy layers. Low-tier texture memory, estimated from the texture sizes
(measured on CI by memory.spec): Karoo ≈ 98, Bushveld ≈ 113, Okavango ≈ 118, Kalahari ≈ 110 MB
(budget 128).
- **Why the far animals are sprites and not a sharper far layer:** a 3× far-veld layer would be
  9× its texture memory; the herds are a few small boxes.
(13) *PR #70 review fixes:* scoped hunts and the Skietbaan check and retry the Ver-group files
they need (`missingLate`, `neededLateMissing()`, `ensureArt()`), then Retry/Back; the Reload bar
shows only when the new worker serves another build, sits bottom centre with a ×, never in capture
mode; production builds treat an absent asset index as a failure (only dev/test builds and
`?art=placeholder` run without one). Tech §10.
(14) *Skietbaan "Fresh load" button (dev builds)* (product owner, 25 Oct: force a fresh map load
after a deploy without a manual hard refresh): on the setup page's header and the range bar (behind
More on phones), `PlatformAdapter.hardRefresh()` unregisters the game's service worker (its scope
only: Pages shares one origin), deletes the `tm-*` caches and reloads with `?fresh=<now>`, every
other parameter kept (`?admin=1` lands back on the admin page); the save is untouched and a
failing or hung step still reloads (`src/platform/freshLoad.ts`, unit-tested). Shown where
`freshLoadShown()`: the web build's admin page (dev server and GitHub Pages; the Skietbaan's own
gate), never in Poki/CrazyGames builds (no Skietbaan chunk; their `hardRefresh` is a plain
reload). The setup page and the bar also show the build line. Tech §10.

**D-043 v1.6b Reload power-ups: Blitslaai and Oupa Laai (25 Oct 2026):** the product owner
(25 Oct): "Another power-up that should exist in the game is an AUTO reload, and a fast reload."
Two crate power-ups (GDD §10.4), numbers in `content/powerups.json`.
(1) *Blitslaai* (`reloadTimeMul` 0.35, 12 s): every reload step is `round(ticks × 0.35)`, where
`ticks` already has Snelhand and the Boss Rule in it (they multiply), floored at
`reloadFloorMs` 150 ms and never longer than it was. It covers full-belt reloads, each per-shell
step, the Voorlaaier's ramrod and the Kettie's draw — the draw is the Kettie's reload for charms
too (D-025), so treating it the same keeps one rule. The Mielie-Masjien's fire interval and the
rifles' bolt are not reloads and stay. A reload step already running keeps the length it started
with (no mid-step rescaling: simpler and the HUD ring never jumps); a per-shell gun takes each new
round at the rate of the moment, so Blitslaai picked up or ending mid-reload changes the rounds
still to come. The floor applies to what Blitslaai shortens (alone or on top of Snelhand); Snelhand
alone never comes near it (the shortest, the Windbuks' 600 ms / 1.3, is 460 ms).
(2) *Oupa Laai* (`autoReload`, `idleTopUpMs` 600, 12 s): the tick the gun is empty (after the shot
resolves, the same tick) the reload starts by itself, no gesture; a per-shell gun also starts
topping up once 0.6 s have passed since its last shot, one round per reload step, until full. The
event is `reloadStarted` with `auto: true`; it fires the charm `reload` trigger like a manual
reload. **An auto reload can always be cut by a shot**, even on the Windbuks whose own reload
can't: otherwise the idle top-up would lock the player out of the shot they were lining up. It
checks every tick, so a belt left empty when Chilli Biltong or a crate weapon ends reloads at
once. Nothing happens while Chilli Biltong is active or a crate weapon is out.
(3) *Crates and Padstal:* power-ups keep 85 of the 100 crate weight: Blitslaai 18, Oupa Laai 18,
Chilli Biltong / Boeretroos / Bush Buckshot 25 → 14 each, Meerkat Spotter 10 → 7 (rounded to keep
the sum); Voorlaaier 8 and Mielie-Masjien 7 unchanged. Padstal price 2 each.
(4) *Determinism:* sim ticks only; replays carry the content hash, so logs from before this change
are refused by `verifyReplay` like after any content change. Golden replays re-recorded; the frozen
InputLog v3 Classic fixture still decodes and replays deterministically, its expected events
re-derived (a different crate roll changes an open-loop bot log's outcome).
(5) *Balance* (competent bot unless noted; `npx tsx tools/balance-sim.ts --seeds 500`):
Classic Dubbelloop competent mean 4 180 → **4 258** (+1.9 %), plinker 2 407 → 2 455, random 267 →
269; all three M3 gates pass. 200-seed cells, before → after: Kettie 4 713 → 4 782, Pomp 4 238 →
4 389, Windbuks 3 039 → 3 041; Namibië long-range cap (4 500, D-038/D-039) still holds — scoped
.22 Sunday 4 421 → 4 351, Tuesday 4 409 → 4 347, Thursday 4 378 → 4 352, Saturday 4 337 → 4 427;
Langloop Saturday 3 515 → 3 512. Season Run (`--run --seeds 500`), pass rates before → after,
every gate passes: Herfs 83.0 / 92.4 → 83.0 / 93.0 % (none / synergy), Winter 47.0 / 80.1 → 47.0 /
77.0 %, **Lente synergy 64.1 → 69.6 %** (target ~60 % ± 10: inside, but at the edge), Somer
0.0 / 34.6 → 0.0 / 34.9 %. Price 3 instead of 2 measured the same (69.5 %): the synergy bot buys a
consumable whenever it can, and the new ones are simply useful. If Lente drifts over in a later
change, the lever is Lente's quota, not these prices.
(7) *Look and feel* (screen only): the existing four power-ups have no icon (a text chip with a
timer bar, a plain crate); the two new ones keep that chip and add an icon at its left
(`ui/pu_blitslaai`: a shell with a lightning bolt; `ui/pu_oupa_laai`: Oupa's hand holding two
shells), shown for any power-up that has a `ui/pu_<id>` texture, a long name shrinking to fit
beside it. While Blitslaai runs, small lightning glints (`fx/bolt`, local sprites, never a flash;
steady and dimmer with "reduce flashes") hop along the rounds — two during a reload — and a
reload starts with a quick metallic **zip** (`sfx/zip`) instead of the gun's own reload-start
sound; the refill itself animates faster because it follows the sim's shorter reload. While Oupa
Laai runs, his hand sits just outside the belt's inner end, clear of the rounds (mirrored in
left-handed mode). His bark
`bark.oupa_laai` ("Ek laai vir jou, my kind!" / "I'll load for you, my kind!" / "Ich lade für
dich, mein Kind!" / nl "Ik laad wel voor je, m'n kind!") is the new trigger `oupaLaai`: the first
auto reload after an Oupa Laai pickup (the director gets the `autoReload` ids from content, so
another power-up's pickup doesn't re-arm it), held over the bark gap but dropped if Oupa Laai ends
first; voiced in en/af/de with the existing interim
TTS (`npm run audio:voice -- --only bark.oupa_laai`), Dutch text speaks Afrikaans as before. Names
(`docs/i18n-names.md`): Lightning Load / Blitzladung / Bliksemlading, Oupa Loads / Oupa lädt /
Oupa laadt; the Afrikaans-names toggle shows Blitslaai and Oupa Laai. The Padstal card of an item
with a description (`item.<id>.desc`, only these two so far) shows it under the kind. All art and
sound is interim (`origin: interim`, tools/art and tools/audio). No zip caption: captions are
per event and the event doesn't say Blitslaai is on; "[reloaded]" still shows.
(8) *Sizes* (`npm run size -- --strict`, gzip): first download **3 026.6 KB** (+13.1 KB over
v1.5's 3 013.5 KB: the two icons, the bolt, the zip and the code); voice-en 627.8 KB, voice-af
679.4 KB, voice-de 822.2 KB (each + one line). *Tests:* unit — `src/sim/reloadPowerups.test.ts`
(reload times with each, both, + Snelhand, the floor, the Kettie draw, the Voorlaaier ramrod and
the Mielie-Masjien interval, auto start on empty, no idle top-up on full-belt guns, per-shell idle
top-up and its cut, Chilli Biltong, refresh on pickup, expiry, a scripted Season replay and Classic
crate hunts replaying identically), weaponState, barks, AudioDirector, gunLook; e2e (CI) —
`tests/e2e/reload-powerups.spec.ts` picks up each crate with `?crate=` on every landscape profile:
chip icon, a reload in about a third of the time with glints, an empty belt reloading with no
gesture and Oupa's line.
(6) *Test fix:* `maps.test.ts` feeding-spot check used 4 seeds and a ×2 bar; the spot's own share
is unchanged (0.52) but the no-spot share swings with the bot's luck (main itself gave 1.79× on
seeds 21–28). Now 8 seeds and a ×1.7 bar.

**D-044 v1.7 meerkat colonies on the desert maps (25 Oct 2026):** the product owner (24 Oct):
"the desert stages should have small meerkat holes, and occasionally have them peek out and run
from one nest to the other. Be creative." (D-043 is v1.6b, PR #71.) Rules in GDD §11.2, the sim
in Tech §3.12, the look in the art bible §3.5. The Meerkat Spotter helper is kept; these are a
separate, living family.
(1) *Sim entities, not decoration.* Meerkats are deterministic non-target ground animals in the
sim (`src/sim/meerkats/colony.ts`), on their own stream `rng.stream('meerkats')`. They are
hit-testable as a new `HitExtra` kind and emit typed events (`colonySpawned`, `meerkatHit`,
`meerkatScold`, `meerkatsDived`, `meerkatAlarm`, `familiefoto`). The game layer only draws from the
snapshot and events, on sim ticks (held frames hold).
- **Why in the sim:** they stop pellets, cost points, react to shots and alert flocks, so replays,
  challenge links and the Daily must play them identically on every device.
(2) *Where.* `colonies` in the biome files: a layout's list replaces the biome's, and a bonus map
keeps its layout's. 1–2 per desert map on the near and mid planes; the plain biome (Season Run) has
one. Mid colonies sit on the ground line at y 812, below the flock lanes and above the near art's
edge (≈ 845). Near ones sit at y 966 (the review round, item 12), below the mid birds' band. `colonyChecks.ts` checks every
map: a near or mid plane, inside the layer, clear of props, secret parts and the other colony, and
never standing in front of the bird lanes or secrets of the planes behind.
(3) *Behaviours and reactions* (all numbers in `birds.json → meerkats`):
- hidden → peek → emerge → sit, sentinel (on the highest mound), forage, sunbathe (Monday's dawn
  light only), dash (1–4 in a file about one body length apart, `dash.gapBodyMul`, stopping
  halfway to look), or dive;
- spacing (review round 3): adults that sit, forage, sunbathe or stand keep at least
  `spacingBodyMul` (0.7) body widths (`bodyWidthPx`, 76 at the near plane) apart; a spot that is
  too close is nudged to the nearest clear one, counting where the others stand or will next stand;
  the sentinel's post is kept clear the same way (those by it step aside); a pup trails its mother
  by `pupGapPx` (56) and never closer than `pup.minGapBodyMul` (0.6) of her body width;
- a nearby shot sends the colony down; it comes back after 3–6 s, the scout first;
- the Langloop (`alertsAllFlocks`) sends every colony down;
- a raptor or the crop sprayer overhead sets off the sentinel's alarm, which also alerts the
  nearest guineafowl flock (threat source `meerkatAlarm`);
- a shot meerkat: −10 with the weaver nest's 2 s cooldown (per colony), a tumble and a scold.
- **Natural dives stay when the colony is calm.** "Calm" (2.5 s without a shot) only makes the
  hidden come out sooner and every peek end outside. An earlier draft also stopped dives when
  calm, so a colony nobody shot at never dived.
- **A meerkat hit counts as hitting a thing** (like a secret part): the shot is not a miss and the
  streak is kept, as with the weaver nest.
- **Namibië gains the crop sprayer** (0–1 per hunt) so its sentinels have something to bark at;
  no new flyer art was needed.
(4) *Familiefoto* (a secret: Bird Book, the Notaboek challenge `familiefoto`, the new metric
`familiefotos`). Once a hunt: hold fire 4 s after the first shot, with a colony within 600 px of
the screen centre and its whole family out. The family lines up facing the camera, a camera click
sounds, and it pays +25 through `secretTriggered` (propId `familiefoto`), so the secret count,
chain and charms see it. "On screen" uses a fixed half-width that fits 4:3, so the device's
viewport never enters the sim.
- **Why after the first shot:** with no shots at all the photo came 5 s into a hunt while the
  player was still looking round. "Holding fire" means pausing after you have started shooting.
(5) *Art and sound in a shared lazy group.* The sheet (`desert/meerkats`, 24 frames and 3 mounds,
interim at 2× in `tools/art/meerkats.ts`, 96-colour PNG8, 84 KB) and four sounds (chirp, alarm
bark, dig, camera click) are in a new asset group **`desert`**, loaded with either desert map.
- **Why a new group:** a key both deserts use would otherwise fall into the common group, the
  first download, which had 40 KB left. The Kalahari chunk had about 95 KB left.
- The meerkat placeholder drawing rides in the desert biome chunks (`BiomeArt.extraTextures`).
- On desert maps the Meerkat Spotter climbs out of a burrow mound.
- **Voice:** the scold ("We're not guineafowl!") and Oupa's Familiefoto line in en/af/de, with the
  v1.5 interim TTS (46 lines per language).
(6) *Balance* (`docs/balance/v1.7-meerkats.md`, `tools/meerkat-sweep.sh`): before/after on the
same build, the colonies removed by `--set`. Dubbelloop, 500 seeds, 20 maps: −0.9 % to +4.4 %.
Rifles against the 4 500 cap: Namibië under (max 4 442).
- **A finding from before v1.7:** the scoped .22 is over the cap on the Kalahari's Nog Verder and
  Die Verste: 4 612–5 578 before the colonies, slightly lower after. v1.3 checked the cap on the
  Karoo only. It is left for its own points change (for example a Kalahari bonus-map
  `planePointsMul`, as D-039 did for Namibië).
(7) *Golden replays* were re-recorded on purpose: the content hash changed for all 37. Only the 7
desert cases changed their events.
(8) *Sizes* (`npm run size -- --strict`, gzip): the first download is 3 041.7 KB (was 3 032.1 KB;
the colony code). The desert chunk is 100.7 KB. The Kalahari (1 438.8 KB) and Namibië (1 373.5 KB)
chunks are unchanged. A Kalahari hunt downloads its chunk plus the desert chunk, 1 539.5 KB in all.
Each is a chunk of its own under the 1 536 KB cap, as the brief suggested.
(9) *Tests:*
- sim tests for the rules (`src/sim/meerkats.test.ts`), the frame mapping, the meta and the
  captions;
- e2e for a hunt (`tests/e2e/meerkats.spec.ts`: dive after a shot, −10 and the scold, the
  Familiefoto);
- a Pixel 7 perf case (the colonies ≤ 1 ms a frame at 4× throttle);
- the screenshot spec `tests/e2e/art-preview-v17.spec.ts`. The e2e and screenshots run on CI and
  the supervisor's machine. For it an e2e-only page hold (`__TM_HOLD_AT__`) freezes the sim right
  after an event.
(10) *Names* (docs/i18n-names.md): Familiefoto (`secret.familiefoto`, `hud.familiefoto`,
`notaboek.familiefoto`), the sentinel (brandwag) in the alarm caption, and the scold, in
en/af/de/nl, with Afrikaans flavour names for the toggle.
*Review round (playtest-reviewer, 25 Oct).*
(11) *A shot pup was stuck* in its tumble for the rest of the hunt: it never scolded, bullets
passed through it, and its colony could never give the Familiefoto. A shot pup now tumbles, waits
in the hole and scolds like an adult, then follows its mother again. A sim test shoots a pup.
(12) *The "never hides birds" check ignored the mounds.* A sentinel stands on the highest mound,
so the meerkats' band now starts that much higher. Monday's near colonies failed it, so every
near colony moved from y 950 to 966, below the mid birds' band even on a 28 px mound. The test is
`colonyChecks.test.ts`.
(13) *Numbers out of the code:* the pup's start and emerge delays, how far its mother may get
before it follows, and the dive's run speed are now `meerkats.pup` and `meerkats.diveRunMul`, at
the same values.
(14) *e2e:* the scold test picks its meerkat and taps it in one page call, retrying a miss.
- **Golden replays** re-recorded: only Die Verste (classic-74) and Namibië Thursday (classic-76)
  changed their events (meerkat positions); their scores are the same.
- **Balance** was not re-swept for a 16 px shift of the near colonies.
*Look round (the supervisor's screenshots, 25 Oct; #70 merged into main, then main into this
branch).*
(15) *The meerkats looked flat* (grey-brown figures, a plain face), below the v1.4/v1.6 bar. The
sheet was redrawn from one rig (`tools/art/meerkats.ts`):
- a torso grown along a spine, with back and belly widths;
- a cream belly and throat clearly lighter than the back, which is tan to grey-brown with faint
  bands and fine fur strokes;
- light from the upper left, a shaded side, haunches, and tapered legs and tail (black tip);
- the dark eye mask with a small bright eye, a crescent ear and a dark nose;
- the sentinel chin up, its paws together at the belly;
- the pup smaller and fluffier, with a bigger head;
- the run low and stretched, tail up.
(16) *Burrows:* each mound has 2–3 dark oval holes with an inner shadow and a lit front lip, fresh
lighter sand fanned out from each hole, scratch marks and tiny tracks.
(17) *Clear of the HUD:* `colonyHud.test.ts` checks every colony's screen rect against the
gadget, item slots, belt, reload prompt, timer, Frenzy and score. It runs at every desert map's
opening view, on desktop 16:9, the Pixel 7 and the iPhone 14 (its insets), right- and
left-handed.
- **Near colonies always sit in the bottom HUD row's band,** so they now open in the middle of the
  view. Three Kalahari mid colonies (Tuesday, Wednesday, Saturday) moved toward the centre,
  because the iPhone's reload prompt sits higher.
- **Why only the opening view:** the near plane pans 1:1, so a colony can pass under a corner
  later, as pop-up birds do.
- **Balance**, re-measured on the moved maps: −0.6 % to +2.5 % against no colonies.
- **Golden replays:** only classic-74 and classic-76 changed their events.
(18) *What one hunt downloads:* a Kalahari hunt loads its chunk and the desert chunk. The sheet is
now a 48-colour PNG8 (79 KB; it keeps the shading), so the desert chunk is 96.1 KB, and Kalahari +
desert is **1 534.9 KB** (cap 1 536). Namibië + desert is 1 469.6 KB. `npm run size -- --strict`
now checks each colony biome's chunk plus the desert chunk.
*Look round 2 (the product owner, 25 Oct ~19:47: "a little bit more hairy … a tick more furry,
and a little bit nicer faces").*
(20) *Fur:* every figure is drawn as fur.
- The smooth ink outline is replaced by a broken edge of short tufts that lean the way the fur
  grows.
- Curved strokes in three tones follow each part's form; the cheeks are fluffy, and the pup is
  rounder and fluffier.
- A body's parts are drawn in passes (edges, then fills, then fur), so the haunch blends into
  the body.
- The arms have volume and small dark claws.
(21) *Faces:* a teardrop mask sloping to the nose (not round goggles), a small almond eye with a
white catch-light, a pale brow, a short tapering muzzle with a small nose and a mouth line, low
crescent ears and fuller cheeks, in the front and side views.
(22) *Poses:*
- The Familiefoto pose is shorter than the side-view sentinel, with a shaded cream belly,
  haunches, hind feet and the tail on the sand.
- The runs bend at the knee (reached out, gathered, pushing, in flight).
(23) *Budget:*
- The left-looking peek and stand are now the right-looking frames mirrored by the view
  (`MIRRORED_FRAMES`, two cells freed).
- The sheet is 32 colours (92 KB; no visible loss against 48).
- The Kalahari's interim near, foreground and mid layers went from 128 to 96, 96 and 112 colours,
  with no visible banding.
- Kalahari 1 426.2 KB + desert 108.7 KB = **1 534.9 KB**. The first download is 3 055.0 KB after
  merging v1.6b; Poki 3 049.7, CrazyGames 3 049.9 KB.
- Version 1.7.0.
(19) *Screenshot spec:* seed 33 (Monday's near colony has a pup) with a new dev/e2e-only
`?birds=0` (no flocks, pop-ups, fly-over spawns, events or crates), so the meerkats are the
subject. The Familiefoto shows a clear row, the dash is held mid-run, and there is a
sentinel-and-pup close-up. Every close-up shows each meerkat at least 150 px tall.

**D-045 Project overview page in the admin (25 Oct 2026):** the product owner asked: "add to the
admin page a process log page, where the whole build file with all the images is present, but on
top it should have all the stuff that has been ticked off, all the stuff that we have done and all
the stuff that is still outstanding, with date and time and which build one can expect it, so that
I don't have to keep on asking … what questions are unresolved, stuff I need to give feedback on or
make decisions on, what has been built, what will be built, possible suggestions, and also the
history page which shows the total build process. And as you publish photos and tests, that all
gets added there." Rules in Tech §8.4; the data format in `docs/project/README.md`.
(1) *One data file on its own branch:* the supervisor (Claude) publishes `project.json` on the git
branch `project-log`, read from `raw.githubusercontent.com` (CORS `*`). Why: the status changes
many times a day; a branch without CI updates in seconds without a build, a deploy or a review, and
the test build never has to change for news to show. The page adds `?t=<now>` (the CDN still
caches ~5 min). `?projectData=` points the page at another copy for tests and previews; on
`raw.githubusercontent.com` only the ShadowNam account's files, since that host serves anyone's
and a crafted link must not show the product owner a fake list of decisions.
(2) *Schema in code, forgiving where it costs nothing:* `src/meta/projectLog.ts` (Zod, types by
`z.infer`) needs `schema: 1`, the time, the summary, the current build, the jobs and the needs-you
items; the other lists may be left out (read as empty) and unknown fields are ignored, so a
hand-edited file with a missing glossary still shows the status. A broken file shows "could not
be read" and the first Zod issue, so whoever edits it sees what to fix.
(3) *Allowlist:* the file comes from outside the build, so every string goes in as text, never
HTML, and links and pictures are kept only when https on `github.com`, `raw.githubusercontent.com`,
`shadownam.github.io` or `claude.ai` (the hosts the team publishes to); anything else is dropped
silently. Links open in a new tab without opener or referrer.
(4) *Gating:* exactly where the Skietbaan's Fresh load is (`freshLoadShown()`: the web build's
admin page on the dev server and GitHub Pages), never in Poki or CrazyGames builds: the page is a
lazy chunk behind the raw `VITE_PLATFORM` guard (D-037), checked by a unit test and `size-check`.
Players never download it; the first download grew by 0.5 KB gzip (the button, its string, the
guard), the chunk is 15.4 KB gzip.
(5) *Offline copy:* the last log that loaded is kept on the device (through `storage.ts`, which may
throw) and shown, marked "Offline copy from <time>", when a load fails, so a weak connection in the
veld still shows the last status.
(6) *Namibia time:* every time is shown in `Africa/Windhoek` (UTC+2), labelled once in the header;
the file stays in UTC. Chrome strings are in en/af/de/nl in the page's own lazy tables
(`src/i18n/project/`); the log's text is English data.
(7) *Tests:* `projectLog.test.ts` (schema, allowlist, time formatting, selections and orders, the
offline copy); `project-overview.spec.ts` on desktop, Pixel 7 and iPhone 14 (landscape; portrait
also passes) with the log and pictures served by `page.route` (no network), screenshots in
`docs/art-preview/compare/project-overview-*.png`. No sim, content or replay change.

**D-046 v1.7b Power-ups explained, and an Oupa switch (25 Oct 2026):** the product owner (25 Oct,
~20:20 Namibia time): "In the gun shed there needs to be a section that explains, with pictures,
all the power-ups the game has, and what each does. When one collects these power-ups, one is very
unsure what they actually do. The game indicates too little what is actually happening." And: "Add
under Settings the option to have the grandfather mode enabled or not. Some people would be
irritated by always having a grandfather give his input." What the power-ups do and their numbers
are unchanged (GDD §10.4, §13.7, §18.3).
(1) *Icons* for all six power-ups and both crate guns (art bible §5): interim art at 2× in the
D-035 look, 128 px textures (Blitslaai and Oupa Laai moved up from 64 px so all eight match and
stay crisp on the Gun Shed's 148 px cards). 26 KB together (PNG-8): small enough for the first
download, so the HUD, the crates and the shed never wait for a lazy group.
(2) *The crate shows its contents, rolled when it drops.* Options were a "?" (contents secret until
shot) or the real item. The real item answers the brief directly, and choosing to shoot a crate or
not is a small, fair decision. The roll moved from `openCrate` to `spawnCrate`, on the same
`crates` stream right after the crate's position, so a hunt whose crates are each shot before the
next drops draws exactly the same numbers; only an unshot crate changes the next one's roll.
`CrateView.item` and `crateSpawned.item` carry it. Golden replays re-recorded: every event hash
changes (the new field); 36 of 37 keep score and event count, `daily-65-bushveld-wed-aim-touch` goes
16 966 → 15 886 (a crate it never shot). The frozen v3 Classic fixture's hash is re-derived (score
and count unchanged). The content hash doesn't change (and no sim version is folded into it:
that would re-seed the Daily), so 1.7.0 replays and challenge links still load and verify their
hash; one that left a crate unshot now replays to different events, as the golden case shows.
(3) *Words built from content.* `src/game/ui/powerupGuide.ts` builds each sentence from
`powerups.json` (durations, shells, multipliers, `idleTopUpMs`, Padstal price), `weapons.json`
(crate guns' shots, pellets, ramrod, duration) and `run.json` (rental price); i18n strings hold
only placeholders. A unit test changes every number in content and checks each card follows it.
50 % reads "half speed" (`guide.half`), other factors "37 % speed". Decimals use a comma in af, de
and nl. The Padstal card now shows the same short line for every item; v1.6b's hard-coded
`item.<id>.desc` strings ("35 %") are gone.
(4) *Gun Shed → Power-ups tab*: eight cards (icon, name, sentence, how to get it, tip); not yet
found = darker card with "Not found yet", still fully explained. The list scrolls by drag, wheel
or ↑/↓; it is drawn by a second camera whose viewport is the list window (clipping that works on
WebGL and Canvas without masks); each card is a menu item whose rect is its visible part.
(5) *Pickup card* (top centre under the pause button, `HudLayout.pickup`; never over the
crosshair or the flock): about 2 s, or 3.5 s with the full sentence and "New!" the first time on a
save (`powerups.seen`, a new save section, no migration). It is timed on sim ticks, so a held
frame holds it. A banner arriving while it is up drops below it. It replaces the old "CRATE:
{item}" banner (and its "Hold to fire" hint: the Mielie-Masjien's line says it).
(6) *Oupa's first word on each power-up* (`bark.pu.<id>`, en/af/de/nl) is spoken when its card
first shows: `BarkDirector.claim` speaks now and claims the 6 s gap, like a secret's bark (the card
is up only briefly). These eight lines have text only for now: the interim TTS models aren't on
this build server. Voicing them means adding them to `voicedLines` (src/game/audio/voiceLines.ts,
which the asset catalogue and `npm run audio:voice` read) in the same change as the recordings, so
the audit never lists a voice key without files. Until then the bubble shows and he says nothing.
The lines name the item through `{item}` (the HUD fills it, so the Afrikaans-names toggle reaches
them); a recording would need one take per name the toggle can show.
(7) *While it runs*: the chip adds the seconds (or shells) left at its right; the last 2 s blink
on sim time (steady red with "reduce flashes"); `powerEnd` (a descending, softer pickup chime)
plays when a power-up ends or a crate gun is used up. Looks, all local: Boeretroos — warm edge
gradients on 16 % of each side (fade in/out over 0.5 s; the centre stays clear; not a flash) and
effects played at 0.72 rate on buffer sources (music and voice untouched); Chilli Biltong — a ∞
over the belt and 4 chilli sparks per shot (× the tier's particle scale, dimmed by reduce flashes);
Bush Buckshot — a warm ring just outside the widened crosshair. Numbers in
`feel.json → hud.powerups`. The GDD's old "screen edges glow red" for Chilli Biltong became the ∞
and sparks: a glowing edge was Boeretroos' cue now, and two power-ups with screen-edge looks
would read alike.
(8) *Captions* name the item: `caption.pu.<id>` on pickup ("[Farm Coffee: everything slows]") and
`caption.pu_end` at the end, with `{item}` filled by the HUD (the crate gun's end names the gun it
was). *Tally:* a "Power-ups used" row (icons and names, icons only if the names don't fit) on
Classic and Daily tallies; icons in the corner of the Season Run tally.
(9) *Settings → Oupa's comments: On / Text only / Off* (`settings.oupa`, default On). Two gates:
`sayBark` shows nothing when Off and voices only when On; the AudioDirector refuses his voice
unless On (covering secret barks and a line still loading). Off also drops a secret's bark text
from its banner. Instructions stay: the lesson's prompts and the pickup card are plain HUD text;
Oupa Laai keeps his hand on the belt. Sound & game's left column has seven rows now, so its rows
are 68 px (≥ 64 px). The pause menu opens the same Settings scene.
(10) *Tests:* unit — `powerupGuide.test.ts` (sentences follow every content number, all languages
filled, how-to lines, decimals), `powerupsSeen.test.ts` (first-pickup memory, old saves),
`oupaMode.test.ts` (three states, prefs, repair), `crateContents.test.ts` (rolled at spawn, the
shown item is the one given), captions and AudioDirector cases. e2e (CI, landscape profiles) —
`tests/e2e/powerup-guide.spec.ts`: eight cards with icons and scrolling; a `?crate=boeretroos`
pickup's crate icon, card text and countdown; Oupa Off and Text only; the Settings switch.
Screenshots — `tests/e2e/art-preview-v17b.spec.ts` (ART_PREVIEW=1). The in-page hold hook
(`__TM_HOLD_AT__`) is v1.7's, ported unchanged for that spec.
(11) *Sizes* (`npm run size -- --strict`, gzip, after merging v1.7). The v1.x first-download
line is **3 MB = 3 072 KB** (docs/04, docs/06). With the icons in the first download it was
3 094.7 KB, over the line, so the eight `ui/pu_*` icons (~26 KB, PNG-8) moved to the **late group**
(sidecar `group: "late"`; the packer accepts it for sprites): the first crate drops at 22 % of a
hunt at the earliest. Until the late group lands, the procedural placeholders draw; then
`upgradePowerupIcons()` swaps them in and bumps an epoch the HUD chips, Oupa's hand, the pickup
card and the crate tags watch to re-set their textures, and the Gun Shed's Power-ups tab redraws.
First download now: web **3 069.0 KB**, Poki **3 068.8 KB**, CrazyGames **3 068.8 KB** (59.9 % of
the 5 MB budget, 3 KB under the 3 MB line). The `powerEnd` recording stays in the first download:
sounds load beside boot whatever their group (only images and atlases wait for the late queue),
so moving it would change the report, not what downloads; the synth plays it if it's late.
Voice packs carry no new lines.
(12) *Review* (playtest-reviewer): a first pickup's full sentence could overflow the card on 4:3
or in German/Dutch/Afrikaans — the line now shrinks (to 72 %) and wraps wider until it fits a
260 px slot sized clear of the left HUD column, and the hook reports where the text ends; Oupa's
first-pickup line claims the gap before the frame's pick, so a held line (boss, Stampede, quota,
Oupa Laai) waits instead of being lost; the Gun Shed list draws its own focus ring and ignores drag
and wheel while Settings covers it; the Season Run tally's row moved clear of its title; the
chip's "s" goes through i18n. Visual baselines that change: `settings-sound` (the new row, 68 px
rows) and `padstal` (every offer shows its line).
(13) *Second review* (independent, at 97b38fc): the first download over 3 MB (11); the pickup card
can sit over the crosshair or a flushed flock — it now fades to 30 % while the crosshair is over it
or within 80 px (`hudLayout.pickupAlpha`, unit-tested with crosshair positions); the Skietbaan arms
a chosen crate gun at tick 0, which showed a card and marked the gun found — range sessions skip
pickups; a caption could read "[{item} wears off]" after captions were turned on mid-hunt — the HUD
follows the crate gun either way and an end line with no item is dropped; Oupa's switch silenced
voices that aren't his (the weavers, the frog, the meerkats) — `isOupaLine()` exempts them, and
the voice pack keeps loading for them; the e2e no-voice checks wait for the voice pack (and an On
control hears the greeting); a unit test keeps digits out of the power-up strings; Oupa's
first-pickup lines name the item through `{item}`; the CHANGELOG no longer claims 1.7.0 replays
are refused. Owner's screenshots of 079a570: the crate icon is twice as big, opaque on a cream disc
with a dark ring, above the scenery, on the canopy and the box front (the canopy patch and the
stencil are gone); the floating item name on a crate is gone (the card says it); the Meerkat
Spotter and Voorlaaier icons were redrawn stockier. The Settings screen's two build stamps (its
own and the title's corner stamp under it) were already on main and are left as they are.
(14) *A freeze after a crate pickup* (CI, Pixel 7 and desktop, after (11)): when the late group
landed mid-hunt, `AssetManifest.upgrade()` removed the placeholder icons while a HUD chip, a crate
tag or the pickup card still drew them, and the next render read a destroyed frame ("null
sourceSize"), stopping the hunt. `upgrade()` now renames a placeholder out of the way
(`<key>#placeholder-<n>`, a few KB that stay) and adds the delivered image under the key, so
anything still drawing the old canvas stays valid until its view sets the key again (unit test in
`AssetManifest.test.ts`). Supervisor screenshots of the final build (45, desktop, Pixel 7 and
iPhone 14) are in `docs/art-preview/compare/v17b-*`.

**D-047 v1.7c fruit swing and drop when shot (26 Oct 2026):** the product owner (25 Oct, testing
the sausage tree in the Okavango): "When shooting these fruits, make them swing or drop down."
Rules in Tech §5 (fruit) and art bible §4.2 (fruit as sprites); tunables `feel.json juice.fruit`.
(1) *View-only:* fruit are not targets. `FruitView` reads the sim's `pelletImpact` events, maps
each pellet onto the fruit's layer (`planeX = (cx − 960) × scrollFactor + 960 + dx`) and matches it
against the fruit's frame; the sim has no fruit state, no hit test changed, nothing scores, and the
golden replays are identical. A pellet the sim stopped in front of the fruit (a bird on its layer
or a nearer one, a nearer prop, a crate, a meerkat) never reaches it. A pellet that flew past the
far plane (or stopped at or behind it) carries the wind drift in its event (7–23 px with the
Dubbelloop, up to ~75 px with the Windbuks on Verder): on layers in front of the far plane the view
takes the shot's drift back off (driftPxAtFar × strength × dir × the gun's wind sensitivity × the
charms' windDriftMul, the sim's own sum), as the sim's mid/near hit test never drifts. Each shot
is mapped with the camera the sim resolved its tick with (`HuntRunner.cameraAt`: on a frame of
several ticks while panning, the frame's last camera is up to ~23 px off on the near plane).
(2) *Motion on sim ticks:* every pose is a pure function of the hits' ticks and the sim tick
(`fruitMotion.ts`): a damped pendulum per hit (0.9 Hz, down to 5 % in 2.2 s; hits add up), so
replays and held frames (`?holdAt`) draw the same. One pellet swings it 18°, each extra pellet
+6° (cap 34°); a near miss (within 30 px of the frame) swings it 0.4×. Hanging and standing fruit
snap off on 3 pellets in one shot, or a hit while the swing is still above 30 % of a one-pellet
swing (so "hit it, then hit it again"); near misses never drop it. A dropped fruit falls at
2,400 px/s², bounces twice (0.32 of its speed), rolls 16 px, lies across its fall, takes no more
hits, never comes back in that hunt and fades after 30 s. Fruit on the ground (marula, !nara
melons, fallen camelthorn pods) rock 9° and roll 4 px per hit, never drop. Reduce motion: 0.4×
swings, no bounce. A small leaf puff on a hit and a dust puff on landing (local sprites scaled on
sim time; no flashes). Sounds: a soft thock on a hit and a thud on landing through
`AudioDirector.playExtra` (`sfx/fruit_thock`, `sfx/fruit_thud`), synths until recordings are
delivered: no download.
(3) *Separate sprites:* the species code hands each reacting fruit, pod or flower to
`tools/art/fruitSink.ts`; `art:interim` collects them from the mid, near and foreground layers and
from every prop (the far planes keep theirs baked), renders each on its own and packs them into one
512 × 512 png8 sheet per biome (`fruit/<biome>`, interim origin), with
`src/game/view/fruit/spots/fruit-<biome>.json` saying where each sits (layer or prop px, its ground line,
its frame and pivot). The random streams are used exactly as before, so the rest of every layer
and prop is unchanged. 282 fruit: Karoo 20 sweet-thorn pods; Bushveld 24 marula fruit and 5 baobab
pods (the secret pod stays prop art); Okavango 6 sausages and 3 ilala clusters; Kalahari 48
camelthorn pods; Namibië 92 quiver flower spikes, 17 !nara melons and 67 camelthorn pods. The
jackalberry draws fruit only at the near detail, which no map uses, so it has none to split.
(4) *Sizes (gzip):* nothing new in the first download (3,069.4 KB with v1.7b, +0.4 KB: the lazy
import and the tunables, offset by the Karoo mid layer losing its pods). `FruitView` (5.0 KB) and
each map's spots table (`fruit-<biome>`) are small lazy chunks fetched when a hunt starts. Sheets
(after the look round, (6)): Okavango 21.0 KB, Bushveld 9.3 KB and Namibië 31.8 KB in their biome
chunks (Okavango 1,529.1, Bushveld 1,499.1, Namibië + desert 1,508.3 of 1,536 KB); the Karoo's
(2.7 KB, no room in the first download) and the Kalahari's (5.8 KB: the Kalahari and desert chunks
are at 1,534.5 KB together) load with the late group (1,471.3 KB), so their fruit show once it has
arrived (the first Karoo hunt after a cold start may begin without them; `FruitView` swaps the
sheet in when it lands, and until then nothing reacts or sounds).
(5) *Tests:* `fruitMotion.test.ts` and `fruitHits.test.ts` (swing, sides, near misses, drop
rules, fall/bounce/roll/fade, ground fruit, plane mapping, blocking); `fruit.spec.ts` (Okavango,
`?birds=0`: a shot beside a sausage swings it, shots at it drop it, it lands, the score stays);
`art-preview-v17c.spec.ts` (on demand) for `docs/art-preview/compare/v17c-fruit-*.png`.
(6) *Look round (26 Oct, from the 15f7afe screenshots):* the close-ups showed flat shapes (tan
"pills" on a straight line, smooth grey eggs); the product owner wants the camelthorn bar on every
fruit. The sprites now have their own drawings (`tools/art/fruitLook.ts`): sausages long, heavy,
slightly curved and fatter toward a darker blunt tip, grey-brown mottled rough skin with pale
lenticels, lit upper left with a shade side, on a thin twisted rope stalk that thickens into the
fruit; baobab pods velvety ovoids, grey-green to olive-tan, a soft sheen, a fuzzy rim and a woody
stalk end; round fruit with a shade side, a highlight and a nub (marula speckled, !nara warts and
pale bands, glossy ilala fruit on a branched rachis); sweet-thorn and camelthorn pods with seed
bulges, two tones and a lit edge (camelthorn: fuzz); quiver racemes of tubular flowers, open
yellow below and greener buds above. They are used only for the sprites (the far-plane fruit stay
baked in their old look, so no layer changed) and seed their own random streams. Prop fruit (seen
close up, like the 2× props) are drawn at 2×. A hanging fruit is now two frames: its stalk stays
on the tree (and swings out) when the fruit snaps off, and the fruit falls from the stalk's end, so
a sausage no longer lies with a 200 px stalk across the tree. A dropped fruit lands toward the side
it swung and rolls on until it lies `trunkClearPx` (10 px) clear of its trunk (the species code
gives each fruit its trunk's foot), so it never reads as stuck to the trunk; a soft contact shadow
lies under it.
(7) *Second review round (26 Oct, at 611a1d4):* fruit now take the map light's tint on their
layer (`ParallaxView.layerTint`, the same compound tint as the layer art and props:
`lightTint.ts`), so they match their tree on dawn mist, overcast, golden, dusty and dusk maps, and
they sit below the light's haze. Draw order per layer: layer art → the layer's fruit → its props →
its props' fruit → haze → fixtures (meerkats, secret marks) → birds, so a layer fruit behind a
prop (the Kalahari pods under the weaver tree's foot, the marula behind the dassie koppie) stays
behind it as it was in the baked art. Wind drift and the shot's camera: see (1). Cost: a fruit at
rest, faded out or settled is posed once and skipped until a shot moves it; fruit off screen are
hidden and skipped; a drop works its fall out once. Poses use the interpolated sim time (the
snapshot's tick − 1 + the frame's alpha), as the birds and the camera do, so a falling fruit is
smooth on 90/120 Hz screens and a held frame still holds.

**D-048 Feesdae (special-day Dailies) and Halloween's Spookjag, 31 Oct (26 Oct 2026):** the
product owner (26 Oct): "Halloween special yes, go ahead", from the Feesdae list of 24 Oct
("Halloween, 31 Oct: 'Spookjag', a dusk hunt with owls, bats, pumpkin lanterns and guineafowl in
witch hats"). Rules in GDD §15 (Feesdae), Tech §12 (Feesdae) and §3.10 (InputLog v6), art bible §11.
(1) *A system, content-driven:* `content/feesdae.json` (Zod `FeesdaeSchema`, cross-refs: unique
ids and dates, i18n keys, a known biome, bats positive and owls negative, enough lantern spots;
`content:validate` checks the light preset and the `feel.json feesdae.looks` entry). A special has
an id, a date rule (a fixed UTC month/day; the schema is a union so ranges can join it), a map
(`daily` = the day's map, or a fixed biome/layout), a light, its twist's numbers, decoration ids,
Oupa's lines, a sting and a share frame. Only Halloween is in it; the other holidays are content
later. It is in the bundle and `contentHash`: the twist is a rule, and replays must carry it.
(2) *The date is an input of the mode:* the game decides (`src/meta/feesdae.ts`, the UTC day from
`Date.now()` or `?today=`); the Daily's seed rule is unchanged; the special's id goes into
`ModeConfig.feesdag` (Daily only, else the sim throws), InputLog v6 and challenge links (`f`). The
sim never reads a clock. Overrides: `?feesdag=<id|none>` on dev/e2e builds and the web admin page
(a "Special days" group with Play for each); never on a Poki or CrazyGames build. The e2e `boot()`
pins `feesdag=none` unless a spec names a special, so no spec changes on 31 Oct.
(3) *The twist in the sim* (`src/sim/feesdag/spookjag.ts`, its own `feesdag` RNG stream): 7–10
bats and 2–3 owls cross edge to edge (bats on the mid or far plane, 210–430 px down; owls on the mid plane only, 250–370 px, about a guineafowl's size, across the moon's height and clear of the top HUD) (bats 560 px/s with ±70 px swerves
every 0.18–0.42 s; owls 260 px/s, gentle); 3–5 lanterns stand on prop tops or their own post or rock in front of the flock
line. They are `HitExtra` kind `spook`, not birds: they need no bird rig, atlas or flock logic,
and the bird pipeline (spawn director, Bird Book, hitShots, Whole Flock) stays as it was. Scoring
follows GDD §5.3 (supervisor review, 26 Oct): a bat (+15) and Lanterns out (+25, once) are event
bonuses like a secret's — Frenzy × Stampede, a `bonusAwarded` event (`bat`, `lanternsOut`) — and
an owl (−10) is a penalty on the hadeda's path (`penaltyApplied` with creature `ooruil`, the charms'
penalty trigger, a penalty in the tally). Spookjag ids start at 1,000,000, clear of bird ids. A shot that hits only Spookjag
things leaves the Frenzy streak alone, like a secret part. Events: `feesdagStarted`, `spookFlew`,
`spookHit`, `lanternsOut`. Everything else of the Daily (quota, omens, crates) is as it was. By
design (review, 26 Oct): bats and owls keep their speed
under slow-mo and Boeretroos (they are the day's sky, not birds); touch assist snaps only onto
birds, so a snapped pattern's other pellets may still catch an owl, as they may a hadeda.
*Golden replays:* every existing event hash is unchanged (re-recorded for the new content hash
only); `daily-2026-10-31-halloween-competent-pointer` is new.
(4) *The look in the game:* the special's light replaces the layout's (Halloween: `spookjag`, its own dark, cool grade, and a soft vignette); a lazy
chunk (`FeesdagView`, 4.0 KB gz) draws the moon and sky bats, the lanterns with a slow additive
glow (no flashes), bats and owls, cobwebs on props (`feel.json feesdae.looks`), a puff when a
lantern goes out, and gives the `BirdView` witch hats for about a third of the guineafowl (by bird
id; a hat drawing per plane size on the head anchor, like the Generaal's pot). The title's Daily
button shows the special's name and a badge; the HUD tag reads "Spookjag · DAILY #n"; the tally
has a purple frame with the moon, bats and a pumpkin, the title "Spookjag 2026" and a
Bats/Owls/Lanterns row; the share text is framed 🎃🦇 … 🦇🌕. Oupa says five lines (start, a bat, an
owl, lanterns out, the end; triggers `feesdag*` take their lines from feesdae.json), voiced en/af/de
with the interim TTS, and respect his switch. Captions for the sting, the owl, a bat and a lantern.
(5) *Assets in lazy groups:* `feesdae` holds the 2× sheet (png8, 1920 × 1882) and four sounds
(sting, hoot, squeak, puff): 201.5 KB gzip; Oupa's five Spookjag lines are a group per voice
language (`feesdae-voice-en/af/de`, 113–134 KB), so the year-round voice packs don't carry them.
All are fetched only when a special day's hunt starts (the current voice language's lines; another
language picked since: on the next one). The hunt starts once the view's code is in (a veil with
the special's name; if the code fails, the art-failed message with Retry and Back); the files load
in the background, all at once, and one that failed is tried again on the next special-day hunt.
Until the sheet arrives a code-drawn stand-in with the same frames shows (built only while the
sheet is missing); the view swaps images with `setTexture` and never removes a texture. Interim
art `npm run art:interim -- --only feesdae` (tools/art/halloween.ts, and the witch hats' head
anchors tools/art/hatAnchors.ts), sounds in tools/audio/sfx.ts.
(6) *Sizes (gzip, `npm run size -- --strict`):* the first download had 3 KB left, so the build now
ships content JSON without its `$comment` notes (`tools/stripComments.ts`, a Vite plugin; the
content hash already ignored them; −9 KB), which pays for the special day's code and strings.
First download: web 3,070.8 KB, Poki 3,064.1 KB, CrazyGames 3,064.2 KB (limit 3,072 KB; 1.7.2 web
3,069.1 KB). No biome chunk grew (Bushveld 1,499.1, Okavango 1,529.1, Kalahari + desert 1,534.5,
Namibië + desert 1,508.3, late 1,471.3), nor the voice packs (af 718.3, de 867.6, en 663.8).
(7) *Supervisor review, 26 Oct (screenshots on desktop and Pixel 7):* the scoring went through the
pipeline (above); witch hats moved from the hitbox's head to each frame's drawn head, sized to it;
every lantern is carved and lit at every size (a bold half-size drawing far away) and stands on a
prop's top or its own post or rock in front of the flock line; the Spookjag got its own dark, cool
grade (`spookjag` light) and a vignette in place of the warm `dusk`; owls became guineafowl-sized
on the mid plane and fly a band below the HUD; the title hides the Classic map line on a special
day and hangs the badge under the Daily's label; the tally's moon moved clear of the tag. A second
Halloween golden (a `spook` bot) covers the bat bonus, the owl penalty and Lanterns out; `?spook=early`
(e2e/dev) brings owls and bats in early for the specs.

**D-049 Perspective: birds get smaller with distance, on every map (26 Oct 2026):** the product
owner (26 Oct, playing the Karoo): "the guineafowl, the further away they are, the smaller they
get … the ostriches, because they're far away, are small, but the guineafowl is even bigger than
they are … still in such a way that one can still shoot them … this needs to apply to all the
levels." (1) *Measured* (`tools/perspective-audit.ts`, tables in `docs/balance/perspective.md`):
a far guineafowl (58 px standing at 0.22) looked 8–12× too big next to the far springbok and
ostriches and 10–19× next to the giraffes and elephants; the far animals had been drawn for a far
plane near scale 0.03. (2) *Plane scales* (`scoring.json`): near 1.0 (pop-ups, unchanged), mid
0.5 → **0.42**, far 0.22 → **0.15**, Ver 0.1 → **0.07**: 263 / 110 / 39 / 18 px standing. Smaller
than 0.15 makes far birds hard to read and to hit, so the rest of the gap is closed from the
animals' side. (3) *Far animals* (`feel.json perspective.faunaScale`, client only): every far herd
shows at 3× (their art is drawn at 3×, D-042, so no upscaling); the Namibië waterhole's animals
are re-drawn 5× taller in the same spots (scaling its sprite would spread them off the water). A
far guineafowl now stands below every ostrich and springbok beside it; the remaining oversize
(1.8–4×) is for the HD redraw, which draws to the per-species target heights in
`perspective.md`. Mid-plane props (windpomp, bakkie, trees, reeds) keep their stage-set scale:
true proportions would make a windpomp 2 000 px tall, and many are occluders or secrets. (4)
*Everything on a plane scales with it:* px tunings written "at the mid plane" (flock spacing,
speeds, alert radii, crate drops, dust devils, Skietbaan) are now × plane scale ÷
`scoring.tuningRefScale` (0.5), so they shrink with the birds; crates, feathers
(`juice.featherPerScale`), boss pots, Spookjag hats, lanterns, bats, owls and meerkats follow the
plane scale; bird atlases are packed at the new sizes (the asset index records each atlas's packed
scale, so a dev override draws correctly). (5) *Still shootable* (sim, content): a target's body hit
radius is at least `planes.*.minHitRadiusPx` for every input — far 18 px, Ver 10 px (heads scale as
drawn; a floored head made a 36 px-wide target); touch assist far 18 → 12, mid kept at 14 (the floor
already widens far birds); far points 25 → 22 (`tune`). Pellet spread unchanged. (6) *Balance* (`tools/perspective-sweep.ts`, 500 seeds, tables in `perspective.md`): Classic
Dubbelloop competent 4 258 → 4 313 (mouse), 4 262 → 4 312 (touch). Every gate that passed on main
passes; the Langloop's Classic mean fell under 2 500, so it scores ×0.72 mid (was 0.65) and ×1.15
far (new): 2 585. Long-range cap held everywhere (highest: Namibië Thursday .22 scope 4 376).
Season Run: all eight cells pass. *Accepted:* the plinker loses 8.5–11.4 % on the Dubbelloop
(fixed-px aim error against smaller mid birds; mid touch assist kept at 14; no gate limits it);
shotguns on the far-heavy bonus maps lose 5–23 % (those maps are for rifles); the Spookjag Daily
competent rises 4 518 → 5 004 (+11 %), as the plain Bushveld Saturday Daily does: tighter flocks
under the same pellet pattern give more two-bird shots. (6b) *Review:* the floor applies to
targets and bosses only (don't-shoot birds and the owl stay as drawn); the Spookjag's bats and
lanterns get it, and its flyers convert px tunings with `tuningRatio`. (7) *Size:* first download 3 071.5 → 2 965.2 KB gzip on the web
build (−106.3 KB; Poki 2 958.6, CrazyGames 2 958.7), room for the Karoo HD aloes; the waterhole
grows the lazy Ver group 516.8 → 531.9 KB. (8) *Determinism:* golden replays re-recorded and the
v3 fixtures re-derived (scales, hit rule, assist and points changed on purpose). A meerkat that
arrives under half a px from its spaced spot now takes the spot exactly (smaller mid meerkats
could sit a fraction inside the spacing rule). (9) *Screens:* `?planeScale=v17` (dev/e2e) shows
the old scales and far animals for before | after shots
(`tests/e2e/art-preview-perspective.spec.ts`).

**D-050 v1.8 Blikkies: tin cans on the fence posts (26 Oct 2026):** the product owner (24 Oct):
"On maps with fence posts, have some cans standing on them that can be shot off. They somersault
when hit. The distance should vary. If one gets it right to hit the rotating, somersaulting can in
the air, it flips higher and keeps flipping and flying as long as it's hit"; again on 26 Oct ("I
haven't seen that in any of the builds"). Rules in GDD §11.3. (1) *Design:* a skill toy beside the
hunt, not a new loop: one fence of 3–6 posts on 3–4 weekday layouts of the Karoo, Bushveld,
Kalahari and Namibië (none in the Okavango: no farm fences there); the plane varies by day and the
bonus maps push it back (Verder one plane, Nog Verder far, Die Verste Ver). (2) *Scoring:* event
bonuses through the pipeline, × Stampede only (a can-only shot leaves the streak alone, so a Frenzy
multiplier would last a whole juggle; review 1), never a bag; a can-only shot is not a miss, as a
secret part. Knock-off 5, air hit n 8 + 2 × (min(n, 8) − 1), Weg! 15, × plane near 0.8 / mid 1.3 /
far 2 / Ver 2.5: the apex juggler and the can-happy bot take ≤ ~9 % of their score from cans on
every fence map (`docs/balance/v1.8-blikkies.md`). (3) *Season Run: no cans* — it plays the plain biome with
fixed quotas, and a quota shortcut would undo its tuning; the FTUE neither. (4) *Not hiding
anything:* the posts and landed cans don't stop pellets; resting cans are checked against the bird
bands and secrets behind them as the meerkat colonies are; a can in flight is fair game wherever it
goes. (5) *The juggle (reviews 1–3):* a can is hit in the air within 2.5× its drawn radius; the
plane's hit floor applies only to a resting can, so far is the hardest plane to juggle (an
earlier floored far can juggled to 16–19); the 10th air hit (`wegChain`) always ends in Weg!. The
kick (430 px/s up, 110 sideways, pellet cap ×1.04, jitter growth 15) was set with an apex-juggler
bot (100 ms late, 10 px error): near reaches 3 in ~96 % of juggles and Weg! at 4–6, mid 3 in ~50 %,
far 3 in ≤ 1 % (review's suggested 400 px/s made near too long: ≥ 5 in 83 %).

**D-051 1.8.1 Karoo polish: HD aloes; the potjie simmers and its lid flies off (27 Oct 2026):**
the product owner (26 Oct): "These aloes … need to become HD" and "The braai pot … add a small bit
of animation … as if … the pot is boiling a little bit. And when it's shot, at least the deksel
should fall off." Decisions: (1) **Size route (b):** the Karoo is in the first download (2,987 of
3,072 KB; HD clumps need ~+120 KB), so the old aloe_a/aloe_b/potjie stay there as placeholders and
`karoo/hd/aloe_a|aloe_b|potjie|potjie_lid` load in the `late` group (`src/game/assets/hdProps.ts`).
`ParallaxView.upgradeHd()` polls (every 30 frames) and swaps a prop to its HD key only when the HD
file and all its pieces are the textures under their keys (`AssetManifest.delivered`); placeholders
are renamed by `AssetManifest.upgrade()`, never removed (D-046). (2) **The aloe** is the bitter aloe
(Aloe ferox), at 2× with thin tinted outlines (art bible §Karoo); the **Bushveld** clumps use the
same drawing at 1× in place (chunk 1,445.4 → 1,466.1 KB gzip, ≤ 1,536). They stay at 1× because a
2× pair (~+90 KB over the 1× pair) would push the Bushveld chunk past its 1,536 KB cap, and the
Bushveld cannot use the late-group route without also exceeding the late group's own 1.5 MB cap
(the product owner agreed on 27 Oct to keep the Bushveld aloes at 1× for now; the 2× versions
are revisited in the HD graphics job (next), which adds HD packs that load per area). The HD clumps stand at the old ground level (crest ~52 px
below the origin; first drawn ~100, which put the plants' feet below the screen). The koppie's small crack
aloe (`rocks.ts`) is a different, tiny drawing and stays. (3) **The potjie** is drawn lidless with
the lid as its own texture; `PotjieView` draws the lid, steam (`fx/smoke` tinted, ≤ 16 images),
and the coals' warmth (normal blend: an additive glow saturated the flames to lime in play) on the
prop's layer, all under the layer's map light like the pot. The rattle clacks on its three drops,
and its puff leaves both lid edges. Placeholders for the HD keys are never shown: they install as
1×1 canvases (`CanvasSpec.empty`) with the texture's design size. Every pose is a pure function of the sim tick
(`potjieMotion.ts`: held frames hold, replays match); reduce motion is calmer. (4) **Shot:** the
existing `lid` secret (+5 s, `bark.kos_is_reg`, once per hunt) is unchanged in the sim and content;
the view starts the lid's 40-tick tumble on `secretTriggered` (or shows it lying there if the
secret is already spent). No sim, content or golden change. (5) **Sounds:** small AudioDirector
synths (`potjieSounds.ts`) — bubbles on sim ticks while the pot is near the screen, the rattle's
clacks, the clang — so they cost no download; a recording under the same keys replaces each later.
(6) Sizes (gzip): first download web 2,987.3 → 2,990.7 KB, Poki 2,980.9 → 2,984.3, CrazyGames
2,981.1 → 2,984.4 (+3.4 KB: the view code and asset index; cap 3,072); late 1,235.6 → 1,399.2;
Bushveld 1,445.4 → 1,466.1; Kalahari + desert unchanged (1,534.5). Full table in PR #87.

**D-052 Release aim: friends, then the Apple and Google app stores (27 Oct 2026):** the product owner:
"I don't think I'm really interested in publishing to Poki or Crazy Games; for me the aim would be to
have it only for friends and Apple and Android store." (1) Friends play the web test build on GitHub
Pages (installable as a PWA); an Android test app (Capacitor, built by GitHub Actions, signed with a
test-only key, every asset inside) follows after the tree-life job; the iPhone app after the product
owner has an Apple developer account. Store accounts, release keys and listings are the product
owner's. (2) Poki and CrazyGames are no longer targets: no new work is shaped by portal rules (e.g.
the HD graphics job shows its Standard/HD choice before play on every build). Their adapters and CI
builds stay until they are removed on purpose. (3) Budgets: the web first download stays ≤ 3 MB and
each lazy chunk ≤ 1.5 MB for a fast start on phones; store apps bundle everything, so HD packs can
ship inside the app. Docs: CLAUDE.md, Tech §8 (release aim), this file's open question 4.

**D-053 1.9.0 HD graphics: Standard or HD, chosen on the loading screen (27 Oct 2026):** the
product owner (26 Oct): "when the game loads, it should ask you standard quality or HD, so that the
person can choose if his device and browser have enough resources … HD where everything has much
higher graphics … and the standard version so that it works on all other devices"; (27 Oct) "a
normal, not too high resolution loading screen … then it would ask you, do you want standard
resolution or high resolution … a tick box that says save preset … why not use high-quality
graphics if it's possible?" The product owner's design replaced the supervisor's Settings-only
Auto proposal. (1) **Two resolutions of the same art:** Standard is the 1× art of the first
download, unchanged byte for byte; every group `g` gets a lazy `g-hd` twin with the art tools' 2×
renders (layers, props, sprites; `art-source/hd/`) and the 2× masters already delivered (birds,
props). No new art: the 2× Bushveld aloes are the D-051 drawing rendered at 2× and sit in
`bushveld-winter-hd` (the product owner, 27 Oct: "keep them at normal resolution, but revisit
later"; Standard keeps them at 1×). (2) **The choice:** a DOM card before the title on the first
launch and whenever no preset is saved, on every build (D-052): Standard or HD with the real MB
(before the hunt: `common-hd` + the area's `-hd`, as the HD loading bar counts),
the recommendation pre-selected (connection, Save-Data, deviceMemory, device px per design px),
"may be slow on this device" on weak devices, Remember my choice ticked; the card and the HD
loading screen scale with the window like the canvas (laid out for 1280×720, never below 1×, so
phones keep their layout); Settings → Graphics
Standard / HD / Ask on start. (3) **Drawing:** HD textures draw at half scale, so positions, hit
areas, replays and the sim never change; keys without a view scale get frames that report the
standard size (`hdTexture.ts`), a texture is never removed under an object (renamed, freed once
nothing draws it: at the next scene change, or within 30 frames while views live after a switch
to Standard). (4) **Loading:** an area's HD pack loads with it behind the loading screen; a
"Play now in Standard" button after 4 s; late and Ver HD in the background, the next areas'
packs on the title. Standard never requests an HD file. (5) **Budgets:** standard chunks
unchanged; the first download +4.7 KB gzip on web (2,990.7 → 2,995.4 KB; Poki and CrazyGames
+5.0 KB), the boot code the choice needs (Settings row, recommendation, card trigger; the card,
its strings, the HD runtime and the HD index are lazy), accepted by the supervisor 27 Oct; each HD group ≤ 4 MB gzip; texture memory of one area's HD hunt
226–243 MB (Standard 95–110), within the 256 MB ceiling: so the guns (a 2× page is 64 MB), the
near pop-up birds and the late group's rare birds stay Standard (~310 MB otherwise), and the sky
(a gradient) and three cropped sprites (Phaser 4.2 crops clamp to the frame) have no HD version.
**Real 2× only** (measured 27 Oct, supervisor's crops: clear gain on the scope, small on the
aloes, none on far fauna): each HD file against its 1× file upscaled 2× (mean |diff| /255, and
detail above 1× relative to the upscale's, where a pure resize scores 1.0). Six score as resize-only
(diff < 1.5 and ratio < 2 or detail < 1/255) and are left out (`HD_NO_GAIN_KEYS`, −450 KB):
`sky/cloud_cumulus` (1.07, 1.71), `sky/cloud_tower` (1.01, 1.71), `sky/cloud_wide` (1.31, 1.84),
`sight/iron_rear` (0.49, 1.95), `sight/peep` (0.12, detail 0.21), `omen/glare` (0.41, detail 0.39);
each key swaps on its own, so none is kept for consistent swapping. Real 2× renders: every other
image (ratio 2.07–3.7, e.g. `sight/scope` 2.73, the Bushveld aloes 2.56), all 30 layers (2.1–3.2)
and the bird atlases (2× masters). The far animals have no HD entry at all: their Standard files
are already 3× masters drawn at ⅓, so HD can't sharpen them (the far-animals job adds real ones).
(6) Later art jobs (far animals in HD, makalani palms, tree life) add to the HD packs by putting
their 2× render at `art-source/hd/<path>` (docs/06). Docs: Tech §9, §10; GDD Settings; docs/06;
CHANGELOG 1.9.0.
*Correction (D-054, 27 Oct):* the 226–243 MB above held for the Karoo only. A hunt in another
area kept the title's Karoo HD layers (+103 MB: Bushveld 358 MB, Okavango 383 MB on the Pixel 7
profile); D-054 fixes the release and moves the far ridge, far veld, Ver strips and the special
birds to Standard in HD.

**D-054 1.9.1 Far animals redrawn at their real size, in parts, with HD twins (27 Oct 2026):**
the product owner (26 Oct, with close-ups): Bushveld "the zebras, giraffes and elephants look very
cartoony … the details need to be put into HD mode so it looks more realistic"; Kalahari "the
animals in a far distance … still look too much like stick figures". The HD job had found the
cause: the herds were drawn tiny (a zebra 15 px) and shown 3× (D-049's `faunaScale`), so they
showed at 1 texture px per screen px and HD could not sharpen them. Auto proposal, product owner
review of the contact sheet folded in. (1) **Redraw** (`tools/art/farFauna.ts`): every species
from its anatomy (jointed legs, real silhouettes, coats, light from above, thin coat-coloured
outlines), sized from the D-049 targets (the guineafowl's true size beside it); young ones, cows
and hens; details in the art bible (far animals). **Every far species at 0.57 × true proportion, the ostrich at 0.45**: the product
owner, 27 Oct 20:10: "make the elephants and giraffes at least 25% smaller … the realism looks off
… the further animals are away, the smaller they get … 25% should be at least, but it could even
be up to 50%"; 20:15: "make the zebras and wildebeest smaller too."; and 22:45, after playing: "I
think it's coming along very good. It maybe needs to just shrink another 5%, and I saw the
ostriches didn't change. They are still so big." One multiplier for all (0.6, then 0.57),
because herds share maps: shrinking only some species would break their proportions to each other
(Kalahari wildebeest as tall as the springbok, Namibië's gemsbok taller than the zebras); the
ostrich, which still read too big, a quarter smaller again (0.45, hens and young in proportion);
the far guineafowl keep their size (they are the targets). Far heights: elephant 144 px at the
shoulder, giraffe 225 to the head, zebra 61, wildebeest 63, gemsbok 54, springbok 36, lechwe 45
at the shoulder, ostrich 89 to the head; the Ver waterhole the same way. Drawn at that size (no runtime scaling), a tunable:
`feel.json fauna.sizeMul.<species>` (default 1), read by the art generator; the herds close up
to match (`HERD_SPREAD` 0.65) and space themselves from their frames' real sizes. **Contrast** (review 27 Oct: a springbok's pale hazed
neck vanished against the cream horizon glow, so its face looked detached): a thin darker contour
on every part, cinnamon springbok necks with a narrow white throat stripe, the neck's root
filled in the body too (no shoulder seam), and the haze capped per colour: the animals take 0.45
of the layer's haze, cut back until a coat colour keeps a 1.8:1 contrast (WCAG ratio) against the
area's horizon, low sky and clouds. `perspective.faunaScale` is removed (client feel only: content hash, goldens and the
Daily unchanged). (2) **Herds** (`src/game/view/faunaHerds.ts`): hand-placed loose groups at the
v1.6 spots, both facings, 2–3 poses, a young one in most, spread so that no head crosses another
animal's head or body and bodies overlap by a quarter at most (`spaceHerd`, from the frames); each herd one texture key as before,
now a sheet of its animals' parts (tail, body, head with neck, an elephant's ear) with a frame
table (design px, pivots) in the sidecar → asset index; the Bushveld's second giraffe group draws
from the first group's sheet. (3) **Life** (`FaunaView`, `faunaIdle`): heads, tails and ears move a
little about their pivots as a pure function of the sim tick (`feel.json fauna.idle`): a held
frame holds, replays repeat, reduce motion × 0.35. Decor only: no hit tests, no sim change.
(4) **Files**: Standard at 1× (48 colours: no visible change against 256, −40 %), HD twin at 2×
in `art-source/hd/` (96 colours), `npm run art:interim -- --only fauna`. (5) **Budgets**
(`size --strict` passes on web, Poki, CrazyGames): the Karoo's herds move to the late group
(the first download may not grow; they swap in via `AssetManifest.upgrade()`, never a texture
removal): first download 2,996.0 → 2,992.1 KB gzip (web), Poki 2,989.9 → 2,986.0, CrazyGames
2,990.0 → 2,986.1; room freed with the Kalahari weaver camelthorn and Namibië's nest camelthorn
at 128 colours (mean change 2/255, none visible, −40 and −35 KB); chunks after (web, gzip):
Bushveld 1,466.1 → 1,478.6 KB, Kalahari + desert 1,534.5 → 1,497.4, Namibië + desert 1,508.3 →
1,479.7, Okavango 1,426.9 → 1,442.1, late 1,399.2 → 1,409.4, Ver 532.2 → 521.8; HD groups
Bushveld 1,984.0 → 2,122.8, Kalahari 1,284.7 → 1,325.4, Namibië 1,598.4 → 1,651.4, Okavango
2,377.1 → 2,486.0, late 41.5 → 71.2, Ver 333.2 → 359.5 (Karoo 1,587.1 unchanged; all ≤ 4 MB).
Texture memory of the far animals per area (Standard / HD; v1.9.0: 0.6–1.9 MB in both): Bushveld
1.0 / 4.2 MB (+2.7 in HD), Okavango 0.8 / 3.1 (+2.1), Kalahari 0.2 / 1.0 (+0.3), Karoo 0.2 / 0.7
(−0.1), Namibië incl. the waterhole 0.4 / 1.7 (−0.2): within the 256 MB ceiling even on the
highest area measured for D-053 (243 + 2.7). **HD texture memory per area (fixed here):** CI's
new Pixel 7 check (27 Oct) found the HD hunts far over the 256 MB ceiling, already on main: Karoo
238.7 MB, Bushveld 358.1, Okavango 383.4 (D-053 had only measured the Karoo; the far animals add
~2 MB). Breakdown (Okavango): its HD layers 106 MB, **the title's Karoo HD layers 103 MB never
released**, HD birds 74 (tarentaal mid 32, kuifkop 16, Kuifkop Koning 16 …), props and others 61,
a gun 16, Standard birds and layers 23. Causes and fixes: (a) a hunt in another area released the
title's textures, but `buildViews()` then ran `graphics.sync()`, whose `applyHd()` on every
manifest put the released Karoo's HD layer tiles straight back: a manifest is now *parked* until
its own `install()` (and after `release()`), and a parked manifest uploads no HD (swapping back to
Standard still runs); areas whose HD pack is only preloaded on the title upload nothing either;
A → B → A brings the title's HD layers back (unit-tested). (b) Least visible cuts to leave
headroom (target ≤ 240 MB): the far ridge, far veld and Ver strip layers stay Standard in HD (the
most distant, hazed scenery; −19 MB per area, the far animals on them keep HD), and the special
birds kuifkop, Kuifkop Koning and ou grys stay Standard (rare and brief, each a 16 MB HD mid atlas
that prewarm keeps on the GPU, 4 MB in Standard). Measured 27 Oct, Pixel 7 profile, SwiftShader (HD, hunt running +12 s; before = main 2ff38b1,
now = 5de5ff1): Karoo 238.7 → 217.4 MB, Bushveld 358.1 → 224.7, Okavango 383.4 → 237.6,
Kalahari — → 224.5, Namibië — → 228.6: all five under the 240 MB target. `perf.spec.ts` asserts
≤ 256 MB and no other area's HD layers in all five areas, reached through the Karoo title as
players do. HD downloads
shrink with it: Bushveld-hd 1,984.0 → 1,493.3 KB gzip, Kalahari-hd 1,284.7 → 1,117.6, Karoo-hd
1,587.1 → 1,356.9, Namibië-hd 1,598.4 → 1,458.6, Okavango-hd 2,377.1 → 1,429.5, Ver-hd 333.2 →
155.8. **Build workaround for a Phaser 4.2.1 shader bug** (found by the supervisor in the browser,
27 Oct): the batch fragment shaders pick a quad's texture unit with an exact compare on an
interpolated varying (`outTexDatum == float(INDEX)` in GetTexture.glsl, `texId == float(i)` in
GetTexRes.glsl); a miss returns transparent. Interpolation need not hit the whole number exactly:
on SwiftShader (and possibly mobile GPUs at mediump) a rotated quad on a high unit lost
straight-edged regions that changed every frame — the swaying far elephant heads on unit 11 of 12
fragmented in Standard and HD. Evidence: a magenta fall-through in the no-match branch showed
exactly the missing pieces; the sheet, frames, UVs, the GPU texture read back and the vertex
upload were all correct. Fix: `tools/phaserShaderFix.ts` rewrites the compares to the nearest unit
(`abs(x − i) < 0.5`), applied by vite.config.ts in the build (a transform hook) and in
`npm run dev` (an optimizeDeps Rolldown plugin); it throws if a Phaser upgrade changes that text,
so the fix is never lost silently, and `tools/phaserShaderFix.test.ts` runs it over the shipped
`phaser.esm.js` (no exact compare left; unknown text throws). Remove it once Phaser fixes the
shaders. Docs: art bible (far animals); docs/06 §6b; docs/balance/perspective.md; CHANGELOG 1.9.1.

*D-054 HD texture memory, measured 27 Oct, Pixel 7 profile, SwiftShader (HD, hunt running +12 s):*

| Area | before (main 2ff38b1) | now (5de5ff1) |
|---|---|---|
| Karoo | 238.7 MB | 217.4 MB |
| Bushveld | 358.1 MB | 224.7 MB |
| Okavango | 383.4 MB | 237.6 MB |
| Kalahari | — | 224.5 MB |
| Namibië | — | 228.6 MB |

**D-055 1.9.2 Playtest fixes: crate icons, the ten-second call, and the Rooikol (28 Oct 2026):**
the product owner's playtest (27 Oct): "there should be an option, a power up that one can get for
a red dot sight that just makes aiming and shooting so much faster"; a crate's power-up picture
"in two positions at the wrong time … like there's a layer mismatch"; and "when it tells you
you've got 10 seconds left … those 10 seconds don't seem to be 10 seconds. They're much shorter."
- *Crate icon.* The disc + icon lived in the hunt's screen layer at a hand-worked position (the
  plane's screen x, the raw sim y), so it ignored the plane layer's scope zoom and y, sat above
  nearer planes' props, and showed twice while falling (canopy and box front). Now one tag per
  crate, in the crate's own overlay layer above the crate (the overlay is above the layer's haze
  bands and the light tint only touches static art, so nothing washes it out): on the canopy while
  falling, on the box front once landed. e2e `crate-icon.spec.ts` checks every frame through a
  pan, a raised scope and the shot's shake that the tag's world transform sits on the canopy
  (through the crate image's transform) and that one tag shows.
- *Ten-second call.* The hunt clock was right: 60 ticks a second, also through the Stampede (unit
  test), and the HUD rounds up (9.9 s shows 0:10). The call waited for the 6 s bark gap, which
  the Stampede's own call (15 s left) holds until 9 s left, and later lines pushed it further. Now
  `lastSeconds` skips the gap and the frame's other picks, cuts the line playing (a new bark
  replaces the bubble and stops the voice) and claims the gap; if the first frame that sees ≤ 10 s
  is past 9.5 s (`barks.lastSecondsLateSeconds`), it is never said: a late "Ten seconds!" is wrong.
  An exception to D-028's "never share the screen": a secret's own bark claims the gap, and if the
  clock reaches 10 s inside that gap the ten-second call is still said, so its bubble can show
  while the secret's banner is up. The clock wins: the call is worthless late.
- *Rooikol (red dot sight).* A timed power-up (`powerups.json`): `redDot` — a rifle's sight is up
  on the press tick, sways as its first zoom step × `redDotSwayMul` (0.6), and the view draws it
  at 1× with a red-dot reticle (SightView 'red_dot'; the input's fine aim moves 1:1); and
  `fireCooldownMul` 0.75 on a rifle's time between shots; 15 s. Rifles only (`needsSight`): crates
  hold it only when the hunt's gun has a sight — elsewhere it weighs 0, so a shotgun hunt's crates
  draw exactly as before — and no `padstalPrice`, so the Padstal never offers it (the run's gun can
  change between hunts; `padstalPrice` is now optional for such power-ups). A hold started under
  the red dot stays a red dot until released. Hunts with a rifle drop it at weight 14 (114 in all).
  Name in i18n: Rooikol (af and the Afrikaans names toggle), Red Dot, Rotpunkt, Rode Stip; Oupa's
  first-pickup line is text only (no recording yet). Balance (docs/balance/rooikol.md, 500 seeds,
  every crate a Rooikol vs a no-op crate): competent .22 +111, Langloop +385; × 0.5 and × 0.6
  cooldowns cost the .22's bots points (they shoot at once and each shot alarms the flocks);
  bonus-map cap ≤ 4 500 holds (highest 3 982). Golden replays re-recorded: shotgun replays keep
  their events; the four rifle replays change (their crates roll from the new table).
- *First download.* The Rooikol's strings and code grew the first download by 1.8 KB gzip. The
  power-up guide's long sentences (`guide.effect/tip/how.*`, every item, four languages) moved to
  their own lazy tables (`src/i18n/guide/<lang>.json`, loaded as a hunt or the Gun Shed starts,
  like the Skietbaan's and the Graphics card's): 2 991.4 KB, 0.8 KB under main. The first-pickup
  card shows the short line if they are not in yet; the Shed redraws when they land.
- *CI shards.* Playwright splits a run into shards by test count, and the art-preview specs' tests
  (run only with `ART_PREVIEW=1`) counted though they skip. The first two desktop shards ran about
  4 min; the last held every long spec (30 min on main, 44 min on a slow runner with this PR's
  specs and one retry) and hit the job's 45-min limit. `playwright.config.ts` now ignores the
  art-preview specs unless `ART_PREVIEW=1`, so the four desktop and three Pixel 7 shards hold 40–54
  tests each. The Skietbaan's long tests get 10 min (about 5 on a typical runner, 7 on a slow one).

**D-056 1.9.3 Makalani palms in the Okavango, with nuts that crack off, juggle and pop; cans on
the Karoo's far fence (28 Oct 2026):** the product owner (26 Oct, photos of makalani palms at
sunset by the water and of a nut cluster): "Since it's Okavango, I want us to add some makalani
trees … The makalani are very hard nuts that are hanging on them … If somebody manages to hit such
a small makalani, maybe it can do a small blow-up, or fall down … Be creative." And (27 Oct): "the
Blikkies game works well; I would prefer if there were one or two cans on the further-away fence,
as it's so close by." GDD §11.3b, §11.3; art bible §4.2b; Tech §3.13.
- *Palms.* Layout content (`layouts[].palms`: kind single/pair/trio, near or mid plane, u, flip,
  water) with the shapes in `birds.json → makalani.palms` (trunk feet, tops and heights, cluster
  anchors), which the sim, the view and the content checks share. Drawn from **one trunk and one
  crown texture per plane** (MakalaniView turns each trunk to its lean, stretches it to its height
  and sets a crown on top): one image per group would cost several times the texture memory in the
  Okavango's HD hunt, the closest to the budget. Crowns sway ±1.6° on sim time (held frames hold;
  reduce motion × 0.35). A group by water is mirrored below the water line, squashed into the
  channel (× 0.28: the mid channel is a narrow strip), see-through, with a ripple on sim time.
  The painted mid-layer palms are gone (the sprites stand where they stood on some days); the far
  layers paint makalani silhouettes in ones, twos and threes.
- *Nuts reuse the juggle body.* A nut is the v1.8 `JuggleBody` with two optional tuning fields:
  `knockUpMul` (the crack-off kicks only × 0.25 upward: it drops off its stalk; cans leave it out,
  1) and `roll` (after its bounce it keeps rolling, slowing by `decelPxPerSec2`; cans leave it out
  and lie still). No second physics; the cans' flights are unchanged (their golden events too).
  Nuts enter the hit test as the cans' capsule with no axis (a circle) and `passThrough`: a pellet
  that meets a nut and then a bird behind it hits the bird (nuts never block a bird); anything else
  behind stops at the nut. The touch assist grows them like a can.
- *Pop.* `popPellets` (3) pellets on one nut in one shot, or any hit by a `popWeapons` gun (.22,
  Langloop): the nut bursts (hanging or in the air). One or two pellets crack it off or juggle it.
- *Scoring* (event bonuses × Stampede only, as the cans): crack-off 5, air hit 10 + 3 × (n − 1)
  capped at chain 8, pop 12, Weg! 18, × the plane factor (near 0.8, mid 1.3). Air hits and Weg!
  a little more than a can (8 + 2 × (n − 1), Weg! 15): a nut is smaller. The crack-off was 6 at
  first; the nut-happy bot's nuts reached 10.9 % of its score (100 seeds), so it is a can's 5. The secret "Hard soos 'n makalani": 3 nuts
  popped or juggled out in one hunt, +25, once a hunt, Oupa's line `bark.makalani`.
- *Far fence.* `layouts[].farFence` (the fence's shape) on Wednesday's Karoo map, whose fence is on
  the near plane: 2 cans on 3 posts on the mid plane's fence line, moved back by a bonus map like
  the near fence. Same rules and checks; scored with the cans' plane factor (mid 1.3), which already
  pays distance, so no extra distance bonus. The Blikkiesdans is once a hunt over both fences.
- *First download (must not grow).* The nut pops, the secret's banner and its Bird Book name are
  in the lazy guide tables (D-055, `guide.makalani.*`); only Oupa's line is in the main tables.
  MakalaniView is its own lazy chunk (loaded once a map with palms runs). The sim, content and
  view glue still added ~4.6 KB gzip, so the playtest admin page moved out of the first download:
  AdminPanel and its labels are a lazy chunk (AdminScene imports them), and its strings are their
  own tables (`src/i18n/admin/<lang>.json`; the keys the rest of the game shares — admin.back,
  admin.crate_tag, admin.range, admin.sight_default — stay in the main tables). The privacy
  screen's three long paragraphs moved to `src/i18n/privacy/<lang>.json` (Settings loads them;
  the screen redraws once they are in; after the review fixes its first paragraph and the three
  headings too; their Afrikaans-names wording moved with them, `src/i18n/privacy/flavour.json`) and the makalani placeholders are empty (drawn art only,
  like the fruit sheet). First download 2,991.4 KB, 0.4 KB under main (2,991.8).
- *Bonus maps (review M8).* The Okavango's bonus maps move the palms back like the Karoo's fence:
  Verder near → mid (mid groups, moved to far, are left out: the far layers paint their own
  makalani), Nog Verder and Die Verste none. Four near groups moved along the pan (Mon, Fri, Sun
  u 0.178; Tue a single at 0.96) so that they stand clear on the mid plane too.
- *Placement.* `src/content/palmChecks.ts` checks every map (each layout, with each bonus map):
  art for the plane, inside the layer, no overlap with props, secret parts, colonies or another
  group, and no hanging nut in front of a bird band or secret part of a plane behind. The first
  palm heights hung mid-plane nuts in front of the far plane's flocks and near nuts in front of the
  mokoro flag; the palms are taller now (h 700–820 at plane scale 1).
- *HD texture memory.* After the review's art pass (M13: the crown drawn × 1.3, about a third of
  the trunk's height) the new HD textures (from the packed sizes) are the near crown 728 × 684
  (1.90 MB) and the nut sheet (0.08 MB); the trunks (a smooth grey gradient stretched per palm)
  and the small mid-plane crown stay Standard in HD (`"hd": false`; 0.39 MB as loaded). Expected
  Okavango HD hunt ≈ 237.6 + 2.4 ≈ 240.0 MB (up to ~240.6 if the near crown's Standard copy stays
  resident), budget 256, target 240; perf.spec measures it in CI's full lane. The painted mid
  palms' removal leaves the mid layer's tiles the same size.
- *Golden replays.* The existing 39 keep their events, hashes and scores (none plays a map with
  palms or a far fence; only the content hash in each changed). Two new ones lock the new
  behaviour: `classic-81-okavango-tue-nuthappy-pointer` (the nut-happy bot on Okavango Tuesday:
  crack-offs, air hits, landings) and `classic-82-karoo-wed-canhappy-pointer` (the can-happy bot,
  which now shoots the far fence's cans too, on Karoo Wednesday).
- *Later (build plan):* a carved makalani nut as a Notaboek reward or a charm.

**D-057 1.9.4 Tree life: a living baobab, a better sausage tree and a busy weaver colony (28 Oct
2026):** the product owner (26 Oct, with screenshots). Bushveld: "This big tree … it's a good
start, but I think we need to put a bit more detail into it. Also the fruit somehow makes it look a
bit weird … maybe the tree needs a few holes where a little mouse can look out or something
similar … to make it a bit more alive." Kalahari: "this big family tree, I think it would be good
to have some little birds fly around there also." Okavango: the sausages "still all look very stick
figure like". GDD §11.1b; art bible §4.2c, §4.2d, §4.3b; Tech §3.14.
- *The baobab* (`bushveld/baobab`, tools/art/baobab.ts) is one silhouette: a fluted, slightly
  buttressed trunk that flows into six root-like limbs (each piece is inked and painted in the same
  pass, with filled crotches, so there is no collar or hard join), grey-pink bark lit from the
  upper left, horizontal wrinkles, vertical fluting that runs on into the limbs, two old elephant
  scars, lichen; branches and fine twigs; the limbs' geometry, the hollows, the buffalo weavers'
  stick nests and the squirrel's run live in `src/game/view/tree/baobabShape.ts`, which the art and
  the view share. The pods are small (a third to half the branch's thickness), hairy, on long thin
  stalks, in twos and threes; the secret pod is a cluster of three inside the content's hit
  ellipse (content unchanged). 80 colours (the Bushveld chunk had 57 KB).
- *The hard light band* across its trunk was the dawn mist's band on the mid layer (`dawn_mist`
  haze from y 520), drawn over the layer's props. A haze band with an edge (top or bottom) now goes
  under a plane layer's props (`hazeOrder.ts`); a whole-layer distance haze has no edge and stays
  over them; sky and backdrop layers keep their order.
- *Residents* (view only): a lesser bushbaby peeks from a small hole on the trunk's right side (more often under
  dawn, dusk and golden light), a tree squirrel pops out of limb 2 and runs up it and back, a barn
  owl looks out of the big cavity (turns its head, blinks), a yellow-billed hornbill flies in to
  the sealed slit and feeds the female (her beak tip shows), red-billed buffalo weavers come and go
  at their stick nests, and wild bees swirl at a crack. Each resident shows itself at most once per
  slot of `slotSeconds` (feel.json `treeLife`), with a seeded chance, at a seeded point of the slot:
  `lifeHash(seed, resident, slot)`, a pure function of the hunt's seed and the sim tick (never the
  sim's RNG streams, no sim state). A pellet impact on the baobab's layer within `duckRadiusPx`
  (mapped with `planeX = (cx − 960) × scrollFactor + 960 + dx`, fruitHits.ts) makes the one it
  startles duck back (or the owl, hornbill and weaver fly off) for the rest of that visit; residents
  never score and sit under the layer's birds, so they never block a shot at a bird. Their sheet
  (`bushveld/baobab_life`) is drawn at 2× (18 KB; HD needs no twin): at 1× the small animals were
  mostly half-transparent edge pixels and the squirrel read as a faint outline (review R2). The
  bushbaby is 1.6× and peeks from a visible hole a little wider than its head (review R1); the
  squirrel is 1.5×; a dozen amber bees make a little cloud at their crack (review R3). Room for it
  in the Bushveld chunk: the baobab at 80 colours and the dassie koppie at 96 (1,525.0 KB). Frames
  at a hole are drawn masked by the hole (the opening, and only ears above its upper rim), so the
  view needs no mask. The wind's drift is left out of the near-shot test (it is a few px on the mid layer).
- *Sausage tree* (`okavango/sausage_tree`, tools/art/sausageTree.ts): the same one-silhouette trunk
  and limbs, a crown of eleven leaf clumps in three tiers (dark under, lit upper left, dense
  leaflets breaking the edges, gaps where the limbs show), maroon flower cords, and the sausages
  in four sizes (× 0.7 – 1.6), heavier and curved, on rope stalks of 34–104 px at staggered
  heights (v1.7c swing and drop kept, the pivot at the stalk top). The fruit sheet is 9 KB smaller.
- *Weaver colony* (`ColonyView`, colonyFlight.ts): 12 (mid) or 13 (near) weavers per family nest
  live cycles of 8–15 s: in the nest, a dart (with a loop now and then) out of an entrance hole to
  a perch on the roof or a branch, to the ground to hop and peck, or a wider loop; 6–12 are in
  sight most of the time. A pygmy falcon perches at the nest now and then; in Namibië a pair of
  rosy-faced lovebirds sits on a branch and flies a round now and then. A pellet within
  `nearShotPx` of the nest scatters them for `scatterSeconds`; the nest shot itself (the existing
  −10 every 2 s, `bark.weavers`, and the angry burst) scatters them for the burst; they trickle
  back over `trickleSeconds`. Reduce motion: half the birds, cycles 1.5× slower. One sheet,
  `desert/colony` (4 KB; HD twin 8 KB), in the desert group (it loads with either desert map).
  Review R4–R5 (held desktop frames showed about 4 weavers, specks against the thatch): 13 per
  nest, most cycles now loops in the open sky under the nest either side of the trunk(s) (each
  bird on its own phase), a few perched on the roof and branches; drawn at a set wingspan per
  plane (`wingspanPx`: 22 px mid, 32 px near, about 1.3× true size against the tree). The falcon
  is 1.2× a weaver and perches on a branch against the sky picked from each tree's art
  (`COLONY_FALCON_PERCH`); the test build's `?treeLife=falcon` keeps it perched the whole visit.
- *Room in the Kalahari chunk.* `kalahari/weaver_camelthorn` is 1× in Standard with its 2× twin in
  the Kalahari HD pack, as the Namibië nest tree has been (D-053): −149 KB in the Kalahari chunk
  (Kalahari + desert 1,497.4 → 1,352.6 KB). HD texture memory is unchanged by it (the 2× twin
  replaces a 2× master).
- *First download (must not grow).* The residents' and the colony's views, and WeaverView (the
  angry burst, v1.4), are one lazy chunk (`TreeLifeView`, 8.6 KB gzip) loaded on maps with the
  baobab or a family nest; the scene plays the burst's scolding and counts it from the
  `secretPenalty` event itself, and holds nest shots that come before the chunk for its burst
  (review). First download 2,991.4 KB, 0.4 KB under main.
- *HD texture memory* (computed from the textures; perf.spec measures it in CI): the residents'
  2× sheet adds 0.8 MB to the Bushveld hunt (≈ 225.5 MB), the colony's 0.4 MB to the Kalahari and
  Namibië hunts (≈ 225 and 229 MB); the sausage tree keeps its size (Okavango ≈ 240 MB); budget 256.
- *Golden replays* are unchanged: none of this is in the sim (`npm run golden:update` shows no
  diff), and feel.json is outside the content hash.
- *Later (build plan, v1.13):* the residents become "Did you know?" entries in the field guide.

**D-058 1.9.5 Android test app: an installable APK for friends (28 Oct 2026):** the product owner
(27 Oct): "Yes, add the Android test app" — an APK friends install on Android phones from a link,
before any store account exists (D-052). Tech §8.5; docs/ANDROID-TEST-APP.md.
- *Capacitor 8.5.3* (exact pins; 8.6.0 came out the same day, too new), `appId`
  `na.tarantal.madness`, the `android/` project committed without build outputs.
  `npm run build:android` (`VITE_PLATFORM=capacitor`, the same Vite config and Phaser shader fix)
  → `dist-android/` → `npx cap sync android`. Every asset group, Standard and HD, is inside the
  APK; the app never downloads art. APK ≈ 30 MB (CI, 1.9.5).
- *The `capacitor` adapter:* no ads, no service worker or manifest, no admin page; native share
  sheet else the clipboard; share links point at the public Pages build; external links open in
  the system browser; `capabilities()` standalone, no fullscreen button. A new
  `openExternal(url)` on every adapter and an optional `onBackButton(fn)`.
- *Phone behaviour:* landscape locked, immersive full screen, the screen kept on during play (the
  app's own small `TmScreen` plugin rather than a community keep-awake plugin). The back button
  is Escape (pause in a hunt, Resume in the pause menu, Back in menus); only on the title does
  the app go to the background, so it never leaves a hunt without the pause menu. Going to the
  background reports the page hidden when the WebView does not, so audio mutes and the hunt
  pauses on the existing `visibilitychange` paths. Storage: the WebView's `localStorage` persists
  in the app's data across restarts and updates.
- *Version:* versionName = package.json version, versionCode = MAJOR·10000 + MINOR·100 + PATCH
  (1.9.5 → 10905), so each build installs over the previous one.
- *Signing:* a dedicated test key (`android/test-signing/`, PKCS12 made with OpenSSL, public
  passwords in the Gradle file) labelled TEST ONLY; a store release needs the product owner's
  private upload key, never committed, and an App Bundle.
- *Delivery:* `.github/workflows/android.yml` (label `android` on PRs; called by `pages.yml` on
  main) uploads `tarantal-madness-<version>.apk` (14 days) and checks its certificate; Pages
  serves `/android/tarantal-madness.apk` and an install page `/android/` (en/af/de/nl). The game's
  deploy does not depend on the APK build; `/android/` is outside the first download (size-check)
  and the game's service worker. First download unchanged (web 2,991.4 KB).
- *Icon and splash* from the game's guineafowl art (`tools/make-android-icons.ts`): the head on
  the Karoo dusk as an adaptive icon, the whole bird on the same gradient as the launch screen.
- *Out of scope:* iOS (needs an Apple developer account), store listings or uploads, ads,
  in-app purchases.

**D-060 1.9.6 Season Run: [Save & leave] on every screen between hunts (29 Oct 2026):** the
product owner, after playing the Android test app (29 Oct): the Farm Stall offers only [Reroll]
and [Next hunt] — "what if you don't want to continue playing now? There's no way out … these
bottle caps need to be stored so that you can reuse them later." GDD §13.6.
- *What was there:* every run step was already in the save (RunFlow writes it), and the title's
  "Continue run" resumed on the same screen; but only the hunt card had a way out ([Menu]), the
  run tally and the Padstal had none, Escape / the Android back button did nothing on any run
  screen, and nothing said the caps were kept.
- *Change:* [Save & leave] bottom-left on the hunt card (was [Menu]), the run tally (while the
  run goes on) and the Padstal ([Reroll] moves beside it; [Sell] moves to the row above); it
  returns to the title with the run untouched. Escape and the Android back button do the same
  (D-058: back is that screen's Back); on the Padstal they first close the help card; on a lost
  run's tally they go on to the summary; on the summary ([Menu]) they go to the title. The
  Padstal's help card gains a line saying so.
- *Title:* over "Continue run" a status line gives the run's place and caps ("Autumn · hunt 2 of 3
  · 12 caps"; between hunts it names the next hunt), kept within the button's width so it never
  meets the Daily's status line.
- *Not changed:* the doppies stay in-run currency (§13.4: no meta currency to grind or sell).
  Leaving pauses the run; the caps wait in it, as the product owner asked ("reuse them later").


**D-059 1.9.7 Namibië veld life: grass and sand, ostriches, oryx in the mirage, balloons (29 Oct
2026):** the product owner (25 Oct): "at least two ostriches with somewhere an ostrich nest … some
oryx antelopes … far away in the distance, and there needs to be some mirage attached to that. And
maybe some hot air balloons drifting by", and "The grass landscapes in the Namibia one also look
very rough still". Decided:
- *Ground and grass:* ink-free Namib sand baked in the layers (ripples, swells, grain, gravel,
  quartz, tracks, lit sand-ridge plane edges) and the grass, dollar bush and dead branches as
  **sprites from one small sheet** (`namibie/veld`, 22 frames) placed at the art's recorded
  placements (`veld-namibie.json`, ~1 500): baking hundreds of fine clumps into the layers cost
  ~4× the bytes (mid + near + foreground +600 KB against ~240 KB of room). The five 2×-master
  Namibië props (camelthorns, quiver trees) are 1× in Standard with their 2× twins in the HD pack
  (as D-057), which paid for the life. The Kalahari keeps its ground (its own job if wanted).
- *Ostriches:* in the sim like the meerkats (D-044): own stream `ostriches`, non-targets, −10 per
  2 s for a bird or the nest, never hurt; nearby shots and the Langloop make them run and come
  back. On the mid plane at 197 px to the head (true scale would be 552 px; the PO found the far
  ostriches too big at 0.45 × true). **One pair per map:** a second pair (tried on the calm days)
  stood in the mid flocks' ground band and drew ~1 accidental −10 per competent hunt (one pair:
  0.1–0.2). Their sheet stays Standard in HD (a 2× twin is 25 MB of texture). No near-plane pair: at that scale an ostrich stands ~470 px and covers the planes
  behind (the content check forbids it).
- *Oryx:* view-only, a roaming FaunaView of the far gemsbok sheet (no new art) with a reflection
  and a waver driven by the heat (the mirage omen, the light). No filter pass: Phaser 4.2.1
  containers take none, and a Displacement filter per part would cost a render pass each on
  phones; the brief's fallback (reflection, no bending) plus a sideways waver.
- *Balloons:* a non-target `drift` creature (sim: hits, penalty 25 with a 2 s cooldown, never
  bagged), the `balloons` event (+ one on `dawn_mist`/`bright_calm` days via the new event
  `lights` filter), spawned upwind beside the view, high over the birds' lanes; drawn by the lazy
  BalloonView (its own 4.6 KB sheet; BirdView skips drifters). The competent bot hits one in
  0.05–0.1 hunts.
- *Bytes:* the ostrich sim and content cost +3.6 KB in the first download; `sfx/weavers` moved to
  the desert group (only the desert maps have weaver nests): first download 2,970.9 KB (main
  2,991.6); Namibië + desert 1,456 KB of 1,536 (main 1,483.5); Kalahari + desert 1,377 KB.
- *Balance:* `docs/balance/v1.7d-namibie-life.md` (before = this build without the pairs and the
  balloon events).
- *Perf (review, CI run 40842297447: Pixel 7 Namibië CPU 17.6 ms against 16.67, HD memory sampled
  with the Karoo's HD layers still in):* the ground cover is **baked** into DynamicTexture strips
  (1024-px columns trimmed to their tufts, 15 pieces, 13.7 MB, Standard resolution in HD too; the
  veld sheet has no HD twin), the nest and its eggs into one clutch image; the veld life's
  per-frame update allocates nothing and sets only what changed, the oryx reflection copies the
  herd's pose, off-screen balloons are hidden; layer tiles with the same file share one texture
  (Namibië's five identical empty HD foreground tiles: −12.5 MB). The veld life has its own
  timer (`namibLifeMs`, ≤ 0.5 ms a frame at 4×); the HD-memory test waits (bounded) for two HD
  refreshes and no other area's HD layers, since refreshHd runs every 30 rendered frames.


**D-061 1.9.8 Bushveld realism, and tell animals instead of the secret star (29 Oct 2026):** the
product owner (25 Oct): "In the Bushveld, the rocks and the middle distances also look a little
bit childish, cartoonish. They need to look more realistic. And I also don't like this little
star effect that pulls attention to the special areas one can shoot … Either a very unique animal
that always appears there, or something, but that star thing is not working for me." Shown
mock-ups of three cues on 28 Oct (A: a tell animal at each secret; B: natural cues only; C: no cue
on the map, Oupa hints in words), they gave no answer by 10:00 on 29 Oct, so the recommended
option A stands (their standing instruction: go with the recommended options).
- *Rocks, hills and ground (rendering only; replays unchanged by it).* Bushveld boulders, the
  dassie koppie, the cracked boulder and the foreground piles are ink-free weathered granite
  (`tools/art/granite.ts`: gradient light, rim tones, undercut, contact shadow, exfoliation shells,
  rain streaks, iron stains, lichen, cracks, grain, grass at the foot). The far ridge is three haze
  rows of bushy koppies and ridges (`tools/art/bushHills.ts`; tree-crown skylines, granite faces and
  boulder knobs, gullies, tree dots; haze by colour, never alpha) instead of smooth orange cones and
  mesas. The mid and near ground get red-earth and pale-grass patches, a game path, termite mounds
  and dwala sheets (`tools/art/bushveldGround.ts`); the ink lines between the planes are a lit crest
  with grass over it. Shrub and grass ink on those layers is a dark tone of the grass, not black.
  Art bible §4.2. The baobab, the herds and the residents are unchanged.
- *Size.* The Bushveld chunk went 1,525.0 → 1,480.5 KB (budget 1,536): the baobab is 1× in
  Standard with its 2× twin in the HD pack (as the Kalahari weaver tree, D-057; HD texture memory
  unchanged), patches and crests have crisp edges (a blurred edge costs palette entries), the dwala
  have no noise grain, and the foot of the far ridge, always hidden by the far veld, is one flat
  colour (−23 KB on that layer). HD: every redrawn layer and prop has its 2× twin.
- *Tell animals (cue A).* Thirteen species, one per paying secret (GDD §11.1c): drongo, rock agama,
  striped skink (Bushveld); lilac-breasted roller, flap-necked chameleon (Kalahari); rock kestrel,
  Cape wagtail, striped mouse, fiscal shrike (Karoo); pied crow (Namibië); malachite kingfisher,
  red-billed oxpecker, African jacana (Okavango). The "don't shoot it" weaver nests get none. Each
  secret names its tell in the biome file (Zod; cross-refs: every paying secret has one, one secret
  per species, its hit shape never touches the secret's part or a rotor's sweep).
- *Why a sim entity.* The brief asks that a hit on the tell costs nothing and sends it off: so it
  is hittable, and a hit must be decided by the sim (replays, the Daily). Tells are hit extras on
  their prop's layer with their own RNG stream (`tells`); a shot that only hits a tell counts as
  hitting a thing (no Frenzy change, D-021). Golden replays re-recorded on purpose: 6 of 41 event
  streams changed where a bot's pellet meets a tell; no score changed. Tech §3.12c.
- *Readable, and on their props (review R6–R9).* Each species has a `scale` in `birds.json`
  (sprite and hit shape grow together) so the small ones are ≥ ~14 screen px at 1280 px wide on
  the mid plane (agama 1.8, skink 1.9, kingfisher, wagtail and oxpecker 1.5 …), with clear key
  marks (the agama's blue head and orange tail, the drongo's deep fork, the roller's turquoise and
  lilac, the rufous kestrel, the jacana's long toes). A unit test checks every tell's feet stand on
  opaque prop art (`tools/art/tellFeet.test.ts`; the jacana brings its own lily leaf). They fade in
  only at the hunt's start or back from a flight, never after their own action.
- *The glint retired.* `fx/glint` and `juice.glintEveryMs/glintMs` are gone. Oupa se Kaart, a dusk
  map and the Meerkat Spotter now give the tells a soft warm outline (a warm fill of the frame
  behind the animal) instead of rings on the secrets; "reduce flashes" has nothing to dim there
  (it never flashes). Oupa's Map text stays ("Secrets glow": their tell animals do; it never named the glint). The FTUE line ("Hmm, Oupa's wind
  pump…") stays: the kestrel sits on the pump it names.
- *First download (must not grow).* `TellView` is a lazy chunk (1.3 KB gzip); the sheet (2×, one
  for all thirteen) is in the late group (Standard 17 KB, HD 36 KB); names live in the lazy guide
  tables (`guide.tell.<id>`). The sim's tell code is paid for by the removed glint art: the first
  download is 2,972.3 KB, 25 bytes under main.
- *Phone performance (D-059 rules).* Two images per tell at most, properties set only on change,
  no per-frame allocations, its own timer (`tellMs`, perf.spec ≤ 0.2 ms a frame at 4× throttle on
  the Pixel 7 Namibië run).

**D-062 1.10.0 Bobbejane: baboon troops on the ridges, raiders that come down (29–30 Oct 2026):**
the product owner (25 Oct, ~20:20): "It's important in these maps that the African baboon is also
present, maybe sitting at the back of the mountains, because they are also problem animals and
people tend to shoot at them, so one should always see them here and there. Pop up and do
something naughty that might get them to eat a bullet or two."
- *Decided with the product owner the same evening: a shot baboon goes down and is bagged like a
  guineafowl* (not just scared off). Only raiders (adult and young males that came down to cause
  trouble) are targets; mothers carrying babies and the babies stay on the ridge and cost points
  if hit. The game's tone stays: no blood, the guineafowl's tumble and puff, Oupa's humour.
- *Portals may rate it older.* Shooting a mammal (even a cartoon "problem animal", bloodless) may
  push an age rating up on some portals and stores (an IARC questionnaire asks about violence
  against animals). Poki and CrazyGames are no longer targets (D-052); for the App Store and Google
  Play the rating questionnaire must mention it. If a store objects, raiders can become
  scare-only by content alone (`birds.json → baboons.hit.hitsToBag` very high: every hit sends
  the raider and its troop off, none is bagged), a store build's content override.
- *Rules (GDD §11.3d).* A troop of 5–10 on each map's far ridge (the Kalahari: chance 0.3, its
  rocky outcrop only), seats on the ridge art's skyline (`tools/art/ridgeLine.ts`). ~1.2 raids a
  minute with a build-up (the lookout barks, a raider climbs down, then walks in at a raid spot on
  the mid plane). 2 hits bag a raider for 3 × a guineafowl's base on its plane (an event bonus ×
  Frenzy × Stampede), +15 before its raid is done; a mother costs 15 (2 s cooldown); any hit, or the
  Langloop, sends the troop over the ridge for 14–22 s. A finished throw or chase threatens the
  flocks nearby. Mothers take the troop's highest seats and never walk: the first sweep showed
  0.2–0.8 accidental mother hits a hunt on the Okavango (its troop sat ~35 px above the far flocks'
  ground band).
- *Line of fire (review round 2).* A pellet aimed at a fruit (view-only: the Okavango's sausages)
  or a little off a secret's part or tell flies on to the far ridge; with the troop behind, a mother
  cost 15 (fruit.spec on the Okavango). Every map now keeps the seats mothers can take out of the
  line of fire of every fruit, paying secret part and tell on the near and mid planes over the whole
  camera sweep (the ridge scrolls slower, so x lines up somewhere; y must not overlap):
  `tools/art/troopLineOfFire.ts` and its test. The troops moved to clear stretches (Karoo u 0.425,
  Okavango 0.8417, Namibië 0.425; Bushveld unchanged), and the Kalahari has no troop on Friday (its
  dead camelthorn's branch lines up with every stretch of the ridge). The "don't shoot it" weaver
  nests are no targets. e2e specs that shoot at other things or count the score use `?baboons=0`.
  Raid spots that would put a raider over a secret's part, a tell animal, a meerkat
  colony or an ostrich pair are left out on that map (`src/sim/baboons/spotClear.ts`, shared by the
  sim and the content check; ≥ 2 clear spots on every map).
- *Sim (Tech §3.12d).* Own stream `baboons`; hit kind `baboon`; events `baboonRaidWarned`,
  `baboonRaidStarted`, `baboonRaidDone`, `baboonHit`, `baboonBagged`, `troopFled`; bonuses `baboon`,
  `raidStopped`. Golden replays re-recorded on purpose (every map with a troop gains its events;
  one random-bot replay lost 15 to a ridge mother); the v3 fixtures' hashes re-derived.
- *Size: lazy sim systems.* The baboons' sim code (~5 KB gzip) went into a lazy chunk with
  Namibië's ostriches (D-059) and the tell animals (D-061), moved there unchanged (every golden
  replay passed as recorded), so the first download pays for none of them. The game loads the chunk
  from the title; a hunt that needs it waits (offline: Retry or Back, D-042). The baboon sheet is
  its own group, `baboons` (2× master, Standard 90 KB, `baboons-hd` 189 KB), loading in the
  background after the first download like the late group; a hunt with a troop waits for that one
  file (the troop can be hit from the first tick, so it must be drawn then; review round 1). The
  view is a lazy chunk, Oupa's lines are in the lazy guide tables (en/af/de/nl), voiced in en/af/de
  with the interim TTS (D-041), and the voice packs' index entries moved to a lazy
  `asset-index-voice.json` (fetched when a pack first loads), which pays for their ten new lines.
- *Hit order (review round 1).* The baboons' hit shapes come after a layer's secret parts and tell
  animals: where a raider walks in past one, the secret takes the pellet (spotClear checks only
  where raiders stand at their mischief). Members climbing over the ridge can't be hit.
- *Low tier.* A far ridge with a troop is no longer merged into the far veld on the low tier: merged,
  its art would scroll at the far veld's rate while the troop's hit shapes stay at the ridge's. So
  troop maps draw 6 layers on the low tier (5 before); the sim must be the same on every tier, and
  the perf jobs (desktop and Pixel 7, incl. the low tier's 50 fps at 6× throttle) passed with it
  (supervisor's decision, 30 Oct). quality.spec checks the merge on a map without a troop and the
  unmerged ridge on a troop map.

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

**Makalani palm (D-056)**
- *Hyphaene petersiana*, the real fan palm: northern Namibia, the Kunene and the Okavango, often in
  pairs or small groups by water; nearly round fruit 40–60 mm, green → orange → glossy dark brown
  over about two years, on long branched, knotted stalks below the crown; the hard ivory kernel
  ("vegetable ivory") is carved into key rings, necklaces and ornaments (oryx, elephants,
  cheetahs); elephants and baboons eat the pulp; the leaves are woven into baskets.
- Sources: [Gondwana Collection — Is the makalani palm really that useful?](https://gondwana-collection.com/blog/is-the-makalani-palm-tree-in-namibia-really-that-useful) ·
  [TravelNam — makalani](https://travelnam.com/?p=43892) ·
  [Cheetah Conservation Fund — the art of makalani nuts](https://cheetah.org/ccf-blog/ccf-in-namibia/the-art-of-makalani-nuts-richard-and-eddies-craftsmanship-in-namibia/) ·
  [Travel News Namibia — trees: cosmetic oil, palm wine and African sandalwood](https://travelnewsnamibia.com/trees-cosmetic-oil-palm-wine-and-african-sandalwood)

**Baobab life and sociable-weaver colonies (D-057)**
- *Baobab fruit:* large (15–22 cm), hairy, grey-green to yellow-brown egg- or sausage-shaped
  capsules hanging on long stalks all over the bare tree; the tree is leafless most of the year,
  so fruit on bare branches in the Bushveld winter is right.
  Sources: [worldplants.ca — Adansonia digitata](https://www.worldplants.ca/display.php?id=3700) ·
  [NTBG — Adansonia digitata](https://ntbg.org/database/plants/detail/adansonia-digitata)
- *Who lives in baobabs:* hollows shelter galagos (bushbabies), tree squirrels, rodents, lizards
  and snakes; larger cavities hold barn owls or ground hornbills; hornbills, rollers, parrots,
  kestrels and spinetails nest in holes; wild honeybees hive in hollows; red-billed and
  white-billed buffalo weavers build their stick nests in baobab crowns so often they could be
  called "baobab weavers".
  Sources: [NTBG — Adansonia digitata](https://ntbg.org/database/plants/detail/adansonia-digitata) ·
  [Weavers of the world — red-billed buffalo weaver](https://weavers.adu.org.za/spcat.php?spc=22) ·
  [Rufford Foundation — Tiwonge Gawa, baobab fauna](https://www.rufford.org/projects/tiwonge_gawa)
- *Sociable weaver colonies:* up to ~100 families in one nest, some used for over a century; the
  African pygmy falcon lives almost only in weaver colonies; pied barbets, familiar chats,
  red-headed finches, ashy tits and rosy-faced lovebirds also use the chambers; owls, vultures and
  eagles roost on the roof.
  Sources: [San Diego Zoo — sociable weaver](https://animals.sandiegozoo.org/node/229) ·
  [Audubon — Africa's social weaverbirds](https://www.audubon.org/) ·
  [Tswalu — pygmy falcon research](https://www.tswalu.com/) ·
  [Colossal — sociable weaver nests](https://www.thisiscolossal.com/?p=30414)

## 4. Open questions for the product owner
1. Portrait support in v1? (Default: no.)
2. Primary launch market and languages beyond EN/AF/DE/NL?
3. Budget for a human illustrator, animator, voice actor and composer (art bible §9–10)?
4. ~~Which portal first: Poki or CrazyGames?~~ Answered 27 Oct (D-052): neither; friends first, then the Apple App Store and Google Play.
5. Keep the hunting framing for all markets, or offer a "camera safari" reskin for sensitive markets?
