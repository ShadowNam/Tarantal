# Tarantal Madness — Art & Audio Bible

Status: v1.0 baseline · 19 Oct 2026 · amended 23 Oct 2026 (§1.1 semi-realistic pass, D-035)

## 1. Locked art direction: "Inked Bosveld Comic"

Of the three directions in the Gemini spec (A: pre-rendered 3D toon, B: inked comic / cel-shaded,
C: textured vector), **B is locked**. Every concept image produced so far is already in this style,
it reads clearly at speed, it suits slapstick, and it differentiates from Moorhuhn's 3D-render look.

**Style rules**
1. Bold warm-black ink outlines (`#1B1410`), hand-drawn wobble, no pure-black fills.
2. Flat hand-painted fills with one shadow tone + one highlight; subtle paper grain on backgrounds.
3. Comic onomatopoeia is part of the world: KEK-KEK!, POOF!, KLAP!, CLANG!, BZZZT! (hand-lettered).
4. **Line weight by depth** (at 1080-tall design space): near 6 px, mid 4 px, far 2 px. Far plane
   gets 15–25 % atmospheric tint toward the sky colour. This sells depth and keeps targets readable.
5. **Targets must pop:** birds are dark and cool (slate-navy with white dots, cobalt face) against warm
   backgrounds. Every biome keeps a calmer, low-detail **sky band** (top ~35 %) where flyers travel.
6. **Silhouette test:** render every creature as a solid shape on every background; you must be able
   to tell tarentaal vs kwêvoël vs hadeda by silhouette alone (not colour) — accessibility rule.
7. No real brands or logos anywhere (fictional windpomp vane, fictional bakkie badge), no text baked
   into backgrounds (all text is UI/i18n), no fake signatures or margin scribbles.

### 1.1 Semi-realistic characters, guns, vehicles and mountains (D-035, 23 Oct 2026)
The product owner, after playtesting: guns and birds "look too cartoony", "the car detail needs to
be better", "the mountains can't all be flat". From graphics pass 3 on, **guns, birds, vehicles and
mountains move from cartoon toward semi-realistic**; UI, FX, onomatopoeia and the slapstick tone
stay comic. Rules that replace or refine §1 for those four:
1. **Realistic proportions and materials.** The guineafowl has a small bare head on a slim neck,
   the bony casque, blue-and-red facial skin and wattles, a round slate-grey body; guns have the
   real parts of their type (splinter fore-end, grooved pump slide, slotted screws, sling swivels,
   checkered wrists); the bakkie is a believable old single-cab pickup.
2. **Painterly shading:** a lit side (upper left), a shadow side and reflected light as soft
   gradients, plus material texture: blued or worn steel with a specular line and bright edge wear,
   wood grain with figure, feather edges, rock cracks and strata. No hard flat fill + single
   highlight blob.
3. **Thinner, softer outlines:** guns 0.42 × the near weight; birds 0.55 (near), 0.65 (mid), 0.85
   (far) × the plane weight; outlines lean toward the object's own shadow colour instead of the
   warm black. Rule 4's *ratio* between planes stays.
4. **Readability is not negotiable (rule 5):** the guineafowl stays the darkest, coolest shape in
   the sky (plumage `#2C303C`, median fly-over contrast at or above v1.2's, `tools/sky-contrast.ts`),
   the far plane keeps a few large spots and a thicker outline so flocks read as guineafowl, and the
   head hitbox is unchanged (the drawn head is smaller inside it).
5. **Mountains vary** (no flat-topped row, no repeating stamp): granite inselbergs (Spitzkoppe),
   dark massifs with ravines (Brandberg), jagged strata ridges, pointed koppies with scree, boulder
   heaps, and Karoo mesas where they fit, with aerial perspective on the back rows
   (`tools/art/mountains.ts`).
6. **Same budgets:** more detail comes from better drawing at the same texture sizes; download
   growth is measured per pass (D-035).

## 2. Review of the existing concept art (project files)

| File | What it is | Keep | Fix before it becomes a reference |
|---|---|---|---|
| `2.jpeg` | Gameplay mock, Karoo v2 ("more African") | **Target screenshot / key art.** HUD layout (timer, wind sock, Frenzy, score, +50, shell belt), near pop-up face, running bird with dust, pot-helmet Generaal on fence post, potjie on fire, windpomp + reservoir | Baobabs, giraffe and zebra belong to the **Bushveld** stage, not the Karoo farm; "Climax" vane is a real brand → fictional vane; bakkie grille looks like a real make → fictional; HUD shows 8 full shells *and* "RELOAD!" (contradiction); first-person gun covers ~20 % of the screen — on mobile shrink it (see §6) |
| `1.jpeg` | Gameplay mock, Karoo v1 | Flat-topped mesas/koppies — **these are actually authentic Karoo** (dolerite-capped hills); keep them for the Karoo stage | Tall spire termite mounds read Kalahari/Bushveld; same brand/bakkie issues |
| `3.jpeg` | Four seasons | Overall season palettes; Kalahari storm drama; Karoo dust devil; Bushveld granite + **winter-flowering red aloes (correct!)** | Summer: hanging ball nests are wrong — sociable-weaver nests are huge communal haystacks in the canopy. Autumn: baobabs/giraffes/zebras → move to Bushveld. Spring: **purple jacarandas are South American invasive trees** (listed invaders in South Africa and Namibia) — replace with papyrus, reeds, ilala palms, jackalberry, sausage trees, water lilies; keep the sun-shower rainbow |
| `4.jpeg` | Asset & gameplay concept bible | Tarentaal poses (pop-up, sprint, flight, hit & fall with dizzy swirl eyes — **exactly the no-blood tone**), Chilli Biltong, Boeretroos mug, windpomp-blade targets, spare-wheel alarm | **Generaal Tarentaal** is drawn as an armoured humanoid hulk here but as a normal bird with a pot in `1/2/3.jpeg` → **canon is the pot-helmet bird** (same rig as the tarentaal, readable as a bird). Kwêvoël needs its prominent **crest** (real grey go-away-bird). "Climax" label. Buckshot labelled "3× spread" vs spec 250 % → spec value (×2.5) wins |
| `5/6/7.jpeg` | Weapon arsenal & HUD (three near-identical copies — keep one) | Windbuks, Kettie, Voorlaaier, Mielie-Masjien, Vuvuzela look; reticle set row; ammo icon row | Typo "Mielie-**Masmasjien**" → "Mielie-Masjien"; Patat-Kanon panel labelled "Steel bearings / High precision" (that's the Kettie); Voorlaaier "Reload!" hands hold a double-barrel (wrong gun); "Sawed-off" cut from launch; reticles need a consistent family (see §6) |
| `8.jpeg` | Title, shed, tally screens | Wooden sign + burst-through mascot, biome cards, **Bakkie Tally** chalk slate with rank stamp (great), shed interior | Mascot should be the regular tarentaal (Generaal is a boss); shed shows coin prices — the shed is a loadout/collection screen, not a shop (GDD §13.7); Patat-Kanon drawn like a military rocket launcher → must read as PVC pipe + duct tape; remove the fake artist signature (top right) and margin scribbles; pump shotgun labelled as "12-Gauge" default (default is the side-by-side Dubbelloop) |

**Legal note on AI concept art.** Treat all Gemini images as *internal reference only*. The US
Copyright Office's January 2025 report concluded that material generated wholly by AI is not
copyrightable; only human-authored contributions are protected. Steam requires disclosure of AI-
generated content, and app stores have AI-content rules too. For a game you want to own and sell,
final characters, backgrounds, UI and audio should be human-authored (or substantially human-
reworked), with source files (PSD/Krita/Spine) kept as evidence of authorship.

## 3. Characters

### 3.1 Die Tarentaal (hero target)
- **Shape (D-035, semi-realistic):** round body with a hunched back and drooping tail, a **small
  bare head** on a slim neck (drawn at 0.66 × the head hitbox radius), the bony **casque** with
  growth ridges, cobalt-blue bare face with **red skin at the back of the head**, red wattles, a
  short horn-coloured bill, a realistic eye (dark brown iris, small pupil; it opens wider when
  alarmed), slim scaled legs that blur when running.
- **Plumage:** dark slate grey covered in fine white spots (finer and denser at near and mid,
  feather edges at near), pale bars on the wing and flight feathers, a finely barred collar; at
  the far plane the spots simplify to a few larger dots so the flock stays legible at 0.22.
- **Personality beats:** dignified forager → frozen alert ("…") → total panic sprint → explosive
  clumsy take-off → dazed POOF with swirl eyes and stars.

| Part | Hex |
|---|---|
| Plumage base / shadow / highlight | `#2C303C` / `#1D2029` / `#4A5060` (D-035; was `#2E2F45` / `#1F2033`) |
| Dots | `#F4F1E8` |
| Face skin / highlight | `#2F7DE1` / `#6FB3FF` |
| Wattles | `#D7263D` |
| Casque | `#C49A6C` (bone highlight `#E6C9A0`) |
| Beak (horn) | `#C98F4E` |
| Iris | `#4A2A18` |
| Legs | `#6B5B4B` |
| Ink | `#1B1410` |

### 3.2 Variants and bosses (all built as **skins/attachments on the same rig**)
| Id | Change from base |
|---|---|
| `tarentaal_wit` | White plumage, pale grey dots, pink-tinged face; subtle sparkle |
| `tarentaal_lavendel` | Lavender-grey plumage, white dots |
| `kuifkop` | Black plumage with fine blue-white dots, **curly black crest** ("punk perm"), no casque, red eye-ring |
| `generaal` | Rusty blue enamel pot as helmet (dented, handle sticking out), bandolier of dry mealie cobs, scowl brows. First hit: pot spins off with CLANG |
| `ou_grys` | Faded grey plumage, eye patch, chipped casque, toothpick |
| `kuifkop_koning` | Kuifkop with a bottle-cap crown wedged in its crest |
| `stormvoel` | Giant silhouette only; eyes glow in lightning |

### 3.3 Non-targets (must differ by silhouette)
- **Kwêvoël (grey go-away-bird):** slim, long tail, upright **pointed crest**, all grey, long legs;
  perches high; speech bubble "KWÊ-KWÊ!" ("go-away"). First sighting per session shows a ⛔ badge.
- **Hadeda:** long down-curved bill, chunky brown-grey body, broad wings; flies over shouting
  "HAA-HAA-HADEDA!".
- **Fish eagle (Okavango):** white head and chest, chestnut belly — majestic, protected.
- **Crop sprayer:** yellow fictional biplane trailing a mist.
- **Meerkat spotter (helper):** pops up with binoculars; friendly.

### 3.4 Animation list (per rig) — frame counts for frame-by-frame, or clips for Spine
| Clip | Frames @ fps | Notes |
|---|---|---|
| `forage_walk` | 8 @ 12 | head bob, tail sway |
| `peck` | 6 @ 12 | |
| `alert` | 4 @ 10 (hold) | neck up, eyes wide, "…" |
| `run` | 8 @ 18 | legs blur frames, dust puffs spawned by FX |
| `takeoff` | 6 @ 20 | steep launch, wings slam down |
| `flap` | 6 @ 16 | clumsy, feathers shed occasionally |
| `glide` | 2 @ 6 | |
| `land` | 4 @ 14 | stumble |
| `hit_poof` | 6 @ 24 | feather explosion, swirl eyes |
| `tumble` | 4 @ 16 (loop) | falling out of frame |
| `peek` (near pop-up) | 6 @ 12 + blink | stare into camera, duck |
| boss extras | as needed | pot knock-off, peek-from-boulder, crest flourish |

**Sizes:** author character masters at 512 px tall. Export @2x atlas at 256 px (mid/far) + 512 px
(near pop-ups), @1x at half. Hitboxes defined per clip in `content/birds.json`.

**Recommended tool:** Spine (skeletal + mesh deform for squash-and-stretch; variants as skins;
official `spine-phaser-v4` runtime). Spine is paid software with its own licence terms for runtime
use — check them. Fallback: frame-by-frame in Krita/Aseprite → TexturePacker/free-tex-packer atlases.

## 4. Biomes

### 4.1 Parallax layer spec (all biomes)
| Layer | Scroll factor | Content | Notes |
|---|---|---|---|
| L0 Sky | 0.05 | Gradient + clouds | Calm band for flyers |
| L1 Far ridge | 0.15 | Koppies / dunes / tree line | Atmospheric tint |
| L2 Far veld | 0.35 | Far plane ground + far props | Far birds live here |
| L3 Mid | 0.6 | Main stage ground, secrets | Mid birds, flocks |
| L4 Near | 1.0 | Near ground, pop-up grass | Near pop-ups |
| L5 Foreground | 1.15–1.25 | Framing grass, aloes, rocks, fence | Occluders; keep bottom 18 % mostly open on mobile |

Layer core width = `1920 + 3200 × scrollFactor` (mid 0.6 → **3 840**, near 5 120, far veld 3 040,
far ridge 2 400, sky 2 080, foreground 5 760), **plus 300 px of bleed art on each side** for 21:9
screens (Tech §3.3). Cut into tiles ≤ 2 048 px. Secrets and occluders must line up with their layer.
Low quality tier merges far ridge into far veld (5 layers).

### 4.2 Biome sheets
**Herfs · Karoo farm (MVP)** — golden veld, flat-topped dolerite koppies, windpomp + corrugated
reservoir, rusty bakkie (fictional), wire fence + wooden posts, aloes, potjie on a small fire, fence-post
bell, distant springbok. Palette: sky `#8DB8D8 → #F2D8A7`, veld `#E3A23B`, soil `#B8562C`, far
koppies `#8E7FA6`, aloe flowers `#E2552C`. Weather: wind sock, dust devils, flying leaves.

**Winter · Bushveld** — frost mist at dawn, baobabs, mopane, granite koppies, red flowering aloes,
dry pale grass, giraffe silhouettes, dassie on a rock. Palette: sky `#B9D7EA`, grass `#C9B98F`,
granite `#D07A3E`, aloe `#E04A2B`, baobab bark `#8D7F74`. Weather: low sun glare (lens flare one side),
breath-fog puffs from birds.

**Lente · Okavango** — papyrus and reeds, ilala palms, jackalberry + sausage trees, water lilies,
muddy channels, mokoro marker pole, hippo, lechwe, fish eagle. Palette: water `#6FA8B6`, reeds
`#6FAE4A`, papyrus `#9BC75A`, sky `#9CCBEB`, lilies `#F2E9E4`/`#E9A1C0`. Weather: sun-showers,
rainbow, insect swarms.

**Somer · Kalahari** — red dunes, camelthorn trees with **sociable-weaver mega-nests**, gemsbok on
the ridge, windpomp + sign, dead camelthorn branch. Palette: dunes `#C8452B`/`#E0703A`, camelthorn
`#7B8F3A`, storm sky `#3B4256`, lightning `#E8F1FF`. Weather: heat shimmer → thunderstorm, rain
streaks, puddles. Lightning flashes must obey the ≤ 3 flashes/second rule and the reduce-flashes option.

**Future · Namibië (Etosha & Namib)** — white salt pan with mirage, quiver trees, springbok, waterhole
at dusk, tarentaal roosting in a tree.

## 5. Props, secrets, crates
Each secret prop needs: idle, "hint glint" (4-frame shimmer), triggered state, and an occluder shape.
Crates: wooden ammo crate on a patched canvas parachute (Oupa's initials stencilled).
Power-up icons (from `4.jpeg`, refined): chilli biltong strip with flame, blue enamel mug with steam,
bundle of red shells, meerkat with binoculars.

## 6. HUD and UI

**Materials:** weathered wood signs (`#8B5A2B`), cream enamel with blue rim (`#F3EAD3` / `#2D5DA8`),
chalk slate (`#2E3B33`), rubber-stamp gold (`#D8A73A`), shotgun-shell red (`#C8302A`).

**In-hunt HUD (from `2.jpeg`, adjusted):**
- Top-left: timer, omen icon (wind sock shows direction + strength), Frenzy meter.
- Top-right: score + pop stack.
- Bottom-right: shell belt (tap target on mobile ≥ 64 px tall); RELOAD prompt only when empty.
- Bottom-left (mobile): gadget + consumable buttons; mirrored for left-handers.
- First-person gun: bottom-centre-right; **on mobile, scale to 60 % and fade to 40 % opacity while a
  finger is down** so it never hides targets.
- Reticle family: one consistent ring language — ring size = spread, centre dot = precision, tick
  marks = wind drift, colour change on hover-over-target (desktop only). v1.1 (D-032): each gun
  has its own crosshair in that language and its own realistic (not cartoony) ammo on the belt:
  GDD §17.1.
- The game title is **not** shown during play (the mock-ups put it top-centre — that's marketing art).

**Screens:** Title (burst-through sign + START HUNT), Skiet-Skuur (shed: loadout, Bird Book,
Notaboek, cosmetics), Padstal (farm-stall shop with hand-painted price boards), Bakkie Tally
(chalk slate on the tailgate, rank stamp), Settings, Pause, Daily card, Share preview.

**Fonts (open licences, self-hosted, subset):** display — *Bangers* (onomatopoeia); body —
*Baloo 2* 600/800 (all UI text). Shipped in M10 (`public/fonts/`, D-027). Verify glyphs for Afrikaans (ê ë ô ï û ʼn) and German (ä ö ü ß).

## 7. FX
Feather bursts (palette-tinted per variant), dust puffs, muzzle flash + smoke, shell ejection,
pellet impact puffs on ground/props, Voorlaaier smoke cloud, corn-kernel spray, BZZZT shockwave rings,
rain/dust/leaf weather particles, heat-haze filter (high tier), lightning screen tint, score pops,
onomatopoeia bubbles (6–8 variants each, random rotation ±8°).

## 8. Prompt pack for further concepting (reference only — not shippable art)
Use these to explore; then give the winners to a human illustrator. Always append:
`no text, no letters, no logos, no signature, no watermark, no brand names`.

1. **Tarentaal model sheet** — `Character model sheet, comic ink style with bold warm-black outlines
   and flat hand-painted colours, a plump helmeted guineafowl cartoon character: slate blue-black body
   covered in small white dots, bright cobalt-blue bare face, red wattles, exaggerated bony casque,
   huge panicked white eyes, short legs. Turnaround: side, three-quarter front, front, three-quarter
   back, back; plus four expressions: calm, alert, panic, dazed with swirl eyes. Neutral warm paper
   background, consistent proportions across all views.`
2. **Generaal Tarentaal** — `…same character design wearing a dented rusty blue enamel cooking pot as
   a helmet with the handle sticking out, bandolier of dry maize cobs, grumpy brows; still clearly a
   round guineafowl (not humanoid); side and three-quarter views.`
3. **Kuifkoptarentaal** — `crested guineafowl cartoon: black body with fine blue-white dots, a big
   curly black crest like a punk perm, red eye ring, no casque; same comic ink style.`
4. **Kwêvoël** — `grey go-away-bird cartoon: slim all-grey bird with long tail and tall pointed crest,
   perched on a high branch, beak open shouting; comic ink style; clearly different silhouette from
   a round guineafowl.`
5. **Karoo panorama (layer-friendly)** — `Ultra-wide 21:9 2D side-scrolling game background, comic ink
   style, South African Karoo farm in autumn: golden grass veld, flat-topped dolerite koppies in hazy
   purple distance, a generic steel wind pump with corrugated round reservoir, wooden fence posts with
   wire, aloes, a rusty generic pickup truck, a small three-legged pot on a fire; calm open sky band
   across the top third; empty of animals; clear separation between far, middle and near ground.`
6. **Bushveld winter panorama** — `… Limpopo bushveld in winter morning: frost mist, baobab trees,
   mopane shrubs, orange granite koppies, red flowering aloes, pale dry grass, distant giraffe
   silhouettes, low golden sun on one side …`
7. **Okavango spring panorama** — `… Okavango Delta floodplain: papyrus and reed beds, ilala palms,
   jackalberry and sausage trees, water lily channels, a hippo's eyes and ears in the water, distant
   lechwe, light sun-shower with a rainbow …` (no jacarandas)
8. **Kalahari summer panorama** — `… red Kalahari dunes, camelthorn trees holding huge haystack-like
   sociable weaver colony nests, gemsbok on the ridge, building thunderstorm with dark clouds …`
9. **UI kit** — `game UI kit sheet in comic ink style: weathered wooden sign buttons, cream enamel
   panels with blue rims, chalkboard slate panel, rubber-stamp rank badge, shotgun-shell ammo belt,
   charm cards styled like old farm-stall price labels; isolated on dark background.`

## 9. Production pipeline
1. **Lock** (this doc) → 2. Human illustrator: tarentaal model sheet + Karoo paintover (MVP).
3. Animator: rig in Spine, clips per §3.4 (exported to frames per skin for v1, D-027).
4. Export into `art-source/` per `docs/06-ASSET-DELIVERY.md`, then `npm run assets:pack` →
   `public/assets/` + `asset-index.json`.
5. The `AssetManifest` picks up every delivered key at boot (placeholders swap without code
   changes); `npm run assets:audit -- --strict` lists what is still a placeholder or interim.
   Interim keys (D-029) are code-drawn stand-ins from `npm run art:interim` (`tools/art/`): they
   follow this bible's palette and shapes so the game looks right meanwhile, and a human delivery
   for the same key replaces them.
6. Repeat per biome. Keep all sources in `art-source/`.

## 10. Audio bible

**Direction:** "boeremusiek-kwela surf" — pennywhistle (kwela) lead, konsertina, banjo/guitar
*vastrap* groove, upright bass, brushed snare. Three stems per biome (calm / build / stampede),
120 → 150 bpm in the Stampede. Original compositions only; no quoting existing tunes.

**Guineafowl voices:** alarm "kek-kek-kek-kaaa", soft contact "kek", flock chatter, take-off wing
clatter. Best source: record real flocks (common on farms — you own the recordings). Field-recording
libraries (e.g. xeno-canto) use Creative Commons licences, many **NonCommercial** — check each file.

**Oupa (voice actor, EN/AF mix, ~40 barks at launch, all subtitled):**
"Mooi skoot, my kind!" · "Ag nee man!" · "Jinne, kyk hoe hardloop hulle!" · "Die hele swerm!" ·
"Twee vlieë met een klap!" · "Laai, laai, laai!" (reload) · "Los die kwêvoël uit!" (leave the go-away-
bird alone) · "Kos is reg!" · "Stadsjapie…" (gentle teasing after a bad hunt) · "Bosveld Legend!".
Max one bark per 6 s; never over a tally count-up.
*v1.0.1 (D-028):* 39 launch lines are in the game, each with its trigger (`content/client/feel.json
→ barks`), text in en/af/de/nl, a speech bubble as its subtitle, and a `voice/bark.<id>` key waiting
for the recording (`docs/06-ASSET-DELIVERY.md` lists them).

**SFX list (MVP):** dubbelloop shot ×3 variants, empty click, break-open + shell insert + snap shut,
belt refill, pellet thuds (ground, wood, metal CLANG for the pot), feather POOF ×4, bird alarm ×6,
take-off wing burst ×3, run patter loop, vuvuzela BZZZT, windpomp creak + blade pings + water gush,
bakkie alarm, potjie lid clang + bubbling, crop-sprayer drone, kwêvoël call, hadeda call, record
scratch (penalty), Frenzy tier stings ×3, Stampede rumble, tally ticks, rank stamp thud, UI clicks.

**Mix:** music −16 LUFS integrated; SFX peaks ≤ −1 dBTP; music ducks −6 dB under barks; spatial pan
by screen x (±0.7 max); separate volume sliders (music / effects / voice).
