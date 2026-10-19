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
  mode: ModeConfig;             // classic | daily | seasonHunt (+ charms, weapon, biome, omen, boss)
  inputKind: 'pointer' | 'touch'; // fixed per hunt; selects aim-assist radii; recorded in the replay
}
// The sim never knows the device's viewport width (see §3.3) — that is what keeps replays,
// the Daily Hunt and challenge links identical on every device.
export type Command =
  | { t: 'fire'; dx: number; sy: number }      // dx = design px from SCREEN CENTRE, sy = design px from top
  | { t: 'fireHoldStart'; dx: number; sy: number } | { t: 'fireHoldMove'; dx: number; sy: number }
  | { t: 'fireHoldEnd' }
  | { t: 'reload' }
  | { t: 'cameraTarget'; cx: number }          // camera CENTRE in reference units, quantised to 0.5
  | { t: 'gadget' } | { t: 'consumable'; slot: number };
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
  `'pellets'`, `'flockNoise'`, `'charms'`, `'shop'`) so adding randomness in one system doesn't shift
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
- Projectile weapons (Kettie): **delayed hitscan** — travel time per plane (near 80 ms, mid 180 ms,
  far 350 ms), gravity drop and wind drift applied at arrival; the target may have moved (leading
  is the skill).
- Every resolution emits events: `ShotFired`, `PelletImpact`, `TargetBagged`, `Miss`, `FlockAlerted`,
  `FlockFlushed`, `SecretTriggered`, `ComboChanged`, `ScoreAwarded`, `PenaltyApplied`, …

### 3.5 Birds and flocks
- `Flock` holds members + FSM state (`forage | alert | run | flush | settle | exit | roost`), the
  escalation-window timer (`escalationWindowMs`, 1.5 s) and state timers. One threat inside the
  window escalates one step; window expiry de-escalates ALERT → FORAGE (GDD §6.1).
- Members steer with boids (separation, alignment, cohesion) + a flock goal + zigzag noise from
  `rng.stream('flockNoise')`. Flight = ballistic launch (55–75°) → flap → glide → land.
- Fly-overs and pop-ups are separate lightweight behaviours.
- Bosses are birds with extra components (`armorHits`, `bossRule`, scripted moves).

### 3.6 Spawn director
- Budget-based: each biome defines `pacing` keyframes (`t: 0..1 → targetBirds per plane, flockRate,
  flyoverRate, eventWeights`). The director spawns to meet budgets, respecting min/max on screen
  (default max 60 birds total, max 8 flocks).
- All windows in content (events, crates) are **fractions of hunt length** (`window: [0.2, 0.8]`).
- The **Stampede** has one source of truth: `scoring.json → stampede.lastSeconds`. When the mode (or
  the Stampede-Kenner charm) enables it, the director switches to its surge profile at
  `duration − lastSeconds` and the pipeline applies `stampede.mul`.
- Events (hadeda, dust devil, crates, stampede) come from a seeded schedule generated at hunt start —
  this is what makes the Daily Hunt identical for everyone.
- World-event ids (used by biome JSON and the charm action `spawnEvent`): `hadeda`, `cropSprayer`,
  `kwevoel`, `dustDevil`, `farmDog`, `carAlarm`, `reservoirFlush`, `bossAppearance`, `crate`, `stampede`. Each has a
  handler in `director/events.ts`; unknown ids fail content validation.

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
- Escape hatch: `"script": "<id>"` → a TypeScript charm registered in `charms/registry.ts` for effects
  the DSL can't express. Mods may **not** register scripts in v1 (no remote code, no `eval`).

### 3.9 Season Run state machine
`RunStart → (Hunt → Tally → Padstal) × 12 → Victory | Defeat`. Run state (charms, doppies, seed
cursor, unlock flags) is serialisable and saved after every Padstal so a closed tab resumes the run.

### 3.10 Replays
`InputLog = { v, seed, contentHash, mode, inputKind, commands: [tickDelta, command][] }`, delta + varint encoded,
then base64url'd (`src/sim/replay/inputLog.ts`). Deflate is applied outside the sim, at the
share/challenge-link boundary (M7), because it needs async platform APIs (D-018). Used for: golden tests, bug reports (attach log), ghost replays, and
(v1.x) server-side leaderboard validation by re-simulating in Node.

## 4. Content system (`content/`, `src/content/`)

- One Zod schema per file type in `schemas.ts`; types are `z.infer`'d — never hand-written twice.
- `npm run content:validate` (also in `npm run check` and CI) validates every JSON file and checks
  cross-references (biome → creature ids, charm → trigger names, run → boss ids).
- `contentHash` = SHA-256 of the canonicalised bundle; part of every replay, daily seed and score
  submission (only official content counts for leaderboards).
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
}
```
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
- `SaveData` v1 (JSON, key `tm.save.v1`): settings, unlock flags, Notaboek progress, Bird Book,
  bests per biome, daily history (date → score, first-attempt flag), streak + freezes, in-progress run.
- Migrations: `migrations[from] = (old) => new`; tests for each.
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
`error`. No personal data. Respect each portal's tracker rules.

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
| Perf | Headless Chrome, 4× CPU throttle, 30 s hunt | avg frame ≤ 16.7 ms on medium tier |
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
