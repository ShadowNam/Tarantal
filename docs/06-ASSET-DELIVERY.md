# Tarantal Madness — Asset Delivery Spec

Status: v1.0 · 21 Oct 2026 · interim art and gun rigs added 22 Oct 2026 (D-029) · for the illustrator, the animator and the sound designer.
Rules come from the art bible (`03-ART-AUDIO-BIBLE.md` §1, §3.4, §4.1, §9, §10) and Tech §10. If this
page and the bible disagree, the bible wins: tell the developer.

## 1. How delivered files reach the game

1. Put source exports in `art-source/` using the folder layout below (keep the PSD, Krita or Spine
   files there too: they document human authorship).
2. Run `npm run assets:pack`. It checks every file against this spec, resizes the bird frames per
   plane, cuts layers into tiles of 2048 px or less, normalises audio and encodes it twice (Ogg
   Vorbis and MP3), then writes `public/assets/` and `public/assets/asset-index.json`.
   `public/assets/` is generated: never edit it by hand. Commit it together with `art-source/`.
3. When the game boots it reads the index. **Every key listed there uses the delivered file. Every
   other key keeps its procedural placeholder.** No code changes are needed. A file that is
   missing, broken or slow (over `feel.json assets.fileTimeoutMs`) falls back to the placeholder
   for that key only.
4. Run `npm run assets:audit`, which lists every key as final, interim or placeholder. Before
   launch, `npm run assets:audit -- --strict` must pass with no placeholders and no interim keys
   left.
5. Update the visual regression baselines (§7).

**Interim art (D-029).** Until your files arrive, some keys use *interim* art: code-drawn stand-ins
written into `art-source/` by `npm run art:interim` (`tools/art/`), in exactly the layout this page
describes. They are marked `"origin": "interim"` in their `rig.json` (or sprite sidecar JSON), and
the audit lists them in their own INTERIM group. **A human delivery for the same key simply
replaces them:** delete the interim folder (e.g. `art-source/birds/tarentaal/`), copy your files in
(your `rig.json` has no `origin`, so the key counts as final), run `npm run assets:pack`. The
generator never overwrites a folder whose `rig.json` isn't marked interim. Today the six guns
and the tarentaal family (tarentaal, wit, lavendel, kuifkop, kuifkop_koning, generaal, ou_grys)
are interim.

You can deliver in parts. A single sprite, one layer, or one bird with only some clips all work:
whatever isn't delivered stays on its placeholder.

## 2. Folder layout (`art-source/`)

```
art-source/
  sprites/<key>.png               one texture key, e.g. sprites/ui/shell.png → ui/shell
  sprites/<key>.json              optional: { "originX": 0.5, "originY": 1 } (fractions)
  layers/<biome>/<layerId>.png    one parallax layer, full width with bleed (§4)
  layers/<biome>/<layerId>.json   optional: { "top": 630 } (design y of the top edge)
  birds/<creature>/<clip>/00.png  one folder per §3.4 clip, frames numbered 00, 01, …
  birds/<creature>/rig.json       optional: origin, per-clip fps/loop, clips per plane (§3)
  birds/<creature>/planes/<plane>/<clip>/00.png
                                  optional: a master drawn for one plane only (§3)
  guns/<weaponId>/<clip>/00.png   animated first-person gun: idle, fire, reload, flash (§6)
  guns/<weaponId>/rig.json        optional: grip, muzzle tip, per-clip fps/loop (§6)
  audio/sfx/<id>.wav              sound effects (§5)
  audio/music/<biome>/<stem>.wav  calm | build | stampede
  audio/ambience/<biome>.wav      one loop per biome
  audio/voice/<id>.wav            Oupa barks (keys arrive with the bark list)
```

All images are 8-bit RGBA PNG with straight (not premultiplied) alpha, sRGB. Don't bake any text
into art: all words come from the i18n files (bible §1 rule 7). Don't use real brands or logos.

## 3. Birds (bible §3)

**Frame box.** Draw every frame inside the same box as the placeholder birds: **620 × 400 units,
facing right, with the bird's sim position at (310, 230)**. The sim position is the origin of the
hitboxes in `content/birds.json` (body and head circles), so line the body up with them: the debug
overlay (`?debug=1`) draws the hitboxes over the live bird. The master resolution can be any
multiple of the box with the same 31 : 20 aspect. The bible's 512 px-tall masters are 794 × 512.
All frames of one creature must have the same size. Use `rig.json` `originX`/`originY` only if
the origin really has to move.

**Sizes per plane.** The tool scales the masters to box × plane scale for @1x (low and medium
tiers) and twice that for @2x (high tier). It never upscales, so masters smaller than @2x get no
@2x set.

| Plane | Plane scale | @1x frame | @2x frame |
|---|---|---|---|
| near (pop-ups) | 1.0 | 620 × 400 | 1240 × 800 |
| mid | 0.5 | 310 × 200 | 620 × 400 |
| far | 0.22 | 136 × 88 | 273 × 176 |

Line weight by depth (bible §1 rule 4) is drawn into the masters. If one master doesn't read well
at both 136 px and 620 px, draw that plane's own version in
`birds/<creature>/planes/<plane>/<clip>/` (same frame box, any multiple of it): it replaces the
shared master on that plane, clip by clip. The interim art does this for every plane (6 / 4 / 2 px
ink, fewer and larger dots on the far plane).

**`rig.json` options:** `originX`/`originY` (fractions), `clips` (`{ "flap": { "fps": 18,
"loop": true } }`), `planeClips` (which clips each plane's atlas holds), `"x2": false` (no @2x
set: the game draws @1x at 1 texture px per canvas px on every tier, D-029 §4), `"encode":
"png8"` (palette PNG pages, about 3–4× smaller; fine for flat-fill art) and `"origin":
"interim"` (only for stand-in art; leave it out). Atlas frames are packed whole (untrimmed):
Phaser 4.2.1 draws trimmed frames wrongly when they play as an animation (D-029 §3).

**Clips (bible §3.4).** Folder names must be one of these:

| Clip | Frames @ fps | Loop | Plays when (sim motion → phase) |
|---|---|---|---|
| `forage_walk` | 8 @ 12 | yes | flock walking; bosses walking |
| `peck` | 6 @ 12 | yes | flock walking, every third 1.5 s spell (staggered per bird) |
| `alert` | 4 @ 10 | hold | flock alert; perched bird (kwêvoël) sitting |
| `run` | 8 @ 18 | yes | flock running; boss running or landing |
| `takeoff` | 6 @ 20 | hold | flock crouched to launch; hopping bird mid-hop |
| `flap` | 6 @ 16 | yes | flying: fly-overs, flushed flock, bosses flying off |
| `glide` | 2 @ 6 | yes | flock gliding |
| `land` | 4 @ 14 | hold | flock touching down |
| `hit_poof` | 6 @ 24 | once | played where a bird is bagged (feather burst FX still plays) |
| `tumble` | 4 @ 16 | yes | reserved (falling out of frame) |
| `peek` | 6 @ 12 | yes | near pop-ups (rise, stare, duck); peeking bosses |

Different frame counts work (the tool warns). fps and loop can be changed per clip in `rig.json`:
`{ "clips": { "flap": { "fps": 18 } } }`.

**Missing clips** fall back in this order, and after the last one to the placeholder frames:
`peck`, `alert` and `run` → `forage_walk` · `land` → `run` · `peek` → `alert` · `takeoff` and
`glide` → `flap` · `tumble` → `hit_poof`. So the minimum useful delivery is `flap` and
`forage_walk`.

**Near-plane atlas.** Near birds are pop-ups, so by default the near atlas holds only `peek`,
`alert`, `hit_poof` and `tumble`. That keeps a 620 × 400 frame set inside a few 2048² pages.
Override it with `rig.json` `"planeClips": { "near": [...] }`.

**Variants and bosses** are separate creature folders (bible §3.2). A Spine rig would be exported
per skin to frames for v1 (see D-027). Creatures and the planes they appear on:

| Creature | Planes | Group |
|---|---|---|
| `tarentaal` | near, mid, far | common |
| `tarentaal_wit` | mid, far | common |
| `tarentaal_lavendel` | mid, far | common |
| `generaal` | mid | common |
| `ou_grys` | mid | common |
| `kuifkop_koning` | mid | common |
| `stormvoel` | mid, far | common |
| `kwevoel` | mid | common |
| `hadeda` | far | common |
| `sproeier` | far | common |
| `kuifkop` | mid | okavango-spring |
| `visarend` | far | okavango-spring |

The tool packs each creature × plane into Phaser multi-page atlases (≤ 2048² per page at @1x,
≤ 4096² at @2x).

## 4. Parallax layers (bible §4.1)

One PNG per layer, drawn at design px (1080-tall design space). The width is the core width plus
300 px of bleed on each side, for 21:9 screens. The tool cuts it into 2048 px tiles. The table
gives each placeholder layer's band (top edge and height): a delivered layer may be taller or
start higher (set `top` in the sidecar JSON), and transparent areas show the layers behind it.

| Biome | Layer | Scroll | Width (px) | Top (design y) | Height |
|---|---|---|---|---|---|
| karoo-autumn | `sky` | 0.05 | 2680 | 0 | 1080 |
| karoo-autumn | `far_ridge` | 0.15 | 3000 | 380 | 280 |
| karoo-autumn | `far_veld` | 0.35 | 3640 | 548 | 232 |
| karoo-autumn | `mid` | 0.6 | 4440 | 630 | 280 |
| karoo-autumn | `near` | 1 | 5720 | 820 | 260 |
| karoo-autumn | `foreground` | 1.2 | 6360 | 900 | 180 |
| bushveld-winter | `sky` | 0.05 | 2680 | 0 | 1080 |
| bushveld-winter | `far_ridge` | 0.15 | 3000 | 380 | 280 |
| bushveld-winter | `far_veld` | 0.35 | 3640 | 548 | 232 |
| bushveld-winter | `mid` | 0.6 | 4440 | 630 | 280 |
| bushveld-winter | `near` | 1 | 5720 | 820 | 260 |
| bushveld-winter | `foreground` | 1.2 | 6360 | 900 | 180 |
| okavango-spring | `sky` | 0.05 | 2680 | 0 | 1080 |
| okavango-spring | `far_ridge` | 0.15 | 3000 | 380 | 280 |
| okavango-spring | `far_veld` | 0.35 | 3640 | 548 | 232 |
| okavango-spring | `mid` | 0.6 | 4440 | 630 | 280 |
| okavango-spring | `near` | 1 | 5720 | 820 | 260 |
| okavango-spring | `foreground` | 1.2 | 6360 | 900 | 180 |
| kalahari-summer | `sky` | 0.05 | 2680 | 0 | 1080 |
| kalahari-summer | `far_ridge` | 0.15 | 3000 | 380 | 280 |
| kalahari-summer | `far_veld` | 0.35 | 3640 | 548 | 232 |
| kalahari-summer | `mid` | 0.6 | 4440 | 630 | 280 |
| kalahari-summer | `near` | 1 | 5720 | 820 | 260 |
| kalahari-summer | `foreground` | 1.2 | 6360 | 900 | 180 |

- Props and secrets are separate sprites (§6); line them up with the layer they stand on: a prop's
  position is `u` × core width (bleed not counted) and `y` in `content/biomes/<biome>.json`.
- Keep the sky band (the top ~35 %) calm: flyers travel there (bible §1 rule 5).
- Foreground: keep the bottom 18 % mostly open on mobile.
- The low quality tier draws `far_ridge` on the `far_veld` plane, stretched by the ratio of their
  core widths, so the far ridge must still read when stretched about 1.2×.

## 5. Audio (bible §10, Tech §7 and §10)

**Masters:** WAV, 44.1 or 48 kHz, 16- or 24-bit PCM (or 32-bit float), mono or stereo. Leave
about 1 dB of headroom and don't normalise: the tool measures integrated loudness (ITU-R BS.1770-4)
and true peak, then applies one gain per file.

| Kind | Target | Peak ceiling | Ogg / MP3 quality | Loops |
|---|---|---|---|---|
| sfx | −14 LUFS | −1 dBTP | Vorbis q4 / LAME V4 | no |
| voice | −16 LUFS | −1 dBTP | q3 / V5 | no |
| music stems | −16 LUFS | −1 dBTP | q2 / V6 | yes, seamless |
| ambience | −20 LUFS | −1 dBTP | q1 / V7 | yes, seamless |

Short SFX that would clip at −14 LUFS are held at the −1 dBTP ceiling instead (they come out
quieter). Loops play the whole file: cut them on a zero crossing, with no silence at either end.
Each biome's three music stems (`calm`, `build`, `stampede`) must be the same length and tempo
(they crossfade by intensity: bible §10, 120 → 150 bpm, with the Stampede stem carrying the
tempo-up).

**SFX keys** (the file name is the id, e.g. `audio/sfx/shot.wav`): `shot`, `click` (empty click),
`shell` (shell insert / reload), `poof`, `kek` (contact call), `kekAlarm`, `sting` (flush
music sting), `vuvuzela`, `stamp` (whole-flock stamp), `scratch` (penalty record scratch),
`stampede`, `ting` (secret part hit), `secret` (secret fanfare), `alarm` (bakkie alarm),
`splash`, `clang` (pot), `kwe` (kwêvoël call), `crate`, `powerup`, `whoosh` (dust devil),
`tick` (tally count-up tick) and `thud` (rank stamp thud on the tally). All 22 are required
for `npm run assets:audit -- --strict` to pass. More of the bible's SFX list (variants ×3,
hadeda call, UI clicks) needs a key in the game first: ask the developer for it.

**Music and ambience keys** per biome (`karoo-autumn`, `bushveld-winter`, `okavango-spring`,
`kalahari-summer`): `audio/music/<biome>/calm.wav`, `build.wav` and `stampede.wav`, plus
`audio/ambience/<biome>.wav`. **Calm** plays at the title and in quiet stretches, **build** when a
flock runs or flushes or the Frenzy reaches ×2, and **stampede** in the Stampede. A missing stem
falls back to the next calmer one. Music ducks −6 dB under Oupa.

**Voice keys** (Oupa's barks, file name = the bark's i18n key; the HUD shows the line as a
subtitle): `bark.kos_is_reg` (Karoo), `bark.weavers` and `bark.sign` (Kalahari),
`bark.mokoro` and `bark.kwaak` (Okavango), e.g. `audio/voice/bark.kos_is_reg.wav`. Record the
EN/AF line as written in `src/i18n/en.json`. The bible's ~40 launch barks need their trigger and
key in the game first: they are listed as a follow-up.

**Size:** the home biome's (Karoo) music and ambience are in the first download, which must stay
at or under 5 MB gzip in total (`npm run size`). Three 60 s stems at Vorbis q2 come to about 2 MB.
The other biomes' audio loads when that biome is first played.

## 6. Sprites (UI, FX, props, guns)

A delivered sprite should match its placeholder's size: views place it at its own size (1 texture
px = 1 design px), and the pack tool warns if it differs. Its origin defaults to the placeholder's.
**common** loads with the first download; a biome group loads when that biome is first played.

| Key | Size (px) | Group |
|---|---|---|
| `biome/water` | 256 × 64 | common |
| `crate/box` | 160 × 160 | common |
| `crate/chute` | 260 × 360 | common |
| `fx/bubble` | 260 × 170 | common |
| `fx/dust` | 40 × 40 | common |
| `fx/dust_devil` | 300 × 520 | common |
| `fx/feather` | 24 × 48 | common |
| `fx/flash` | 200 × 200 | common |
| `fx/glint` | 96 × 96 | common |
| `fx/grass_tuft` | 260 × 110 | common |
| `fx/leaf` | 28 × 16 | common |
| `fx/pot` | 140 × 110 | common |
| `fx/puff` | 64 × 64 | common |
| `fx/ring` | 200 × 200 | common |
| `fx/smoke` | 140 × 140 | common |
| `fx/spark` | 80 × 80 | common |
| `fx/splash` | 96 × 64 | common |
| `fx/stone` | 32 × 28 | common |
| `gun/dubbelloop` | 420 × 520 | common |
| `gun/kettie` | 420 × 520 | common |
| `gun/mielie_masjien` | 420 × 520 | common |
| `gun/pomp` | 420 × 520 | common |
| `gun/voorlaaier` | 420 × 520 | common |
| `gun/windbuks` | 420 × 520 | common |
| `helper/meerkat` | 120 × 220 | common |
| `omen/glare` | 256 × 64 | common |
| `omen/rain` | 6 × 40 | common |
| `omen/rainbow` | 512 × 256 | common |
| `secret/mark` | 64 × 64 | common |
| `secret/mark_hit` | 64 × 64 | common |
| `secret/rotor` | 240 × 240 | common |
| `ui/badge_no` | 64 × 64 | common |
| `ui/reticle` | 180 × 180 | common |
| `ui/shell` | 40 × 92 | common |
| `ui/shell_empty` | 40 × 92 | common |
| `ui/windsock` | 150 × 60 | common |
| `bushveld/aloe_a` | 360 × 400 | bushveld-winter |
| `bushveld/aloe_b` | 380 × 400 | bushveld-winter |
| `bushveld/baobab` | 550 × 910 | bushveld-winter |
| `bushveld/boulder_a` | 310 × 244 | bushveld-winter |
| `bushveld/boulder_b` | 290 × 232 | bushveld-winter |
| `bushveld/boulder_crack` | 330 × 250 | bushveld-winter |
| `bushveld/dassie_koppie` | 500 × 340 | bushveld-winter |
| `kalahari/dead_camelthorn` | 400 × 670 | kalahari-summer |
| `kalahari/dune_grass_a` | 360 × 380 | kalahari-summer |
| `kalahari/dune_grass_b` | 380 × 380 | kalahari-summer |
| `kalahari/weaver_camelthorn` | 500 × 740 | kalahari-summer |
| `kalahari/windpomp_sign` | 204 × 410 | kalahari-summer |
| `karoo/aloe_a` | 360 × 340 | karoo-autumn |
| `karoo/aloe_b` | 380 × 340 | karoo-autumn |
| `karoo/bakkie` | 500 × 300 | karoo-autumn |
| `karoo/fence_bell` | 220 × 240 | karoo-autumn |
| `karoo/potjie` | 220 × 240 | karoo-autumn |
| `karoo/reservoir` | 420 × 220 | karoo-autumn |
| `karoo/windpomp` | 170 × 560 | karoo-autumn |
| `okavango/hippo` | 320 × 190 | okavango-spring |
| `okavango/lily_frog` | 180 × 200 | okavango-spring |
| `okavango/mokoro_pole` | 182 × 400 | okavango-spring |
| `okavango/papyrus_a` | 440 × 480 | okavango-spring |
| `okavango/papyrus_b` | 460 × 480 | okavango-spring |
| `okavango/reeds_a` | 380 × 350 | okavango-spring |
| `okavango/reeds_b` | 360 × 340 | okavango-spring |
| `okavango/reeds_c` | 390 × 350 | okavango-spring |
| `okavango/reeds_d` | 360 × 340 | okavango-spring |
| `okavango/sausage_tree` | 410 × 800 | okavango-spring |

**Animated guns (D-029).** A gun can also be delivered as frames, which replaces its single
sprite: `guns/<weaponId>/<clip>/NN.png` with these clips:

| Clip | Frames | Box | Plays when |
|---|---|---|---|
| `idle` | 1 (required) | 420 × 520 | always, between the others |
| `fire` | 3–4 @ 24 fps | 420 × 520 | each shot (recoil, hammer, band release, crank) |
| `reload` | ~5–8 | 420 × 520 | while the weapon reloads, stretched to `weapons.json reloadMs` (per shell when `perShellReload`) |
| `flash` | 2–3 @ 30 fps | 200 × 200, centred on the muzzle | each shot: a small local muzzle flash, never full-screen; "reduce flashes" dims it |

The gun frame is the placeholder's box: the grip (the gun's screen anchor) at the bottom centre
(210, 520) and the muzzle at (210, 20). If the muzzle sits elsewhere, set `tipX`/`tipY` (fractions)
in `guns/<weaponId>/rig.json`, so the flash and smoke appear at the barrel. Barrels point up the
screen, like the placeholder. On touch screens the game shrinks the gun to 60 % and fades it to
40 % while a finger is down (bible §6).

## 7. Checking a delivery

```
npm run assets:pack                 # art-source/ → public/assets/ (fails on any error)
npm run assets:audit                # every key: final, interim or placeholder, size, where it's used
npm run assets:audit -- --strict    # launch gate: fails while any placeholder or interim key remains
npm run build && npm run size -- --strict
npx playwright test tests/e2e/visual.spec.ts --project=desktop-chromium --project=pixel7-landscape --update-snapshots
                                    # then review tests/e2e/visual-baselines/ in the PR diff and commit
```

To look at the swap path without real art, use `npm run assets:standins`. It regenerates the
committed stand-in delivery in `tests/fixtures/standin-assets/`: one magenta tarentaal stamped
"STAND-IN", the Karoo `mid` layer, and the shot and poof sounds. View it with
`STANDIN=1 npm run dev`. The stand-ins are never part of a build. `tests/e2e/assets.spec.ts`
serves them to the game to show the swap, the fallback with nothing delivered, and the fallback
for one broken file.
