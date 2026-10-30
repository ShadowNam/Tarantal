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
│  ├─ i18n/                       # i18n.ts + en.json, af.json, de.json, nl.json (M9: all
│  │                              #   complete; content:validate checks every key per language)
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
- **RNG:** `sfc32` seeded via `splitmix32`, with **named streams** (v1.7 adds `'meerkats'`, §3.12) (`rng.stream('spawns')`,
  `'pellets'`, `'flockNoise'`, `'charms'`, `'shop'`, `'lightning'`, `'twist'` …) so adding randomness in one system doesn't shift
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
- Planes: `near` (scrollFactor 1.0, scale 1.0), `mid` (0.6, 0.42), `far` (0.35, 0.15), and since v1.3
  `ver` (0.22, 0.07; D-036, scales from D-049) on each biome's `ver_veld` layer, which `resolveMap` leaves out of every
  map that doesn't set `ver: true`. Birds belong to
  exactly one plane; each plane has 2–3 y-lanes for ground birds and a sky band for flyers.
- **Zoomed taps (v1.3):** rifle commands carry the aim in design px of the **unzoomed** screen
  (dx from the centre, sy from the top), exactly like `fire`. The zoom is only a view
  (`src/game/view/zoomView.ts`): every world layer is scaled by `z` around a centre `c`, so an
  unzoomed screen point `p` shows at `C + (p − c) × z`; the centre eases from the screen centre to
  the aim point while the sight comes up and is clamped to `[C/z, size − C/z]` so the view never
  leaves the screen. The reticle is drawn where the shot's unzoomed point shows. Device width
  never enters the sim, so a zoomed shot names the same world point on every screen (unit test
  across 4:3 – 21:9 and both phones).
- **Zoom steps (v1.4, D-038):** a variable scope's zoom is a `zoom` command carrying an integer
  step index (`sanitiseCommand` truncates it and drops a negative one; the sim clamps it to the
  sight's `zoom` list). The InputMapper sends one per wheel notch (`feel.input.wheelZoomStepPx`
  of travel, lines × 33), per + / − key, or per tap on the HUD's − / + buttons (touch,
  `feel.hud.zoomButtonPx`). A step while the sight is up applies at once (`aim.step`) and
  re-anchors fine aim at the current aim point, so later moves divide by the new zoom. The view
  zoom comes from `SimState.aim.zoom`, so the replay drives it too. Unit test: one zoomed
  Langloop hunt played through the InputMapper on desktop, Pixel 7 and iPhone 14 screens gives
  the same commands and the same events (`src/game/input/zoomReplay.test.ts`).
- Hitboxes: per animation state, body ellipse + head circle, defined in `birds.json` in sprite-local
  units; scaled by plane. **Plane scale vs hit size (D-049):** the body ellipse's radii are at least
  `minHitRadiusPx[plane]` (far 18, Ver 10; every input), so a hit area may shrink less than the
  picture; the head circle scales as drawn (`src/sim/planes.ts` `hitRadius`). When
  `inputKind = 'touch'`, radii grow by `aimAssistPx[plane]` on top. Px tunings written at the mid
  plane (spacing, speeds, alert radii) are × plane scale ÷ `scoring.tuningRefScale` (`tuningRatio`).
  Bird atlases are packed at the content plane scale and the index records it (`planeScale`);
  BirdView draws at plane scale ÷ packed scale.
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
- Touch aim assist (M9, D-026): pellets resolve at the real hitboxes (plus the FTUE first-hit
  help). Only if none hits a bird, a crate or a secret part is the aim point tested with the
  assist-grown hitboxes (`assistSnap`, front to back); a target or boss found there (never a
  don't-shoot creature or helper, nor one behind it) shifts the whole pattern onto its body
  centre, kept only if the pellets now hit that same bird (`resolvePattern`). Pointer input has no
  assist and never takes this path. The Kettie's single stone keeps the per-band assist.
- Each shot produces at most **one threat per flock** within the weapon's `alertRadiusPx` of any
  pellet impact (GDD §6.1–6.2); silent weapons produce a threat only for the bagged bird's own flock.
  The radius is design px at the mid plane and scales with `plane.scale / mid.scale`; each impact
  is projected onto the flock's plane with `tapToPlane`. A shot resolves damage first (bags score
  at the behaviour the bird had), then Whole Flock, then its threats (`src/sim/flocks/threats.ts`).
- Projectile weapons (Kettie): **delayed hitscan** — travel time per plane (near 80 ms, mid 180 ms,
  far 350 ms), gravity drop and wind drift applied at arrival; the target may have moved (leading
  is the skill). M8 (`src/sim/weapons/projectile.ts`): the front-to-back slices split into three
  bands by scroll factor (≥ near: foreground + near; ≥ mid; the far plane and everything behind).
  The stone flies to the world point under the tap **for the camera when it was fired**; after
  `travelMs[band]` ticks it is tested against that band only (birds where they are then, crates,
  live secret parts, occluders), with `sy + dropPx[band]` and wind drift read on arrival (far
  band only, × `windSensitivity`). It stops at the first thing it meets; after the far band it
  has missed. Everything a shot does after its pellets land (damage, Frenzy, scoring, bonuses,
  crates, secrets, threats, `miss`, charm `shot` triggers) runs at landing, through the same
  `resolveShot` as hitscan shots, which still resolve in the tick they are fired (event order
  unchanged). Stones resolve in fire order after creatures move; a stone still in the air when
  the hunt ends is dropped (it counts as a shot, not a miss). `pelletImpact.cx` carries the
  firing camera for stones; `SimState.projectiles` lists stones in the air (render only). No new
  command or RNG stream: the replay stays v3.
- **Reach (v1.3):** a slice whose plane is `ver` is skipped unless the shot's weapon has
  `reachesVer` (rifles). Shotgun pellets, air-rifle pellets, crate guns and Haelstorm blasts fall
  short; Kettie bands are built without the Ver layer. A missed pellet on the Ver layer lands
  downwind like a far one.
- **Rifles (v1.3, `src/sim/weapons/sight.ts`):** a primary with an `aim` block takes `aimStart`
  (raise at a point), `aimMove`, `aimRelease`, `aimCancel` and `zoom` (step of the fitted sight)
  commands; a crate weapon in hand ignores them. `aimStart` draws two numbers (loop phase, pace)
  from `rng.stream('sway')`. Each tick after the commands the hold counts up (`aimRaised` when it
  reaches `raiseMs`, `aimBreath` on `held` / `tired`). A release once the sight is up fires a normal
  shot at aim + sway (`shotFired.aim = 'sight'`); an earlier one fires at the aim point with
  `spreadPx + hipSpreadPx` (`'hip'`). Sway = `(swayPx + swayPerStep × step) × breath(t) ×
  progress × (sin θ, ½ sin 2θ)`, θ = 2π·t·pace/period + phase (detmath). A reload or a crate weapon
  lowers the sight (`aimEnded` with the reason); a blocked release fires nothing. `SimState.aim`
  carries the sight, its zoom, progress, aim, sway and breath for the renderer.
  1.9.2 (D-055) red dot: while a power-up with `effect.redDot` runs (the Rooikol), `aimStart`
  raises the sight at once (`aimRaised` on the press tick, held ticks start at `raiseMs`), so a
  release on any later tick is a `'sight'` shot. The hold stores `redDot` and `redDotSwayMul` on
  the `Aim` at the press: its sway is the first zoom step's × that factor for the whole hold, even
  if the power-up ends first. `fireCooldownMul` multiplies a rifle's time between shots.
  `SimState.aim.redDot` tells the view; `src/game/view/redDot.ts` is the view's one answer (the
  hold's own flag while aiming, else the running power-up) for the 1× zoom, the red-dot reticle,
  the HUD's zoom panel and fine aim (1:1). Crates: a power-up with `needsSight` weighs 0 in the
  crate roll unless the hunt's gun has a sight (`rollCrate`'s skip set), so other hunts draw as
  before; the Padstal never offers a power-up without `padstalPrice`.
- **Very loud shots (v1.4, D-038):** a primary with `alertsAllFlocks` (the Langloop) threatens
  every flock with a shot, not just those within its alert radius: after the radius threats,
  `loudShotThreats` adds each other flock with members, once per shot, from the shot's mean
  impact projected onto that flock's plane (`flockThreatened` source `shot`). A charm or the rain
  that silences the shot to radius 0 silences this too.
- Every resolution emits events: `ShotFired`, `PelletImpact`, `TargetBagged`, `Miss`, `FlockAlerted`,
  `FlockFlushed`, `SecretTriggered`, `ComboChanged`, `ScoreAwarded`, `PenaltyApplied`, …
- Water (M8 Okavango, `biome.twist.splash`): a pellet that stopped on nothing (no bird, prop or
  crate) whose screen point projected onto a zone's layer is inside the zone splashes; the shot
  then threatens every flock within `alertRadiusPx` of the wet impacts that its own alert didn't
  reach (one threat per flock per shot), source `splash` — silent guns and Stil Loop included.
  Showers (omen): rain spells from the omen stream; `alertRadiusMul` scales the shot's radius
  while `SimState.rain` is true (`weatherChanged` events).
- Storm (M8 Kalahari, `omen.storm`): before `stormAt` (fraction of the original length) the haze
  offsets far-plane birds' x by `hazePx·sin(2π·tick/period + id·1.7)` (detmath) in both the hit
  test and the snapshot; at `stormAt` a `weatherChanged` (rain) and every flock — and every new
  one — becomes running-only. Lightning: the boss rule's schedule (stream `lightning`) is
  unchanged; storm flashes and the Stormvoël's own flashes (when he flies without his boss rule)
  are drawn at run time from stream `storm`. Every flash passes one gate: at least
  `60 / min(maxFlashesPerSecond in play)` ticks since the last. `SimState.lightning` is the lit
  state; `lightningOnly` birds are hittable only then. Sky-pass bosses (`bossAppearance.passes`)
  cross a plane's sky lane; when a pass leaves unbagged, the next pass enters from the other side
  as a new bird with the same `hitsLeft`.
- Secret rewards (M8): `penalty` = points off (`secretPenalty` event), not a secret found (no
  count, chain or charm trigger).
- Secret kinds (M8): `singleHit` may need `hitsRequired` hits over any number of shots (progress
  is a `secretPartHit` with the hits left); `nearMiss` pays for an impact projected onto its layer
  within `radiusPx` of the part's centre but outside its shape — its part is never a hit target.
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
- Biome twist (M8): `biome.twist.flushAsRunChance` marks each new flock running-only with that
  chance (stream `twist`, drawn only when the chance is above 0); a running-only flock treats a
  threat in RUN like a late one — it never takes wing from shots. `forceState` (Vuvuzela,
  secrets, Stampede) is unchanged.
- Fly-overs and pop-ups are separate lightweight behaviours.
- Bosses are birds with extra components (`armorHits`, `bossRule`, scripted moves). M8
  `peekFromCover` (Ou Grys): the boss event's `perchProps` are covers; his whole route (cover
  order, `hideMs`, `peekMs`) is drawn from the `boss` stream when he appears, so updates need no
  randomness. Phases `hidden` (not hittable, not drawn) and `peek`; a hit sends him to the next
  cover hidden.

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
  `kwevoel`, `dustDevil`, `farmDog`, `carAlarm`, `reservoirFlush`, `bossAppearance`, `crate`, `stampede`,
  and (M8) `fishEagle` (flyover) and `kuifkopHop` (handler `hopper`: a target hides in one of
  `perchProps`, peeks `peekMs`, hops `hopMs` on an arc `hopPx` high to the next cover; route drawn
  from the `hop` stream when it appears). Each has a
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
RNG cursor. Every season plays its own biome (M8 removed the Karoo stand-in; a season without its
biome file is a content error). Run state (charms, doppies, seed
cursor, unlock flags) is serialisable and saved after every Padstal so a closed tab resumes the run.

### 3.10 Replays
`InputLog = { v, seed, contentHash, mode, inputKind, aimAssist?, commands: [tickDelta, command][] }`
(v2 since M5: an aim-assist byte follows the input kind; v1 logs still decode as `standard`; v3 since M6:
a flag bit adds the Season Run block and `charmOrder` is a command; v4 since v1.2: the map — layout
and bonus map ids, empty = none — follows the mode block, and a v1–v3 log decodes with none, so it
replays on the plain biome it was played on; v5 since v1.3: the fitted sight follows the map, '' =
the gun's default, and the rifle commands `aimStart`/`aimMove` (positions), `aimRelease`,
`aimCancel` and `zoom` (step) are appended to the op table — a v1–v4 log holding one is corrupt;
v6 since v1.7.3 (D-048): the special day's id follows the sight, '' = an ordinary hunt),
delta + varint encoded,
then base64url'd (`src/sim/replay/inputLog.ts`). Deflate is applied outside the sim, at the
share/challenge-link boundary (M7), because it needs async platform APIs (D-018). Used for: golden tests, bug reports (attach log), ghost replays, and
(v1.x) server-side leaderboard validation by re-simulating in Node.

### 3.11 Maps: weekday layouts and bonus maps (v1.2, D-033)
`ModeConfig.layout` ('mon' … 'sun') and `ModeConfig.bonus` ('verder', needs a layout) are part of
the hunt setup and of the replay (InputLog v4); only Classic and Daily may carry them.
`src/sim/maps.ts → resolveMap(biome, layout, bonus)` is pure: it applies the layout, then the bonus
map, to a copy of the biome (props moved, lanes merged, keyframe rates multiplied and flock targets
replaced, wind strength multiplied, the twist's run share, `feedingSpots`, `flyovers`) and returns
the map's weather (`calm | default | omen`; an explicit `mode.omen` still wins) and points
multiplier (applied to a bird's base points, rounded). The rest of the sim reads only the resolved
biome. The spawn director draws feeding-spot placement from the `flocks` stream and only when the
map has spots; a fixed fly-over direction still draws the coin, so the `spawns` sequence is
unchanged. No layout = the biome as it is: every pre-v1.2 golden replay kept its event hash. The
weekday is chosen in the game layer (`src/meta/maps.ts → layoutForDay(utcDay)`), never in the
sim. Light presets live in the client file `feel.json` (outside `contentHash`); `ParallaxView
.applyLight` tints each layer's static art and adds haze rectangles under its fixtures and birds.
v1.3 (D-036): bonus maps `nogVerder` and `dieVerste` follow `verder` (BONUS_MAP_IDS order is the
unlock chain); a layout or bonus map with `ver: true` keeps the biome's `ver` layer, every other
map drops it (`ResolvedMap.ver`). Fly-over plane weights may name `ver`; the Ver lane joins the
draw only when its weight is > 0, so maps without it draw exactly as before.

v1.4 B (D-039): a biome may be an **area pack** (`biome.area`: `unlockBonus`, `quota`), playable
in Classic without a run season. `crossRefs` accepts it, and `mapQuota` reads its quota. Its omen
can be the **mirage** (`omen.mirage`: `hazePx`, `verPx`, `hazePeriodSeconds`). It moves far and Ver
birds sideways all hunt through the same `hazeDx` path as the Kalahari haze, so the hitbox moves
with the bird, and the snapshot carries `mirage`. A map without the Ver plane also drops Ver flocks
from its biome's own keyframes (only Namibië has any).
A layout or bonus map may also set **`planePointsMul`** (per-plane multipliers on a bird's base
points, on top of `pointsMul`; the layout's × the bonus map's, `ResolvedMap.planePointsMul`, applied
in `Sim`'s `mapPoints`). Namibië uses it to make its plentiful Ver birds worth less; no value = 1,
so every other map is unchanged.


### 3.12 Meerkat colonies (v1.7, D-044)
Where: `colonies` in a biome or a layout (`ColonySchema`: id, a near or mid plane layer, `u`, the
mounds' ground `y`, 3–5 burrows as `dx` and `mound` height, a family range of 4–8). A layout's list
replaces the biome's (`resolveMap`); a bonus map keeps its layout's. Tuning is
`birds.json → meerkats` (`MeerkatsSchema`): hit shapes per pose, timings, activity weights,
`shotDive`, `alarm`, `hit` and `familiefoto`.

- **Sim:** `src/sim/meerkats/colony.ts` is pure: `createColony`, `stepColony`, `diveColony`,
  `hitMeerkat`, `lineUp`. Every draw comes from **`rng.stream('meerkats')`**, in colony order
  (content order), then meerkat id. Colonies step with the creatures (Boeretroos slows them). A
  hunt without colonies draws nothing from the stream, so other systems never shift.
- **In `Sim.ts`:**
  - The colonies are built at hunt start (none in the Skietbaan); a `colonySpawned` event follows.
  - **Hit test:** each meerkat that can be hit is a `HitExtra` of kind `meerkat` (body and head
    ellipses, scaled by the plane and mirrored by facing). On its layer the order is: birds of the
    same plane, then crates (drawn in the plane's overlay, over the meerkats), then meerkats, then
    secret parts, then props. A pellet that
    stops on one carries `meerkatId` in `PelletResult` and `pelletImpact`; the field is absent
    everywhere else, so older event streams are byte-identical.
  - **Shots:** `shotAtColonies` runs after a shot lands. A hit is `meerkatHit` with `points`
    (−penalty, or 0 inside the colony's cooldown). A colony dives (`meerkatsDived`, cause `hit`,
    `loud` or `shot`) when one of its meerkats is hit, for a gun with `alertsAllFlocks`, or for an
    impact within `shotDive.radiusPx` (measured on the colony's plane, from the span of its
    burrows). A meerkat hit counts as hitting a thing, like a secret part: the shot is no miss
    and the streak is unchanged.
  - **Alarms:** `colonyAlarms` runs each tick. A bird of `alarm.creatures` within `alarm.radiusU`
    (pan fraction, comparing `x / coreWidth` across planes) sets off one alarm per bird per
    colony: `meerkatAlarm` (with the flock alerted), a threat of source `meerkatAlarm` to the
    nearest flock that isn't flushing, then a dive.
  - **Familiefoto:** `tickColonies` counts each colony's held fire. It starts at 0 on a shot,
    with the colony off screen, or before the hunt's first shot. "On screen" is
    |`planeToDx(cameraX, f, centre)`| ≤ `onScreenHalfPx`, which fits a 4:3 screen, so the device
    never enters. With the hold at `holdSeconds` and the family out, the colony lines up. When it
    stands in the row, `familiefoto` fires, then `secretTriggered` with propId `familiefoto` and
    its bonus. Paid once a hunt.
- **Snapshot:** `SimState.meerkats` (`ColonyView`: burrows, ground, phase, and each meerkat's
  position, facing, pose, head turn, ticks in pose and whether it can be hit).
- **Game layer:**
  - `MeerkatView` draws mounds and meerkats from one sheet (`desertAssets.ts`), choosing frames by
    pose on sim ticks (`meerkatPose.ts`).
  - The HUD shows the −10, the scold bark (when penalised) and the Familiefoto banner.
  - The AudioDirector plays the scratch on a penalised hit. The colonies' own sounds go through
    `playExtra` (`meerkatSounds.ts`).
  - On desert maps `WorldView` shows the Meerkat Spotter climbing out of a burrow.
- **Assets:** the sheet and the four sounds load in their own lazy group **`desert`** with either
  desert map. The catalog puts them there (`isDesertKey`), the manifest loads the group for a
  manifest that lists the keys, and `size-check` budgets it as its own chunk.
- **Content checks** (`src/content/colonyChecks.ts`, on every map a biome can play):
  - each colony is on a near or mid plane layer and inside it;
  - its burrows are in order;
  - it is clear of the other colony and of props and secret parts on its own layer;
  - its standing meerkats, measured from the highest mound, never overlap the bird lanes (ground,
    sky, pop-up) of the planes behind it, or the secret parts on those layers;
  - every map of a colony biome has 1–2 colonies.
- **Clear of the HUD** (`src/game/ui/colonyHud.test.ts`): at each desert map's opening camera,
  every colony's screen rect stays clear of the HUD corners. It is checked on desktop, the Pixel 7
  and the iPhone 14, right- and left-handed.
- **Download:** `size-check` adds the desert chunk to each colony biome's chunk (what one hunt
  downloads) and fails `--strict` above 1.5 MB.
- **Previews:** `?birds=0` (dev and e2e builds only, `devContent.withNoBirds`) plays a hunt
  without flocks, pop-ups, fly-over spawns, events or crates.

### 3.12c Tell animals at the secrets (1.9.8, D-061)
`src/sim/tells/tells.ts`: one tell per secret that names one (`tell` in the biome file, feet
relative to the prop; species from `birds.json → tells`). State per tell: phase rest / act / gone,
ticks in it and its length. It rests for `actEverySeconds`, acts for `actSeconds` (only while its
secret is ready), and a hit sends it away for `goneSeconds`; once its secret is spent it is gone
for the hunt. Draws come only from the `tells` stream, in tell order. While present its ellipse
is a hit extra on the prop's layer (after the secret parts; `PelletResult.tellId`): it stops the
pellet (a stone too), counts as hitting a thing (no Frenzy change, D-021) and costs nothing;
a `tellSpooked` event (its return shows in the snapshot's phase). The snapshot's `tells` carry phase and ticks; `TellView` (a lazy
chunk) draws from them only, on sim time, and holds on a held frame. Content checks
(`src/content/tellChecks.ts`): every paying secret has a tell and no penalty prop has one, one
secret per species, the hit shape (+4 px) never touches the secret's part or a rotor's sweep.

### 3.12d Baboon troops (1.10.0, D-062), and the lazy sim systems
`src/sim/baboons/baboons.ts`: the troops (`createTroop`: seats from the biome file, a member per
seat, roles lookout / male / mother / juvenile from `birds.json → baboons.troop`), their idle moves
on the ridge, `scareTroop` (over the ridge for `awaySeconds`) and the raid scheduler: one raid at a
time; gaps of 60 / rate × (1 ± `gapJitter`) from one warning to the next (a raid that falls due
while one is on waits); phases warn → climb → travel → on (raiders approach, act, leave; a hit one
flees; a bagged one tumbles). Every draw comes from the `baboons` stream. `spotClear.ts` decides
which raid spots are clear on a map (shared with the content check). `system.ts` is the hunt's view
of it through `BaboonHost` (tick, emit, `awardBonus`, base points, penalty, threatening flocks):
hit extras of kind `baboon`, after the layer's secret parts and tells (ridge members, not while
climbing over the ridge: their body and head ellipses, × plane scale × role
scale; raiders: the same with the plane's `minHitRadiusPx` floor, D-049), `PelletResult.baboonId`
(stops a pellet or a stone; a thing for the Frenzy, D-021), events `baboonRaidWarned`,
`baboonRaidStarted`, `baboonRaidDone`, `baboonHit`, `baboonBagged`, `troopFled`, bonuses `baboon`
and `raidStopped`, and the snapshot's `baboons` (troops, raiders, the raid now).
**Lazy sim systems:** the baboons, Namibië's ostriches (`ostriches/system.ts`, D-059) and the tell
animals (`tells/system.ts`, D-061) live in one lazy chunk (`src/sim/lazySystemsRegister.ts`) so the
first download doesn't carry them. A hunt takes their factories from `SimConfig.systems`, else the
registered ones (`src/sim/lazySystems.ts`), and refuses to start a map that needs them without them
(never a silently different replay). The game starts loading the chunk on the title
(`src/game/simSystems.ts`) and a hunt that needs it waits behind a veil (offline: Retry or Back).
Tools, unit tests (vitest `setupFiles`) and the Node side of e2e specs register it up front. Moving
the ostriches and tells there changed no event: every golden replay passed as recorded.
The view (`src/game/view/baboon/BaboonView.ts`, lazy) draws from the snapshot on sim time: one
sprite per baboon, the thrown fruit and the tap's water; properties set on change only, off-screen
sprites hidden, its own `baboonMs` timer. A far ridge with a troop is never merged into the far
veld on the low tier (its art would slide away from the troop's hit shapes): troop maps draw 6
parallax layers on the low tier instead of 5 (the sim is the same on every tier; the low-tier and
Pixel 7 perf jobs passed with it); `tests/e2e/quality.spec.ts` checks both cases.

### 3.13 Juggle bodies: tin cans and makalani nuts (v1.8, D-050; 1.9.3, D-056)

- **One physics:** `src/sim/juggle/body.ts` is the only flight code for things that are knocked,
  juggled and fall: rest → air (each air hit grows the chain; the `wegChain`-th air hit clears the
  top of the view) → one bounce → landed, or gone out of the top. Tunings are px at the tuning
  reference, × `tuningRatio` per plane (`scaledTuning`). Two optional fields serve the nuts and
  leave the cans as they were: `knockUpMul` (the knock-off's upward kick × it) and `roll` (after
  the bounce it rolls on: `rollBody` slows it by `decelPxPerSec2`, turning with its speed).
- **Cans** (`src/sim/cans/cans.ts`): a fence per layout (`fence`) and, since D-056, a second one
  further back (`farFence`); the sim keeps a list of fences, one `CansView` each in the snapshot
  (`cans`, `farCans`). Ids: 2,000,000 + (1000 for the far fence).
- **Makalani nuts** (`src/sim/nuts/makalani.ts`): palm groups from the layout (`palms`, moved back
  by a bonus map's `fencePlane`) and their shapes (`birds.json → makalani.palms`); 3–8 nuts per
  cluster and their colours from the `nuts` stream. A nut is a `JuggleBody` plus `popped`. Ids
  from 3,000,000. Snapshot `nuts` (palms with trunk feet and tops, cluster anchors; nuts).
- **Hit test:** cans and nuts are `HitExtra` capsules of kind `can` (a nut's has no axis: a
  circle). A nut's has `passThrough`: `resolvePellet` remembers the first nut a pellet meets and
  goes on; a bird behind takes the pellet, anything else (or nothing) gives it to the nut. The
  pellets on one can or nut in one shot make one kick (or, for a nut, `popPellets` of them or a
  `popWeapons` gun burst it).
- **Events:** `canKnocked`, `canJuggled`, `canLanded`, `canGone`; `nutKnocked`, `nutJuggled`,
  `nutPopped`, `nutLanded`, `nutGone`. Bonuses `canKnock|canAir|canWeg` and `nutKnock|nutAir|nutPop|
  nutWeg` are × Stampede only; a can- or nut-only shot leaves the Frenzy streak alone.
- **View:** `CanView` (one per fence) and `MakalaniView` (palms from one trunk and one crown
  texture per plane, sway and reflection on sim ticks; nuts; bits; sounds via the AudioDirector).

### 3.14 View-only life on sim time: tree residents and weaver colonies (1.9.4, D-057)
- **Not in the sim.** The baobab's residents (`src/game/view/tree/baobabResidents.ts`) and the
  weaver colonies' life (`colonyFlight.ts`) are pure functions of the sim tick and the hunt's
  seed: `lifeHash(seed, …)` (an integer hash; never `Math.random`, never the sim's RNG streams)
  picks each slot's visit, each bird's cycle and its targets. Held frames and replays draw the
  same; golden replays never change. Tuning in `content/client/feel.json → treeLife` (outside the
  content hash).
- **Reactions from the event stream.** `BaobabLifeView` and `ColonyView` read `pelletImpact`
  events, map each pellet onto their layer with `pelletsOnLayer` (fruitHits.ts: `planeX = (cx −
  960) × scrollFactor + 960 + dx`; pellets a nearer bird or prop stopped are left out) and keep
  only view state (the visit a resident was startled in, a colony's current scatter). The nest
  shot's `secretPenalty` scatters its colony; the −10 is the sim's, as before.
- **Never in the way.** Their sprites go in the layer's prop-fruit container: above the tree,
  under the layer's haze, fixtures and birds. They take no pellets and never score.
- **Lazy.** `TreeLifeView` (both views and WeaverView's angry burst) is a chunk of its own, loaded
  on maps with the baobab or a family nest. Sheets are cut by the file under the key (1× Standard,
  2× HD) and re-cut after a texture swap.
- **Haze order** (`hazeOrder.ts`): on a plane layer a haze band with a top or bottom edge goes
  under the layer's props; a whole-layer haze stays over them.
- **Test build:** `?treeLife=<resident>|falcon` keeps one out almost all the time (art previews),
  `?treeLife=off` turns the views off ("before" shots). Hook: `treeLife` (residents on screen,
  near-shot ducks, the colonies' birds, falcon, lovebirds, scatters, nests).

### 3.15 Namibië veld life: ostriches and balloons (1.9.7, D-059)
- **Ostriches (sim):** `src/sim/ostriches/ostriches.ts`, tuning `birds.json → ostriches`, pairs in
  the biome file (`ostriches`, per layout; `maps.ts` lets a layout replace them). Every draw comes
  from the **`ostriches`** stream (eggs, activities, swaps, run distances), family then bird order.
  Each bird is a small state machine (sit · stand · look · walk · peck · display · run · hiss);
  a family keeps a swap timer, a scare timer and its penalty cooldown. Hit test: each bird's body
  and neck ellipses, then the nest (`HitExtra` kind `ostrich`, `PelletResult.ostrichId`), after
  the meerkats on the layer. Events: `ostrichesSpawned`, `ostrichHit` (points: −penalty or 0),
  `ostrichesRan` (shot · loud · hit), `ostrichCall` (display · swap). Snapshot: `ostriches`.
  Content checks (`ostrichChecks.ts`, sharing `behindIssues` with the colonies): on a near or mid
  layer, inside it, clear of colonies and own-layer secrets, never in front of the bird bands or
  secrets behind.
- **Balloons (sim):** a `nonTarget` creature with `drift` (`lugballon`) and the world event
  `balloons` (handler `flyover`; an event may name `lights` it plays under). The director's
  `driftGroup` spawns 1–3 from the **`events`** stream, beside the view on the upwind side
  (`DirectorContext.windDir`) at `drift.skyY`; they fly like fly-overs (`airMul` follows the
  wind). A drifter is never bagged: a hit (`drift.pelletsToHit` pellets of one shot) restores its
  hits, pays the penalty once per `hitCooldownSeconds` (`penaltyApplied`) and emits `balloonHit`.
- **View (lazy chunk `NamibLifeView`):** `VeldView` (the veld sheet at the art's placements,
  `veld-namibie.json`, in each layer's fruit container), `OstrichView`, `OryxView` (a roaming
  FaunaView of the far gemsbok sheet and its reflection; pure `roamAt`/`shimmerAt` of the tick),
  `BalloonView` (BirdView leaves drifters out). All on sim time; sheets cut by the file under the
  key (1× Standard, 2× HD) and re-cut after a swap. Hook: `namibLife`, `namibLog`.

## 4. Content system (`content/`, `src/content/`)

- One Zod schema per file type in `schemas.ts`; types are `z.infer`'d — never hand-written twice.
- `npm run content:validate` (also in `npm run check` and CI) validates every JSON file and checks
  cross-references (biome → creature ids, charm → trigger names, run → boss ids; M4: a secret
  reward's `at` prop, its power-up, unique part ids, `perchProps` that have a `perch` point on a
  plane the creature uses, and each biome event's required fields for its handler kind).
  `--dir <path>` validates another content folder (used by the test that proves a broken
  cross-reference fails the CLI).
- `contentHash` = SHA-256 of the canonicalised bundle, except `modes.range` (see §8.3); part of
  every replay, daily seed and score submission (only official content counts for leaderboards).
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
- **Biomes (M8):** each biome's placeholder art registers in `ProceduralAssetFactory`
  (`placeholder/biomes/*.ts`: one band painter per layer id, a prop painter); a biome is playable
  only with art. Manifests are built on first use (`ctx.manifestFor`); the title shows the home
  biome, and `HuntScene` rebuilds its views when a hunt's biome is another one (Daily rotation,
  challenge, Season Run). `ctx.huntBiome` is the biome on screen.
- **Parallax:** 6 layers using camera scroll factors (sky 0.05 → far ridge 0.15 → far veld 0.35 →
  mid 0.6 → near 1.0 → foreground framing 1.2). Layer widths = core width from §3.3 + 300 px bleed
  per side. Layer art is cut into tiles ≤ 2 048 px wide.
- **Draw-call discipline:** all birds of a biome on one atlas page per tier; props on one; FX on one.
  Particles via Phaser's emitter (or `SpriteGPULayer` for large feather storms on high tier).
- **Quality tiers** (`QualityManager`): auto-picked from a 90-frame benchmark on the title screen +
  `hardwareConcurrency`/`deviceMemory` hints; user override in Settings.
  M9 as built (D-026): `FrameBenchmark` counts rAF frame times only while the title is up and the
  tab visible (after `warmupFrames`), once per page; `benchmarkTier` → low above `lowAboveMs`,
  high at ≤ `highBelowMs` on a fine pointer with ≥ `highMinCores` and enough `deviceMemory`, else
  medium (`feel.json quality.benchmark`). The result is saved per device (`SaveData.device`) and
  "auto" follows it from then on; small touch devices stay low. **Render scale** is real: the
  canvas is design size × `renderScale` and every scene camera zooms by it (`fitCamera`), while
  scenes keep laying out in design px (`designSize()`). Filters are camera filters on the hunt
  scene (vignette; bloom = threshold + blur in a ParallelFilters, added back). The low tier draws
  the far ridge on the far veld's layer (stretched by their core widths) and renders without
  antialiasing (fixed at boot). Tiers never hide birds, secrets or information.
  **Per-frame cost rules (M9):** HUD shapes are cached Shape objects (`ui/shapes.ts`), never
  per-frame `Graphics` (Phaser re-tessellates Graphics paths every frame); off-screen parallax art
  is hidden; safe-area insets are computed per layout, not per frame.

| Tier | Render scale | Atlas set | Particles | Filters | Parallax layers |
|---|---|---|---|---|---|
| Low | 0.67 | @1x (≤ 2048² pages) | 40 % | none | 5 (far ridge merged into far veld) |
| Medium | 0.83 | @1x | 70 % | vignette, glare | 6 |
| High | 1.0 | @2x (≤ 4096² pages) | 100 % | + bloom, heat haze, lightning glow | 6 |

(Glare, heat haze and lightning are gameplay weather drawn on every tier; atlas sets arrive with
final art in M10. Values live in `feel.json quality.tiers`.)

v1.4 B (D-039):
- **Angry weavers** (`src/game/view/WeaverView.ts`) are rendering only. A `secretPenalty` on a nest
  (any penalty secret with `feel.json juice.weavers.barkKey`) starts a burst. The flight is a pure
  function of the prop id, the event tick and the sim tick (`weaverFlight.ts`). The pool holds 36
  sprites; the chatter is `AudioDirector.weavers()`.
- **Fruit react to shots (v1.7c, D-047)** (`src/game/view/fruit/`), rendering only. The hanging
  and fallen fruit, pods and flowers are sprites from the biome's `fruit/<biome>` sheet, placed by
  `spots/fruit-<biome>.json` on their layer or prop (fixtures container: above props, below birds).
  `FruitView` maps each `pelletImpact` onto the fruit's layer and swings, drops or rocks the fruit
  (`fruitHits.ts`, `fruitMotion.ts`: pure functions of the hit ticks and the sim tick, so held
  frames and replays draw the same). The sim never sees fruit: no state, no score, no change to
  any hit test, and a pellet the sim stopped in front of a fruit never reaches it. Pellets are
  mapped as the sim saw them: with the camera of their tick (`HuntRunner.cameraAt`) and without
  the wind drift the sim adds to far-landing pellets' events (`fruitHits.ts pelletsOnLayer`).
  Fruit take their layer's light tint and sit in two containers per layer (`LayerNode.fruit`
  above the layer art, `propFruit` above the props), both below haze and fixtures. Poses use the
  interpolated sim time; still and off-screen fruit are skipped. HuntScene imports the view
  lazily per map (its own chunk); tunables in `feel.json juice.fruit`.
- **The mirage** (`WorldView.drawMirage`): a few soft strips over the far and Ver horizons. They
  move on sim time and stay still with reduce flashes or reduced motion.
- **2× props:** a prop plan's `master: 2` image is packed per plane (near and mid 2×, far and Ver
  1×, `tools/assets/pack.ts PROP_PLANE_RES`). The asset index's image `scale` (design px per
  texture px) is applied by `ParallaxView`.

## 6. Input (`src/game/input/InputMapper.ts`)
- Pointer Events only (one code path for mouse/touch/pen); canvas CSS `touch-action: none`;
  prevent double-tap zoom, long-press callouts, text selection, overscroll bounce.
- Converts device input → sim `Command`s; owns gesture recognition (tap vs drag vs flick-down) and
  pan inertia (exponential decay, max 2 400 design px/s).
- Desktop edge-pan (outer 12 %), keyboard pan, right-click reload (suppress context menu).
- Rifles (v1.3, D-036): while the snapshot's weapon has a sight, a press sends `aimStart` at the
  pointer (pointer captured), moves become `aimMove` at `press + (pointer − press) / zoom`
  (at most one per tick, so replay logs stay small), the release sends `aimRelease`. Right-click
  while holding sends `aimCancel` instead of a reload; on touch a slide onto the ammo display
  cancels (the finger is then ignored until it lifts), a flick down cancels and reloads, and the
  screen edges pan.
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
- Web Audio directly (Phaser's sound manager is off). The AudioContext is created and resumed in
  the first user gesture; nothing decodes or plays before it.
- Buses under the master (`feel.json audio.masterLevel` headroom): SFX (with the ambience loop),
  music, voice, each with its Settings volume (master / effects / music / voice, art bible §10).
- SFX: a delivered recording per key (`sfx/<id>`) when the asset index has one, else the
  placeholder synth (`synth.ts`). Stereo pan by screen x of the event (±0.7); voice limit 16.
  v1.1 (D-032): a shot plays the firing gun's own sound (the `shotFired` event names the weapon)
  and reload events the gun in hand's (`feel.json guns.weapons.<id>.sfx`); interim code-made
  recordings (`npm run audio:interim`, origin `interim`) ship for every key until a delivery
  replaces them.
- Music (M10, `music.ts`): per biome, three looping stems (`music/<biome>/calm|build|stampede`)
  started together and crossfaded by intensity (`stemFor`: calm; build when a flock runs or
  flushes or Frenzy ≥ `buildAtFrenzy`; stampede in the Stampede; rising is immediate, calming
  waits `stemHoldMs`). A missing stem falls back to the next calmer one. A biome change fades
  the old set out and the new one in (`biomeFadeMs`); ambience (`amb/<biome>`) loops beside it.
  With no music delivered there is none, and the synth flush sting and Stampede cue stay.
- Oupa's barks (`voice/<voice language>/<barkKey>`, subtitled by the HUD banner in the text
  language): at most one per `barkGapMs`, never during the tally count-up; music ducks by
  `duckDb` (−6 dB) under them. v1.5 (D-041): each voice language is a lazy asset group
  (`voice-en|af|de`); `voicePack.ts` loads only the chosen one, after the first gesture and not
  at voice volume 0, and the director keeps only that language's buffers. Text language,
  voice language and the Afrikaans-names toggle (`setAfrikaansNames`, flavour table
  `src/i18n/flavour/afNames.json`) are presentation only: never in the sim, the replay or the
  content hash.
- Mute on `visibilitychange` (and the context suspends), on pause, and whenever the platform
  adapter reports an ad (Poki rule) or the portal mutes (CrazyGames).
- Formats (M10, D-027): Ogg Vorbis where `canPlayType` says "probably", else MP3 (Safari);
  recorded files come from the asset index, the synth stays the fallback per sound.

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
  rewardedAvailable(): boolean;                         // M9: offer a rewarded ad only if true
  cloudSave?: { get(): Promise<string | null>; set(data: string): Promise<void> };
  user?(): Promise<{ id: string; name: string } | null>;
  shareUrl(base: string): string;                       // portal deep-link rules differ
  launchParam(name: string): string | null;             // M9: portal invite param, else the URL's
  share(p: { text: string; url: string }): Promise<'shared' | 'copied' | 'cancelled' | 'failed'>;
                                                        // M7: share sheet → clipboard → textarea copy
  analytics(event: string, data?: Record<string, unknown>): void; // may be a no-op on some portals
  canShowExternalLinks: boolean;
  openExternal(url: string): void;                      // D-058: new tab; the app: system browser
  onBackButton?(fn: () => boolean): void;               // D-058: Android back (false: background)
  pwa: boolean;                                         // M9: service worker + install banner (web)
  onAdChange(fn: (playing: boolean) => void): () => void; // AudioDirector mutes during ads
  onPortalMute(fn: (muted: boolean) => void): () => void; // M9: CrazyGames settings.muteAudio
  reportError(report: ErrorReport): void;               // M9: crash/error hook, no personal data
  capabilities(): { fullscreen: boolean; standalone: boolean; iphone: boolean };
  requestFullscreen(): Promise<void>;
}
```
- M5 ships the `web` adapter (`src/platform/web.ts`): no ads, analytics kept on the device (no
  network) until a privacy-reviewed endpoint exists, service-worker registration in production
  builds. The fullscreen/banner rules are pure functions in `src/platform/capabilities.ts`.
- M7 `share` (`src/platform/share.ts`, called from inside the tap's event handler): `navigator.share`
  with text and url apart (where `canShare` allows it); a closed sheet is `cancelled` with no
  fallback; otherwise `navigator.clipboard.writeText(text + " " + url)`, then a hidden-textarea
  copy, else `failed`. Portals that forbid external share sheets override it in M9.
- Selected at boot via build flag (`VITE_PLATFORM`), never by sniffing.
- **M9 adapters** (D-026): `web`, `poki`, `crazygames` on a shared base (`local.ts`: analytics and
  error reports kept on the device, `AdGate` one ad at a time with a timeout). `npm run build`,
  `build:poki`, `build:crazygames` → `dist/`, `dist-poki/`, `dist-crazygames/`; the flag is
  inlined, so each build carries only its own SDK. Portal SDKs load from the portal's host in
  `init()` (awaited at boot, bounded by `feel.json platform.sdkTimeoutMs`); without the SDK the
  game runs with no ads. Ads only between hunts (`src/game/ads/AdBreaks.ts`): a commercial break
  before every hunt but the page's first and none right after a rewarded ad; audio muted and menus
  locked while an ad shows; gameplay start/stop around hunts and the pause menu; loading
  finished when the title is up. Rewarded ads: the Season Run's retry and double Doppies (GDD §19).
  Portal builds: no service worker or manifest, no fullscreen button, clipboard-only sharing,
  challenge links via the portal's own parameter (Poki `gdc`, CrazyGames `inviteLink`).
- **Test hooks** (`src/game/testHooks.ts`): compiled out of portal builds unless
  `VITE_TEST_HOOKS=1` (CI's e2e builds); `?e2e` uses the storage namespace `tm.e2e.`.
  v1.0.1 (D-028): only a `VITE_TEST_HOOKS=1` build (or the dev server) records official results
  under `?e2e`. On a public build (Pages, portal releases) `?e2e` is unranked like capture mode:
  Dailies are practice (no attempt, streak or best saved), no tally offers [Share], and `?c=`
  links are ignored. `tests/e2e/daily-public.spec.ts` (CI job `public`, `E2E_BUILD=public`)
  proves it on the build Pages ships.
- **Release aim (D-052, 27 Oct 2026):** friends on the web test build first, then the Apple App Store and
  Google Play through Capacitor. Poki and CrazyGames are no longer targets; their adapters and builds
  stay until they are removed on purpose. The portal notes below are kept for reference.
- **Portal constraints** (reference only since D-052; verify against current docs before any submission):
  - **Poki:** initial download target < 8 MB; must work on desktop, mobile and tablet (tablets get
    mobile controls) and in incognito; on mobile the game must fill the screen in portrait or
    landscape; only Poki's ad system; remove external CDN dependencies; mute audio during ads;
    in-game privacy policy if you link out.
  - **CrazyGames:** initial download ≤ 50 MB (≤ 20 MB for the mobile homepage), total ≤ 250 MB,
    ≤ 1 500 files; mouse, keyboard and touch; many players on Chromebooks.
  - **YouTube Playables:** initial download under 30 MiB.
- **Our budget:** first playable hunt ≤ **5 MB** compressed (core + Karoo); other biomes lazy-loaded.
  M9: each non-home biome's art is its own chunk (`import()` in `ProceduralAssetFactory`), loaded
  the first time a hunt there starts ("Loading…" and the portal's loading signals meanwhile; a
  failed load returns to the title). The content JSON of all biomes stays in the initial bundle
  (the sim, `contentHash` and the Daily rotation need it). Final art (M10) plugs into the same
  per-biome loader.

### 8.1 Marketing capture mode (M10, D-027)
`?capture=1` hides the hunt HUD and the reticle (`&gun=0` also hides the gun), plays seed
`feel.json capture.seed` unless `?seed=` is given, and adds keys: **S** cycles the speed
(`capture.speeds`, 1 → ½ → ¼), **F** freezes the action, **C** sweeps the camera end to end. The
keys scale how real time feeds the hunt runner, tweens and animations; the sim stays
deterministic. The gate is the test hooks' gate: web and dev builds always, a portal build only
when built with `VITE_TEST_HOOKS=1` (the CI e2e builds). In a shipped portal build the code is
compiled out: the `hooksInBuild` constant is `false`, so the minifier drops it, which a grep of
`dist-poki` confirms (the capture class's field `speedIndex` is absent; i18n keys like
`capture.hint` stay in every build's string tables). Capture sessions play on their own save (`tm.capture.*`).
v1.0.1 (D-028): entering capture mode shows a small "S slow · F freeze · C pan" hint (i18n
`capture.hint`) at the top for `capture.hintMs`, then fades it over `hintFadeMs` and destroys it.
It runs on frame time, not hunt time (a freeze doesn't hold it), at most `hintMaxStepMs` per frame
(a warm-up stall can't use it up unseen). Portal release builds have no capture mode, so no hint.

### 8.2 Playtest admin (v1.2x, D-034)
`https://shadownam.github.io/Tarantal/?admin=1` (or `npm run dev` → `/?admin=1`) opens the admin
page instead of the title, on builds whose adapter has `adminPage` (web only; Poki and
CrazyGames ignore it). It lists every playable map from content (biome × plain / Mon…Sun /
bonus maps, the Daily with a date, each Season Run hunt) with options (gun incl. crate guns,
seed, length, omen, forced event, Season quota ×) and a review per map (status, 1–5, notes).
[Play] stores the pick in the admin save and reloads with `&play=1`; `main.ts` applies it like the
e2e parameters (`src/game/admin/adminPlay.ts`). Everything runs on the `tm.admin.*` save and is
unranked, so the player's progress is never touched. Feedback leaves as "Copy report" (markdown)
or "Send to GitHub" (a prefilled `issues/new?labels=playtest` link ≤ 7 KB, `src/meta/admin.ts`).

### 8.3 Skietbaan: the range mode and its gating (v1.3x, D-037)
- **Gating:** the admin page's Skietbaan button, so only builds whose adapter has `adminPage` (web).
  The range's code is one lazy chunk (`src/game/range/` → `Skietbaan-*.js`, 8.7 KB gzip), loaded
  by `HuntScene.openSkietbaan()`. Its `import()` sits behind the raw `VITE_PLATFORM` flag (a literal
  after Vite's replacement), so Poki and CrazyGames builds drop it. `adapters.test.ts` checks the
  guard names exactly the platforms without the admin page; `tools/size-check.ts` fails a portal
  build that carries range code, or a web build whose range chunk is in the first download.
  `main.ts` boots in an async function rather than with top-level await: Rolldown merges modules a
  lazy chunk shares back into the entry only when no module uses top-level await.
- **Sim:** mode `range` (`content/modes.json` `modes.range`, Zod + cross-refs) with
  `ModeConfig.range = { plane, target, crate? }`. It is endless (no `huntEnded`), unscored (no
  `scoreAwarded`, bonuses, penalties or Frenzy) and has no director spawns, world events, crates,
  secrets, gadget or omen. The Ver plane is always open (`resolveMap(…, openVer)`). A crate gun
  is armed at tick 0 and re-armed when spent. The targets come from a spawn program passed in as
  `SimConfig.rangeProgram` (`src/sim/range/program.ts`, so its code ships in the lazy chunk): each
  tick it may add birds or a flock (via the director's `spawnFlockAt`) and retire birds beyond
  the range's half-width; randomness comes only from the `range` stream. Paper targets are
  `HitExtra`s of kind `paper` on their plane's layer, so they are hit-tested front to back like
  crates (props in front still stop pellets). Range-only events: `rangeShot` (the aim point on the
  range's plane, a rifle's before the sway) and `paperHit`; `pelletImpact` gains `paperId` only
  there. Every hunt's event stream is byte-identical, and the golden replays are unchanged.
- **Hashes and replays:** `modes.range` is left out of `contentHash`, so tuning the range never
  re-seeds the Daily or marks challenge links and replays as made on other content. Range
  sessions are not replay logs: `encodeInputLog` and `runReplay` refuse mode `range`.
- **24 Oct update (mixed course, plates, feedback):** `RangeConfig` takes `plane: 'all'` and
  `target: 'mixed'`; the program lays the course out as slots (`rangeLayout`/`mixedLayout`, from
  `modes.range.mixed` and the `range` stream) and respawns each bird slot on its own. Steel plates
  are `PaperView`s of `kind: 'plate'` (radius `plateRadiusPx`), hit-tested like paper; a pellet on
  one emits `plateHit` instead of `paperHit`. Both now carry the shot's aim point on that plane
  (`aimX`, `aimY`). `rangeShot` names the target a miss is counted for (`RangeProgram.aimTarget`:
  the range's plane and kind, or on the mixed course the target nearest the aim point on screen),
  and every range shot ends in one `rangeOutcome` (`hits`: plane, kind, id and pellets of each
  target hit, from `RangeProgram.hits`; `short` when it hit nothing, its target is at Ver and the
  gun can't reach). Stats count shots at `rangeOutcome`. Feedback (`RangeFeedback.ts`,
  `PlateDraw.ts`, `PaperDraw.blink`) is driven only by these events. The range's sounds play
  through `AudioDirector.playExtra` (the recording once loaded, else the chunk's synth). Its
  interim plate art and sounds (`src/game/range/rangeAssets.ts`) are in their own asset group,
  `range`, which the range chunk loads (`rangeSounds.ts`) and the service worker doesn't
  precache; `assets:audit` lists them as interim. The first download grew by 868 bytes gzip; the
  Skietbaan chunk is 13.8 KB gzip, its assets 43.6 KB.
- **Game:** `HuntScene` runs a `RangeSession` (`src/game/range/RangeSession.ts`, types only) through
  the normal hunt path: views, sights and zoom, InputMapper, the HUD belt and pause, with the
  clock, score and Frenzy hidden. It writes no save, admin save, hunt log, ad count or analytics.
  The setup page and the stats bar are DOM (`RangePanel.ts`); paper targets and their holes are
  Graphics on the plane's overlay layer (`PaperDraw.ts`; the holes are baked, see below). The stats (`rangeStats.ts`) are fed from
  the events and kept in memory. Strings come from `src/i18n/range/<lang>.json`, checked by
  `content:validate` like `src/i18n`.
- **Hit marks (D-040):** `rangeMarks.ts` (pure) turns each `paperHit`/`plateHit` into a `Mark`
  (offset from the target's centre over its radius, size from the weapon's optional `markSize`
  — `pellet` | `rifle` | `heavy`, default from the pellet count — and plane scale, a
  shape seed from the range session number, shot id, tick and pellet index; shapes use `sim/detmath` trig) and keeps them in
  a module-level `MarkStore` for the visit, keyed `area|course|plane|kind|index` (course: `mixed` or the single course's target kind, so
  the mixed course never shares marks with the paper or plate course; index among the
  snapshot's targets of that plane and kind). Leaving the setup page for the admin list clears
  it; the bar's Repaint clears the session's keys. Capped at 400 per target (past it the oldest
  50 go and the target re-bakes). `MarkSurface.ts` bakes them into `DynamicTexture`s (a plate's
  face too): level 0 sized for the strongest sight × render scale (≤ 1 024 px), each lower level
  half of the one above, the shown level picked each frame from the plane root's zoom × camera
  zoom; LINEAR on every tier; a WebGL context restore re-bakes. New marks are appended to level 0
  (one draw) and the lower levels re-stamped. The plate's swing and the newest mark's glint run
  on the snapshot tick (`rangeHold` freezes that tick), never the wall clock. No sim change.

### 8.4 Project overview (D-045)
The admin page's **Project overview** button (`data-action="project"`, or `?admin=1&project=1` as
a bookmark) opens a full-screen DOM page, `#tm-project`, with the build's status for the product
owner: Overview (needs you, now building, next up, recently done, numbers, links, latest
activity), Roadmap, History (stages, pictures, evolution, decisions, glossary), Requests, Ideas.
- **Data:** one JSON file the supervisor publishes on the git branch `project-log` (no CI there;
  it changes many times a day without a deploy):
  `https://raw.githubusercontent.com/ShadowNam/Tarantal/project-log/project.json` (CORS `*`, CDN
  cache ~5 min), fetched with `?t=<now>` and `cache: 'no-store'`, 15 s timeout. `?projectData=<url>`
  loads another copy (tests, previews) when that URL is https on an allowed host (a
  `raw.githubusercontent.com` file only from the ShadowNam account). Format, schema
  and how to update it: `docs/project/README.md`; the Zod schema and every pure helper (allowlist,
  Namibia-time formatting, grouping and sort orders, the offline copy) are `src/meta/projectLog.ts`
  (unit-tested against `tests/e2e/fixtures/project-log.json`).
- **Safety:** every string is set as `textContent`; links and pictures are kept only when https on
  `github.com`, `raw.githubusercontent.com`, `shadownam.github.io` or `claude.ai` (no credentials,
  no other port), others are dropped silently; links open in a new tab with
  `rel="noopener noreferrer"`.
- **Gating:** shown where `freshLoadShown()` is true (the web build's admin page: dev server and
  GitHub Pages), on the list page. `AdminScene.openProject()` loads `src/game/project/` as its own
  lazy chunk behind the raw `VITE_PLATFORM` guard, like the Skietbaan (§8.3): `adapters.test.ts`
  checks the guard, `size-check` fails a portal build carrying the code or a web build with the
  chunk in the first download. The first download grew by 0.5 KB gzip (the button, its string,
  the guard); the chunk is 15.4 KB gzip. Strings are `src/i18n/project/<lang>.json`, checked by
  `content:validate` like the range's; the log's own text is English data.
- **Fallback:** "Loading the project log…", then the page. A failed load (network, HTTP error,
  timeout) shows a message with Retry; a file that fails the schema shows "could not be read" and
  the first Zod issue in small text. The last good log is saved through `src/meta/storage.ts`
  (`project.lastGood`, re-checked against the schema when read) and shown under the error as
  "Offline copy from <time>". Times are Namibia time (`Africa/Windhoek`, UTC+2).
- **Page:** tabs scroll sideways on phones; the body scrolls with `touch-action: pan-y`; every
  button and link is ≥ 44 px; a compact two-row header below 500 px height (iPhone 14 landscape).
  Pictures are lazy thumbnails; a tap opens the lightbox (full picture, caption, previous/next by
  button, arrow key or swipe, "open full size", Escape or ✕ closes; the page under it doesn't
  scroll). A picture that fails to load shows its caption in a box. While open, `project=1` stays
  in the address (`history.replaceState`), so a reload returns to it; Back drops it.

### 8.5 Android test app (`capacitor`, D-058)

The friends' Android app before any store account (docs/ANDROID-TEST-APP.md). Capacitor 8.5.3
(exact pins: `@capacitor/core`, `cli`, `android`, `app`, `share`) wraps the web build;
`capacitor.config.ts`: `appId` `na.tarantal.madness`, name "Tarantal Madness", `webDir`
`dist-android`. The `android/` project is committed without build outputs or the copied web build
(Capacitor's `.gitignore`).
- **Build:** `npm run build:android` = `VITE_PLATFORM=capacitor` through the same `vite.config.ts`
  (so the Phaser shader fix, D-054, applies) → `dist-android/`, then `tools/android-sync.ts`
  writes `android/app/version.properties` (versionName = package.json version, versionCode =
  MAJOR·10000 + MINOR·100 + PATCH, `src/platform/androidVersion.ts`) and runs
  `npx cap sync android` (no SDK needed). Gradle runs only in CI (`.github/workflows/android.yml`).
- **Every asset inside the APK:** `public/` (both the Standard and the HD packs, every group) is
  copied into `dist-android/`, so the WebView loads the lazy groups and the HD twins from the
  app's own files (`https://localhost/…`): no network after install. The Standard/HD choice on the
  loading screen is unchanged. No service worker: `pwa: false`, no manifest (stripped like the
  portal builds), no install banner.
- **Adapter** (`src/platform/capacitor.ts`, shell in `capacitorNative.ts`, loaded by `import()`
  in `init()` so no other build carries Capacitor code): no ads (breaks resolve at once,
  `rewardedAvailable()` false); `capabilities()` = `{ fullscreen: false, standalone: true,
  iphone: false }` (the app is full screen); share through the native share sheet
  (`@capacitor/share`; a closed sheet is `cancelled`), else the clipboard; `shareUrl` rewrites the
  device's `https://localhost/…?c=` onto the public Pages build; `openExternal` opens the system
  browser (Capacitor sends any off-origin page there); no admin page (`?admin=1` ignored, the
  Skietbaan and Project overview chunks compiled out, `?feesdag=` ignored).
- **Phone behaviour:** landscape locked (`sensorLandscape` in the manifest); immersive full screen
  (`MainActivity` hides the status and navigation bars, swipe shows them for a moment); the app's
  own `TmScreen` plugin keeps the screen on between `gameplayStart` and `gameplayStop`; pinch zoom,
  long-press menus and text selection are off as on the web (viewport and CSS in `index.html`).
- **Back button** (`src/platform/backButton.ts`): it sends the page an Escape keydown, so it means
  what Escape means — in a hunt the pause menu, in the pause menu Resume, in a menu its Back. Only
  on the title (Escape unused, no scene over it) does the app go to the background
  (`App.minimizeApp`); anywhere else an unused press is swallowed, so it never leaves a hunt.
- **Background:** `appStateChange` → if the WebView still reports `visible`, the adapter reports
  `hidden` and fires `visibilitychange` (and undoes it on return), so the existing paths run as in
  a browser tab: audio mutes, the hunt opens its pause menu, the save flushes.
- **Storage:** `src/meta/storage.ts` as everywhere. The WebView's `localStorage` lives in the
  app's private data: it survives app restarts and updates installed over the old APK, and is
  deleted only by "Clear storage" or uninstalling.
- **Signing:** a release APK signed with the committed **TEST-ONLY** key
  (`android/test-signing/tarantal-test.p12`, public passwords in `android/app/build.gradle`), so
  every friends' build installs over the previous one. A store release uses the product owner's
  private upload key, never committed, and an App Bundle (docs/ANDROID-TEST-APP.md §3).
- **CI:** `android.yml` (PRs labelled `android`, manual runs, and called by `pages.yml` on every
  push to main) builds, signs, checks the signature against the test certificate and uploads
  `tarantal-madness-<version>.apk` (14 days). `pages.yml` puts it at
  `/android/tarantal-madness.apk` with an install page `/android/` (en/af/de/nl,
  `tools/androidPage.ts`, strings in `src/i18n/android/`); the game deploys even if the APK build
  fails. The game's service worker never caches `/android/`, and `size-check` ignores it.
  `ci.yml` builds `dist-android/` (`size --strict`) and runs `tests/e2e/android-app.spec.ts` on
  Pixel 7 landscape (`E2E_PLATFORM=capacitor`).

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
  D-053: the HD pack keeps one area's hunt within 256 MB (226–243 MB, §10 HD pack); on the low
  tier the HD option says it may be slow.
- Safe areas (notches), dynamic viewport units (`100dvh`), no scroll/pinch.
- `localStorage` can throw (blocked/private) → always via `meta/storage.ts` with in-memory fallback.

## 10. Assets pipeline
- Sources in `art-source/` (PSD/Krita/Spine) — keep them: they document human authorship (see art bible).
- `tools/pack-atlases.ts` (`npm run assets:pack`, M10, D-027): turns `art-source/` into PNG
  textures, layer tiles (≤ 2 048 px), multi-page bird atlases (JSON hash, @1x + @2x) and audio,
  under `public/assets/<group>/` with content-hashed names, plus `public/assets/asset-index.json`
  (schema `src/game/assets/assetIndex.ts`). Rules for artists: `docs/06-ASSET-DELIVERY.md`.
- **Final/placeholder switch:** the game fetches the index at boot. `AssetManifest` loads each
  listed key's file (`loadFinal`) and `install()` uses it in place of the placeholder; a key
  without a file, or whose file fails, keeps its `ProceduralAssetFactory` placeholder (or the
  synth, for sounds). Every key reports `final`/`placeholder` (`entries()`, the audit, the test
  hook). Files belong to `common` or to one biome; non-initial groups load with their biome and
  are lazy for the size budget and the service worker.
- **Art gate (v1.6, D-042):** a hunt or the Skietbaan never starts on placeholders. The index
  fetch retries (bounded); `AssetManifest.missingFinal` lists delivered keys whose files failed
  (the late group not counted) and `main.ts ensureArt()` retries a biome `feel.assets.artRetries`
  times, fetching the index again each time (a deploy changes the hashed names). The home biome
  gates the title (a DOM message with Retry, `src/game/assets/artGate.ts`); other biomes gate
  their hunt behind a veil with the area's name, then a Retry/Back message. Rifle hunts and the
  Skietbaan also wait for the late Ver group: `AssetManifest.missingLate` lists its failed files
  once it settles, `neededLateMissing()` picks the ones the hunt needs (sight pictures, the map's
  Ver strip, a rifle's rig), and `ensureArt()` retries those the same way before the Retry/Back
  message; `upgrade()` swaps a sight placeholder drawn earlier by any manifest. A production
  build ships its index, so there an absent index (404, HTML soft-404) is a failure like any
  other; only dev, Vitest and `VITE_TEST_HOOKS=1` (CI e2e) builds run without one
  (`absentIndexAccepted()`). Placeholders on purpose: `?art=placeholder` (dev and
  test builds). Every failed file is named in a console warning and in the test hook
  (`assets.failed`); the debug overlay shows `art: interim · N placeholder`.
- **HD pack (1.9.0, D-053):** every asset group `g` may have a lazy twin `g-hd` with the same art
  at 2 texture px per design px (`src/game/assets/hdPack.ts`). Sources: the art tools' 2× renders
  (`npm run art:interim -- --only scenery|sprites --hd` writes layers, 1× props and shared sprites
  to `art-source/hd/`, same paths as `art-source/`), and the ≥ 2× bird and prop masters already in
  `art-source/` (packed straight into the HD group). The asset index lists each HD file beside its
  standard one (`hd` on images, layers, bird planes; `hdFiles()` lists an area's). Not in HD: the
  sky (a soft gradient), sprites cropped without a view scale (HUD ammo, the meerkat helper, water:
  Phaser 4.2 clamps a crop to the frame's size), the guns, near pop-up birds and the late group's
  rare birds (memory, below). Adding art to an HD pack is one step: its 2× render at
  `art-source/hd/<same path>` (or a ≥ 2× master), then `npm run assets:pack`; `"hd": false` in a
  sidecar or rig.json leaves one out (docs/06).
  - **Drawing at half scale:** props and far animals (`CanvasSpec.viewScaled`) keep the HD frame
    and `displayScale()` halves; layers take the HD tiles (2048 texture px = 1024 design px each,
    `LayerArt.scale` 0.5, the standard opaque-row profile in design px); birds use their HD atlas
    at `FinalBird.scale / 2` with animations keyed `final:<id>@hd/<clip>`. Every other key gets the
    HD image under the same key with its frames reporting the standard size and the source's
    resolution 2 (`hdTexture.ts halveTexture`): Phaser draws the quad at cutWidth / resolution,
    so every view, origin, particle and hit area sees design px unchanged. The sim never sees any
    of it; `HuntScene` samples on-screen boxes into the test hook (`graphics.bounds`).
  - **Swapping:** `AssetManifest.applyHd()` puts the chosen art under each key: the old texture is
    renamed and retired (never removed under an object, D-046), and `purgeRetired()` frees retired
    textures no object draws (`textureUse.ts` scans every scene) at the next scene change
    (`GraphicsControl.sync()` in `buildViews`). Switching to Standard also forgets the decoded HD
    images (`dropHd`, `finalLoader.forgetImage`). A hunt started from the title keeps its views (no
    scene change), so with Standard chosen `GraphicsControl.settle()` runs every 30 frames: Standard
    back under each key, live objects moved off retired images (same frame and size; props and far
    animals via `refreshHd()`), retired textures freed once nothing draws them; HD files still in
    flight are let go. With HD a layer never holds both tile sets on the GPU: `install()` skips
    the standard tiles of a layer that has HD tiles, `applyHd()` retires them when HD lands later
    (freed once nothing draws them, every 30 frames during play, `GraphicsControl.purge`), and
    puts them back first when Standard returns. HD files that land during play go in every 30
    frames; `ParallaxView.refreshHd()` swaps tiles, props and far animals in place and
    `WeaponView.refreshRig()` picks the gun's atlas again.
  - **The choice** (`graphicsChoice.ts`, Settings `graphics`: `ask` | `standard` | `hd`, saved with
    the settings): a saved preset wins; otherwise `main.ts` shows the DOM card
    (`ui/graphicsCard.ts`) before Phaser starts, with `recommendGraphics()` pre-selected: HD when
    `navigator.connection` says 4g and ≥ 10 Mbit/s (each where known), no Save-Data,
    `deviceMemory` ≥ 4 where known, not the low tier, and > 1.25 device px per design px (DPR ×
    the canvas's fit); "may be slow" at `deviceMemory` ≤ 2 or the low tier (the four numbers:
    `content/client/feel.json` `graphics`). No card when the HD index can't load. Remember my choice
    saves it, else `ask` stays. Test builds skip the card unless `?graphics=card`
    (`?graphics=standard|hd` forces a mode).
  - **Loading:** Standard never requests an HD file. HD: an area's files in common, the area and
    desert load before its hunt (the DOM loading screen at boot, the area veil in `HuntScene`),
    with a bar and MB; after `feel.assets.hdOfferStandardMs` (4 s) "Play now in Standard" starts on
    the standard art and HD swaps in when it lands (both screens time the offer on the wall clock,
    not Phaser's frame-capped scene clock; an HD file may take `hdFileTimeoutMs`, 120 s, so a slow
    one keeps loading after the offer; one that fails stays Standard). A hunt in a lazy area waits
    for its HD pack behind the same veil whether or not its standard art had already come in. The
    late and Ver HD groups follow in the
    background; between hunts the Classic area's and today's Daily's packs preload. A store app
    can ship the HD groups inside (one folder per group, listed in the index).
  - **Budgets** (`npm run size -- --strict`): the first download and the standard chunks
    unchanged; each `-hd` group ≤ 4 MB gzip (`HD_CHUNK_BYTES`); the report lists each area's HD
    download. Texture memory of one area's HD hunt (layers, every sprite, the guineafowl, a rare
    variant, the equipped gun): 226–243 MB against Standard's 95–110 MB, within the 256 MB
    ceiling (§9); with HD guns and near birds it would be ~310 MB, which is why they stay Standard.
- **Service worker (v1.6):** the asset index and HTML are network first (the cached copy only
  offline); other files cache first; a failed answer is never cached or replaced. The worker
  names its build (`<sha>@<build time>`, `src/platform/swUpdate.ts`) when the page asks; a new
  worker taking over a running page shows a Reload bar (`PlatformAdapter.onUpdateReady`) only
  when that build differs from the page's. The bar sits bottom centre above the safe area, has a
  × to dismiss it, and never shows in capture mode. `PlatformAdapter.hardRefresh()` (D-042 (14),
  the Skietbaan's "Fresh load", web admin-page builds only) unregisters the game's worker, deletes
  its `tm-*` caches (`CACHE_PREFIX`) and reloads with `?fresh=<now>`, keeping the other
  parameters and the save; portal adapters just reload.
- **Build stamp (v1.6):** `src/game/ui/buildStamp.ts` formats `v<version> · <sha> · <UTC build
  time>` (Vite defines `__APP_VERSION__`, `__BUILD_SHA__`, `__BUILD_TIME__`) plus the area,
  weekday and art status; a small corner label on the title, hunts and the Skietbaan (web), a
  line in Settings and the pause menu (every build), the admin page and reports, the boot
  console. Hidden in capture mode and with `?stamp=0` (visual baselines).
- Characters: frame-by-frame atlases for v1 (D-027). Spine (one rig, variants as skins) is
  exported to frames per skin; a Spine runtime is a v1.x option. Bird clips follow art bible
  §3.4 (`src/game/assets/birdClips.ts` maps sim motion/phase → clip, with fallbacks).
- Audio: WAV masters → loudness-normalised (BS.1770-4 meter in `tools/assets/loudness.ts`:
  music −16, voice −16, SFX −14, ambience −20 LUFS, true peak ≤ −1 dBTP) → Ogg Vorbis + MP3
  (`wasm-media-encoders`, no ffmpeg).
- Fonts (M10): self-hosted OFL Baloo 2 (600, 800: all UI text) and Bangers (onomatopoeia), from
  `@fontsource`, subset by `tools/make-fonts.ts` (`npm run fonts:build`) to the four language files
  plus the art bible §6 letters → `public/fonts/` (~42 KB, initial download). `main.ts` waits for
  them (≤ `feel.json assets.fontTimeoutMs`) before Phaser draws any text; system font otherwise.

## 11. Persistence (`src/meta/`)
- `SaveData` v1 (JSON, key `tm.save.v1`, schema `src/meta/saveSchema.ts`): `settings`, `ftue`,
  `notices`, `loadout`, `unlocks`, `notaboek` (progress + done), `birdBook` (creatures, secrets as
  `biome/propId`), `bests` per biome (Classic), `bestRank`, `stats`, and (M6) `run` — the Season
  Run in progress (`RunState`, null when none) — and `runStats` (started, won, best hunts cleared).
  v1.2 adds `bonusMaps` (defaults, no migration): `day` (UTC day of the unlocks), `unlocked`
  (`biome/bonus` keys, valid only on `day`: they reset at UTC midnight) and `bests`
  (`biome/bonus` → score, rank); rules in `src/meta/bonusMaps.ts` (GDD §11.5). A bonus-map hunt
  never moves the Classic `bests`.
  v1.3 adds (with defaults, no migration) `loadout.sights` (weapon id → fitted sight) and
  `unlocks.sights` (sights earned by Notaboek challenges); `progress.fittedSight()` picks the
  hunt's sight (fitted and unlocked, else the gun's default) and `HuntScene` puts it in the mode.
  M7 adds `daily` (a new section needs no migration: it defaults): `streak`, `bestStreak`,
  `bestScore`, `lastDay` (UTC day number of the last official attempt), `freezesUsed` (ISO weeks),
  `cosmetics` (streak milestones) and `history` (recent official attempts: day, score or null if
  abandoned, rank, whole flocks, share grid), bounded by `content/meta/daily.json`. M9 adds
  `runAds` (rewarded ads used by the run with `seed`: retries, doubled hunts; reset at run start).
  v1.4 B adds `areas` (defaults, no migration): `unlocked` (area packs earned for good) and `classic`
  (the area Classic plays, null = home). The rules live in `src/meta/areas.ts`: an area unlocks
  once its `unlockBonus` is reached in any area; the chosen area falls back to home while locked;
  `unlockedBiomes()` serves the Shed's bird book. The game stores new unlocks after each hunt and
  on the title (`ctx.grantAreas`).
- Season Run save (M6, `src/game/run/RunFlow.ts`): written at run start and after every step of
  the tally and the Padstal (open, buy, sell, reroll, reorder, leave), so a closed tab resumes on
  the same screen; a finished run leaves the save (the summary is shown from memory). Closing the
  tab mid-hunt resumes at that hunt's card: the hunt starts again with the same seed. A saved run
  is used only while it fits the content (`src/meta/run.ts validRun`: ids, slots, hunt count);
  otherwise it is dropped, never "repaired" into a different run.
- Loading (`src/meta/save.ts`): every section — and every field of an object section — is
  validated on its own, so damage falls back locally; text that isn't JSON is kept under
  `tm.save.corrupt` and the defaults are used; a save from a newer version is read but never
  overwritten. The `SaveStore` writes through on every change and on `pagehide`/hidden tab.
- Migrations: `migrations[from] = (old) => new`; tests for each. v0 = the loose M2 key
  `tm.settings.screenShake`, folded into `settings.screenShake` and removed.
- Cloud save via adapter where available; last-write-wins with per-section merge for unlocks (union).

## 12. Daily Hunt, share and challenge links
- `dailySeed = u32(SHA-256("tm-daily|" + YYYY-MM-DD(UTC) + "|" + contentHash))`: the first 4
  digest bytes read big-endian (`src/meta/daily.ts`, the sync SHA-256 of `content/hash.ts`, so Node
  and every browser agree). The date comes from `Date.now()` in the game layer only; the UTC day
  number, `YYYY-MM-DD` and ISO weeks are integer arithmetic in `src/meta/dailyCalendar.ts` (no
  `Date`, no time zones, DST-free). Daily #n counts from `content/meta/daily.json → epoch` (#1), its only copy (D-028: `content:validate`
  rejects a copy in code; `npm run release` warns, `--strict` fails, while it is the placeholder).
- Biome rotates by day: `biomeRotation[day mod n]` over the rotation biomes that are playable (in
  the bundle and drawn by this build); none playable → `modes.json → daily.biome`. Omen + crate
  schedule come from the seed's own streams (`omen`, `crates`). Daily = Classic rules with the
  omen on (D-021), no charms, no ad boosts; the gun is the Skiet-Skuur loadout (GDD §13.7).
  `content/meta/daily.json` is meta-only (outside the bundle and `contentHash`, like the Notaboek).
- First attempt of the UTC day is official (claimed when the hunt starts); later ones are practice
  and change no streak, share card, daily best, Classic best or rank. Streak/freeze rules: GDD §15.
- Share text is built locally (no server, `src/meta/share.ts`) in the player's language and sent
  through `PlatformAdapter.share` (§8): share sheet with text and link apart, else the clipboard.
- Challenge URL: `/?c=<base64url(JSON {v, seed, mode, biome, weapon, score, by?, n?, h?, l?, b?})>` —
  `l`/`b` (v1.2) are the map's layout and bonus map; a link without them (made before v1.2)
  plays the plain biome, unknown ids are rejected (`badShape`). `s` (v1.3) is the sender's rifle
  sight, lent with the gun; one that doesn't fit the gun is rejected (`unknownWeapon`). The share line names the day.
  friend challenges only (trivially editable; no leaderboard trust). `mode` is `classic` or
  `daily`; `n` = daily number (for the card), `h` = first 8 hex of `contentHash` (a mismatch still
  plays, with a "game updated" note). `src/meta/challenge.ts` decodes with a length cap, strict Zod
  and content checks (playable biome; a primary the sim plays — lent for that hunt even if
  locked) and never throws. The link carries no replay, so it is not deflated (D-024).
  `f` (D-048) is a Daily's special day; an id this version doesn't know is rejected (`badShape`).
- **Feesdae (D-048): a special day is an input of the mode.** `src/meta/feesdae.ts` decides from the
  UTC day number (the game reads the clock: `Date.now()`, or the e2e `?today=`) whether a special's
  date rule matches (fixed month/day, UTC like the Daily); `?feesdag=<id|none>` forces it on dev and
  e2e builds and the web admin page only (never a portal build; the admin page lists each special
  with Play). The Daily's setup keeps its seed (`dailySeed` is unchanged) and puts the special's id
  in `ModeConfig.feesdag`; the sim never reads a date — it looks the id up in
  `content/feesdae.json` (in the bundle and `contentHash`) and runs its twist from the `feesdag`
  RNG stream, so no other stream moves and every ordinary hunt's events are unchanged. InputLog v6
  records the id. Halloween's twist (`src/sim/feesdag/spookjag.ts`): bats and owls are flyers of
  their own (not birds): they cross a plane edge to edge on its sky lane with smoothstep swerves;
  lanterns stand on a plane's ground line (`groundY[0]`, lifted by `lanterns.lift`); all are
  `HitExtra` kind `spook`, first in their plane's layer. Events `feesdagStarted`, `spookFlew`,
  `spookHit` and `lanternsOut` (paid once); a bat and Lanterns out are event bonuses
  (`bonusAwarded`, GDD §5.3), an owl a `penaltyApplied` like the hadeda's; a shot
  that hits only Spookjag things leaves the Frenzy streak alone, like a secret part. The look
  (light, moon, decorations, hats) is the game's: the special's light replaces the layout's, and
  `src/game/feesdae/FeesdagView.ts` is a lazy chunk with a lazy asset group (`feesdae`).

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
`settings_change` through `PlatformAdapter.analytics`. M7 adds `daily_play` (day, number,
official, biome, challenge), `share_click` (mode, official, method = shared/copied/cancelled/failed)
and `challenge_open` (ok, mode and contentChanged, or the rejection reason). M9 adds `error`
(source, trimmed message: see §17), `rewarded_ad` (kind, granted), `rewarded` (kind, hunt: the
reward applied) and `privacy_clear`. Analytics and error reports stay on the device on every
platform for now (neither portal SDK takes custom events or error reports).

## 15. Quality gates

| Gate | Tool | Budget / rule |
|---|---|---|
| Types | `tsc --noEmit` (strict, `noUncheckedIndexedAccess`) | 0 errors |
| Lint | ESLint (incl. sim purity rules) + Prettier | 0 errors |
| Unit | Vitest | sim, scoring, flock FSM, charms, run math, migrations |
| Golden replays | Vitest | fixed seed + input log → expected score + event-stream hash |
| Content | `tools/validate-content.ts` | all schemas + cross-refs pass |
| E2E | Playwright: desktop Chromium + WebKit, Pixel 7 & iPhone 14 landscape emulation | boot → hunt → 20 taps → tally |
| Visual | Playwright `toHaveScreenshot` (`tests/e2e/visual.spec.ts`, M10): title, hunt held at tick 300 (seed 42, `?holdAt`), tally, Padstal, Settings ×2, privacy, on desktop-chromium + pixel7-landscape; baselines in `tests/e2e/visual-baselines/`, Linux/SwiftShader reference | ≤ 2 % pixels differ (colour threshold 0.25); after an intentional change (art swap), CI re-records them: label the PR `update-baselines` or run the *Visual baselines* workflow (D-030), then review the image diff in the PR |
| Perf | Headless Chrome, 4× CPU throttle, 30 s hunt (`tests/e2e/perf.spec.ts`) | avg frame ≤ 16.7 ms on medium tier: CPU cost per frame always; real frame time with `PERF_STRICT=1` on a GPU machine (D-019) |
| Perf, low tier (M9) | Pixel 7 profile, 6× CPU throttle, quality low, 20 s hunt (`perf.spec.ts`) | CPU cost of a frame at 50 fps ≤ 20 ms: (CPU per frame − sim time) + 1.2 × sim tick cost (D-026) |
| Size | `tools/size-check.ts` (`--strict` in CI, `--dir` per platform build) | initial (entry + static imports, from Vite's manifest) ≤ 5 MB gzip; hard fail at 8 MB; lazy chunks reported apart, each lazy chunk (a biome, the late group) ≤ 1.5 MB gzip under `--strict` (v1.1, D-032); the v1.x plan keeps the first download ≤ 3 MB |
| Assets (M10) | `tools/asset-audit.ts` (`npm run assets:audit`) | every manifest key final/placeholder, size, where used; fails on unused deliveries/files/keys and missing files or keys; CI runs report mode, `--strict` (no placeholders) is the launch gate |
| Sim cost | microbenchmark | `step()` ≤ 1.5 ms with 60 birds on a mid-range phone profile |

CI (GitHub Actions): install → `npm run check` → build → size → e2e. Deploy previews per PR to static
hosting (Cloudflare Pages / Netlify); `main` deploys the PWA.

## 16. Supported browsers
Last two major versions of Chrome, Edge, Firefox, Safari (macOS + iOS/iPadOS), Samsung Internet;
Android Chrome on mid-range devices from ~2021. WebGL2 required; show a friendly message otherwise.

## 17. Security and privacy
No PII collected; anonymous device id only if a platform needs it. No `eval`/remote code; mods are
data. CSP for the standalone site. In-game privacy policy screen (M9: Settings → Privacy: what is
stored locally, what is sent, no personal data, clear my data). Bundle all dependencies (no
external CDNs at runtime) — the one exception is the portal's own SDK script in its portal build,
which the portal requires. Error reports (M9, `src/platform/errors.ts`) carry the error message
and top stack frames with every URL cut to its file name (no origin, path, query or hash), capped
per page.
