# Tarantal Madness — Art & Audio Bible

Status: v1.0 baseline · 19 Oct 2026 · amended 23 Oct 2026 (§1.1 semi-realistic pass, D-035) · 25 Oct 2026 (§4.2 veld art pass, D-042) · 26 Oct 2026 (§4.2 fruit as sprites, D-047)

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
3. **No dark contours on guns; slate edges on birds** (round 2): every gun part is edged with a
   1–2 px darker shade of its own material; birds are edged in a darker slate of their own shadow
   colour at 0.45 (near), 0.5 (mid), 0.85 (far) × the plane weight; folded wings have no outline.
   One key light (top left) with soft contact shadows where parts meet. Rule 4's *ratio* between
   planes stays.
4. **Readability is not negotiable (rule 5):** the guineafowl stays the darkest, coolest shape in
   the sky (plumage `#2C303C`, median fly-over contrast at or above v1.2's, `tools/sky-contrast.ts`),
   the far plane keeps a few large spots and a thicker outline so flocks read as guineafowl, and the
   head hitbox is unchanged (the drawn head is smaller inside it).
5. **Mountains vary** (no flat-topped row, no repeating stamp): granite inselbergs (Spitzkoppe),
   dark massifs with ravines (Brandberg), cuesta ridges of tilted strata, rounded boulder-strewn
   dolerite koppies with broken skylines, boulder heaps, and Karoo mesas where they fit, with
   aerial perspective on the back rows. At most **one** pointed spire per biome, as a landmark
   (`tools/art/mountains.ts`). Dunes have a sinuous crest, a sharp slip face, a graded windward
   slope and fine ripples.
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
- **Shape (D-035, semi-realistic):** an egg-shaped body with a **hump** peaking behind the
  middle, the rear sloping into a drooping tail; a **small bare head** (about 1/6 of the body
  length, 0.48 × the head hitbox radius, always inside the hit circle) carried forward and low on a
  slim neck; the bony **casque** with growth ridges, cobalt-blue bare face with **red skin at the
  back of the head**, red wattles, a short horn-coloured bill, a small round dark eye in a pale
  ring (no lids; the dazed POOF keeps its swirl), slim grey-black scaled legs.
- **Plumage:** dark slate grey covered in fine white spots, each in a faint dark ring, smaller and
  denser toward the neck and in loose rows on the folded wing (feather edges at near), pale bars on
  the secondaries and flight feathers, a finely barred collar; at the far plane the spots simplify
  to a few larger dots so the flock stays legible at 0.22.
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
| Legs | `#3C3D42` (D-035; was `#6B5B4B`) |
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
- **Meerkat spotter (helper):** pops up with binoculars; friendly. On the desert maps (v1.7) it
  climbs out of a burrow mound instead of rising from nowhere.

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

### 3.5 Meerkat colonies (v1.7, D-044)
A living family of meerkats in the desert veld (Kalahari, Namibië), separate from the cartoon
Spotter. Semi-realistic (D-035) at the v1.4 camelthorn bar: drawn at 2×, layered shading, no flat
shapes; light from the upper left.
- **Look:**
  - tan to grey-brown fur, lit to the upper left and shaded grey-brown on the far side;
  - faint darker bands across the back;
  - a pale cream belly, throat and face;
  - dark eye patches (with a small glint), small dark ears and a dark nose;
  - a thin tail with a black tip;
  - a slim, upright body. Standing, the front paws are held in front of the belly (the
    sentinel's pose).
- **Frames:** one sheet, 112 × 144 design px cells, feet at (56, 136), facing right; the layout
  is in `src/game/assets/desertAssets.ts`.
  - Peek: two frames, head and shoulders above the hole's rim, looking left and right.
  - Standing: head turned left, at the camera, right; the bark (mouth open); the front-facing
    photo pose.
  - Sit (on its haunches, leaning forward), sunbathe (sitting back, belly up), dig (2 frames).
  - Run: 4 frames, tail up.
  - Dive (2 frames: hindquarters and tail, then the tail tip), emerge, the scold head (front,
    mouth open, at the rim), and a curled tumble.
  - Pup: sit and a 2-frame run, smaller with the same markings. A sand flick.
- **Burrows:** three low sand mounds (two cells wide each), the main hole's centre at (112, 92).
  - Each mound has 2–3 dark oval holes, each with an inner shadow under the back rim and a lit
    front lip.
  - Fresh, lighter sand fans out downhill from each hole.
  - Loose grains, pebbles, scratch marks and tiny tracks lie round them. The game scales a mound's height to the content's `mound`.
- **Interim art:** `tools/art/meerkats.ts` (`npm run art:interim -- --only meerkats`). One rig
  builds every pose (look round, 25 Oct):
  - a torso grown along a spine with back and belly widths;
  - the cream belly and throat clearly lighter than the banded, fur-stroked back;
  - lit from the upper left with a shaded side;
  - haunches, and tapered legs and tail;
  - the eye mask with a small bright eye inside, a crescent ear and a dark nose;
  - the sentinel chin up with its paws together at the belly;
  - the pup smaller and fluffier, with a bigger head;
  - the run low and stretched, tail up.

  Look round 2 (the product owner, 25 Oct: furrier, nicer faces):
  - fur everywhere: a broken edge of short tufts leaning with the fur, curved strokes in three
    tones that follow the form, fluffy cheeks;
  - a teardrop mask sloping to the nose, with a small almond eye and a white catch-light;
  - a pale brow, a short tapering muzzle with a small nose and a mouth line, low crescent ears;
  - the haunch blended into the body; arms with volume and small dark claws; knees bent in the
    run.

  The left-looking peek and stand are the right-looking frames, flipped. It is a 32-colour
  palette PNG, 92 KB; a Kalahari hunt's download (its chunk plus the desert chunk) stays under
  1.5 MB.

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
- *Plants (v1.6, D-042):* **sweet thorn** (*Vachellia karroo*, soetdoring) on the mid plane and in
  stands along the far veld: a forked dark red-brown trunk with furrowed bark, an irregular rounded
  crown of separate feathery clumps (dark undersides, lit tops, sky between), white paired thorns
  on the outer limbs, yellow pompom flowers and curved brown sickle pods. **Karoo bushes** as
  layered mounds: renosterbos (fine, grey-green, rounded) and ganna (olive, upright and twiggy),
  with ragged leafy edges, a woody base and a contact shadow. **Golden grass tufts** with cream
  seed heads. Aloes with orange-red candelabra spikes (props).
- *HD aloes (1.8.1, D-051; `tools/art/aloe.ts`):* the bitter aloe (Aloe ferox) at the camelthorn's
  detail, drawn at 2×: a rosette of thick, fleshy grey-green to blue-green leaves curving up and
  out (lighter lit tops, darker undersides, darker toward the heart, lit from the upper left), small
  reddish-brown teeth on the edges and a few on the faces; a skirt of dry papery old leaves down the
  short stem; a candelabra of 3–6 racemes packed with tubular flowers (dark red buds on top, orange,
  then open yellow-orange lower down) on grey-green stalks. Thin tinted outlines, never the heavy
  black line; three plants of different sizes per clump, two clumps. The first download keeps the
  old clumps as placeholders; the HD ones (late group) swap in when they land
  (`ParallaxView.upgradeHd`, `AssetManifest.upgrade`). The Bushveld clumps use the same drawing at
  1× in place.
- *The potjie (1.8.1, D-051; `tools/art/potjie.ts`):* a round cast-iron three-legged pot with a soft
  sheen up left, reflected light on the right and a lit rim, on a small fire of glowing coals,
  flame tongues and three split logs in a ring of stones; the lid (domed, cast knob) is its own
  texture. Animation (view only, on sim ticks, `src/game/view/potjieMotion.ts`): steam wisps rise
  from the lid's edge, drift with the wind and fade; the coals' glow flickers gently; every ~4 s
  the lid rattles (four little lifts with a tilt; a clack on each of the three drops inside it) and
  white puffs squeeze out at both lid edges. Wisps are white-grey, opaque near the pot, stretched
  upright and fading as they rise; the coals' warmth is a normal-blend red-orange (an additive glow
  turned the flames lime). Lid, steam and warmth take the map's light like the pot. Shot (the `lid`
  secret): the lid pops up, tumbles off and lands on the ground to the right of the pot with a clang
  and a big puff; the open pot then steams freely all hunt. Reduce motion: rattles every ~7 s and
  smaller, fewer wisps, a slower flicker. Sounds (AudioDirector synths until recordings exist):
  soft bubbles while the pot is on screen (they stop with the hunt), the rattle's clack, the clang.
  Before the HD art lands the old pot shows unchanged.
- *Far animals:* springbok herds (cinnamon back, dark flank band, white belly, lyre horns) and a
  few ostriches near the farm.

**Winter · Bushveld** — frost mist at dawn, baobabs, mopane, granite koppies, red flowering aloes,
dry pale grass, giraffe silhouettes, dassie on a rock. Palette: sky `#B9D7EA`, grass `#C9B98F`,
granite `#A8977F` (grey-ochre since v1.6, D-042), aloe `#E04A2B`, baobab bark `#8D7F74`. Weather: low sun glare (lens flare one side),
breath-fog puffs from birds.
- *Rocks and middle distance, realistic (1.9.8, D-061; product owner 25 Oct: "the rocks and the
  middle distances also look a little bit childish, cartoonish"):* **no ink anywhere on the rocks
  or the ground.** Boulders and koppies (`tools/art/granite.ts`) are weathered granite, rounded
  but faceted: a soft light-to-shade gradient (lit upper left), darker tones (not a line) toward
  the rim, a dark undercut and a soft contact shadow, one or two onion-skin exfoliation shells
  (a lit lip, a shadow under it, fresher pinkish rock where a shell flaked off), black rain
  streaks down from the crown, warm iron stains, lichen rosettes (orange, grey-green, pale),
  cracks with a lit edge, a low-contrast granite grain, grass breaking over the foot. **Far
  hills** (`tools/art/bushHills.ts`) are Waterberg/Limpopo koppies and ridges in three haze rows
  (each row mixed toward a cool haze `#AEBBC8` and the horizon, never faded by alpha): broken
  skylines made of tree crowns, grey granite faces and boulder knobs on the crests, gullies in
  shade, trees as dots thickening toward the foot. **The middle-distance ground**
  (`tools/art/bushveldGround.ts`): dry winter veld with bare red-earth and pale-grass patches, a
  game path winding toward the viewer, termite mounds of red earth, dwala (low sheets of bare
  granite with joints, stains and lichen, grass over their edges) instead of the grey slabs; the
  ink line between the planes is gone: a lit crest under the edge and grass breaking over it.
  Patches and crests have crisp edges (a blurred edge costs palette entries and bytes in a
  128-colour layer). The baobab, the herds and the tree residents are unchanged.
- *Plants (v1.6, D-042):* the **baobab** (kremetart): a massive smooth grey bottle trunk (lit left,
  shade right, long vertical folds, soft wrinkles), thick limbs splaying up like roots into crooked
  bare winter branches, velvety grey-green pods on long stalks (the secret pod is one of them).
  **Mopane:** a narrow upright crown of butterfly-shaped paired leaves, olive with clumps turned
  copper, dark rough bark; mopane scrub as low mounds. **Marula:** grey flaky bark in plates, a
  spreading half-bare winter crown, yellow fruit lying in its shade. Red aloes (props; the HD
  Aloe ferox drawing at 1× since 1.8.1, D-051), pale dry
  grass with seed heads.
- *Far animals:* giraffes (patches, ossicones, a sloping back, browsing or head up), zebra,
  blue wildebeest and elephants.

**Lente · Okavango** — papyrus and reeds, ilala palms, jackalberry + sausage trees, water lilies,
muddy channels, mokoro marker pole, hippo, lechwe, fish eagle. Palette: water `#6FA8B6`, reeds
`#6FAE4A`, papyrus `#9BC75A`, sky `#9CCBEB`, lilies `#F2E9E4`/`#E9A1C0`. Weather: sun-showers,
rainbow, insect swarms.
- *Plants (v1.6, D-042):* **jackalberry:** a tall, dense, dark evergreen crown on a rough dark
  trunk, small yellow-orange fruit up close. **Sausage tree** (*Kigelia*): a broad round crown,
  smooth grey-brown bark, long grey-brown sausage fruit on rope-like stalks, a few maroon flowers.
  **Ilala palm:** one or two slender ringed stems, round heads of stiff ribbed fan leaves (old ones
  hanging brown), clusters of glossy brown fruit. **Papyrus** umbels of many fine drooping rays with
  brown spikelets, **reeds** with feathery plumes, veined **lily pads** with pointed-petal water
  lilies, green seed-head grass.
- *Far animals:* elephants, red lechwe (black forelegs), zebra and wildebeest on the floodplain.

**Somer · Kalahari** — red dunes, camelthorn trees with **sociable-weaver mega-nests**, gemsbok on
the ridge, windpomp + sign, dead camelthorn branch. Palette: dunes `#C8452B`/`#E0703A`, camelthorn
`#7B8F3A`, storm sky `#3B4256`, lightning `#E8F1FF`. Weather: heat shimmer → thunderstorm, rain
streaks, puddles. Lightning flashes must obey the ≤ 3 flashes/second rule and the reduce-flashes option.
- *Plants (v1.6, D-042):* the v1.4 camelthorns and family nest stay. New: **grey velvety
  camelthorn pods** lying in the trees' shade; **shepherd's trees** (*Boscia albitrunca*, witgat):
  a pale smooth trunk under a dense grey-green dome; **Bushman grass** (*Stipagrostis*) with
  silvery feathery plumes; **driedoring** as grey, open, spiny mounds.
- *Far animals:* gemsbok on the dune crest (stripe, face mask, long straight horns), springbok,
  ostriches and blue wildebeest.

**Namibië (Etosha & Namib), v1.4 B (D-039).**
- **Setting:** Etosha's white salt pan (faint polygon cracks, a bright mirage band at the horizon,
  the shimmer drawn live) under Sossusvlei-style Namib dunes. The dunes stand in three overlapping
  ranges. Each has a sinuous knife-edge crest that splits it into a sunlit apricot face and a rust
  slip face, concave flanks flattening into the pan, soft ripples, and haze on the farthest range.
- **The waterhole** on the Ver strip: a mud ring, pale-blue water with a sky glint, and springbok
  and gemsbok drinking.
- **Plants and ground:** quiver trees (a thick golden papery trunk, forked branches, blue-grey
  rosettes), a pale calcrete pan edge, and the red dune edge in front with blonde grass.
- **Plants (v1.6, D-042):** quiver trees in **winter flower** (short branched spikes of
  canary-yellow racemes over the rosettes), on the props and now also on the mid and far planes in
  other shapes (never in the waterhole sightline); **!nara** (*Acanthosicyos horridus*) hummocks on
  the red dune edge: tangled leafless grey-green stems with pale paired spines, sand banked against
  them, round warty melons from green to yellow; grey pan shrubs.
- **Far animals:** at the waterhole springbok and gemsbok drink, with zebra, a giraffe and a pair
  of ostriches; gemsbok, ostriches and zebra out on the pan.

**Fruit as separate sprites (v1.7c, D-047).** Fruit, pods and flowers that react to shots are
not part of the tree, layer or prop art on the mid, near and foreground planes: each is its own
sprite in the biome's fruit sheet (`fruit/<biome>`, 512 × 512, its frames and pivots listed in
`src/game/view/fruit/spots/fruit-<biome>.json`). A hanging fruit with a long stalk is two frames:
the stalk (pivot at its top, it stays on the tree) and the fruit (pivot where it hangs from the
stalk's end); flower spikes pivot at their foot, fruit on the ground at their base. Each spot also
gives the ground line a dropped fruit lands on and the foot of its trunk (it comes to rest clear
of it). Prop fruit are drawn at 2×, layer fruit at 1×. The look is the camelthorn bar
(`tools/art/fruitLook.ts`): sausages long, heavy, slightly curved, fatter toward a darker blunt
tip, grey-brown mottled rough skin with pale lenticel dots, on a thin rope stalk thickening into
the fruit; baobab pods velvety grey-green to olive-tan ovoids with a soft sheen, a fuzzy rim and a
woody stalk end; round fruit with a shade side, a highlight and a nub (marula speckled, !nara
warty with pale bands, ilala glossy brown on a branched rachis); pods two-toned with seed bulges
and a lit edge; quiver racemes of tubular flowers. They are: Karoo sweet-thorn pods;
Bushveld baobab pods (not the secret pod) and marula fruit on the ground; Okavango sausages and
ilala fruit clusters; Kalahari and Namibië camelthorn pods (hanging and on the sand); Namibië
quiver-tree flower spikes and !nara melons. Far-plane trees keep theirs drawn in. A delivery
replaces the sheet and the spots file together (same sheet size); the interim art is drawn by
`tools/art/fruitSink.ts` from the same species code, so it matches the trees exactly.

**How the veld is drawn (v1.6, D-042).** Every tree, shrub and grass tuft is built the
camelthorn's way (`tools/art/flora.ts`, species in `tools/art/species.ts`): an irregular
silhouette, never a geometric shape; foliage as separate clumps of leaf dabs with gaps where sky or
ground shows; lit tops and shaded undersides (light from the upper left); textured bark (furrowed,
smooth with folds, or flaky plates); a soft ground contact shadow; each tree grown from the layer's
seeded random stream, so no two repeat. Distant planes get simpler versions: far trees are a few
ragged clumps with a lit cap and plain limbs, no dabs. Distant animals (v1.6; redrawn in D-054: `tools/art/farFauna.ts`, see far animals below) share
one rig with species proportions and markings, three poses (grazing, walking, head up), a lit back,
a shaded belly and far legs, a soft ground shadow and no ink (edged in a darker shade of their own
colour, D-035 rule 3). Species follow the decision log's "Biome-accurate flora/fauna".

**Proportions per plane (D-049).** A guineafowl stands 263 px near, 110 mid, 39 far and 18 on the
Ver plane (0.5 m: 221 px per metre mid, 79 far, 37 Ver). Everything drawn on a plane is sized
against that bird: never a bird taller than an ostrich or a springbok beside it. The far herds
show at 3× their v1.6 drawing until the HD redraw, which draws each species to its target height
in `docs/balance/perspective.md` (e.g. far: springbok 63 px at the shoulder, ostrich 197 px to the
head, giraffe 395 px). Mid props keep their stage-set scale (a true 9 m windpomp would be 2 000 px).
Bird atlases are drawn per plane at the plane's scale (`npm run art:interim -- --only birds`).

**v1.6 review round (D-042, 25 Oct).**
- **Windpomp:** a classic multi-blade farm wheel, after the product owner's reference photos (25 Oct):
  20 galvanised sails, one every 18°, narrow at the hub and wide at the slanted tips, which stand
  free (no outer rim); two thin rings run across the sails (at 40 % and 70 % of the radius) and
  six rods tie the hub to them. Old and weathered: every sail a slightly different grey, rust on
  the tips, at the rivets and in streaks, rusty rings. Six sails lost in no pattern, one bent and
  one torn short; never one of the secret's four marked sails at 0°, 90°, 180° and 270°) on a braced angle-iron tower (ladder, pump rod, platform,
  footings, bolts, rust), drawn at 2×. The head (gearbox, tail boom, riveted vane) turns into
  the omen wind and the wheel spins on sim time (fast in wind, a slow idle when calm); when the
  secret is live, the sim's rotor is the wheel, face-on. A service plank carries the kwêvoël.
- **Rocks:** weathered grey/ochre granite (`tools/art/rocks.ts`): domed, faceted, iron stains,
  peeling sheets, lichen, cracks, dark crevices, grass or a small aloe in the cracks; never
  orange balloons. **The dassie** (rock hyrax) at 2× inside its unchanged hit part: round back,
  no tail, grey-brown fur strokes, cream chin and belly, short rounded ears, dark eye with a
  pale ring, blunt snout, the dorsal spot.
- **Giraffes:** their own drawing (high withers, sloping back, deep chest, neck as long as the
  front legs, knobbly knees, dark hooves, tufted tail, two tufted ossicones, side ears, a cream
  net between angular chestnut patches); browsing, walking, head up, drinking; calves.
- **Far animals** (D-054, 1.9.1; `tools/art/farFauna.ts`, herds in
  `src/game/view/faunaHerds.ts`) are drawn from their anatomy at their **real size beside the
  guineafowl on their plane** (D-049 targets, docs/balance/perspective.md) **× 0.57 for every
  species, the ostrich × 0.45** (the product owner: smaller with distance; one multiplier keeps
  shared herds in proportion): far elephant 144 px at the shoulder, giraffe 225 to the head,
  zebra 61, wildebeest 63, gemsbok 54, springbok 36, lechwe 45, ostrich 89 to the head; the Ver
  waterhole the same way. `feel.json fauna.sizeMul`. Young ones 55–70 % of an
  adult (elephant calves 50 %) with bigger heads and longer legs; cows and hens a little smaller.
  - *Anatomy:* jointed legs (elbow, knee, fetlock, pastern and a tapering hoof in front; stifle,
    hock, fetlock behind), never sticks; a barrel with withers, back, croup and a tucked flank;
    a neck with crest and throat; a head with forehead, nasal bridge, muzzle and jaw. Species
    silhouettes: the giraffe's sloping back, long neck and tufted ossicones; the African
    elephant's back highest at the shoulders with a saddle behind, a sagging belly, a domed
    forehead dented above the eye, a tapering trunk (rings on its lower half), tusks from the
    lip with the trunk between them, the big ragged Africa-shaped ear behind the eye (its top
    above the back, its lobe below the jaw), pillar legs with subtle nails; the wildebeest's high
    shoulders, beard and horns curving out and up; the gemsbok's two straight horns in line with
    the face, ringed at the base; the lechwe's two ridged lyre horns (rams); the ostrich's heavy
    plumed body on bare thighs that meet under its middle.
  - *Coats:* plains zebra stripes that follow the body (bands down the barrel tapering to the
    belly, arcs over the haunch, rings on the legs, faint brown shadow stripes, a striped
    crested mane and tail tuft, brown on foals); giraffe patches as an irregular liver-brown
    Voronoi net with pale lines, darker on bulls, smaller on neck and legs; elephant grey with a
    few faint wrinkles (shoulder, elbow, knees, flank) and dust on the back and lower body (red
    in the Bushveld, grey mud in the delta); wildebeest slate grey with darker brindle bands, black
    mane, beard and face (calves tawny); gemsbok grey-fawn, a thin black stripe on the lower flank,
    a black blaze down the neck, black upper legs over white lower legs with a dark knee band, the
    black-and-white mask; springbok cinnamon back, dark flank band, white belly, rump and face;
    red lechwe chestnut with a clear white belly and throat and dark fronts on the forelegs,
    wading (legs cut at the surface, ripple rings, a dim broken reflection); ostrich cocks black
    with white wing tips and tail plumes, hens and young grey-brown.
  - *Light:* from above: a lit back (a vertical wash), rounded light on haunch and shoulder, a
    shaded belly and far legs (a shade darker, behind the body), a soft contact shadow; a thin,
    clearly darker contour in a shade of the coat (never black ink) on every part; 0.45 of the
    layer's haze, cut back per colour so a coat keeps 1.8:1 contrast against the area's horizon
    glow, low sky and clouds (never alpha): a far animal never melts into the sky. Overlapping shapes are drawn as separate fills (no see-through legs).
  - *Poses and life:* grazing (muzzle to the ground; the giraffe browses head up), alert, walking
    (a diagonal stride), the giraffe's splay-legged drink; loose groups, both facings, young ones.
    Each animal is in parts (tail, body, head with neck, an elephant's ear) that move a little on
    sim time (`feel.json fauna.idle`): a grazing bite, an ear flick, a nod, a tail swish, an
    elephant's ear fan and trunk sway, a giraffe's browsing sway; held frames hold still, reduce
    motion is calmer.
  - *Files:* one sheet per herd (`art-source/sprites/fauna/<herd>.png`, Standard at 1× with 48
    colours; its frame table in the sidecar) and its HD twin at 2× (`art-source/hd/sprites/...`,
    96 colours). `npm run art:interim -- --only fauna` writes both.
- **Dead camelthorn:** a weathered acacia skeleton (continuous taper, acacia forks, a wide
  umbrella, twig clusters, silver-grey wood with long cracks, peeling strips, knots; the dry
  branch ends in a splintered break).
- **Far trees** are broken canopies (small leaf clusters with sky between), each in its
  species' silhouette; Karoo farm trees are bluegums and a pepper tree.
- **Clouds:** soft billowing cumulus and cirrus sprites (merged billows brightening to a sunlit
  top, a flat grey-blue base, blurred, no outline, no dots), a deck per biome that drifts on sim
  time and greys over in rain; the Kalahari storm is a cumulonimbus with cream tops, never a
  flat-topped shape. The skies are only their gradients (plus the Bushveld's horizon dust).

**The camelthorn** (Vachellia erioloba, kameeldoring), the signature tree of the Kalahari and
Namibië:
- **Trunk:** short and thick, dark grey-brown, with deeply furrowed, cracked bark (many vertical
  strokes) and a lit and a shade side on every limb. It leans or forks low into 2–4 gnarled limbs.
- **Branches:** angular zig-zag limbs with rounded forks that spread wide and taper into fine
  twigs; a few bare dead branches poke out of the crown.
- **Crown:** a broad, flat-topped umbrella, much wider than tall, built from 30–60 separate clumps
  of feathery grey-green leaf dabs in three greens, with dark undersides, lit tops and sky between.
- **Fruit:** velvety grey half-moon pods in the crown and on the ground.
- **Ground:** a dappled shade circle on red sand with blonde grass tufts.
- **Variants:** young (small, rounder), mature umbrella, old half-dead (one side bare), and one with
  the family nest. They are drawn in layers by `tools/art/camelthorn.ts`, at 2× on near and mid.
  The product owner approved them on 24 Oct 2026.

**The sociable-weaver family nest:** a huge communal haystack of dry grass built over and among
the limbs, often the size of a car.
- **Shape:** a domed thatched roof rising into the crown and merging into the branches, irregular
  bulging sides, a lower second lobe, and a flat-ish underside.
- **Colour:** a weathered grey-brown roof blending raggedly into golden-to-tan sides, with sunlit
  highlights, deep shadow under the overhang and on the belly, and soft contact shadows where limbs
  enter.
- **Texture:** 1 500+ individual straws following the form (thatch down the roof, sides hanging),
  stray straws all round and a ragged fringe.
- **Entrances:** 10–20 holes in the underside, seen from below: wide, thin dark ovals with a lit
  straw lip, some half hidden by the fringe.

**Angry weavers:** sparrow-sized brown sociable weavers with a black chin and face, a scaly back of
dark feathers with pale edges, black flank bars and a pale bluish bill, drawn as two wingbeat
frames. When a nest is shot they pour out of the holes, swirl round it chattering and scolding, a
few dart at the camera, and they settle back after about 3–4 s; mid and far nests send smaller
bursts.

#### 4.3b The colony's everyday life (1.9.4, D-057)
Round every family nest, all hunt long: 6–12 sociable weavers in sight, about 1.3× true size
against the tree, darting out from under the nest and looping in the open sky either side of the
trunk, a few perched on the thatch roof and the branches either side,
hopping and pecking on the ground below, going back in (frames: flap ×2, glide, perch, hop, peck).
Now and then an **African pygmy falcon** (tiny, white below, grey above, a red-orange eye ring, a
barred black-and-white tail; a little bigger than a weaver) perches on a branch against the sky
and looks round; in Namibië a
pair of **rosy-faced lovebirds** (green, a rosy face, a blue rump, a pale bill) sits on a branch
and flies a round now and then. A near shot scatters them all; they trickle back a few seconds
later. One sheet (`desert/colony`, `tools/art/colony.ts`), 1× with an HD twin; on sim time.

## 5. Props, secrets, crates
Each secret prop needs: idle, triggered state, and an occluder shape. (The "hint glint" is gone since
1.9.8, D-061: each secret has a tell animal instead, §5.2.)
Crates: wooden ammo crate on a patched canvas parachute (Oupa's initials stencilled).
Power-up icons (from `4.jpeg`, refined): chilli biltong strip with flame, blue enamel mug with steam,
bundle of red shells, meerkat with binoculars.
v1.7b (D-046): every power-up and crate gun has an icon, interim art from `tools/art/sprites.ts`
in the D-035 look (ink outline, one shadow and one highlight per surface), drawn in a 64-unit box at
2× and shown on a **128 px** texture so it reads at HUD-chip size (42 px) and big on the Gun Shed's
cards (148 px): **Chilli Biltong** — a strip of biltong (fat edge, spice flecks) with a red chilli
across it; **Boeretroos** — a blue enamel mug with a cream rim and a chip, coffee in it, three
steam wisps; **Bush Buckshot** — a fat red shell bursting into a wide spray of pellets; **Meerkat
Spotter** — a stocky meerkat in profile, sitting up, holding binoculars to its eye and looking out
to the right (the helper sprite shrunk read as a thin stick); **Die Voorlaaier** — a stout
blunderbuss: thick stock, heavy barrel with a flared bell and brass bands, the ramrod under it
and a puff of black-powder smoke at the muzzle; **Mielie-Masjien** —
the green corn cannon with a cob in its hopper and kernels flying. Blitslaai and Oupa Laai (v1.6b)
moved to the same 128 px size. A crate shows its item's icon, fully opaque on a cream disc with a
dark ring: big on the canopy while it falls (74 px radius at the near plane, drawn above the
scenery so haze never fades it) and on the box's planked front, where the stencil used to be (the
canopy's canvas patch and the stencil are gone from the art). About 3 KB each (PNG-8); all eight 26 KB, in the first download.


#### 4.2b Makalani palms (1.9.3, D-056)

The Okavango's makalani palm (*Hyphaene petersiana*), at the camelthorn quality bar (D-035):
- **Trunk:** tall and slender, pale grey (`#C2BEB2` lit, `#9A968A`, `#66625A` shade) with faint
  leaf-scar rings (shallow arcs under a lit lip), a gentle swelling a third of the way up, fine
  cracks, old split leaf bases under the crown, a flared foot in grass. Drawn straight; the game
  leans and stretches it per palm.
- **Crown:** stiff, pleated fan leaves, grey-green (`#B9C6A0` / `#8C9C78` / `#5C6A4E`), on long
  stalks with small spines, radiating from a dark heart; lit upper left; a skirt of dry brown
  fronds (`#B8936A` / `#94704A` / `#644A30`) hanging below. Sways ±1.6° on sim time.
- **Groups and water:** ones, twos and threes leaning apart; by a channel a group is mirrored,
  squashed into the water, see-through and darker, with a gentle ripple (the product owner's
  sunset photo).
- **Nuts:** nearly round, glossy: chestnut brown (`#9A5A30` → `#2E160A`), some orange, a few
  green; a pale stalk scar and a highlight upper left; a motion-blurred twin for a fast spin. They
  hang on knotted, branched stalks (drawn by the game) under the crown. Bits: fibre strands, dark
  husk chunks and pale ivory chips (`#F2EADA`), a small local puff, no flash.
- **Far:** silhouettes in the far ridge and far veld (grey trunk, a round fan head, the dry skirt,
  a dark nut cluster).
- **Textures:** one trunk and one crown per plane (near at scale 1, mid at 0.42); the near crown
  has an HD twin; the trunks and the mid crown stay Standard in HD (texture memory, D-056); the nut sheet at 2× (`src/game/view/palms/makalaniSheet.ts`, `tools/art/makalani.ts`).
- **Sound:** a woody "tok" (crack-off and air hits, rising with the chain), a dry "krak!" (pop), a
  hard click on the bounce, the cans' whistle for Weg!.

#### 4.2c The baobab and its residents (1.9.4, D-057)

The Bushveld kremetart in winter (*Adansonia digitata*), redrawn at the camelthorn bar (D-035):
- **Silhouette:** one shape: a massive, fluted, slightly buttressed trunk (root lobes at the foot,
  a slim waist, swelling into the shoulder) that flows into six thick, tapering, root-like limbs
  with filled crotches: no collar, no hard join. Crooked branches off the outer limbs, fine twigs.
- **Bark:** smooth grey-pink to grey-brown (`#A88F86` lit, `#9A8A80`, shade −30 %), lit from the
  upper left, the limbs' undersides in shade; horizontal wrinkles and folds that curve round the
  trunk (densest at the foot and the shoulder), vertical fluting running on into the limbs, two old
  elephant scars (pale, pinkish, gouged), lichen in pale grey-green and ochre spots.
- **Pods:** small (a third to half the branch's thickness), egg-shaped, hairy, grey-green to
  olive-tan, each on a long thin stalk, in twos and threes; they swing and drop when shot (v1.7c),
  the pivot at the stalk's top. The secret pod is a cluster of three.
- **Hollows:** a big cavity low on the trunk (the barn owl's), a small hole low on the trunk's right (the
  bushbaby's), a hole high on limb 2 (the squirrel's): placed so no two holes read as eyes (review T1); the hornbill's slit in a rough, lumpy seal of grey-brown dried mud,
  a crack with a glint of comb (the bees'); healed, swollen lips, dark insides, a worn sill. Two
  untidy stick nests of the red-billed buffalo weavers on the outer limbs.
- **Residents** (`bushveld/baobab_life`, `tools/art/baobabLife.ts`; drawn at 2×): a lesser
  bushbaby (huge dark eyes with a pale nose stripe, big pink ears; ears → eyes → head out → looking),
  a tree squirrel (grey-brown, a pale side stripe, a bushy tail; peeking, running ×2, sitting), a
  barn owl in its cavity (white heart-shaped face, golden-buff crown; front, head turned, blinking)
  and flying off, a yellow-billed hornbill (black-and-white spotted wings, white belly, big curved
  yellow bill; flying ×2, clinging, feeding) and the female's beak tip in the slit, a red-billed
  buffalo weaver (black, red bill, white wing patch; flying ×2, perched), a bee (amber, a dark
  band; a dozen swirl as a little cloud). The bushbaby is big enough for its huge eyes to read and
  peeks from a visible hole a little wider than its head. Frames at a hole
  are cut off at its lower rim. They show themselves now and then on sim time; a near shot makes
  one duck back or fly off. No sound loop.

#### 4.2d The sausage tree (1.9.4, D-057)
The Okavango's *Kigelia africana*: a short smooth grey-brown trunk with pale flaking patches and
faint rings, forking into four thick limbs (one silhouette, as the baobab); a broad spreading
crown of leaf clumps in three tiers (dark under, lit upper left, dense oblong leaflets breaking
the edges, gaps where limbs show); a few maroon flowers on hanging cords; heavy, slightly curved
grey-brown sausages with a rough, lenticel-speckled skin, in four sizes, on long thin rope stalks
at staggered heights (never in a row). They swing and drop when shot (v1.7c).

#### 4.5c The Namib ground (1.9.7, D-059)
No ink on sand or grass. Red-orange Namib sand: soft blurred dune swells (lit crest, shaded hollow),
wind ripples as a shadow line under a lit line (rows wider apart toward the viewer, never closer
than 7 px), sparse fine grain; gravel plains (a greyer stain, pebbles with a lit cap and a shadow),
now and then a quartz patch and a line of tracks; paler and cooler toward the horizon (a haze tint,
not alpha). The plane edge is a lit sand ridge over a soft blurred shadow, grass breaking over it.
**Bushman grass** (Stipagrostis): golden-straw blades in a fan, the back ones darker, a
gradient from a shaded base to a lit top, a darker grass edge (never black); culms with slim
silvery feathery plumes; a few dry broken stems and straw litter; a soft contact shadow. Dollar
bush (Zygophyllum): a low mound of round fleshy grey-green leaves, lit on top. Dead branches: grey,
twisted, lit along the top. The cover is a sheet of variants (`namibie/veld`: three grass sizes
per plane, tufts, a dry clump, two bushes, branches), placed at 0.4–1.6× of its drawn size.

#### 4.5d The ostriches (1.9.7, D-059)
Same proportions and coat as the far-fauna ostrich, 197 px to the head on the mid plane (the D-054
far-ostrich proportion). Cock: black plumes with white wing tips and tail, pinkish-grey bare neck
and thighs, red shins. Hen: grey-brown, greyish-white plumes, grey skin. Layered shading (a lit
back, a shaded belly, plume texture strokes), long legs with scaled shanks and two toes, a small
head with a flat bill, a big dark eye with lashes and a bristly crown. Thin edges a shade darker
than the part. Review round 1: the body is rows of overlapping plumes (the cock's black with a
grey sheen on each upper edge, the hen's mottled grey-brown with pale tips) inside a ruffled
outline, drooping white (hen: greyish-white) wing and tail plumes with fine barbs, pink bare
thighs with wrinkles and red shins on the cock, a slight S in the neck with a lighter throat, a
collar ruff, two-toed feet. Sitting, the hen is a fluffed mound, wings a little spread over the
eggs, neck up. Poses: stand, look, a four-step walk, peck, sit, display (the cock kneels, wings
fanned white), a three-step run (wings half out, neck forward), hiss (neck low, bill open). The
scrape: a shallow hollow with a raked rim; cream pitted eggs. One sheet at 1.5× (48 colours) for
Standard and HD: a 2× sheet would take Namibië past its HD texture target and its chunk budget.

#### 4.5e Oryx in the mirage (1.9.7, D-059)
The far gemsbok sheet's walking look (D-054), five animals walking the pan; the reflection is the
same herd flipped and squashed to 45 % under the feet at 32 % alpha × the heat, wavering sideways a
little more than the herd. Never a flash: a breathe of ≥ 3 s; still with reduce motion/flashes.

#### 4.5f Hot-air balloons (1.9.7, D-059)
An envelope 56 × 66 px on the far plane of ten gores in warm colours (red-orange-yellow; deep
orange with a cream band and a zig-zag; terracotta and ochre with a teal gore), a sheen upper left
and a shadow side, a load ring, ropes, a wicker basket with a padded rim, a burner frame and two
small passengers. No brand names or logos. The burner flame is a small local glow (never a screen
flash; steady with reduce flashes); after a hit a passenger shakes a fist.
Sounds (stand-in synths through the AudioDirector until recordings are in): the cock's deep
three-part boom, a breathy hiss, heavy running footfalls, the burner's roar.

### 5.1 Skietbaan targets (D-037, D-040)
Semi-realistic (D-035): no dark contours, light from the upper left. Interim art from
`npm run art:interim -- --only range` (`tools/art/rangeArt.ts`), group `range` (lazy).
- **Steel plate (`range/plate`):** drawn at **2×** (disc radius 200 texture px for a
  plateRadiusPx-100 plate) and scaled per plane, so it stays crisp from Ver at 1× to the 9× scope.
  Freshly painted every visit: an even off-white face (#FBFAF5 → #DCD9D0) with a soft light from
  the upper left and a faint sheen, **never** baked hit marks. A clean mild-steel rim with a small
  bevel: the outer edge lit upper left and shaded lower right, an inner lip the other way round.
  Clean chains (alternating front and side links) to two welded hanger tabs with bolts.
- **Frame (`range/plate_frame`):** two posts and a crossbar of weathered camelthorn timber at the
  v1.4 quality bar: a lit left side and a shaded right side, grain lines and knots, the crossbar
  lit along its top, four bolts, two eye bolts the chains hang from, a dark band where the posts go
  into the ground. Same 2× scale, its origin at the plate's hang point.
- **Hit marks (drawn by the game, `MarkSurface.ts`):** steel — a silver-grey 7–11-point star where
  the paint flaked off (light edge #DFE3E6, splash #B3B9BF), a darker lead centre (#5B6167), 3–6
  small spatter flecks around it (#9EA5AB). Paper — a dark punched hole with a faint ring of torn
  fibre. Radius at near (plane scale 1): steel 5 / 8 / 12 px, paper 3 / 4.5 / 6.5 px for a shot
  pellet / a .22-class bullet / the Langloop or a Kettie stone (the weapon's `markSize` in
  `content/weapons.json`: `pellet` / `rifle` / `heavy`); scaled with the plane. The shape
  comes from the impact (shot id, tick, pellet index), never a per-frame random. The newest mark
  glints (a pale ring on steel, the yellow NEWEST disc on paper) for 1.25 s, fading over its last
  third.
- **Filtering:** marks (and, for a plate, its face) are baked per target into a small chain of textures (each level half the
  one above, like mipmaps), and the view shows the level with at least one texel per screen pixel;
  every level, the plate art and the frame filter LINEAR, also on the low tier (whose default is NEAREST).

### 5.2 The secrets' tell animals (1.9.8, D-061)
One small, unique, biome-accurate creature per secret (GDD §11.1c), drawn in the semi-realistic
look of the tree residents (§4.2c): lit from the upper left, soft outlines in each surface's own
darker tone (no black ink), true colours (the agama's blue head, the roller's lilac breast and blue
wings, the malachite kingfisher's turquoise and red bill, the jacana's chestnut and blue shield).
Sized about 1.3× true size against their prop, then `birds.json → tells.species[].scale` (review
R9: agama 1.8, skink 1.9, kingfisher, wagtail and oxpecker 1.5, fiscal 1.35, chameleon 1.3, drongo
1.2, roller 1.15) so each is ≥ ~14 screen px at 1280 px wide on the mid plane, with one clear key
mark: the agama's bright blue head and orange tail, the drongo's deep fork, the roller's turquoise
belly and lilac breast, the kingfisher's blue, the kestrel's rufous back, the jacana's chestnut and
long splayed toes, the skink's cream stripes and copper tail. Feet always on opaque prop art
(`tools/art/tellFeet.test.ts`). Four frames each,
facing right with the feet at the origin: **rest**, **act_a / act_b** (the small action, shown in
turn: push-ups, a tail flick, a caw), **flee** (flying or running off after a hit). One sheet for
all (`tells/sheet`, `src/game/view/tell/tellSheet.ts` boxes), drawn at 2× (`tools/art/tells.ts`),
late group (no area chunk grows). Oupa se Kaart's look: a warm (#FFC46A) fill of the same frame
18 % bigger behind the animal, at 55 % alpha: a soft glow, never a flash. Placement on each prop is
checked offline with `npx tsx tools/art/tellPreview.ts <out.png>` (prop art, the tell, the
secret's part in red and the tell's hit shape in blue).

### 5.3 Chacma baboons (1.10.0, D-062)
Semi-realistic like the far animals and the ostriches (D-035): olive grey-brown coat with a lit
back and a paler grey belly, short fur strokes, the long dark dog-like muzzle with its nostrils at
the tip, pale eyelids under a heavy brow, small ears, dark hands and feet, the pink-grey sitting
pad; the tail in its typical "broken" arch (up from the rump, a sharp bend, then hanging). The
adult male has a darker shoulder mane; a mother is a little smaller and paler with her small dark
baby (pink face) riding jockey-style on her back, so the player sees at once she is not a target.
No ink: edges a shade darker than the part; lit from the upper left; a soft contact shadow.
Drawn from a posed skeleton (`tools/art/baboons.ts`) so every frame is the same animal. One sheet
(`baboons/sheet`, its own background group `baboons`, a 2× master: Standard gets the pack's 1×,
HD the 2× in `baboons-hd`), frames facing
right with the origin at the feet, each box fitted to its drawing (`tools/art/baboonBoxes.ts`
writes `src/game/view/baboon/baboonBoxes.ts`): **raiders** at the mid plane's size (a sitting male
151 px at 1080): walk ×4, run ×2, the hat (wearing Oupa's khaki bush hat, scratching under it),
fruit and mielie (eating, 2 each), the tap and the throw (up on the hind legs), the moon (on a
fence post, its back to us, looking over its shoulder), the tumble and lying still; **the ridge** at
the far plane's size (54 px): sit, groom, look, the lookout's bark (2), walk (2), play (2), the
mother sitting and walking (2), climbing down and up; plus the thrown fruit and the tap's water.
Youngsters are the male frames at 0.56, mothers their own frames at 0.82. The far frames have
darker, warmer fur than the raiders (they sit against the far ridge's pale haze) and a 1.45×
baby, so a mother reads at 1× on a phone. `r_rock`: a weathered granite outcrop (428 × 100 ridge
px, `troopRock.ts`) drawn under a troop whose ridge has no high ground where it sits, its base
behind the far veld's top edge (the Okavango's far bank: a koppie in front of the treeline). Checks: every seat on its
ridge's skyline, every frame clear of its box's edges and on its feet (`tools/art/baboonArt.test.ts`).
**Sounds** (synths in the lazy view until recordings are delivered under `sfx/baboon_*`): the
lookout's two-note "wa-hoo" bark, a hit raider's screech, each raid's own sound (the tap's water,
a crunch of fruit or mielie, the throw's whoosh, the moon's rude raspberry, the chase's yelps), and
the thump of a bagged one.

### 5.4 Die Oes: the farm field, warthogs and the farm workers (1.11.0, D-063)
Interim at the D-035 bar (review round 1: the sheet's figures are semi-realistic, drawn from
posed skeletons like the baboons, no ink, layered shading and texture, so HD adds detail). **The field** (`oes`): a warm late-summer sky, a
koppie behind (the troop's seats on its skyline), the farmhouse (white walls, a corrugated roof, a
stoep), a generic tractor (no brand) and bluegums on the far veld; rows of ripe tasselled mielies
and sunflower patches on the mid plane with the fence along the back and the gap (the game draws
the gap's panel: whole, broken with two tipped posts and curled wire, three repair stages, whole
again); the pumpkin patch on the near plane; sunflower clumps in the foreground. **One sheet**
(`oes/harvest`, the map's lazy group, a 2× master; frames face right, origin at the feet, boxes
fitted by `tools/art/harvestBoxes.ts`): the warthog (grey-brown, a sparse dark mane, tusks and
warts and two curved upper tusks, a bristle mane; trot ×4 with the tail straight up like an
aerial, dig ×2 kneeling on the front knees with the snout in the soil, run ×2, the tumble and lying
still — no blood), piglets (lighter, faint stripes; trot ×2, run), three farm
workers — respectful, cheerful, simple overalls and boots, varied people (a woman with a headscarf
under a wide hat, an older man with a grey beard and a cap, a young man in a bucket hat): run ×2,
work ×2 (hammering a post, twisting wire with pliers, holding a post), duck (hands over the head,
a comic flinch); about 1.6× the fence posts' height on the mid plane — the gap's five panels and the "OES" sign. Checks: every stand point on drawn
ground (`tools/art/harvestGround.test.ts`), frames clear of their box edges
(`tools/art/harvestArt.test.ts`). **Sounds** (synths in the lazy view until recordings are
delivered under `sfx/harvest_*`): the wire snapping, a warthog's grunt, a piglet's squeal, the thump
of a bagged one, the workers' hammering, the crop warning's two soft beeps and a four-note harvest
jingle when the fence is whole. Oupa's Harvest lines (`guide.harvest.*`): en/af/de voiced, nl text.

### 5.5 Reënbui: the storm, the rain and the alate columns (1.13.0, D-067)
Interim at the D-035 bar, soft weather in gradients and layered tones (no ink on vapour). **One
sheet** (`reenbui/sheet`, 1024 × 416 at 1×, the late group, Standard in HD: ~1.7 MB on the GPU,
inside the Okavango's HD headroom): two rain tiles that repeat across the screen (fine far streaks;
fat near drops with a bright head; each streak drawn at its wrapped copies, so no seam), the alate
column's four rising frames (winged termites pouring up from a mound in a loose plume, wider and
thinner as it climbs, pale wings catching the light; the swarm's pattern repeats every 88 px, so
the loop is seamless), the mound, the first drops' dust puff (four frames), a wet-ground patch,
two storm towers (dark flat bases, lit billowing tops; one with an anvil) and two small lightning
forks. **In the game:** the towers roll in from the sides over the build-up and out after the
rain; the land dims a little (sky to a blue-grey, the land to a cool grey, six steps each way,
chunked); a small fork flickers far off under the towers every ~3.3 s (never a screen flash:
the shared limiter, dimmer with "reduce flashes", none with "reduce motion"); the first drops
bring dust puffs and the ground darkens in patches where it rains, drying over 8 s after; the
columns rise on the mid and far ground near the view and the guineafowl crowd round them,
pecking two spells in three. With the Kalahari Donderstorm only the columns and the wet ground are
the event's: the storm's own gloom, rain and lightning do the rest.

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
- v1.7b (D-046): power-up chips (icon, name, seconds or shells left, a bar) under the Frenzy meter;
  the pickup card slides in at the top centre under the pause button (ink slate, gold rim, the icon
  on a cream disc, gold name, cream line; a coral "New!" the first time). Boeretroos' warm edge
  tint is `#E89A3C` fading to nothing inward over 16 % of the screen; Chilli Biltong's ∞ is chilli
  orange `#FF6B3A` on an ink keyline; Bush Buckshot's ring is `#FF8A3A` on the crosshair's keyline.
  The end chime `powerEnd` is the pickup chime turned around, slower and softer.
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
*vastrap* groove, upright bass, brushed snare; v1.9 (D-066, §10.2): with an mbira ostinato in the
calm stem, a marimba line in the build and hand drums in the Stampede, each area its own colour. Three stems per biome (calm / build / stampede),
120 → 150 bpm in the Stampede. Original compositions only; no quoting existing tunes.

**Guineafowl voices:** alarm "kek-kek-kek-kaaa", soft contact "kek", flock chatter, take-off wing
clatter. Best source: record real flocks (common on farms — you own the recordings). Field-recording
libraries (e.g. xeno-canto) use Creative Commons licences, many **NonCommercial** — check each file.

**Oupa (voice actor, EN/AF mix, ~40 barks at launch, all subtitled):**
"Mooi skoot, my kind!" · "Ag nee man!" · "Jinne, kyk hoe hardloop hulle!" · "Die hele swerm!" ·
"Twee vlieë met een klap!" · "Laai, laai, laai!" (reload) · "Los die kwêvoël uit!" (leave the go-away-
bird alone) · "Kos is reg!" · "Stadsjapie…" (gentle teasing after a bad hunt) · "Bosveld Legend!".
Max one bark per 6 s; never over a tally count-up. The one exception (1.9.2, D-055): the ten-second
call is said the moment the clock reaches 10 s, cutting any line playing, or not at all after
9.5 s (`feel.json → barks.lastSecondsLateSeconds`).
*v1.0.1 (D-028):* 39 launch lines are in the game, each with its trigger (`content/client/feel.json
→ barks`), text in en/af/de/nl, a speech bubble as its subtitle, and a `voice/bark.<id>` key waiting
for the recording (`docs/06-ASSET-DELIVERY.md` lists them).

**Meerkats (v1.7, D-044):** soft contact chirps when a head pops up, the sentinel's harsh
double alarm bark, paws scratching sand, and the Familiefoto's soft camera click
(`sfx/meerkat_chirp`, `sfx/meerkat_alarm`, `sfx/meerkat_dig`, `sfx/camera_click`). They are
interim, from `tools/audio/sfx.ts`, in the lazy desert group. Chirps and digging come only from a
colony on screen, at most one cue per colony every 40 ticks.

**Fruit (v1.7c, D-047):** a soft wooden "thock" when a shot knocks a fruit and a low thud in the
dust when a dropped one lands (`sfx/fruit_thock`, `sfx/fruit_thud`), panned to the fruit. Small
synths (`src/game/view/fruit/fruitSounds.ts`) until recordings are delivered under those keys.

### 10.1 Oupa's voice in English, Afrikaans and German (v1.5, D-041)

**What is voiced:** the 39 lines of Oupa's triggers (`feel.json → barks`) and the 5 secret barks
(including the weavers' "Tsk-tsk-tsk! Leave our nest!" scold), 44 keys, the same keys as the
captions. v1.7 (D-044) adds the meerkats' scold (`bark.meerkat_scold`, "We're not guineafowl!")
and Oupa's Familiefoto line (`bark.familiefoto`): 46 keys. **Voice language** (Settings → Sound & game: Same as text / English / Afrikaans /
Deutsch) is separate from the text language: the speech bubble (the caption) always follows the
text, so an Afrikaans voice with English subtitles works. Dutch text on "Same as text" uses the
Afrikaans voice (the closest).

**Delivery:** one pack per voice language, asset group `voice-<lang>` (`art-source/audio/voice/<lang>/<key>.wav`
→ `public/assets/voice-<lang>/`). Only the chosen language's pack downloads. It starts on the first gesture anywhere (the title, a menu,
Settings, the Skiet-Skuur: a document-level listener unlocks audio), so it is usually in before
the first hunt's greeting. A bark whose line is still on its way waits up to `barkWaitMs`
(1.5 s, `content/client/feel.json → audio`) and plays if the line arrives in time; its caption
shows at once either way. None of it downloads while the voice volume is 0; it is never part of the
first download. Ogg Vorbis q3 with the MP3 V5 twin (Safari), −16 LUFS like any voice. It plays
through the AudioDirector: muted before the first gesture, while the page is hidden, paused or
in an ad; the music ducks under it; one line at a time; never over the tally count-up.

**Character:** Oupa is an older Afrikaner farmer, dry and proud, sometimes scandalised. The
interim voices are slowed and lowered (`tools/audio/voice.config.json`): en/af speed 0.94/0.90,
pitch −1.5 semitones; de speed 0.92, pitch −2 (Thorsten's voice is younger). The resampled pitch
also slows the line by the same ratio: unhurried, with the model's own pauses at commas. His
Afrikaans words inside an English or German line ("Mooi skoot", "my kind", "Jinne", "Ouma") are
read with Afrikaans phonemes. The weavers' scold is higher and quicker (+5 semitones), the frog's
"Kwaak!" lower.

**Interim TTS engines and licences** (made offline by `npm run audio:voice`, all `origin:
interim` in `assets:audit`; no account, key or payment; no NonCommercial model):

| Voice | Engine | Model / voice | Licence | Commercial use of the audio | Source |
|---|---|---|---|---|---|
| en | kokoro-onnx 0.6.1 | Kokoro-82M v1.0 (int8), voices bm_george 0.7 + am_fenrir 0.3; eSpeak NG en-gb phonemes | engine MIT; model Apache-2.0 (trained on permissive / public-domain audio); eSpeak NG GPL-3.0 (a build tool; its output is not covered) | yes | https://github.com/thewh1teagle/kokoro-onnx · https://huggingface.co/hexgrad/Kokoro-82M · https://github.com/espeak-ng/espeak-ng |
| af | kokoro-onnx 0.6.1 | the same Kokoro-82M voice reading eSpeak NG's **Afrikaans** phonemes (rule-based) | as en | yes | as en |
| de | kokoro 0.9.4 (PyTorch, CPU) | Thorsten-Voice/Kokoro (German fine-tune of Kokoro-82M on the Thorsten-Voice dataset); eSpeak NG de phonemes | engine Apache-2.0; model Apache-2.0; dataset CC0 | yes | https://huggingface.co/Thorsten-Voice/Kokoro · https://www.thorsten-voice.de |

**No commercially usable Afrikaans neural voice exists** (checked 25 Oct 2026): Meta's MMS-TTS
`afr` is CC BY-NC 4.0, Coqui XTTS-v2 uses the non-commercial CPML, and Piper has no Afrikaans
voice. So the Afrikaans pack is the English Kokoro voice driven by eSpeak NG's Afrikaans
pronunciation rules: understandable, with a slight English colour. It is swappable key by key.

**Rejected for licence reasons:** most Piper voices (en, de incl. thorsten) are fine-tuned from
`lessac` (Blizzard 2013 research-only licence) or `ryan` (CC BY-NC-SA); `hfc_*`, `semaine`,
`pavoque` are CC BY-NC-SA; MMS-TTS is CC BY-NC; XTTS is CPML. The public-domain Piper voices
`norman`/`john` (LibriVox, trained from scratch) were the fallback for English.

**Final voices** are the product owner's decision (docs/06 §5 "voices"): a delivered WAV at
`art-source/audio/voice/<lang>/<key>.wav` without an interim sidecar replaces the interim line for
that key; the generator never overwrites it.

**SFX list (MVP):** dubbelloop shot ×3 variants, empty click, break-open + shell insert + snap shut,
belt refill, pellet thuds (ground, wood, metal CLANG for the pot), feather POOF ×4, bird alarm ×6,
take-off wing burst ×3, run patter loop, vuvuzela BZZZT, windpomp creak + blade pings + water gush,
bakkie alarm, potjie lid clang + bubbling, crop-sprayer drone, kwêvoël call, hadeda call, record
scratch (penalty), Frenzy tier stings ×3, Stampede rumble, tally ticks, rank stamp thud, UI clicks.

**Mix:** music −16 LUFS integrated; SFX peaks ≤ −1 dBTP; music ducks −6 dB under barks; spatial pan
by screen x (±0.7 max); separate volume sliders (music / effects / voice).

### 10.2 The veld soundscape and local instruments (v1.9, D-066)

The product owner (24 Oct): "Veld soundscape per area and time of day, plus marimba, mbira and
drum layers." The veld should sound alive and local: the birds and insects of that place at that
time of day, and music with Southern African instruments.

**The soundscape.** Over each area's ambience bed, one-shot calls of its creatures and weather,
each with a rate (calls a minute, ±45 % jitter), a level and a distance — near (as recorded), mid
(−5 dB, a 6.5 kHz low-pass) or far (−12 dB, a 1.5 kHz low-pass) — panned to a random spot across
the screen (±0.7). The time of day is the map's light: each call has a profile with a factor per
layout light (dawn_mist, midday, overcast, golden, dusk, bright_calm, dusty_wind); a bonus map's
haze makes everything a little further away (−1.5 to −4.5 dB); a special day's light falls back to
the map's own. At most two calls sound at once and never closer than 1.4 s; the title plays the
area on screen at half the rate. Numbers in `content/client/soundscape.json`.

| Area | Calls (distance; when) |
|---|---|
| Everywhere | Cape turtle dove "work-HAR-der" (mid; all day, fewest at midday and in the wind), laughing dove's bubbling coo (mid; all day, softer at midday), hadedas' "haa-haa-haa" (far; at dawn and dusk, rare at midday) |
| Karoo | wind gusts (near; most in the dusty wind), a windpomp's creak (far; with the wind), a sheep far off (far; by day) |
| Bushveld | francolins at dawn (mid), cicadas in the heat (mid, quiet; midday and golden, silent at dawn and dusk), a grey go-away-bird far off (far; by day) |
| Kalahari | cicadas (mid; loudest at midday, silent at dawn and dusk), barking geckos at dusk (mid), a korhaan's croak (mid; by day) |
| Okavango | the fish eagle's "weee-ah, hyo-hyo-hyo" (far; by day), reed frogs tinkling at dusk (mid), a hippo's grunt far off (far; any time) |
| Namibië | barking geckos at dusk (mid), a korhaan (mid), cicadas far off in the heat |
| The Harvest | doves, cicadas in the heat, francolins at dawn, hadedas far off |

**Warnings stay clear.** The hadeda, the fish eagle and the kwêvoël are penalty creatures with
their own calls in the game. Their soundscape calls are far only (quiet, muffled), and none plays
from 5 s before that creature's world event until 2 s after it has left the screen, so its own
call is always the player's warning.

**Local instruments.** The three stems keep their keys, tempo and kwela character and gain
Southern African parts: **calm** — a pennywhistle lead (breathy, a flick up into the long notes,
vibrato blooming) over an **mbira** (thumb-piano) ostinato of two interlocking lines, low on the
beat and high off it, with the bottle-cap buzz; **build** — a **marimba** line in a 3-3-2 rhythm,
up the chord then down; **Stampede** — **hand drums** (a djembe/ngoma groove of open bass, rim
tones and slaps) over the brushed snare. Each area has its own colour: Okavango and Bushveld
marimba-forward; Kalahari and Namibië sparse drum-and-mbira (their hand drums start in the build);
Karoo mostly kwela with a light marimba. All phrases are original, built from each area's chords.

**Recordings.** Every call is an interim synth (`tools/audio/soundscape.ts`) until a recording
replaces it (`docs/06-ASSET-DELIVERY.md` §5 lists the keys); own recordings or public-domain ones
with their source written down, never NonCommercial library or xeno-canto files. `npm run
audio:preview` renders a 20 s mix per area with its spectrogram for review (`docs/audio-preview/`).

### 10.3 Reënbui's sounds (1.13.0, D-067)
The first summer storm in sound: **thunder** rolling in far off (a soft crackle, then a low,
rolling rumble), **the first fat drops** on a sinkdak and on the dust (metallic ticks with a ring,
soft pats, closer and closer together), **the rain** (a steady hiss full of ticks on the iron roof,
in and out soft), the swarm's **soft buzz** (a warm drone of small wings with a flutter) and the
**excited birds** at the feast (guineafowl "kek-kek" chatter, quick small-bird chirps). Interim
synths (`tools/audio/soundscape.ts`, mono 32 kHz, `sfx/amb_reenbui_*`, the lazy `soundscape`
group); recordings wanted (docs/06). The soundscape's own calls go quiet from just before the
build-up until 1.5 s after the rain has eased: the event's cues are the veld's sound then.
**Oupa:** "Smell that rain?!" / "Ruik jy die reën?!" at the first drops, "Flying ants! Every bird is
coming down to feast!" / "Rysmiere! Al die voëls kom fees!" when the alates rise, "There goes the
rain. By Sunday the veld will be green." when it eases (en/af/de interim TTS, nl text).

## 11. Special days (Feesdae, D-048)

A special day dresses the day's map; it never swaps the biome art. Each special's art and sounds
are a lazy asset group of their own (loaded when that special's hunt starts, never with the first
download, never with another special's; D-064): Halloween's `feesdae`, Christmas's
`feesdae-christmas`. One sheet per special (`feesdae/halloween`, `feesdae/christmas`; layouts and
origins in `src/game/feesdae/feesdaeAssets.ts` and `christmasAssets.ts`, drawn at 2×; Halloween's
ships its 2×, Christmas's a 1× pack that HD shows too). Until a sheet arrives the game draws a flat stand-in with the same frames
(Christmas waits for its listed sheet instead, D-064).

**Halloween — Spookjag (interim art: `npm run art:interim -- --only feesdae`, tools/art/halloween.ts):**
- *Light:* its own preset, `spookjag` (feel.json lights): a spooky dusk, not a warm sunset — a deep
  blue-purple sky, a dimmer and cooler ground, a faint violet afterglow on the horizon (no orange),
  and a soft steady vignette, so the moon, the lanterns' glow and the bats' silhouettes stand out.
  Birds stay untinted. No full-screen flashes.
- *Moon:* a big, low, pale-yellow full moon on the sky layer with soft maria, a few craters and a
  faint halo; five or six small black bats circle it (sky decoration, not targets).
- *Pumpkin lanterns:* every one a carved jack-o'-lantern — ribbed, glossy orange, the eyes, nose and
  mouth lit from inside (a warm core in the cuts) — on top of a prop where the day's map has one
  (the reservoir's rim, the bakkie's roof, a boulder, the dassie koppie, the mokoro pole, the egg
  rock: a bare pumpkin) or on its own lichen rock or weathered fence post (with a strand of wire)
  just in front of the flock line. Distant ones use a bold half-size drawing (bigger cuts, a heavier
  edge) so the face reads at a few dozen px. Each has a
  small additive glow that flickers slowly (12 %, ~0.5 s) — a local light, never a flash. Shot
  out: the same carved pumpkin gone dark, the cuts sooty, the glow gone, a thin wisp of smoke
  rising (and a puff as it goes out).
- *Bats (targets):* furry bodies and ears, membrane wings stretched between finger bones that let
  the moonlight through; three wing poses (14 fps). Small on the mid and far planes, on purpose.
- *Spotted eagle-owl (protected):* about a guineafowl's size on the mid plane (the drawing shown
  2.2× its frame), gliding on its own band between the HUD and the horizon, across the moon's
  height — never under the top HUD. Seen from below with its round face turned to the hunter: ear
  tufts, a pale grey facial disc, big yellow-orange eyes, barred and pale-spotted grey-brown wings
  with splayed dark-tipped primaries, a pale finely barred belly; three wing poses (5 fps).
- *Witch hats:* a small purple-black cone with a bent tip, a brim, an orange band and a buckle,
  on about a third of the guineafowl (picked by bird id). It sits on the head of the frame shown
  — every clip's head position comes from the poses the bird art is drawn with
  (`src/game/feesdae/hatAnchors.json`, written by `art:interim -- --only feesdae`) — mirrored with
  the bird, tilted with the head and a little back, about 2.7 head radii wide. Three drawings
  (large, medium, small): the smaller, the bolder and simpler.
- *Cobwebs:* white silk with dew drops (and a small spider) on a corner of the windpomp, the fence
  bell, the baobab, the camelthorns, the quiver tree and the sausage tree (`feel.json feesdae`).
- *Tally and share card:* a purple edge round the slate with the moon, bats and a lit pumpkin;
  the title "Spookjag 2026". The share text is framed 🎃🦇 … 🦇🌕.

**Sounds (interim, `npm run audio:interim -- --only sfx`):** a 2.6 s sting — a reedy organ chord in
A minor that sags a semitone over a low drone, a kalimba figure dropping through it, a church-hall
tail; the owl's soft "hoo-HOOO"; a bat's two high squeaks; a lantern's soft whoomph. Captions:
"[a spooky organ sting]", "[an owl hoots]", "[a bat squeaks]", "[a lantern puffs out]". Oupa's
five Spookjag lines are voiced like his others (§10.1).

**Christmas — Christmas in the sun (D-064; interim art: `npm run art:interim -- --only christmas`,
tools/art/christmas.ts; 644 × 694 design px, drawn at 2× and shipped as a 1× pack, ~1.7 MB on
the GPU; it stays Standard in HD, like D-054's specials, so an HD hunt stays ≤ 256 MB):**
- *Light:* its own preset, `kersfees_son`: a blazing midsummer noon — the sky bleached white-hot
  towards the horizon, the far ridge washed pale in the glare, the veld and near ground baked
  golden. Birds stay untinted. Along the horizon a heat band of fine wavering ripples (it reads in
  a still frame) with the Namibië mirage's soft strips, at `looks.christmas.heat` (sim time; off
  on the low tier and with reduced motion).
- *Presents:* a box seen a little from the right and above (the front lit, the side in shade,
  fold creases), three wraps — Christmas red printed with gold stars and a gold ribbon, bottle
  green with white polka dots and a red ribbon, sky blue with silver stripes and a silver ribbon —
  paper grain, a glossy ribbon (dark rims, a bright streak) and a full bow (shaded loops, inner
  shadows, a knot with a highlight), a soft contact shadow. Tucked in behind a prop (drawn under it, so the trunk,
  rock, tank or bakkie covers 10–50 % of the box and never its middle), feet on the line the
  prop's art stands on (unit-tested against the art). Opened: the lid knocked back and tilted
  behind the box, the bow flown, tissue paper and a toy guineafowl peeping out of the dark inside;
  as it opens the lid hops off (0.7 s) and a puff of paper confetti rises (0.9 s), on sim time;
  no flash.
- *Tinsel:* a silver and a red garland — a twisted foil strand with a bright spiral, a dense
  fringe of fine hairs and sparkles — hung between two hooks in the crown of every listed tree the
  map has (the camelthorns first; the windpomp one small garland), and red, gold and silver baubles
  with a ridged cap, a window reflection and a rim light (anchors per tree in
  `feel.json looks.christmas.tinsel`, checked against the tree's art). A small soft four-point glint
  walks the baubles, up and down over ~1 s of a 3.2 s turn (never a flash; off with "reduce
  flashes").
- *Santa hats:* a red cone flopping back to a white pompom, a white fur brim, on about 30 % of
  the guineafowl, on the witch hats' head anchors and sizes (three drawings).
- *Oupa:* an old Karoo farmer, cheerful and respectful — sun-browned face, a full white beard and
  moustache, bushy white brows and smiling eyes, a khaki short-sleeved shirt with flap pockets,
  rolled sleeves and folds, a belt, khaki shorts with creases, shaded arms and legs (knees, calves,
  hands with fingers), socks rolled down over laced brown vellies, and a Santa hat; waving beside the title's
  badge, his head on the tally slate's corner and on his bark bubble (drawn at half size: he is
  shown small).
- *Tally and share card:* a green and red edge round the slate, tinsel along the top, a present
  on the right edge and Oupa's head in his Santa hat on the left edge (both kept on screen and
  clear of the buttons); the title "Christmas
  in the sun 2026". The share text is framed ✨🎁 … 🎅☀️.

**Sounds (interim, `npm run audio:interim -- --only sfx`):** the sting, kwela on a pennywhistle —
the chorus of "Jingle Bells" (1857, public domain) in D, swung, with the whistle's slides, over a
chopped guitar and a bass; on the tally the opening of "Silent Night" (1818, public domain) on the
whistle; a present opening: wrapping paper crackling and a little bell. Captions: "[a pennywhistle
plays a carol]", "[paper rustles, a little bell rings]". Oupa's five Christmas lines are voiced
like his others (§10.1; nl text speaks Afrikaans).

**New Year — the countdown (D-065; interim art: `npm run art:interim -- --only newyear`,
tools/art/newyear.ts; 400 × 1934 design px with the baked firework strips, drawn at 2× and shipped as a 1× pack, ~3 MB on the
GPU; Standard in HD from the start, so an HD hunt on the Okavango stays ≤ 256 MB):**
- *Light:* its own preset, `nuwejaar_skemer`, grading the whole scene: the low sun's warm light
  on the near plane, the mid plane dimmer, the far planes cool and violet in shadow, a rose-gold
  afterglow low on the horizon under a deepening blue sky. Over the hunt it goes to blue hour: a
  midnight-blue wash on the sky (`looks.newyear.blueHour`) and an extra blue tint on every plane's
  art, props and far animals (`blueHour.ground`, stronger on the far planes); ~34 stars come out
  and twinkle slowly (sim time). Birds stay untinted (readability).
- *Fireworks:* small bursts low over the far horizon, on the sky layer behind the far ridge: a
  dim rocket streak climbs, a small bright core puffs (30 px, gone in a sixth of the burst), and
  16 sparks streak out along their own rays at their own speeds — gold, red, green or white, a
  white sparkle in each burst — their trails shortening as they slow, then glittering (a flicker)
  as they fall and fade over 1.5 s (one 40 × 10 px streak frame, tinted, added light). Never a
  large or full-screen flash: each burst is ≤ ~170 px across, at most 3 start in any second (one
  per 1/3 s slot), more in the countdown (2.4/s) than before it (0.7/s), half as many on the low
  tier; with "reduce flashes" only plain dots twinkle where they hang (≤ 35 % alpha, no core,
  never brighter than the sky). Baked (D-065 perf): the burst's animation is drawn offline from
  that spark math (src/game/feesdae/fireworkMath.ts) into 12 half-size frames on the sheet, one
  strip per burst colour (gold, red, green, white) with its white sparks, the core and the fade
  baked in — so in the game a burst is one untinted image changing frame (mirrored or not, a slight
  turn, its own size); the stars twinkle as four groups, the two updated on alternate frames.
- *Party hats:* a striped paper cone (gold, red, blue bands, shaded round), a white zigzag trim and
  a gold pompom, on about 30 % of the guineafowl, on the witch and Santa hats' head anchors and
  sizes (three drawings; the small one two-tone).
- *Oupa:* D-064's figure in a party hat worn a little to one side, a striped party blower blown
  out in his waving hand (the title, beside the midnight-blue badge with gold text); his head in
  the party hat on the tally slate's corner and on his bark bubble.
- *HUD:* the countdown "10 … 1" big in gold (150 px, × the text-size setting) at the top centre,
  under the pause button and the charm row, with a short pulse as each second starts; a "×2" tag
  in gold left of the score plate.
- *Tally and share card:* a midnight-blue edge with a gold line round the slate, curled gold and
  blue paper streamers along the top, a small firework burst on the right edge and Oupa's head in
  his party hat on the left edge (kept on screen and clear of the buttons); the slate's title
  "Happy New Year!". The share text is framed 🎊🥳 … 🎆🎊 and titled "New Year 2027".

**Sounds (interim, `npm run audio:interim -- --only sfx`):** the sting, the first line of "Auld
Lang Syne" (traditional tune, words Burns 1788; public domain) on the pennywhistle in D over a
walking bass; on the tally its first phrase, slower, coming home to D; a firework far off — a soft
low thump and a faint crackle through a long dull reverb (quiet, under the hunt); the countdown's
tick on the last 3 s. Captions: "[a pennywhistle plays Auld Lang Syne]", "[fireworks pop in the
distance]". Oupa's four New Year lines are voiced like his others (§10.1; nl text speaks
Afrikaans).
