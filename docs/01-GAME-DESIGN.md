# Tarantal Madness — Game Design Document (GDD)

Status: v1.0 build baseline · 19 Oct 2026
Owner: product lead · Implementation: Claude Code, milestone by milestone (see `04-BUILD-PLAN.md`)

> Numbers in this document are **starting values**. The live values are in `content/*.json`.
> When tuning changes a number, change the JSON; only update this doc if the *rule* changes.

---

## 1. The pitch

**Moorhuhn meets Balatro in the African bushveld.**
Ninety-second slapstick shooting-gallery hunts across a panning Southern African panorama, where
real guineafowl flock behaviour turns aim into strategy — stitched into a four-season roguelite run
you can finish on a lunch break, plus a daily seeded hunt everyone shares.

- Genre: 2D panning shooting gallery + light roguelite (run-based build crafting)
- Session: 90 s (Classic) · ~15 min (Season Run) · 90 s (Daily Hunt)
- Platforms: desktop + mobile browsers first (portals, PWA); app stores / Steam via wrappers later
- Audience: everyone 10+, casual-to-midcore; nostalgic Moorhuhn players (DE/NL/SA); portal players
- Tone: affectionate South African farm comedy. Oupa (grandpa) narrates. No blood, ever.

## 2. Design pillars (use these to settle every argument)

1. **Bang in three seconds.** From "Start" to the first feather burst in under 3 s. One input does the core.
2. **Read the flock.** The skill ceiling comes from understanding how guineafowl actually behave,
   not from faster clicking.
3. **One more run.** Every hunt ends with a reason to start the next (a quota just missed, a charm
   combo half-built, today's daily score to beat).
4. **Unmistakably Southern African.** Real birds, real places, real slang, real humour —
   not a postcard Africa. Locals should laugh in recognition; everyone else should want to visit.
5. **Fair and clean.** No pay-to-win, no paid randomness, no forced mid-hunt ads, no gore.

## 3. What makes it different (the hooks)

| | Moorhuhn (1999–2025 remasters) | Tarantal Madness |
|---|---|---|
| Targets | Chickens fly randomly across the sky | **Flocks** that forage, alert, run, then *flush* into short steep flights — like real guineafowl |
| Skill | Speed + distance aiming | Speed + distance aiming **+ flock reading**: flush on purpose, catch wing shots, wipe whole flocks |
| Structure | One 90 s round, high score | Classic 90 s **plus** a 4-season roguelite **Season Run** with charm build-crafting and bosses |
| Social | High-score table | **Daily Hunt** (same seed for everyone) + one-tap share card + challenge links |
| Mobile | PC-first, later ports | Designed for touch from day one: tap-to-shoot, drag-to-pan, flick-to-reload, optional tilt-to-look |
| Setting | Scottish moor | Karoo, Bushveld, Okavango, Kalahari — through a South African hunting year |

The two load-bearing differentiators are **the Flock** (§6) and **the Season Run** (§13).
Everything else supports them. If scope must shrink, protect those two.

## 4. Player fantasy, cast and tone

- **You:** a city kid ("Stadsjapie") sent to Oupa's farm for the hunting season. Climb the ranks to
  Bosveld Legend.
- **Oupa:** off-screen narrator voice. Dry, proud, occasionally scandalised. Afrikaans-English barks
  ("Mooi skoot, my kind!", "Ag nee man!", "Jinne, kyk hoe hardloop hulle!"). Never mean.
- **Die Tarentaal:** the star. Plump, polka-dotted, blue-faced, red-wattled, bony casque, enormous
  panicked eyes, legs that blur when it runs. Comically dignified until it panics (always).
- **Generaal Tarentaal & friends:** boss birds with accessories (pot helmet, eye patch, crest crown).
- **Non-targets:** Kwêvoël (grey go-away-bird), Hadeda, fish eagle, the neighbour's crop-sprayer.
- **Helpers:** the meerkat spotter, Bles the farm dog (charm), Oupa's bakkie.

**How hits look:** feathers explode in a comic "POOF!", the bird tumbles with stars around its head
and drops out of frame (or flops behind grass). No blood, no carcasses lying around, no suffering
animations. Aim for PEGI 7 / ESRB E10+ (the current Moorhuhn 2 console release is rated E10+).

## 5. Core loop (seconds)

`aim → shoot → feathers + score pop → (combo grows) → reload → find the next flock → …`

### 5.1 Shooting
- Weapon fires at the cursor/finger point. Shotguns fire a **pellet pattern** (default 8 pellets)
  within the weapon's spread circle; each pellet hits the **front-most** hittable target under it
  (near plane before mid before far; foreground props occlude).
- A **hit** = one shot that lands ≥ `min(pelletsToBag, weapon.pellets)` pellets on the target, so a
  single-projectile weapon (Windbuks, Kettie) always scores a full hit. Pellets never add up across
  shots. Normal birds are bagged by 1 hit. Bosses first lose `armorHits` (e.g. the Generaal's pot),
  then need `hitsToBag` further hits (accumulated across shots).
- Default magazine: **8 shells** (the Moorhuhn number — keep it). Reload refills the belt.
  Reload time 0.9 s (desktop right-click/Space, mobile flick-down or tap the shell belt).
- Firing on empty: loud *click*, belt flashes, Oupa sighs. No penalty beyond lost time.

### 5.2 Depth planes (Moorhuhn's distance scoring, kept)
| Plane | Visual scale | Base points | Notes |
|---|---|---|---|
| Near (pop-ups) | 1.0 (largest) | 5 | Curious birds pop up from the grass, stare, duck. Easy, cheap. |
| Mid | 0.5 | 10 | Where flocks forage and run. The main stage. |
| Far | 0.22 | 25 | Fly-overs and distant flocks. Small, fast, wind-affected. |

Moorhuhn's original paid 25 for the farthest birds; we keep 5 / 10 / 25 so the instinct transfers.

### 5.3 Scoring pipeline (exact order — implement exactly this)

For each bagged target:

```
points = base(plane or creature override) + Σ addPoints          // "Punte" (order irrelevant)
mult   = 1 + behaviourAdd                                         // "Maal" starts here
for each charm in slot order, left → right:                       // order MATTERS (Balatro-style)
    for each matching effect in that charm, in listed order:
        addMult → mult += x        mulMult → mult ×= x
mult  ×= weaponScoreMul × frenzyMul × stampedeMul                  // system multipliers, always last
award  = round(points × mult)
```

- `behaviourAdd`: foraging/alert **+0**, running **+0.5**, flying/flushed **+1.0** ("Wing shot!").
- Because charms apply in slot order, a "+2 Mult" charm placed *before* a "×3" charm is worth more
  than after it. The Padstal and pause screen let players reorder charms (drag) — a real decision.
- Classic and Daily have no charms, so there `mult = (1 + behaviourAdd) × weapon × frenzy × stampede`.
- The pop-up shows both parts like Balatro: **`10 ×2.5`** then resolves to **`+25`**. Big multipliers
  are the fun; format large numbers (12.4K, 1.2M).
- **Event bonuses** (Twee Vlieë, Whole Flock, secrets, armour knock-offs) are flat amounts multiplied
  only by `frenzyMul × stampedeMul` (not behaviour, weapon or per-bird charm effects), unless a
  charm's `bonusMul` targets that bonus.

## 6. The Flock — signature mechanic

Real helmeted guineafowl live in flocks (roughly 6–25 birds), forage on the ground, **prefer to run
rather than fly when alarmed**, and only when pressed **burst from cover in a steep, explosive flight**
with harsh "kek-kek-kek" alarm calls, then glide down and run again. They roost in trees at dusk.
That behaviour *is* the game.

### 6.1 Flock state machine

Flocks escalate one step per **threat**. A threat is: a shot whose impact lands within the
weapon's alert radius of any flock member (hit **or** miss — one threat per shot per flock), a
flockmate being bagged by a silent weapon, or a world event (hadeda, dust devil, dog, bakkie alarm).
The **escalation window** is 1.5 s: a second threat inside it escalates; if it expires, the flock
calms down one step. Every step needs a threat inside the window opened by the previous one: a
threat that reaches a RUNNING flock after its window has closed reopens the window (and restarts
the 4–7 s calm timer) but does not flush it (D-020).

```
          threat                    threat within 1.5 s                threat within 1.5 s
FORAGE ─────────────▶ ALERT ─────────────────────────▶ RUN ─────────────────────────────▶ FLUSH
  ▲                    │ (frozen 0.6–1.2 s,              │ (sprint 3–5× walk,               │ (steep take-off 55–75°,
  │  window expires    │  alarm calls)                   │  away from threat)               │  staggered 0–300 ms,
  └────────────────────┘                                 │                                  │  flight 1.5–3.5 s, glide)
  ▲                                                       │ no threat for 4–7 s              │
  └───────────────────────── SETTLE ◀────────────────────┴──────────────── land ◀───────────┘
                   (or EXIT off the panorama edge; or ROOST in a tree in dusk hunts)
Vuvuzela / reservoir flush / car alarm jump straight to FLUSH or the event's stated state.
```

- **FORAGE:** slow walk + peck, occasional soft "kek". Easy ground targets (behaviour +0).
- **ALERT:** heads up, frozen 0.6–1.2 s, alarm call bubble. Still standing targets — but one more
  shot within 1.5 s sends them running. Wait out the window and they go back to foraging.
- **RUN:** whole flock sprints together (boids: separation/alignment/cohesion) with zigzag noise,
  away from the threat's x-position. 3–5× walk speed. Behaviour +0.5.
- **FLUSH:** every bird launches steeply and staggered — a fountain of targets for 1.5–3.5 s.
  Behaviour +1.0 (wing shots). This is the combo moment.
- **SETTLE:** glide down, land, run a few steps, return to FORAGE (or EXIT off-screen).

### 6.2 Threat sources (data-driven, per weapon/event)
| Source | Radius (design px, mid plane) | Counts as |
|---|---|---|
| Dubbelloop / Pomp shot (hit or miss) | 260 around impact | 1 threat to each flock in range |
| Kettie shot | 120 around impact | 1 threat |
| Windbuks shot | 0 (silent) | none — but bagging a bird is 1 threat to *its own* flock only |
| Voorlaaier / Mielie-Masjien | 600 / 200 | 1 threat |
| Hadeda fly-over, dust devil contact, Bles the dog | event-defined | 1 threat (hadeda: every flock) |
| Vuvuzela, reservoir flush | whole screen / event area | straight to FLUSH |
| Bakkie alarm | whole screen | hidden birds jump; flocks straight to RUN |

### 6.3 The decision this creates: tempo
- **Patient plinking:** fire, let the 1.5 s window expire, fire again. Flocks stay put, points are
  low (behaviour +0) and the clock is running.
- **Escalation:** fire twice quickly to send the flock running (+0.5), a third time to flush it into
  a fountain of wing shots (+1.0), Twee Vlieë multi-hits and the Whole-Flock bonus — but a flushed
  flock leaves fast, so you need shells in the belt when it goes up.
- **Silent sniping:** the Windbuks picks birds off without escalating neighbouring flocks.
Accuracy and timing both matter: misses near a flock still count as threats. This is the skill
ceiling Moorhuhn never had.

### 6.4 Whole-flock bonus
Bag every member of a flock of ≥ 5 before it calms down after losing a bird (ALERT → FORAGE),
SETTLES or a member EXITS (a flock that bursts out as a secret's reward never qualifies, D-021) →
**+30 per bird** (`scoring.json`; tuned in M3, D-020), slow-mo 0.3× for
0.4 s, Oupa: "Die hele swerm!". Shown on the tally screen as a badge.

### 6.5 Classic fly-overs (keep the Moorhuhn feel)
Independent of flocks, single birds and small "commuter" groups fly across the far and mid sky at a
steady rate, so there is always something to shoot. Behaviour +1.0 (flying).

## 7. Targets and creatures

| Id | Name | Role | Plane(s) | Base override | Notes |
|---|---|---|---|---|---|
| `tarentaal` | Gewone Tarentaal | Standard target | all | — | Flock member, fly-over, pop-up |
| `tarentaal_wit` | Wit Tarentaal (white morph) | Rare target | mid/far | 100 | ~1 per hunt; drops 3 Doppies; Bird Book entry |
| `tarentaal_lavendel` | Lavendel Tarentaal (lavender morph) | Rare target | mid/far | 75 | Real domestic colour morph; collectible |
| `kuifkop` | Kuifkoptarentaal (crested guineafowl) | Tricky target | mid | 40 | Real related species, punk curly crest; hops erratically, hides in reeds (Okavango) |
| `generaal` | Generaal Tarentaal | Boss (Autumn) | mid | 100 | Rusty enamel pot helmet: first hit knocks pot off (CLANG +25), second bags him. Classic/Daily: appears once at the bakkie, struts, runs once the pot is off, flies off after 10–14 s |
| `ou_grys` | Ou Grys | Boss (Winter) | mid | 150 | Grizzled veteran with eye patch; only peeks from behind boulders |
| `kuifkop_koning` | Kuifkop Koning | Boss (Spring) | mid | 150 | Crested king; erratic hops in reeds; 3 hits |
| `stormvoel` | Die Stormvoël | Boss (Summer) | far→mid | 250 | Only visible in lightning flashes; giant shadow |
| `kwevoel` | Kwêvoël (grey go-away-bird) | **Do not shoot** | mid | −35 | Lands on high branch yelling "kwê-kwê!" (go-away). Shape + ⛔ icon on first sighting (Karoo: flies in to the windpomp's perch, sits 6–10 s, flies off; the ⛔ badge and call-out show until it is in the player's Bird Book, i.e. on the first sighting ever) |
| `hadeda` | Hadeda | Chaos event / do not shoot | far | −25 | Flies over honking — ALERTs every flock |
| `visarend` | African fish eagle | Do not shoot (Okavango) | far | −50 | Iconic call; protected raptor |
| `sproeier` | Oom Faan se sproeivliegtuig (crop sprayer) | Do not shoot | far | −50 | Moorhuhn's plane penalty, localised |
| `meerkat` | Stokstertmeerkat | Helper | near | — | Pops up after a secret; highlights hidden birds for 8 s |

Bird Book ("Oupa se Voëlboek"): every creature, morph, boss and secret gets a page with a real
fact + a joke. Completing pages unlocks cosmetics. Collection is a quiet, strong retention hook.

## 8. Hunt (round) structure

- **Classic & Daily:** 90 s. **Season Run hunts:** 60 s (tunable).
- **Pacing director** (budget-based spawner, `content/biomes/*.json → pacing`):
  - 0–15 s *warm-up*: 1–2 foraging flocks in view, sparse fly-overs.
  - 15–75 s *build*: flocks enter from edges, more fly-overs, events (hadeda, dust devil).
  - last 15 s **Tarentaal Stampede** (Classic and Daily; Season Run only with the Stampede-Kenner
    charm): music tempo up, mass run/flush across the panorama, **all points ×2**, event bonuses
    included (Moorhuhn 2 also made hits late in the round worth more — proven tension curve).
    The Stampede length comes only from `content/scoring.json → stampede.lastSeconds`; the director
    starts its surge at `duration − lastSeconds` whatever the hunt length.
  - All event and crate windows in content are **fractions of hunt length** (0–1), so the same biome
    works for 90 s Classic and 60 s Season Run hunts.
- **Secrets** (3–5 per biome): shootable props with puzzle-ish triggers (§11). One per biome grants
  **bonus time** (+5 s, once per hunt). A secret pays once per hunt unless its JSON gives it a
  `cooldownSeconds` (then it can pay again after the cooldown). Bonus time moves the hunt's end
  and a Stampede that hasn't started; pacing and the event schedule keep the original length.
  Secret points are event bonuses (§5.3). A shot that only hits a secret part (or a crate) neither
  extends nor resets Frenzy and is not a Miss (D-021). Each secret lives entirely in the biome JSON
  (`props[].secret`): removing it there removes it from the game.
- **Supply crates** (Classic/Daily): parachute in twice per hunt into view, land, and are gone after
  a few seconds on the ground; shoot the crate to collect a power-up or temporary crate weapon
  (weighted table in `powerups.json`).
- **End of hunt → Bakkie Tally:** count-up of bagged birds by plane, accuracy, wing-shot %, whole
  flocks, secrets, penalties, final score, rank stamp, Bird Book unlocks, then **[Again]** (one tap)
  and **[Season Run]**/**[Share]**.

## 9. Combos

| Combo | Rule | Effect |
|---|---|---|
| **Frenzy** ("Bosveld Frenzy") | Consecutive *shots* that bag ≥1 target | 3 → ×1.5, 6 → ×2, 10 → ×3 (`mulMult`). A shot that bags nothing resets to 0 (hitting only a non-target counts as nothing). Reloading and empty clicks do not reset. The shot that reaches a tier already scores at it (D-018). |
| **Twee Vlieë!** (Afrikaans "two flies with one slap" = two birds, one stone) | One shot bags ≥2 | 2 = +15, 3 = +40, 4+ = +80 (tuned in M3, D-020) |
| **Whole Flock** | §6.4 | +30 per bird |
| **Stampede** | last 15 s | ×2 |
| **Secret chain** | Two secrets within 10 s | +50 |

Example: mid-plane flushed bird during Frenzy 6 in the Stampede:
`points = 10`, `mult = (1 + 1.0) × 2 × 2 = 8` → **+80**.

## 10. Weapons, gadget, crates, power-ups

Design rule: few weapons, each with a distinct *verb*. Every weapon changes how you treat the flock.

### 10.1 Launch arsenal
| Id | Name | Unlock | Mag / reload | Pattern | Flock interaction | Score mod |
|---|---|---|---|---|---|---|
| `dubbelloop` | Oupa se Dubbelloop (12-gauge side-by-side) | Start | 8 shells "belt" / 0.9 s | 8 pellets, medium spread | Misses alert (260 px) | ×1 |
| `windbuks` | Die Windbuks (air rifle) | Bag 50 far-plane birds | 6 / 0.6 s per pellet | 1 pellet, no spread, slight wind drift | **Silent:** misses don't alert | ×1.5 on far plane |
| `kettie` | Die Kettie (slingshot) | Whole-flock 3 times | ∞ / 0.35 s draw | 1 projectile, travel time + drop + wind | Misses alert small radius (120 px) | ×2 all hits |
| `pomp` | Plaas-Pomp (pump shotgun) | Reach Plaaswerker rank | 6 / 0.7 s **per shell**, interruptible | 6 pellets, tighter spread | Alerts | ×1 |

Kettie: a stone reaches the near / mid / far plane after 80 / 180 / 350 ms and drops on the way,
so you lead moving birds and aim a touch high; it lands where you aimed in the world even if you
pan meanwhile. Under Kuifkop Koning's rule its draw takes twice as long (it has no reload). The
Plaas-Pomp's reload was 0.35 s per shell in the first draft; with that it out-scored the
Dubbelloop by ~43 % in the balance sim, so it is 0.7 s with a 60 px spread (D-025) — a different
rhythm, not more power. Numbers live in `content/weapons.json`.

Note: the concept art shows a side-by-side double-barrel as Oupa's default gun; the earlier spec
said over-and-under. **Side-by-side is canonical** (it reads better from first person). The 8-shell
belt is a deliberate arcade abstraction.

### 10.2 Gadget
- **Vuvuzela** (all modes, one slot): no damage; BZZZT shockwave FLUSHES every visible flock
  ("visible" = within the 1920-px reference view around the screen centre, so it is the same on
  every device, D-020). Cooldown 20 s (Classic and Daily: 2 charges per hunt; Season Run uses the
  same number until the run state owns it in M6). Desktop **Q**, touch: the horn button
  bottom-left. The flush tool that makes the flock mechanic sing.

### 10.3 Crate weapons (temporary, Classic/Daily crates and Season Run Padstal)
- **Die Voorlaaier** (blunderbuss): 3 shots, giant spread covering ~30 % of the screen, thick smoke
  0.5 s, 2.5 s ramrod reload after each shot. Flock eraser.
- **Mielie-Masjien** (hand-cranked mealie gatling): 10 s (from pickup) of hold-to-fire corn-kernel
  spray, no reload.
- While a crate weapon is out it replaces the primary; the primary's belt is left as it was and
  comes back when the crate weapon is used up. Picking up another crate weapon replaces it.
- Hold-to-fire: pressing starts firing, moving aims, lifting stops. On touch a held finger aims
  instead of panning; holding it near a screen edge pans (D-021).

### 10.4 Power-ups (crates in Classic/Daily; consumables in Season Run)
| Id | Name | Effect | Duration |
|---|---|---|---|
| `chilli_biltong` | Chilli Biltong | Auto-fire (hold to fire), no shells used, no reload, screen edges glow red | 8 s |
| `boeretroos` | Boeretroos (enamel mug of coffee) | Birds (and their flock timers) move at 50 %; your aim/reload at 100 % | 10 s |
| `bush_buckshot` | Bush Buckshot | Spread ×2.5 for the next 6 shells | 6 shells |
| `meerkat_spotter` | Meerkat Spotter | Hidden birds/secrets get glowing rings | 8 s |

Picking a power-up up again refreshes it. A shell power-up counts the shots after the one that
picked it up.

### 10.5 Parking lot (good ideas cut from launch, with reason)
Patat-Kanon (fun, but a second "line" weapon duplicates Voorlaaier's role — strong v1.x charm or
crate candidate), Kleilat mud-flinger (non-lethal gag; v1.x), .600 Nitro "Grofgeskut" (a real
big-game rifle reads wrong for a cartoon bird game), sawed-off coach gun (crime connotation, overlaps
pump), Brno .22 bolt-action (overlaps Windbuks), Boerewors bolas/net gun (v1.x conservation mode).

## 11. Biomes, seasons and weather

The Season Run follows a **South African hunting year**: guineafowl hunting season has historically
run from about April to July (autumn into winter), so the run starts in autumn and ends with the
summer thunderstorm finale.

| # | Season | Biome | Palette & landmarks (authentic) | Omen (weather) | Gameplay twist | Boss |
|---|---|---|---|---|---|---|
| 1 | **Herfs** (Autumn) — MVP biome | **Karoo farm** | Golden veld, flat-topped dolerite koppies (authentic Karoo), windpomp + corrugated reservoir, rusty bakkie, wire fence, aloes, springbok far away | **Karoo wind** with dust devils | Tailwind birds rocket (+40 %), headwind birds hover; dust devils flush what they touch; far shots drift | Generaal Tarentaal |

Omens are on in Season Run omen hunts and in the **Daily Hunt**; **Classic is off** (purist mode;
`modes.json → omen`, D-021). Karoo wind: direction and strength (0.4–1.0) re-rolled every 12–20 s;
flying birds (fly-overs and flushed flocks) go ×(1 + (1.4 − 1)·strength) with the wind and
×(1 + (0.7 − 1)·strength) against it; pellets on the far plane (and behind it) drift downwind by
45 px × strength × the weapon's `windSensitivity`. Dust devils cross the view downwind for 8–12 s
and flush each flock they touch once.
| 2 | **Winter** | **Bushveld** (Limpopo/Waterberg) | Pale blue sky, frost smoke at dawn, baobabs, mopane, granite koppies, **red aloes flowering (they bloom in winter)**, giraffe silhouettes | **Low sun glare** + morning dust | Glare zone on one side of the pan; 60 % of flocks run rather than fly; boulders occlude | Ou Grys |
| 3 | **Lente** (Spring) | **Okavango** floodplain | Papyrus, reeds, ilala palms, jackalberry and sausage trees, water lilies, hippos, lechwe; sun-showers + rainbow | **Sun-showers** | Kuifkop hop out of reeds; shots near water splash-alert; a hippo yawn flushes nearby flocks | Kuifkop Koning |
| 4 | **Somer** (Summer) — finale | **Kalahari** red dunes | Red dunes, camelthorn trees, **sociable-weaver mega-nests (huge haystack nests in the canopy)**, gemsbok, heat shimmer → thunderstorm | **Heat haze → Donderstorm** | Haze wobbles far targets; rain makes flocks run not fly; lightning reveals silhouettes | Die Stormvoël |

Authenticity corrections vs the Gemini concept (see `03-ART-AUDIO-BIBLE.md §2`): no jacarandas in
the Okavango (South American, listed invasive in South Africa and Namibia), no baobabs/giraffe on the
Karoo farm (they belong to the Bushveld stage), sociable-weaver nests are giant communal haystacks,
not hanging balls.

**Future biome pack (v1.x):** *Namibië — Etosha & Namib*: white salt pan mirages, quiver trees
(kokerbome), springbok herds, waterhole at dusk with roosting flocks. Strong local-market story.

### 11.1 Secrets per biome (launch)
| Biome | Secret | Trigger | Reward |
|---|---|---|---|
| Karoo | Windpomp | Shoot all 4 marked blades while spinning, within 8 s of the first (marks reset otherwise) | Reservoir overflows → 12-bird flush (no Whole Flock for that burst) + flocks near the reservoir flush, +100 |
| Karoo | Bakkie spare wheel | Shoot the wheel on the tailgate | Car alarm → every flock, in view or not, flushes, +25 |
| Karoo | Potjie on the fire | Shoot the lid | **+5 s bonus time** ("Kos is reg!"), once |
| Karoo | Fence-post bell | Shoot the bell (again after a 30 s cooldown) | Meerkat spotter 8 s |
| Bushveld | Baobab fruit (kremetart) | Shoot a hanging pod | Falls, startles the flock below into FLUSH, +25 |
| Bushveld | Dassie on the koppie | Shoot near (not at) it | Dassie alarm whistle: all flocks ALERT; meerkat-style reveal |
| Bushveld | Boulder crack | 3 hits | Rolls, flushes hidden birds, +75; bonus time +5 s |

Bushveld as built (M8, D-025): the twist is on in every mode — each flock has a 60 % chance
(`twist.flushAsRunChance`) of being one that keeps running when a threat would flush it; the
Vuvuzela and secrets still make it fly. The glare is drawn only (a bright band on one side of the
screen in omen hunts and the Daily). The dassie pays for a pellet that lands within 120 px of it
but not on it (pellets pass the dassie itself). The boulder counts hits over any number of shots;
its "hidden birds" are 6 that burst out flushing (no Whole Flock). Ou Grys moves hidden between
three boulders and peeks out from each for 1.2–2 s; only a peeking Ou Grys can be hit, and a hit
sends him back behind cover. Numbers live in `content/biomes/bushveld-winter.json`.

Okavango as built (M8, D-025): water channels on the mid plane are the twist — a pellet that
lands in water splashes and alerts flocks within 320 px, even from the silent Windbuks. Kuifkop
hide in the reed beds, peek out for about a second and hop in plain view to the next reed bed
(3–4 per hunt, 40 points; caught mid-hop it scores as a runner). Kuifkop Koning does the same
with 3 hits; each hit sends him into the reeds. The sun-showers (omen) come every 8–14 s for
5–9 s and muffle shots (alert radius × 0.6); a rainbow shows while it rains. The hippo pays for a
shot into the water beside it (flushes flocks within 650 px, +50). The fish eagle (−50) replaces
the crop sprayer here. Numbers live in `content/biomes/okavango-spring.json`.

Kalahari as built (M8, D-025): in omen hunts and the Daily the heat haze wobbles far birds (and
what you hit with them) until 55 % of the hunt, then the thunderstorm breaks: rain (every flock
runs, none fly) and lightning every 2.5–4.5 s. Die Stormvoël crosses the far sky, then comes back
the other way across the mid sky; he can only be hit while lightning lights him (3 hits). In
Classic he brings his own lightning; in his boss hunt the Boss Rule's lightning lights him. Every
flash from any source keeps at least ½ s from the last (≤ 2 a second), and "reduce flashes" dims
them. The weaver nest costs 10 each time you hit it (every 2 s at most) and is not a secret
found. Numbers live in `content/biomes/kalahari-summer.json`.
| Okavango | Hippo | Shoot the water beside it | Yawn + wave: flushes flocks on the bank, +50 |
| Okavango | Mokoro pole marker | Shoot the flag | **+5 s bonus time** |
| Okavango | Lily pad frog | Shoot the frog's lily | Frog leaps; +25; Bird Book easter egg |
| Kalahari | Dead camelthorn branch | Shoot the dry branch | Snaps; roosting flock bursts out, +50 |
| Kalahari | Windpomp sign | Shoot the sign | **+5 s bonus time** |
| Kalahari | Weaver nest | **Don't shoot it** | Weavers scold you, −10 (scenery joke) |

## 12. Game modes

1. **Klassieke Jag (Classic Hunt)** — 90 s, choose biome (unlocked ones), choose weapon. Pure score.
   Per-biome personal best. Rank titles (§15). The purist Moorhuhn mode.
2. **Seisoen-Jag (Season Run)** — the roguelite (§13). ~15 min. The "one more run" engine.
3. **Daaglikse Jag (Daily Hunt)** — one 90 s Classic hunt per day, same seed, biome, omen and crate
   timings for everyone (UTC day). Unlimited practice, **first attempt is the official score**.
   One-tap share card. Streaks (§15).
4. **Uitdaging (Challenge link)** — share a URL that encodes seed + mode + score: "Beat my 2 840 on
   this exact hunt." Recipient plays the identical hunt. Friend-to-friend virality without a server.
5. **Ewige Droogte (Endless)** — v1.x: after the Season Run finale, continue with escalating quotas
   for leaderboard bragging.

## 13. Season Run (roguelite) in detail

### 13.1 Structure
- 4 seasons × 3 hunts = 12 hunts of 60 s. Hunt 1 = plain; Hunt 2 = **Omen** (biome weather on);
  Hunt 3 = **Boss Hunt** (boss present + one **Boss Rule**).
- Each hunt has a **Bag Quota** (score target). Miss it → run over (Oupa's consolation + tally).
- Between hunts: **Padstal** (farm-stall shop) with charms, consumables, temporary weapons.
- After the Summer boss: victory tally, unlocks, optional Endless (v1.x).

### 13.2 Quotas (Herfs and Winter tuned in M6 on the Karoo stand-in; Lente and Somer are placeholders until M8, §13.8)
| Season | Hunt 1 | Hunt 2 (Omen) | Hunt 3 (Boss) |
|---|---|---|---|
| Herfs | 1 950 | 2 100 | 2 250 |
| Winter | 2 350 | 2 350 | 2 150 |
| Lente | 4 500 | 6 000 | 8 000 |
| Somer | 11 000 | 15 000 | 20 000 |

The curve outpaces raw skill by season 3: you need charm synergies to keep up (that's the point).
Winter's boss hunt is lower than its omen hunt because Ou Grys's rule zeroes ground shots. Until M8
every season runs on the Karoo (`run.json → biomeFallback`, logged) and the Generaal stands in as the
boss of every Boss Hunt, carrying the season's own Boss Rule (D-023).

### 13.3 Boss Rules
| Boss | Rule during the boss hunt |
|---|---|
| Generaal Tarentaal | Every miss alerts **all** flocks |
| Ou Grys | Ground shots score 0 — wing shots only (Ou Grys himself is exempt; he only peeks from cover) |
| Kuifkop Koning | Reload takes twice as long |
| Die Stormvoël | Screen is dark except during lightning flashes (photosensitivity-safe: see §18) |

Boss rules beat charms that would cancel them: Stil Loop silences a miss's own alert but not the
Generaal's "every miss alerts all flocks" (a flock the miss already alerted is not alerted twice).
Under Ou Grys, "ground" is anything not flying, and a shot that bagged only ground birds earns no Twee
Vlieë or Whole Flock either. Lightning comes every 2.5–5 s (`run.json`), never more
than 2 flashes a second.

### 13.4 Currency: Doppies (bottle caps) — in-run only
- Start a run with 4. After each hunt: +3 base, +1 per full 10 % over quota (max +5), +1 interest per
  5 unspent (max +5), +3 after boss hunts. White tarentaal drop 3. Interest counts the doppies you
  held when the hunt ended, before this hunt's payout. Missing the quota ends the run: no payout.
- Doppies never leave the run (no meta currency to grind or sell).

### 13.5 Gelukbringers (charms) — the build-crafting layer
- 5 charm slots. Charms are data (`content/charms.json`) executed by an effect interpreter (§ Tech).
- Rarity / Padstal price: Common 4 · Uncommon 6 · Rare 8 · Legendary 12. Sell for half (rounded down).
- Padstal offers 2 charms + 1 consumable + 1 temporary weapon (if unlocked). Reroll 2, +1 per reroll.
  Charm offers are weighted by rarity (`charms.json → offerWeights`), come only from the unlocked
  pool and never repeat a charm you own. A reroll redraws every offer; its price starts at 2 again
  at the next Padstal. Consumables fill 2 slots and are used from the HUD (one use each). A rented
  crate weapon (Voorlaaier, Mielie-Masjien, 5 doppies) lasts the next hunt only: you set it off from
  its own HUD slot when you choose; unused, it is gone after that hunt.
- Charm reading for the launch set (D-023): Fluitjie has no charge limit, only its 6 s cooldown;
  Haelstorm's blast uses a normal shell; Rooi Patrone = the shot fired from a full belt, Laaste
  Patroon = the shot that empties it (primary shells only, not crate weapons or Chilli Biltong);
  Konsertina counts once per shot, on streaks 10, 20 …, and refills up to the belt size; Geheime
  Resep drops the streak to the start of the tier below (or to 0 from the first tier); Boeretroos-Fles
  slows the birds in the sim (like the Boeretroos power-up), the hunt clock keeps running; Kwêvoël se
  Seën adds visits (×3 the mean); Generaal se Pot's extra shell lasts the whole run.

Launch set (24) — archetypes in brackets so synergies are deliberate:

| # | Name | Rarity | Effect | Archetype |
|---|---|---|---|---|
| 1 | Oupa se Bril (Oupa's specs) | C | Far-plane bags +15 points | Distance |
| 2 | Ekstra Bandolier | C | +2 shell capacity | Ammo |
| 3 | Snelhand (quick hands) | C | Reload 30 % faster | Ammo |
| 4 | Grondwerk (groundwork) | C | Ground bags +1 Mult | Plinker |
| 5 | Vlerkskoot (wing shot) | C | Flying bags +2 Mult | Flusher |
| 6 | Fluitjie (whistle) | C | **Replaces the Vuvuzela:** gadget button gives the nearest flock one threat (6 s cooldown instead of 20 s) — frequent nudges vs one big flush | Flusher |
| 7 | Spaarblik (savings tin) | C | Interest cap +5 | Economy |
| 8 | Rooi Patrone (red shells) | C | First shell of every belt ×2 Mult | Ammo |
| 9 | Laaste Patroon (last shell) | U | Last shell in the belt ×3 Mult | Ammo / risk |
| 10 | Stil Loop (quiet barrel) | U | Your misses no longer alert flocks | Plinker |
| 11 | Bles die Plaashond | U | Farm dog runs through every 12 s, sending one flock to RUN | Flusher |
| 12 | Konsertina | U | Every 10th consecutive bag refunds 2 shells | Frenzy |
| 13 | Hadeda-Fluit | U | Hadeda fly-over every 15 s (ALERTs everything); hadeda penalty removed | Chaos |
| 14 | Windleser (wind reader) | U | Wind no longer drifts your shots; +1 Mult during Omen hunts | Distance |
| 15 | Haelstorm | U | Every 8th shot is a Voorlaaier blast | Ammo / crowd |
| 16 | Padstal-Vriend | U | Padstal offers 1 extra charm; rerolls cost 1 less | Economy |
| 17 | Stampede-Kenner | U | Season Run hunts also get a Stampede (last 15 s ×2) | Timing |
| 18 | Hele Swerm (whole flock) | R | Whole-flock bonus ×3 | Flusher |
| 19 | Kettingreaksie (chain reaction) | R | Each Twee Vlieë gives +0.2 Mult for the rest of the hunt | Crowd |
| 20 | Oupa se Kaart (Oupa's map) | R | Secrets glow; each secret triggered +1 Mult for the rest of the hunt | Explorer |
| 21 | Boeretroos-Fles (thermos) | R | Every flush triggers 1.5 s slow-mo | Flusher |
| 22 | Kwêvoël se Seën | R | Kwêvoël appears 3× as often; while it calls, all bags ×2 (still don't shoot it) | Risk |
| 23 | Oupa se Geheime Resep | L | A miss drops Frenzy one tier instead of resetting it | Frenzy |
| 24 | Generaal se Pot | L | You wear the pot: boss hits ×5; +1 shell capacity per boss bagged this run | Boss |

Charm design rules: every charm must (a) change a decision, not just a number, or (b) be a clean
building block for an archetype. No charm may make a hunt unwinnable. New charms ship in packs of 6.

### 13.6 Unlocks (meta progression without grind)
Unlocks come from **Oupa se Notaboek** (challenges), not currency. Examples: "Bag a whole flock of
10+" → Hele Swerm enters the charm pool; "Win a Season Run with the Kettie" → Kettie gold engraving;
"Find every Karoo secret" → Karoo Bird Book page complete. Unlocks widen the pool (more variety),
never add raw power. ~60 challenges at v1.0. The M5 starter set (`content/meta/notaboek.json`) has
8, counted over all hunts unless marked per-hunt: *Bag 50 far birds* → Windbuks, *Bag the whole
flock 3 times* → Kettie (shown unlocked, playable from M8), first hunt, 25 wing shots, 2 500 in one
hunt, 200 birds, 5 crates, every Karoo secret → Bird Book page. The Plaas-Pomp unlocks at the
Plaaswerker rank.

Between hunts the run shows a hunt card (season, quota, Boss Rule), the run tally (quota met or
missed, doppies earned line by line) and the Padstal; after the last hunt or a missed quota, a
summary with the run record. Charms are reordered by dragging (Padstal and pause screen).

### 13.7 Skiet-Skuur (the shed)
Hub screen: equip weapon for Classic/Daily, view unlocked charms, Bird Book, Notaboek, cosmetics
(gun engravings, reticle styles, belt colours). It is **not** a points shop. v0 (M5): Guns
(equip, or how to unlock), Bird Book (creatures and the biome's secrets; names once seen,
"???" until then), Notaboek (progress bars and rewards), Settings. Cosmetics come later.

### 13.8 Balance tooling
A headless balance simulator plays the deterministic sim over thousands of seeds with bots:
`random`, `plinker` (never escalates on purpose; waits out alert windows), `competent` (escalates
flocks to FLUSH, leads moving targets, ~250 ms reaction, small aim error). Plinker and competent
share one player model (`tools/humanBots.ts`: 250 ms perception lag, leading from perceived
velocity, Gaussian aim error σ 10 px mouse / 26 px finger, keyboard pan speed, human shot cadence)
so their gap measures tempo, not aim. Run it with `npm run balance` (`tools/balance-sim.ts`). In Season Runs a bot's
charm policy is either `none` or `synergy` (a scripted archetype-focused picker).

`synergy` commits to the archetype of its first charm (the best on offer) and then buys only that
archetype plus economy charms; it orders +Mult charms before ×Mult ones and uses its consumables and
rental. A season's **pass rate** is the share of runs that reach the season and clear all three of its
hunts (`npm run balance -- --run`). Quotas are tuned to these pass-rate targets for the competent bot
(60 s hunts):

| Season | Charm policy `none` | Charm policy `synergy` |
|---|---|---|
| Herfs | ~85 % | ~95 % |
| Winter | ~50 % | ~80 % |
| Lente | ≤ 10 % | ~60 % |
| Somer | ~0 % | ~35 % |

Meaning: skill alone gets you through autumn; finishing the year requires a real build.

## 14. Meta: rank titles (from the Gemini spec, kept)
| Classic score | Title |
|---|---|
| 0–999 | Stadsjapie (city slicker) |
| 1 000–2 499 | Plaaswerker (farmhand) |
| 2 500–4 499 | Bosveldjagter (bushveld hunter) |
| 4 500+ | Bosveld Legend / Tarentaal-Verskrikker |

(Afrikaans compounds are written as one word: *Bosveldjagter*, *Tarentaal-Verskrikker* —
note "verskrikker", not the Dutch "verschrikker" used in the earlier draft.)

## 15. Retention and social systems
- **Daily Hunt + streak:** streak counter with one free "freeze" per week (miss a day without losing
  it). Streak milestones give cosmetics only. Rules (M7, D-024): the streak counts UTC days with an
  official (first) attempt; each missed day needs the unused freeze of **its own ISO week**
  (Monday–Sunday), so one missed day per week is forgiven, missing Sunday + Monday uses two weeks'
  freezes, and two missed days in one week (or three in a row) restart the streak at 1. Milestones
  at 3 / 7 / 30 / 100 days (`content/meta/daily.json`).
- **Share card:** generated client-side; text + emoji grid (Wordle-style) summarising the hunt:
  `🐦 Tarantal Madness · Daily #142 · 2 840 · Bosveldjagter · 🟩🟩🟨🟩⬛ · 2× hele swerm` plus a link.
  The grid cuts the hunt into five equal parts; each square is that part's accuracy (shots that
  bagged a target ÷ shots): 🟩 ≥ 60 %, 🟨 ≥ 30 %, ⬛ below or no shots. Classic shares the same line
  with `Classic · Karoo` in place of the daily number; the link is a challenge to the same hunt.
  The original Moorhuhn spread virally because the whole game was ~2 MB and could be emailed;
  a link that opens the same hunt in a browser is the 2026 equivalent.
- **Challenge links** (§12.4).
- **Weekly seeded Season Run** (v1.x) with a leaderboard once replay validation exists.
- **Bird Book completion**, **Notaboek challenges**, **rank titles**, **per-biome bests**.

## 16. First-time user experience (the first three minutes decide everything)
Portal players decide in minutes. Script:
1. Title loads ≤ 3 s; one giant **START HUNT** (no login, no settings, no story wall).
2. First hunt is "Oupa se Les" (60 s Karoo, slower pacing): a foraging flock is already in view.
   Pulsing hand/cursor icon + 1-line prompt "Tap to shoot" / "Click to shoot". Generous first hit.
3. When the player fires twice in quick succession near the flock it RUNS — banner "They run! Hit
   them on the move: +0.5 Mult". (If the player is slow, Oupa's dog Bles trots in at 20 s and
   spooks them, so every player sees it.)
4. First empty belt: big RELOAD prompt with gesture hint (flick down / right-click).
5. ~30 s: a flock FLUSHES — banner "Wing shot ×2!".
6. ~40 s: windpomp blades glint — "Hmm, Oupa's windpomp…" (secret hint).
7. Tally → rank stamp → two buttons: **[Again]** (default focus) and **[Season Run]**.
Never more than one line of text on screen during play. Skippable. Telemetry on every step.
Implementation (M5): mode `ftue` in `modes.json` — 0.6× fly-over/pop-up rates, +40 px hit radius
until the first bag, no Stampede, crates or boss; the Bles spook and the forced flush are beats at
1/3 and 1/2 of the hunt (fractions, so short test hunts keep them) and the windpomp hint at 0.67.
Bles is skipped if the player already made a flock run. A new player's title shows only START
HUNT; after the lesson (or Skip, which returns to the title) START plays Classic. [Season Run]
on the tally stays locked until M6.

## 17. Game feel ("juice") spec
| Moment | Feedback |
|---|---|
| Fire | Muzzle flash 1 frame (a local sprite at the barrel — never a full-screen brighten), gun kick tween, camera shake (dubbelloop 4 px / 90 ms), shell ejects |
| Bag | Feather burst (12–20 particles, palette-tinted), "POOF!" onomatopoeia, score pop `10 ×2` → `+20` rising 60 px / 600 ms, hit-stop 20 ms (35–50 ms for Twee Vlieë) |
| Flush | Synchronised "KEK-KEK-KEK!" bubble, wing-blur, short music sting |
| Frenzy tier up | HUD meter punch-scale, colour shift, Oupa bark (max one bark per 6 s) |
| Whole flock | 0.4 s slow-mo 0.3×, stamp "DIE HELE SWERM!" |
| Penalty | Record-scratch SFX, red score drop, offended creature reaction |
| Stampede | Tempo up, sky tint shifts, ground-shake rumble, ×2 banner |
| Tally | Count-up ticks, per-line stamps, rank badge thud |
Onomatopoeia bubbles (KEK-KEK!, POOF!, KLAP!, CLANG!, BZZZT!) are part of the art style **and** an
accessibility feature (visual captions for important sounds).

## 18. Controls and accessibility

### 18.1 Desktop
Mouse aim · Left click fire · Right click / Space reload · A/D, ←/→ or cursor in the outer 12 % of
the screen to pan · Q vuvuzela · E consumable · Esc pause.

### 18.2 Mobile (landscape)
- **Tap** = fire at the finger (contact < 180 ms and < 12 px movement).
- **Horizontal drag** = pan with inertia (any drag that isn't a tap).
- **Flick down** anywhere (fast vertical swipe ≥ 60 px in < 200 ms) **or tap the shell belt** = reload.
- Gadget + consumable buttons bottom-left (mirror option for left-handers).
- **Touch aim assist:** hit radius bonus near 8 px, mid 14 px, far 18 px (design px). Mouse: 0.
- Optional **"Kyk rond" (look around) tilt mode:** turn the phone to pan (DeviceOrientation; iOS asks
  permission after a tap). Novel, physical, and great in videos — opt-in only.
- Optional **offset reticle**: reticle sits 70 px above the finger for precision players.
- Portrait: show an animated "draai jou foon" (turn your phone) card with a spinning tarentaal.

### 18.3 Accessibility checklist
Reduce screen shake & flashes toggle (any full-screen or large-area flash — lightning, Voorlaaier
blast, Stampede tint pulses — is rate-limited to no more than 3 per second regardless, per WCAG 2.3.1;
muzzle flashes are small local sprites, and the Mielie-Masjien uses a steady glow, not per-shot flashes), colour-blind-safe signals (penalty creatures distinguished by shape + icon,
never colour alone), captions/onomatopoeia for key sounds, hold-to-fire option, adjustable aim
assist, left-handed layout, text size, full keyboard menus, pause anywhere.
M5 Settings: master / SFX / music volume, screen shake (follows reduced motion until set), reduce
flashes (dims the muzzle flash and glints, no red belt flash), touch aim assist (Off / Low 50 % /
Standard; recorded in the replay), left-handed (belt left, Vuvuzela right, gun centre-left),
language (Auto / English / Afrikaans) and quality (Auto / Low / Medium / High). Menus work with
↑/↓/Tab, ←/→, Enter/Space and Esc; Esc or P pauses a hunt, touch players have a pause button.
Text size and captions remain for M9.

## 19. Monetisation and ethics guardrails
- **Web portals (launch):** free; portal ads only at natural breaks (between hunts/runs), never during
  a hunt. Rewarded ads optional: "Oupa se tweede kans" (retry a failed Season Run hunt once per run),
  "double Doppies" after a hunt. Daily Hunt has no ad boosts (fair leaderboard).
- **Premium (Steam / Switch / app stores, later):** one-time price, no ads, includes biome packs.
  (Reference point: the official Moorhuhn 2 console/Steam re-release launched at $7.99 in 2025.)
- **Never:** loot boxes or paid random rewards, paid currency, energy timers, pay-to-skip quotas,
  dark-pattern streak guilt, FOMO countdown shops.

## 20. Content rating and sensitivity
- Cartoon slapstick; no blood; birds "POOF" and tumble.
- Hunting framed as a comedic farm caper; protected birds are penalties (a gentle conservation
  wink). Guineafowl are a common game bird in South Africa — this is a real rural pastime rendered
  as cartoon chaos.
- No real firearm brands, no modern military weapons, no humans as targets, no real-brand logos
  (fictional windpomp and bakkie badges — see art bible).
- Do not use "Moorhuhn" or "Crazy Chicken" in store copy or ads: both are registered trademarks
  (ak tronic Software & Services). "Inspired by classic shooting-gallery games" is fine.

## 21. Scope

| Tier | Contents |
|---|---|
| **MVP / vertical slice** (portal soft-launch candidate) | Classic + Daily in Karoo Autumn; Dubbelloop; Vuvuzela; full flock AI; 3 planes; 4 Karoo secrets; Kwêvoël + crop sprayer penalties; Generaal boss appearance; supply crates with all 4 power-ups + Voorlaaier + Mielie-Masjien; share card + challenge links; save, ranks, Bird Book v0; EN + AF strings; PWA; Poki/CrazyGames adapter |
| **v1.0** | All 4 biomes + omens; Season Run with 24 charms, 4 bosses, Padstal; Windbuks, Kettie, Pomp; Notaboek (~60 challenges); full Bird Book; DE + NL localisation; final art & audio |
| **v1.x** | Namibië biome pack; leaderboards with replay validation; weekly seeded run; Endless; ghost replays of top runs; charm pack 2; gamepad; Capacitor app builds; Steam build |

## 22. KPIs to instrument (targets are hypotheses to calibrate after soft launch)
FTUE step completion · time to first shot (< 3 s) · hunts per session (≥ 3) · % who start a 2nd hunt
(≥ 70 %) · Season Run hunt-2 reach rate · D1 / D7 retention · Daily participation & streak length ·
share-button rate · challenge-link conversion · crash/error rate · average FPS by device tier.

## Appendix A — Afrikaans glossary (for UI, barks and content ids)
Oupa (grandpa) · tarentaal (guineafowl; SA English also spells it *tarantal*) · swerm (flock) ·
skoot (shot) · haelgeweer (shotgun; *hael* = birdshot / hail) · dubbelloop (double-barrel) ·
windbuks (air rifle) · kettie (slingshot) · voorlaaier (muzzle-loader) · mielie (maize) ·
doppie (bottle cap) · padstal (farm stall) · bakkie (pickup) · windpomp (wind pump) ·
potjie (three-legged pot) · boeretroos (coffee) · biltong (dried meat) · kwêvoël (go-away-bird) ·
stofduiwel (dust devil) · donderstorm (thunderstorm) · herfs/winter/lente/somer (seasons) ·
gelukbringer (lucky charm) · notaboek (notebook) · voëlboek (bird book) · Mooi skoot! (nice shot) ·
Ag nee man! (oh no, man) · Jinne! (gosh) · Lekker! (great) · Kos is reg! (food's ready).
Have a native speaker review every player-facing string before launch.
