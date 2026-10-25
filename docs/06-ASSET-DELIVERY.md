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
generator never overwrites a folder whose `rig.json` (or a sprite's or layer's sidecar JSON)
isn't marked interim. Today the six guns, the tarentaal family (tarentaal, wit, lavendel,
kuifkop, kuifkop_koning, generaal, ou_grys), the non-target flyers (hadeda, sproeier, kwevoel,
visarend, stormvoel), the shared FX/UI sprites and every biome's layers and props are interim
(D-031); `npm run assets:audit` lists every key. To replace an interim sprite or layer, delete
its `.png` and `.json` and copy yours in.

You can deliver in parts. A single sprite, one layer, or one bird with only some clips all work:
whatever isn't delivered stays on its placeholder.

## 2. Folder layout (`art-source/`)

```
art-source/
  sprites/<key>.png               one texture key, e.g. sprites/ui/windsock.png → ui/windsock
  sprites/<key>.json              optional: { "originX": 0.5, "originY": 1 } (fractions)
  layers/<biome>/<layerId>.png    one parallax layer, full width with bleed (§4)
  layers/<biome>/<layerId>.json   optional: { "top": 630 } (design y of the top edge); interim
                                  art also sets "origin": "interim", and "encode": "png8" (palette
                                  tiles) except the skies, which are full colour (no "encode") so
                                  their gradient doesn't band (D-031)
  birds/<creature>/<clip>/00.png  one folder per §3.4 clip, frames numbered 00, 01, …
  birds/<creature>/rig.json       optional: origin, per-clip fps/loop, clips per plane (§3)
  birds/<creature>/planes/<plane>/<clip>/00.png
                                  optional: a master drawn for one plane only (§3)
  guns/<weaponId>/<clip>/00.png   animated first-person gun: idle, fire, reload, flash (§6)
  guns/<weaponId>/rig.json        optional: grip, muzzle tip, per-clip fps/loop (§6)
  audio/sfx/<id>.wav              sound effects (§5)
  audio/music/<biome>/<stem>.wav  calm | build | stampede
  audio/ambience/<biome>.wav      one loop per biome
  audio/voice/<lang>/<key>.wav    Oupa's lines, one folder per voice language (en, af, de)
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
"interim"` (only for stand-in art; leave it out), `"planeRes": { "mid": 0.75 }` (pack a plane
below its display size; the game draws it scaled up) and `"group": "late"` (download after the
first download settles, while the title is up: rare variants, bosses; until then the placeholder
shows).

**How the tool packs frames (D-029):** every frame of a clip is cropped to the clip's common
opaque area and stores the bird's sim position (or the gun's grip) as its own pivot, so nothing
moves; frames of a clip that are near-identical to an earlier one are packed once. Frames are
never *trimmed* in the TexturePacker sense: Phaser 4.2.1 draws trimmed frames wrongly when they
play as an animation. You don't need to do anything for this: deliver full frames in the box.

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
per skin to frames for v1 (see D-027). Creatures, the planes they appear on, and the download
group their interim `rig.json` sets (`common` = the first download; `late` = after it settles;
a biome = with that biome; a delivery without `group` falls back to the catalog's group):

| Creature | Planes | Group |
|---|---|---|
| `tarentaal` | near, mid, far | common |
| `tarentaal_wit` | mid, far | late |
| `tarentaal_lavendel` | mid, far | late |
| `generaal` | mid | late |
| `ou_grys` | mid | bushveld-winter |
| `kuifkop_koning` | mid | okavango-spring |
| `stormvoel` | mid, far | late |
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

- **Interim layers since v1.6 (D-042).** The interim `mid` layers start higher than the table's
  band so their trees fit: Karoo, Bushveld and Kalahari `top` 430 (480 tall), Okavango 380 (530
  tall), Namibië 500 (410 tall); the sidecar's `top` says so, and a delivery may do the same. Busy
  interim layers are quantised to fewer palette colours (96–128, `LayerPlan.colours` in
  `tools/art/`) to stay inside the download budgets, and the Okavango sky is a 256-colour palette
  PNG (`"encode": "png8"`) instead of full colour. Final art keeps the normal rules.
- **v1.6 review round keys (D-042):** `fx/windpomp_vane` (the windpomp's turning head, 320 ×
  140, origin at the pivot (290, 70), drawn trailing left), `secret/rotor` (now always shown on
  the windpomps), `sky/cloud_cumulus | cloud_wide | cloud_cirrus | cloud_tower` (drawn at half
  size, shown at 2×, white and grey: the game tints them), and `fauna/<biome>_<group>` (the far
  animals, 3× masters with `master: 3`, one sprite per herd; placement, box and feet line in
  `src/game/view/faunaSprites.ts`; the Namibië waterhole sprite is in the Ver group). Props at 2×:
  `karoo/windpomp`, `kalahari/windpomp_sign` (with its windpomp, frame 320 × 440, origin (120,
  310)), `bushveld/dassie_koppie` (frame 560 × 300, origin (280, 190)). Every interim sky is a
  256-colour palette PNG now (`"encode": "png8"`), gradients only.
- **Interim props resized in v1.6:** `bushveld/baobab` is a 2× master (sidecar `master: 2`), frame
  600 × 640 design px with the content origin at (300, 360); `okavango/sausage_tree` is 1×, frame
  480 × 640 with the origin at (240, 370). The secret pod (110, −120), the perches (−120, −215) and
  (−130, −170) and the occluders are unchanged.
- Props and secrets are separate sprites (§6); line them up with the layer they stand on: a prop's
  position is `u` × core width (bleed not counted) and `y` in `content/biomes/<biome>.json`.
- Keep the sky band (the top ~35 %) calm: flyers travel there (bible §1 rule 5).
- Foreground: keep the bottom 18 % mostly open on mobile.
- The low quality tier draws `far_ridge` on the `far_veld` plane, stretched by the ratio of their
  core widths, so the far ridge must still read when stretched about 1.2×.

## 5. Audio (bible §10, Tech §7 and §10)

**Interim audio (v1.1, D-032).** Until your recordings arrive, every sound effect, each biome's
three music stems and its ambience bed are code-made stand-ins written into `art-source/audio/`
by `npm run audio:interim` (`tools/audio/`), each WAV with a sidecar `<name>.json` of
`{ "origin": "interim" }`; the audit lists them as INTERIM. **To replace one, delete its `.wav`
and `.json` and copy your WAV in** (no sidecar: it counts as final), then run `npm run
assets:pack`. The generator never overwrites a WAV that has no interim sidecar. The interim music
is 8 bars at 120 bpm (16 s loops, 22.05 kHz mono) and the ambience 16 s at 16 kHz mono, to keep
each biome's lazy chunk under 1.5 MB; deliveries may be longer and stereo, within the size budget.

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
`tick` (tally count-up tick) and `thud` (rank stamp thud on the tally), and (v1.1, D-032) each
gun's own sounds: `shotPomp`, `shotWindbuks` (air rifle), `shotKettie` (slingshot band),
`shotVoorlaaier` (black powder), `shotMielie` (air "pok"), `rackPomp` (pump action),
`cockWindbuks` (break-barrel cock and pellet) and `ramrod` (`shot` is the Dubbelloop's), and
(v1.6b, D-043) `zip` (Blitslaai: a quick metallic zip as the belt refills fast), and (v1.7b,
D-046) `powerEnd` (a power-up or crate gun runs out: the pickup chime turned around, softer). Which gun
plays which is in `content/client/feel.json → guns.weapons.<id>.sfx`. All 31 are required
for `npm run assets:audit -- --strict` to pass. More of the bible's SFX list (variants ×3,
hadeda call, UI clicks) needs a key in the game first: ask the developer for it.

**Music and ambience keys** per biome (`karoo-autumn`, `bushveld-winter`, `okavango-spring`,
`kalahari-summer`): `audio/music/<biome>/calm.wav`, `build.wav` and `stampede.wav`, plus
`audio/ambience/<biome>.wav`. **Calm** plays at the title and in quiet stretches, **build** when a
flock runs or flushes or the Frenzy reaches ×2, and **stampede** in the Stampede. A missing stem
falls back to the next calmer one. Music ducks −6 dB under Oupa.

**Voices** (v1.5, D-041; art bible §10.1). Oupa speaks English, Afrikaans and German; the
player picks the voice language in Settings. **One folder per voice language:**
`audio/voice/en/`, `audio/voice/af/`, `audio/voice/de/`, each with one WAV per line, the file name
being the line's i18n key, e.g. `audio/voice/af/bark.kos_is_reg.wav`. The pack tool puts each
language in its own lazy group (`voice-en`, `voice-af`, `voice-de`): the game downloads only the
chosen language's pack, after the first tap, and never in the first download. 44 lines per
language: the 39 trigger lines below plus the 5 secret barks (`bark.kos_is_reg` Karoo,
`bark.weavers` and `bark.sign` Kalahari, `bark.mokoro` and `bark.kwaak` Okavango, `bark.egg`
Namibië; `bark.weavers` is the weavers scolding, not Oupa). Read each language's line as written
in `src/i18n/<lang>.json` (en.json for English, af.json for Afrikaans, de.json for German),
keeping Oupa's Afrikaans exclamations ("Mooi skoot", "my kind", "Jinne") in Afrikaans in every
language. Short: most lines are 1–3 s. The HUD shows the line in the player's text language as
a speech bubble whether or not a recording exists.

**How to deliver final voice packs** (the product owner's choice of human or premium voices):
1. Record or render the 44 lines for one language as WAV masters (as above; mono is fine).
2. Name them `<key>.wav` and copy them into `art-source/audio/voice/<lang>/`, **deleting the
   interim `<key>.wav` and its `<key>.json` sidecar** for each line you replace. A WAV with no
   sidecar is final; `npm run audio:voice` never overwrites it. A pack may be delivered line by
   line: the rest stay interim.
3. Run `npm run assets:pack`, then `npm run assets:audit` (each line shows FINAL or INTERIM, per
   language) and `npm run size -- --strict` (each voice group ≤ 1.5 MB gzip).
4. A new voice language needs a developer: it is added to `VOICE_LANGUAGES` in `src/i18n/i18n.ts`
   (and the Settings choice), then its folder is picked up the same way.

**Interim voices** (v1.5): `npm run audio:voice` makes the interim packs offline with open-source
TTS (`tools/audio/voice.ts`, `voice_tts.py`, `voice.config.json`; engines and licences in art
bible §10.1, nothing needs an account or a key). Setup, once, in a Python 3.12 virtual
environment outside the repo:
`python3 -m venv ~/tts && ~/tts/bin/pip install kokoro-onnx espeakng-loader torch --index-url
https://download.pytorch.org/whl/cpu --extra-index-url https://pypi.org/simple && ~/tts/bin/pip
install kokoro "misaki[en]"`, then `TTS_PYTHON=~/tts/bin/python npm run audio:voice [--lang de]
[--only bark.x]`. The models (≈ 450 MB) download once into `tmp/tts-models/` from their public
URLs and are checked by SHA-256. The trigger lines:

| Voice key (`audio/voice/<lang>/<key>.wav`) | Trigger(s) | EN line | AF line |
|---|---|---|---|
| `bark.ag_nee` | missStreak | Ag nee man! | Ag nee man! |
| `bark.aim` | missStreak | Aim, my kind, aim! | Mik, my kind, mik! |
| `bark.back_again` | firstToday | Back again? Good. The tarentaal missed you. | Terug? Mooi. Die tarentale het jou gemis. |
| `bark.boss_big` | boss | There's the big one. Steady now. | Daar's die grote. Stadig nou. |
| `bark.boss_years` | boss | That one's been dodging me for years! | Daai een ontduik my al jare! |
| `bark.crate` | crate | Ooh, what's in the crate? | Ooh, wat's in die kis? |
| `bark.daar_gaan` | flush | There they go! | Daar gaan hulle! |
| `bark.empty_gun` | emptyClick | Click? That's an empty gun, my kind. | Klik? Dis 'n leë geweer, my kind. |
| `bark.farmer_yet` | badHunt | We'll make a farmer of you yet. | Ons maak nog 'n boer van jou. |
| `bark.hawk_eye` | bagStreak | Eye like a hawk, that one. | Oog soos 'n valk, daai een. |
| `bark.hele_swerm` | wholeFlock | Die hele swerm! | Die hele swerm! |
| `bark.jinne_hardloop` | stampede | Jinne, kyk hoe hardloop hulle! | Jinne, kyk hoe hardloop hulle! |
| `bark.kettle` | idle | I'll put the kettle on, then. | Dan sit ek maar die ketel aan. |
| `bark.kos_is_reg` | quotaMet | Kos is reg! | Kos is reg! |
| `bark.laai` | emptyClick | Laai, laai, laai! | Laai, laai, laai! |
| `bark.laughing` | missStreak | Those birds are laughing at you. | Daai voëls lag vir jou. |
| `bark.legend` | legend | Bushveld Legend! | Bosveld-legende! |
| `bark.lekker` | bagStreak | Lekker! Keep them coming! | Lekker! Hou so aan! |
| `bark.oupa_laai` | oupaLaai (v1.6b) | I'll load for you, my kind! | Ek laai vir jou, my kind! |
| `bark.los_kwevoel` | kwevoel | Los die kwêvoël uit! | Los die kwêvoël uit! |
| `bark.mooi_skoot` | bagStreak | Mooi skoot, my kind! | Mooi skoot, my kind! |
| `bark.morning` | firstToday | Môre, my kind! The birds are up early. | Môre, my kind! Die voëls is vroeg op. |
| `bark.neighbour` | nonTarget | Haai! That one's the neighbour's! | Haai! Daai een is die buurman s'n! |
| `bark.new_best` | newBest | A new best! Wait till I tell Ouma. | 'n Nuwe beste! Wag tot ek vir Ouma vertel. |
| `bark.next_time` | quotaMissed | Not this time. The veld is patient. | Nie hierdie keer nie. Die veld is geduldig. |
| `bark.not_that_one` | nonTarget | Not that one! | Nie daai een nie! |
| `bark.on_fire` | frenzyTop | Now you're on fire! | Nou brand jy! |
| `bark.quota_met` | quotaMet | That's the quota! Now show off. | Dis die kwota! Nou kan jy spog. |
| `bark.rain` | rain | Rain! Now the birds will run. | Reën! Nou gaan die voëls hardloop. |
| `bark.run_won` | runWon | The whole year! Bushveld Legend, my kind! | Die hele jaar! Bosveld-legende, my kind! |
| `bark.slaap` | idle | Are you asleep, my kind? | Slaap jy, my kind? |
| `bark.stadsjapie` | badHunt, quotaMissed | Stadsjapie… | Stadsjapie… |
| `bark.stampede` | stampede | Stampede! Hold on to your hat! | Stormloop! Hou jou hoed vas! |
| `bark.sun_going` | lastSeconds | Hurry now, the sun's going down! | Maak gou, die son sak! |
| `bark.ten_seconds` | lastSeconds | Ten seconds! Make them count! | Tien sekondes! Laat dit tel! |
| `bark.twee_vliee` | twoFlies | Twee vlieë met een klap! | Twee vlieë met een klap! |
| `bark.up_up` | flush | Up, up, up! | Op, op, op! |
| `bark.warming_up` | frenzyTop | You're warming up nicely! | Jy raak lekker warm! |
| `bark.whole_lot` | wholeFlock | The whole lot! Jinne! | Die hele lot! Jinne! |
| `bark.wont_shoot` | idle | They won't shoot themselves, you know. | Hulle gaan nie hulself skiet nie, weet jy. |

Keys are ASCII only (the file name must survive macOS and zip normalisation). If more lines
are wanted later: add the key to `src/i18n/*.json` and to a trigger's `lines` in
feel.json (`content:validate` checks the key exists); the audit then lists its voice key.

**Size:** the home biome's (Karoo) music and ambience are in the first download, which must stay
at or under 3 MB gzip in total (v1.x plan; `npm run size` hard budget 5 MB), and every other
biome's chunk at or under 1.5 MB (`npm run size -- --strict` fails above it). Three 60 s stems at Vorbis q2 come to about 2 MB.
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
| `fx/bolt` | 40 × 56 | common |
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
| `ui/ammo/diabolo` | 50 × 64 | common |
| `ui/ammo/kernel` | 150 × 84 | common |
| `ui/ammo/kernel_spent` | 150 × 84 | common |
| `ui/ammo/paper` | 28 × 80 | common |
| `ui/ammo/paper_spent` | 28 × 80 | common |
| `ui/ammo/shell12` | 30 × 84 | common |
| `ui/ammo/shell12_spent` | 30 × 84 | common |
| `ui/ammo/stone` | 38 × 30 | common |
| `ui/pu_blitslaai` | 128 × 128 | common |
| `ui/pu_boeretroos` | 128 × 128 | common |
| `ui/pu_bush_buckshot` | 128 × 128 | common |
| `ui/pu_chilli_biltong` | 128 × 128 | common |
| `ui/pu_meerkat_spotter` | 128 × 128 | common |
| `ui/pu_mielie_masjien` | 128 × 128 | common |
| `ui/pu_oupa_laai` | 128 × 128 | common |
| `ui/pu_voorlaaier` | 128 × 128 | common |
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
```

Visual baselines are re-recorded on GitHub, not on your machine (D-030): label the PR
`update-baselines`, or run the *Visual baselines* workflow (Actions tab) with the branch name. It
commits the screens that changed to the branch; pull before you push again, then review the image
diff of `tests/e2e/visual-baselines/` in the PR.

To look at the swap path without real art, use `npm run assets:standins`. It regenerates the
committed stand-in delivery in `tests/fixtures/standin-assets/`: one magenta tarentaal stamped
"STAND-IN", the Karoo `mid` layer, and the shot and poof sounds. View it with
`STANDIN=1 npm run dev`. The stand-ins are never part of a build. `tests/e2e/assets.spec.ts`
serves them to the game to show the swap, the fallback with nothing delivered, and the fallback
for one broken file.
