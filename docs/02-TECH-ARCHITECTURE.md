# Tarantal Madness — Technical Architecture

Status: v1.0 build baseline · 19 Oct 2026

## 1. Platform decision (answer to "JavaScript or something else?")

**Decision: TypeScript (strict) + Phaser 4 + Vite.** Browser-native JavaScript is the right base for a
game whose first home is desktop and mobile browsers and web portals.

| Option | Verdict | Why |
|---|---|---|
| **Phaser 4 + TypeScript** | ✅ Chosen | Purpose-built 2D web framework; v4.0.0 shipped 10 Apr 2026 with a rebuilt WebGL renderer, unified Filter system, GPU sprite layers and **28 AI-agent skill files** in the repo (ideal for Claude Code). Latest on phaser.io as of 19 Oct 2026: **v4.2.1 (9 Jul 2026)**. Official Spine runtime `spine-phaser-v4` (v4.3.11 needs Phaser ≥ 4.2.1). Every portal accepts it. Small download. |
| PixiJS v8 | ❌ | Excellent renderer, but you would hand-build scenes, input, audio, cameras, loaders — the parts Phaser gives you. |
| Godot 4.x (web export) | ❌ for this game | Viable, but C# can't export to web, ~5 MB Brotli empty build, iOS needs the single-threaded export; heavier and less portal-native than a JS framework. |
| Unity 6 (WebGL) | ❌ | Hardest fit for Poki's 8 MB initial-download target; slow mobile-web start-up. |
| Construct / GameMaker | ❌ | Proprietary formats hurt moddability and code review by Claude Code. |

**Future-proofing for mods and new platforms** comes from architecture, not engine choice:
1. A **deterministic simulation core** in plain TypeScript (no Phaser, no DOM) — runs in browser,
   Node (tests, balance bots, leaderboard validation) and any future renderer.
2. **Data-driven content** (JSON + Zod schemas) with content packs → modding without code.
3. A **PlatformAdapter** seam → Poki, CrazyGames, PWA, Capacitor (iOS/Android), Electron/Tauri (Steam)
   from one codebase.

## 2. Repository layout

```
tarantal-madness/
├─ CLAUDE.md                      # project memory for Claude Code (keep < 200 lines)
├─ .claude/
│  ├─ rules/                      # path-scoped rules (sim purity, content, game layer)
│  ├─ skills/                     # /milestone, /tune + Phaser 4 skills copied from the Phaser repo
│  └─ agents/playtest-reviewer.md # adversarial reviewer subagent
├─ docs/                          # GDD, this file, art bible, build plan, decisions
├─ content/                       # ALL tuning + content data (JSON), validated at build time
│  ├─ scoring.json  birds.json  weapons.json  powerups.json  charms.json  run.json  modes.json
│  └─ biomes/karoo-autumn.json …
├─ public/assets/                 # packed atlases, audio sprites, fonts (generated; not hand-edited)
├─ art-source/                    # (git LFS or separate repo) PSD/Krita/Spine sources
├─ src/
│  ├─ main.ts                     # boot: platform adapter → content → Phaser game
│  ├─ sim/                        # PURE deterministic core (see §3)
│  │  ├─ Sim.ts                   # createSim(config) → { step(commands), snapshot(), events }
│  │  ├─ rng.ts  detmath.ts  clock.ts  types.ts  events.ts
│  │  ├─ camera.ts                # pan state lives in the sim (needed for replays)
│  │  ├─ birds/                   # Bird.ts, Flock.ts, flockFsm.ts, steering.ts, popups.ts
│  │  ├─ director/                # SpawnDirector.ts, pacing curves, event scheduler
│  │  ├─ weapons/                 # weaponState.ts, pellets.ts, projectiles.ts, wind.ts
│  │  ├─ scoring/                 # pipeline.ts, frenzy.ts, bonuses.ts
│  │  ├─ props/                   # secrets, occluders, crates
│  │  ├─ charms/                  # effect interpreter + registry for scripted charms
│  │  ├─ run/                     # Season Run state machine, quotas, Padstal, doppies
│  │  └─ replay/                  # InputLog, encode/decode, verify
│  ├─ content/                    # schemas.ts (Zod), loader.ts, registry.ts, packs.ts, hash.ts
│  ├─ game/                       # Phaser 4 layer (rendering, input, audio, UI)
│  │  ├─ scenes/                  # Boot, Preload, Title, Shed, Hunt, Hud, Padstal, Tally, Settings, Pause
│  │  ├─ view/                    # ParallaxView, BirdView, PropView, WeaponView, Fx (feathers, bubbles)
│  │  ├─ input/                   # InputMapper (pointer/touch/keyboard/gyro → Commands)
│  │  ├─ audio/                   # AudioDirector (sprites, stems, ducking, panning)
│  │  ├─ ui/                      # UiKit components (buttons, cards, panels) in comic style
│  │  ├─ quality/                 # QualityManager (tiers, benchmark)
│  │  └─ placeholder/             # ProceduralAssetFactory (playable before real art)
│  ├─ meta/                       # storage.ts, save.ts (+ migrations), unlocks, birdbook, daily, share, challenge
│  ├─ platform/                   # PlatformAdapter.ts + web.ts, poki.ts, crazygames.ts, capacitor.ts
│  ├─ i18n/                       # i18n.ts + en.json, af.json, de.json, nl.json
│  └─ debug/                      # dev overlay, URL params, hitbox drawing (stripped from prod)
├─ tools/                         # validate-content, balance-sim, size-check, pack-atlases, golden-update
├─ tests/e2e/                     # Playwright specs
└─ server/                        # (v1.x) leaderboard worker using src/sim for replay validation
```

## 3. Deterministic simulation core (`src/sim/`)

### 3.1 Contract
```ts
// src/sim/Sim.ts (shape, not final code)
export interface SimConfig {
  seed: number;                 // u32
  content: ContentBundle;       // validated, frozen
  mode: ModeConfig;             // classic | daily | seasonHunt | ftue; seasonHunt carries `season`
                                // (charms in slot order, kind, boss, consumables, rental, runShellBonus)
  inputKind: 'pointer' | 'touch'; // fixed per hunt; selects aim-assist radii; recorded in the replay
  aimAssist?: 'off' | 'low' | 'standard'; // M5 Settings; scales the touch radii (scoring.json
                                          // aimAssistLevels); recorded in the replay (v2)
}
// The sim never knows the device's viewport width (see §3.3) — that is what keeps replays,
// the Daily Hunt and challenge links identical on every device.
export type Command =
  | { t: 'fire'; dx: number; sy: number }      // dx = design px from SCREEN CENTRE, sy = design px from top
  | { t: 'fireHoldStart'; dx: number; sy: number } | { t: 'fireHoldMove'; dx: number; sy: number }
  | { t: 'fireHoldEnd' }
  | { t: 'reload' }
  | { t: 'cameraTarget'; cx: number }          // camera CENTRE in reference units, quantised to 0.5
  | { t: 'gadget' } | { t: 'consumable'; slot: number }  // slot = consumables.length → rental
  | { t: 'charmOrder'; order: number[] };      // pause-screen reorder: new slot i = old order[i]
export interface Sim {
  step(commands: readonly Command[]): void;    // advances exactly one tick (1/60 s)
  readonly tick: number;
  snapshot(): Readonly<SimState>;              // for rendering + interpolation
  drainEvents(): readonly SimEvent[];          // typed events for audio/fx/analytics/UI
  isOver(): boolean;
  result(): HuntResult;
}
```

### 3.2 Rules
- Fixed timestep: **60 ticks/s**. The Phaser layer runs an accumulator, calls `step()` 0–N times per
  frame (cap 5 to avoid spiral of death) and interpolates rendering between the last two snapshots.
- **No** `Math.random`, `Date`, `performance.now`, DOM, `window`, Phaser imports, or async inside `sim/`.
  Enforced by ESLint `no-restricted-imports`/`no-restricted-globals` on `src/sim/**`.
- **RNG:** `sfc32` seeded via `splitmix32`, with **named streams** (`rng.stream('spawns')`,
  `'pellets'`, `'flockNoise'`, `'charms'`, `'shop'`, `'lightning'` …) so adding randomness in one system doesn't shift
  every other system's sequence.
- **Cross-browser determinism:** `+ − × ÷` and `Math.sqrt` are safe. `Math.sin/cos/atan2/exp/pow/log`
  are implementation-approximated in JavaScript engines and can differ between browsers — use
  `detmath.ts` (lookup tables + polynomial approximations) for anything that affects sim state.
  Rendering may use `Math.*` freely.
- Iterate collections in stable order (arrays with ids; never rely on `Object.keys` order of numeric-
  like keys or `Set` insertion when order affects results).
- The sim owns the **camera** (centre position `cx`) because a screen tap maps to a different
  position on each parallax plane — see the formula in §3.3.

### 3.3 World model (viewport-independent)
- **Visible design space:** height 1080; width from **1440 (4:3 tablets) to 2520 (21:9 phones)**;
  1920 is the 16:9 reference. Wider screens see more of the panorama, narrower ones less; the sim
  doesn't care.
- **Reference camera:** the camera centre `cx` travels over a fixed range `R = 3200` reference units,
  `cx ∈ [960, 960 + R]`. The clamp never depends on the device.
- **Layer geometry:** a layer with scroll factor `f` has a *core* width `W_f = 1920 + R × f`
  (mid plane f = 0.6 → **3 840**, the panorama width quoted everywhere; near 5 120; far 3 040; sky 2 080;
  foreground at 1.2 → 5 760), plus **300 px bleed art on each side** so a 21:9 screen at either end
  of the camera range never shows an empty edge (4:3 screens just see less).
- **Positions in content** use `u ∈ [0,1]` across a layer's core width (`x = u × W_f`) — fixed, not
  viewport-derived.
- **Tap → plane position:** `planeX = (cx − 960) × f + 960 + dx`, where `dx` is the tap's distance
  from the screen centre in design px; `planeY = sy`. Both the Phaser layer and the sim use this one
  function (`src/sim/camera.ts`).
- Planes: `near` (scrollFactor 1.0, scale 1.0), `mid` (0.6, 0.5), `far` (0.35, 0.22). Birds belong to
  exactly one plane; each plane has 2–3 y-lanes for ground birds and a sky band for flyers.
- Hitboxes: per animation state, body ellipse + head circle, defined in `birds.json` in sprite-local
  units; scaled by plane. When `inputKind = 'touch'`, radii grow by `aimAssistPx[plane]`.
- Occluders: per-prop polygons/ellipses from biome JSON; a pellet stops at the first occluder or
  target it meets in near → mid → far order.
  Layers are walked front to back by scroll factor (foreground 1.2 → near → mid → far); on a plane
  layer its birds stand in front of its own props, and a layer's props block every layer behind
  (D-018). The world constants above live in `src/sim/world.ts`.

### 3.4 Shot resolution
- Shotgun: on `fire`, draw `pelletCount` offsets from `rng.stream('pellets')` inside a disc of
  `spreadPx` (uniform by area), apply wind drift (far plane, wind-sensitive weapons), test each pellet
  front-to-back. A shot counts as a **hit** on a target when its pellets on that target ≥
  `min(pelletsToBag, weapon.pellets)` (single-projectile weapons always qualify). Pellets never
  accumulate across shots. Targets track `armorHits` remaining, then `hitsToBag` (default 1).
- Each shot produces at most **one threat per flock** within the weapon's `alertRadiusPx` of any
  pellet impact (GDD §6.1–6.2); silent weapons produce a threat only for the bagged bird's own flock.
  The radius is design px at the mid plane and scales with `plane.scale / mid.scale`; each impact
  is projected onto the flock's plane with `tapToPlane`. A shot resolves damage first (bags score
  at the behaviour the bird had), then Whole Flock, then its threats (`src/sim/flocks/threats.ts`).
- Projectile weapons (Kettie): **delayed hitscan** — travel time per plane (near 80 ms, mid 180 ms,
  far 350 ms), gravity drop and wind drift applied at arrival; the target may have moved (leading
  is the skill).
- Every resolution emits events: `ShotFired`, `PelletImpact`, `TargetBagged`, `Miss`, `FlockAlerted`,
  `FlockFlushed`, `SecretTriggered`, `ComboChanged`, `ScoreAwarded`, `PenaltyApplied`, …
- Hit order within a layer (M4): birds → crates → live secret parts → occluders. Secret parts are
  shapes from `props[].secret` (on a rotor they turn with it, `src/sim/props/secrets.ts`); a part
  already hit, spent or cooling down is not a target. Wind drift (omen) shifts the pellet's screen x
  on every layer at or behind the far plane. Order after damage: bags → bonuses → Whole Flock →
  crates opened → secret parts → threats. The active weapon (primary or crate weapon, M4) supplies
  pellets, spread (× power-up `spreadMul`), alert radius, wind sensitivity and score multiplier.

### 3.5 Birds and flocks
- `Flock` (`src/sim/flocks/`) holds members + FSM state (`forage | alert | run | flush | settle`;
  exit is per member at the panorama edge, the flock is removed when empty; `roost` arrives with
  the dusk biomes), the escalation-window timer (`escalationWindowMs`, 1.5 s) and state timers. One
  threat inside the window escalates one step; window expiry de-escalates ALERT → FORAGE (GDD
  §6.1). A late threat in RUN reopens the window without flushing. Whole Flock stays possible only
  until the flock first calms down (ALERT → FORAGE or SETTLE) or a member exits (D-020).
- Members steer with boids (separation, alignment, cohesion) + a flock goal + zigzag noise from
  `rng.stream('flockNoise')`; foraging birds feel the goal only beyond half the wander radius so
  they spread out. Flight = launch after a 0–300 ms stagger at 55–75° → flap (climb levels out at
  a cruise height in the sky lane, crossing at fly·cos θ) → glide (glide·cos θ, sinking) → land →
  run on → SETTLE. All tunables in `birds.json → flockDefaults`.
- World-event reactions are `threat | run | flush` over a scope `all | visible | area`
  (`reactionTargets`); hadeda = one threat to every flock, Vuvuzela = flush the visible ones,
  Stampede start = every flock runs (`pacing.stampede.flockState`).
- Fly-overs and pop-ups are separate lightweight behaviours.
- Bosses are birds with extra components (`armorHits`, `bossRule`, scripted moves).

### 3.6 Spawn director
- Budget-based: each biome defines `pacing` keyframes (`t: 0..1 → flocks per plane, flyoversPerMin,
  popupsPerMin`). Flock counts step at each keyframe (live flocks are topped up to the target);
  rates interpolate. Max 60 birds and `maxFlocks` on screen. Hunt-start flocks forage in view;
  later ones spawn out of view (never closer than `spawnSpacingPx` to another flock on the plane).
  Flocks use their own stream `rng.stream('flocks')` (they draw no `spawns` numbers), but share the
  per-hunt caps (`maxPerHunt`) with fly-overs, so a rare morph in a flock is not seen again aloft.
  During the Stampede every flock — live or new — runs toward the screen centre.
- All windows in content (events, crates) are **fractions of hunt length** (`window: [0.2, 0.8]`).
- The **Stampede** has one source of truth: `scoring.json → stampede.lastSeconds`. When the mode (or
  the Stampede-Kenner charm) enables it, the director switches to its surge profile at
  `duration − lastSeconds` and the pipeline applies `stampede.mul`.
- Events (hadeda, dust devil, crates, stampede) come from a seeded schedule generated at hunt start —
  this is what makes the Daily Hunt identical for everyone. Crate times and contents use their own
  stream `rng.stream('crates')` (windows from `powerups.json → crates`); the omen (wind, dust
  devils) uses `omen`, the kwêvoël `perch`, the boss `boss`, secret-reward flocks `secrets`.
- World-event ids (used by biome JSON and the charm action `spawnEvent`): `hadeda`, `cropSprayer`,
  `kwevoel`, `dustDevil`, `farmDog`, `carAlarm`, `reservoirFlush`, `bossAppearance`, `crate`, `stampede`. Each has a
  handler in `director/events.ts`; unknown ids fail content validation. `WORLD_EVENT_HANDLERS` maps
  each id to a handler kind (a typed `Record`, so a new id fails the typecheck until it has one):
  `flyover` (hadeda, crop sprayer), `perch` (kwêvoël: flies to one of `perchProps`' `perch` point,
  stays `stayMs`, calls, flies off), `boss` (appears at a perch point, roams `roamPx`, stays
  `stayMs`), `dustDevil` (`plane`, `radiusPx`, `lifeSeconds`, `speedPxPerSec`), `secretReward`
  (`carAlarm`, `reservoirFlush`: only set off by a secret's reward, which carries its own
  `reaction`, `at` prop and `flushBirds`), `crate`, `stampede`, `later` (`farmDog`, M6). Builders
  live in `director/worldEvents.ts` and read only the biome entry and the creature.
- Omen (M4): `ModeConfig.omen` if given, else `modes.json → <mode>.omen` (Classic off, Daily on);
  omen-only events and the biome's `omen.wind` run only then (`src/sim/omen/`).

### 3.7 Scoring pipeline
Implement GDD §5.3 exactly in `scoring/pipeline.ts` as a pure function:
`scoreBag(ctx: BagContext, modifiers: readonly Modifier[]) → { points, mult, award, breakdown }`.
The `breakdown` array feeds the pop-up UI and the tally screen. Golden-table unit tests cover it.

### 3.8 Charms (effect interpreter)
Charms are data. The interpreter subscribes to sim events and applies effects through the scoring
pipeline or sim actions.

```jsonc
{
  "id": "vlerkskoot",
  "rarity": "common",
  "effects": [
    { "on": "bag", "if": { "behaviour": ["flying"] }, "do": { "addMult": 2 } }
  ]
}
```
- `on` (triggers): `passive` (stat modifier applied while equipped) | `runStart | huntStart | shot |
  bag | miss | reload | beltEmpty | gadget | flockAlerted | flockFlushed | flockWiped | twoFlies |
  secret | penalty | tick:every:<ticks> | timeLeft:<s> | huntEnd | shopOpen`.
- `if` (conditions, all must hold): `plane[]`, `behaviour[]`, `weapon[]`, `creature[]`, `boss`,
  `frenzyAtLeast`, `streakEvery`, `shellIndex` (`first | last | <n>`), `omenActive`, `omen[]`,
  `biome[]`, `kwevoelCalling`.
- `do` (actions): scoring — `addPoints`, `addMult`, `mulMult`, `addMultForHunt`, `bonusMul`,
  `penaltyOverride`; ammo — `addShells`, `shellCapacity`, `shellCapacityForRun`, `reloadSpeedMul`,
  `weaponBlastEvery`; flock/world — `alertRadiusMul`, `alertNearestFlock`, `flushFlocks`,
  `spawnEvent`, `spawnRateMul`, `windDriftMul`, `revealSecrets`, `slowMo`, `addTime`,
  `enableStampede`; frenzy — `frenzyMissBehaviour`; economy — `addDoppies`, `interestCap`,
  `shopSlots`, `rerollDiscount`.
- The vocabulary above is exactly what `content/charms.json` uses; the Zod schema must reject
  unknown triggers/conditions/actions so typos fail validation instead of silently doing nothing.
- Value semantics: actions ending in `Mul` multiply the current value; numeric stat actions
  (`shellCapacity`, `shellCapacityForRun`, `interestCap`, `shopSlots`, `rerollDiscount`, `addShells`,
  `addTime`, `addDoppies`) are **additive** (Spaarblik's `interestCap: 5` raises the cap from 5 to 10).
- **Order:** for each bag, charms apply in slot order (left → right) and, inside a charm, effects in
  listed order — `addMult` adds to the running Mult, `mulMult` multiplies it — then system
  multipliers (weapon, Frenzy, Stampede) apply last (GDD §5.3). Slot order therefore changes results;
  the UI lets players reorder charms.
- `gadget` trigger: a charm with a `gadget` block (e.g. Fluitjie) **replaces** the Vuvuzela on the
  gadget button while equipped (`gadget.replaces`, `gadget.cooldownMs`).
- Interpreter (`src/sim/charms/interpreter.ts`, M6): passive effects fold once into stats (belt,
  reload, alert radius, wind drift, bonus/penalty overrides, spawn rates, Stampede, frenzy-on-miss,
  gadget, shop stats). Per-bag effects return `Modifier`s for `scoreBag`; `addMultForHunt` builds up
  per charm and is applied as an `addMult` at that charm's own slot. Other triggers return actions
  the Sim applies through a queue, so an action that sets off another trigger (a charm flush →
  `flockFlushed`) runs after the current one instead of nesting. Content validation enforces where
  actions may appear: scoring actions only on `bag`, stat actions only on `passive`, no conditions
  on `passive`, `spawnEvent` only for spawnable handlers (`flyover`, `perch`, `dustDevil`,
  `farmDog`). `farmDog` (Bles) needs no biome entry; other spawned events use the biome's entry.
  Run-level actions (`interestCap`, `shopSlots`, `rerollDiscount`, `addDoppies` on `shopOpen`) are
  applied by the run engine (§3.9).
- Escape hatch: `"script": "<id>"` → a TypeScript charm registered in `charms/registry.ts` for effects
  the DSL can't express. Mods may **not** register scripts in v1 (no remote code, no `eval`).

### 3.9 Season Run state machine
`RunStart → (Hunt → Tally → Padstal) × 12 → Victory | Defeat` in `src/sim/run/run.ts` (pure; every
step takes the content and a `RunState` and returns a new one). `huntSetup()` turns the run into a
`SimConfig` (`seasonHunt` with its season block); `settleHunt()` checks the quota, pays doppies
(GDD §13.4) and clears used consumables and the rental; `openPadstal`/`buy`/`sell`/`reroll`/
`reorderCharms`/`leavePadstal` run the shop. Hunt seeds and Padstal rolls are derived from the run
seed and their position (`fnv1a32('hunt:<i>' | 'shop:<i>:<reroll>', runSeed)`), so the state needs no
RNG cursor. A season whose biome isn't loaded runs on `run.json → biomeFallback`. Run state (charms, doppies, seed
cursor, unlock flags) is serialisable and saved after every Padstal so a closed tab resumes the run.

### 3.10 Replays
`InputLog = { v, seed, contentHash, mode, inputKind, aimAssist?, commands: [tickDelta, command][] }`
(v2 since M5: an aim-assist byte follows the input kind; v1 logs still decode as `standard`; v3 since M6:
a flag bit adds the Season Run block and `charmOrder` is a command), delta + varint encoded,
then base64url'd (`src/sim/replay/inputLog.ts`). Deflate is applied outside the sim, at the
share/challenge-link boundary (M7), because it needs async platform APIs (D-018). Used for: golden tests, bug reports (attach log), ghost replays, and
(v1.x) server-side leaderboard validation by re-simulating in Node.

## 4. Content system (`content/`, `src/content/`)

- One Zod schema per file type in `schemas.ts`; types are `z.infer`'d — never hand-written twice.
- `npm run content:validate` (also in `npm run check` and CI) validates every JSON file and checks
  cross-references (biome → creature ids, charm → trigger names, run → boss ids; M4: a secret
  reward's `at` prop, its power-up, unique part ids, `perchProps` that have a `perch` point on a
  plane the creature uses, and each biome event's required fields for its handler kind).
  `--dir <path>` validates another content folder (used by the test that proves a broken
  cross-reference fails the CLI).
- `contentHash` = SHA-256 of the canonicalised bundle; part of every replay, daily seed and score
  submission (only official content counts for leaderboards).
- **Client-only feel** lives in `content/client/feel.json` (gesture thresholds, pan speeds, juice
  timings, HUD sizes, loop step cap, particle budget). It has a Zod schema and is validated by
  `content:validate`, but it is **not** part of the sim `ContentBundle` or `contentHash`: nothing in
  it can change a hunt's outcome (D-019).
- **Meta-only content** lives in `content/meta/` (M5: `notaboek.json`, the Notaboek challenges and
  their rewards). Zod-validated and cross-checked (weapon unlock ↔ challenge reward, secret
  counts, i18n keys), but like `feel.json` outside the sim bundle and `contentHash`: progression
  never changes a hunt's outcome. Settings tiers (quality, reduce-flashes alpha) and FTUE
  presentation timings are in `feel.json`.
- **Content packs / mods:** `mods/<id>/manifest.json` (`id`, `version`, `requiresContentHash?`,
  `adds`, `overrides`). Load order: base → official packs → user mods. v1 mods are data-only
  (new biomes from existing behaviours, new charms via the DSL, reskins). Mods mark the session
  "modded" (no leaderboard submission).

## 5. Rendering (`src/game/`)

- **Phaser 4** WebGL. Verify API details against the Phaser 4 skills in `.claude/skills/` — v4 replaced
  v3's pipelines with render nodes, merged FX + masks into **Filters**, and split tint colour from
  tint mode (`setTint(c).setTintMode(...)`).
- **Scale:** fixed design **height** 1080, flexible width 1440–2520 (4:3 to 21:9, EXPAND-style) so
  19.5:9 phones see more panorama instead of black bars and 4:3 tablets see less; the camera geometry
  is defined in §3.3. Beyond 21:9, pillarbox. HUD anchors to safe areas (`env(safe-area-inset-*)`).
  Implemented as `Scale.FIT` + `setGameSize()` from `designSizeFor()` in `src/game/layout.ts`
  (Phaser's own `EXPAND` grows the height on 4:3 instead — D-017).
- **Parallax:** 6 layers using camera scroll factors (sky 0.05 → far ridge 0.15 → far veld 0.35 →
  mid 0.6 → near 1.0 → foreground framing 1.2). Layer widths = core width from §3.3 + 300 px bleed
  per side. Layer art is cut into tiles ≤ 2 048 px wide.
- **Draw-call discipline:** all birds of a biome on one atlas page per tier; props on one; FX on one.
  Particles via Phaser's emitter (or `SpriteGPULayer` for large feather storms on high tier).
- **Quality tiers** (`QualityManager`): auto-picked from a 90-frame benchmark on the title screen +
  `hardwareConcurrency`/`deviceMemory` hints; user override in Settings.

| Tier | Render scale | Atlas set | Particles | Filters | Parallax layers |
|---|---|---|---|---|---|
| Low | 0.67 | @1x (≤ 2048² pages) | 40 % | none | 5 (far ridge merged into far veld) |
| Medium | 0.83 | @1x | 70 % | vignette, glare | 6 |
| High | 1.0 | @2x (≤ 4096² pages) | 100 % | + bloom, heat haze, lightning glow | 6 |

## 6. Input (`src/game/input/InputMapper.ts`)
- Pointer Events only (one code path for mouse/touch/pen); canvas CSS `touch-action: none`;
  prevent double-tap zoom, long-press callouts, text selection, overscroll bounce.
- Converts device input → sim `Command`s; owns gesture recognition (tap vs drag vs flick-down) and
  pan inertia (exponential decay, max 2 400 design px/s).
- Desktop edge-pan (outer 12 %), keyboard pan, right-click reload (suppress context menu).
- Phaser's own input and sound managers are disabled; `InputMapper` listens to Pointer Events on
  the canvas and keys on `window`. Gesture recognition (`gestures.ts`) and pan integration
  (`panController.ts`, advanced once per sim tick, sends `cameraTarget` only when it changes) are
  pure and unit-tested. A drag moves the camera so the mid plane follows the finger.
- The hunt's `inputKind` is fixed by the pointer that taps the start card (or [Again]): mouse →
  `pointer`, touch/pen → `touch` (aim assist).
- The fixed-step runner (`src/game/HuntRunner.ts`) follows the wall clock (`performance.now()`),
  not Phaser's smoothed frame delta, so a 90 s hunt lasts 90 s; hit-stop pauses its accumulator.
- Gyro "Kyk rond": `DeviceOrientationEvent.requestPermission()` on iOS must be called from a user
  gesture over HTTPS; map yaw delta → camera target with dead-zone + smoothing; recalibrate button.
- Haptics: `navigator.vibrate` where available (Android). iPhone Safari has no Vibration API.

## 7. Audio (`src/game/audio/AudioDirector.ts`)
- Phaser sound (Web Audio). Unlock on first user gesture (Phaser handles; verify on iOS).
- SFX as one audio sprite per biome + common; music as 3 intensity stems (calm / build / stampede)
  crossfaded by the director's intensity value; tempo-up variant for the Stampede.
- Stereo pan by screen x of the event; voice limit 16; duck music under Oupa barks.
- Mute on `visibilitychange`, on pause, and whenever the platform adapter reports an ad (Poki rule).
- Formats: AAC `.m4a` primary + `.ogg` fallback, loaded by array so the browser picks.

## 8. Platform layer (`src/platform/`)

```ts
export interface PlatformAdapter {
  id: 'web' | 'poki' | 'crazygames' | 'capacitor' | 'desktop';
  init(): Promise<void>;
  gameplayStart(): void; gameplayStop(): void;          // portals need these signals
  loadingProgress(p: number): void;
  commercialBreak(): Promise<void>;                     // between hunts only; resolves when done
  rewardedBreak(): Promise<boolean>;                    // true = reward granted
  isAdPlaying(): boolean;
  cloudSave?: { get(): Promise<string | null>; set(data: string): Promise<void> };
  user?(): Promise<{ id: string; name: string } | null>;
  shareUrl(base: string): string;                       // portal deep-link rules differ
  analytics(event: string, data?: Record<string, unknown>): void; // may be a no-op on some portals
  canShowExternalLinks: boolean;
  onAdChange(fn: (playing: boolean) => void): () => void; // AudioDirector mutes during ads
  capabilities(): { fullscreen: boolean; standalone: boolean; iphone: boolean };
  requestFullscreen(): Promise<void>;
}
```
- M5 ships the `web` adapter (`src/platform/web.ts`): no ads, analytics kept on the device (no
  network) until a privacy-reviewed endpoint exists, service-worker registration in production
  builds. The fullscreen/banner rules are pure functions in `src/platform/capabilities.ts`.
- Selected at boot via build flag (`VITE_PLATFORM`), never by sniffing.
- **Portal constraints** (verify against current docs before each submission):
  - **Poki:** initial download target < 8 MB; must work on desktop, mobile and tablet (tablets get
    mobile controls) and in incognito; on mobile the game must fill the screen in portrait or
    landscape; only Poki's ad system; remove external CDN dependencies; mute audio during ads;
    in-game privacy policy if you link out.
  - **CrazyGames:** initial download ≤ 50 MB (≤ 20 MB for the mobile homepage), total ≤ 250 MB,
    ≤ 1 500 files; mouse, keyboard and touch; many players on Chromebooks.
  - **YouTube Playables:** initial download under 30 MiB.
- **Our budget:** first playable hunt ≤ **5 MB** compressed (core + Karoo); other biomes lazy-loaded.

## 9. Mobile web specifics (the gotchas)
- **iPhone Safari has no element Fullscreen API** (iPad does; iOS 17.4 beta even removed an
  experimental flag). Don't show a fullscreen button there; instead show a one-time "Add to Home
  Screen for fullscreen" banner and ship a PWA manifest (`display: fullscreen`, fallback standalone).
  M5: both live in the DOM on the title only; the banner sits at the top edge (at the bottom it
  covered the title buttons on iPhone) and its dismissal is saved (`SaveData.notices`).
- **Offline (PWA):** `tools/serviceWorker.ts` writes `dist/sw.js` at build time with the exact
  build file list and a content-hash cache name; navigations are network-first with the cached
  `index.html` as the offline fallback (query ignored), everything else cache-first.
- Screen Orientation lock only works in fullscreen on Android; elsewhere show the rotate card.
- Handle `visibilitychange`/`pagehide`: pause the sim, mute, save.
- WebGL context loss (backgrounding, memory pressure): Phaser 4 has built-in context restoration —
  test it; re-upload textures; never lose the run.
- Memory: keep decoded texture memory < 256 MB on high tier, < 128 MB on low.
- Safe areas (notches), dynamic viewport units (`100dvh`), no scroll/pinch.
- `localStorage` can throw (blocked/private) → always via `meta/storage.ts` with in-memory fallback.

## 10. Assets pipeline
- Sources in `art-source/` (PSD/Krita/Spine) — keep them: they document human authorship (see art bible).
- `tools/pack-atlases`: exports → WebP atlases (+ JSON) per biome per tier; generates `assetManifest.ts`
  with content hashes for cache-busting.
- Characters: **Spine** skeletal animation recommended (one tarentaal rig, variants and bosses as
  **skins**/attachments; squash-and-stretch via mesh deform). Alternative: frame-by-frame atlases.
  Until art lands, `ProceduralAssetFactory` draws placeholder birds/props/layers at runtime so the
  game is playable from the first milestone.
- Audio: ffmpeg → `.m4a` + `.ogg`; loudness-normalise (−16 LUFS music, −14 LUFS SFX peaks ≤ −1 dBTP).
- Fonts: self-hosted, open licence (e.g. Bangers / Luckiest Guy for display); subset to used glyphs
  (include Afrikaans ê ë ô ï û ʼn and German ä ö ü ß — same list as the art bible §6).

## 11. Persistence (`src/meta/`)
- `SaveData` v1 (JSON, key `tm.save.v1`, schema `src/meta/saveSchema.ts`): `settings`, `ftue`,
  `notices`, `loadout`, `unlocks`, `notaboek` (progress + done), `birdBook` (creatures, secrets as
  `biome/propId`), `bests` per biome (Classic), `bestRank`, `stats`. Daily history, streak and the
  in-progress run join as new sections in M6/M7 (a new section needs no migration: it defaults).
- Loading (`src/meta/save.ts`): every section — and every field of an object section — is
  validated on its own, so damage falls back locally; text that isn't JSON is kept under
  `tm.save.corrupt` and the defaults are used; a save from a newer version is read but never
  overwritten. The `SaveStore` writes through on every change and on `pagehide`/hidden tab.
- Migrations: `migrations[from] = (old) => new`; tests for each. v0 = the loose M2 key
  `tm.settings.screenShake`, folded into `settings.screenShake` and removed.
- Cloud save via adapter where available; last-write-wins with per-section merge for unlocks (union).

## 12. Daily Hunt, share and challenge links
- `dailySeed = u32(SHA-256("tm-daily|" + YYYY-MM-DD(UTC) + "|" + contentHash))`. Biome rotates by
  day; omen + crate schedule derived from the seed.
- Share text is built locally (no server) and copied/shared via `navigator.share` when available.
- Challenge URL: `/?c=<base64url(JSON {v, seed, mode, biome, weapon, score, by?})>` — friend
  challenges only (trivially editable; no leaderboard trust).

## 13. Leaderboards (v1.x)
Small serverless API (e.g. Cloudflare Workers + D1, or Supabase). Client submits
`{ inputLog, claimedScore }`; the server re-runs `src/sim` in Node and stores the verified score.
Rate-limit per device; reject unknown `contentHash`. Replays double as "watch the #1 hunt" ghosts.

## 14. Analytics events (platform permitting)
`ftue_step`, `hunt_start`, `hunt_end` (mode, biome, score, accuracy, wingShotPct, flocksWiped,
secrets, penalties, durationMs), `run_end` (season reached, charms), `charm_pick`, `padstal_buy`,
`share_click`, `challenge_open`, `daily_play`, `settings_change`, `perf_sample` (tier, avgFps),
`error`. No personal data. Respect each portal's tracker rules. M5 emits `ftue_step` (start,
first_shot, first_bag, run, reload, flush, secret, complete, skip), `hunt_start`, `hunt_end` and
`settings_change` through `PlatformAdapter.analytics`.

## 15. Quality gates

| Gate | Tool | Budget / rule |
|---|---|---|
| Types | `tsc --noEmit` (strict, `noUncheckedIndexedAccess`) | 0 errors |
| Lint | ESLint (incl. sim purity rules) + Prettier | 0 errors |
| Unit | Vitest | sim, scoring, flock FSM, charms, run math, migrations |
| Golden replays | Vitest | fixed seed + input log → expected score + event-stream hash |
| Content | `tools/validate-content.ts` | all schemas + cross-refs pass |
| E2E | Playwright: desktop Chromium + WebKit, Pixel 7 & iPhone 14 landscape emulation | boot → hunt → 20 taps → tally |
| Visual | Playwright screenshots of HUD at 16:9, 19.5:9, 4:3 | reviewed on change |
| Perf | Headless Chrome, 4× CPU throttle, 30 s hunt (`tests/e2e/perf.spec.ts`) | avg frame ≤ 16.7 ms on medium tier: CPU cost per frame always; real frame time with `PERF_STRICT=1` on a GPU machine (D-019) |
| Size | `tools/size-check.ts` | initial ≤ 5 MB compressed (hard fail at 8 MB) |
| Sim cost | microbenchmark | `step()` ≤ 1.5 ms with 60 birds on a mid-range phone profile |

CI (GitHub Actions): install → `npm run check` → build → size → e2e. Deploy previews per PR to static
hosting (Cloudflare Pages / Netlify); `main` deploys the PWA.

## 16. Supported browsers
Last two major versions of Chrome, Edge, Firefox, Safari (macOS + iOS/iPadOS), Samsung Internet;
Android Chrome on mid-range devices from ~2021. WebGL2 required; show a friendly message otherwise.

## 17. Security and privacy
No PII collected; anonymous device id only if a platform needs it. No `eval`/remote code; mods are
data. CSP for the standalone site. In-game privacy policy screen. Bundle all dependencies (no
external CDNs at runtime).
