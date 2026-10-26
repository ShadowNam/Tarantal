# Changelog

All notable changes to Tarantal Madness. Versions follow [Semantic Versioning](https://semver.org).
Decision records for each milestone are in `docs/05-DECISIONS-AND-RESEARCH.md` (D-017 … D-028).

## [1.7.3] — Feesdae: the Halloween Spookjag Daily (31 Oct 2026)

Decision record D-048. On a special day (UTC) the Daily Hunt becomes that day's special for
everyone. Halloween, 31 Oct, is the first: the Spookjag.

### Added
- **Feesdae**, special days as content (`content/feesdae.json`): a date, the day's map under the
  special's light, one twist rule, decorations, Oupa's lines, a sting and a share-card frame.
- **Spookjag (31 Oct)**: a dark, cool dusk Daily (its own grade) under a big low moon. Bats are a fast, erratic bonus target
  (+15, with the Frenzy multiplier like every bonus); the spotted eagle-owl is protected (−10, a
  hoot and Oupa's scold); shoot every carved pumpkin lantern of the day — on the reservoir rim,
  rocks and fence posts — for **Lanterns out!** (+25, once). Some guineafowl wear witch hats.
- The title's Daily button shows the special's name and a badge ("Spookjag tonight!"); the tally
  and the share card get a Halloween frame and the title "Spookjag 2026".

### Changed
- Replays are InputLog v6 (they carry the special day); older logs still play.
- Content JSON ships without its `$comment` notes (about 9 KB less to download first).
- Sizes: first download 3,070.8 KB (web), 3,064.1 KB (Poki), 3,064.2 KB (CrazyGames); the
  Halloween art, sounds and Oupa's Halloween lines (about 320 KB) download only for the special
  day's hunt.

## [1.7.2] — fruit swing and drop when shot (26 Oct 2026)

Decision record D-047. Rendering only: the sim, the content it reads and the golden replays are
unchanged, so replays from 1.7.1 stay valid.

### Added
- **Fruit react to shots.** Hit a hanging fruit and it swings on its stalk; a near miss swings it
  a little. Hit it hard (three pellets) or again while it still swings and it snaps off, falls,
  bounces once or twice with a puff of dust, rolls and lies there for the rest of the hunt.
  Fruit on the ground rock and roll a little. Sausages and ilala clusters in the Okavango, baobab
  pods and marula fruit in the Bushveld, sweet-thorn pods in the Karoo, camelthorn pods in the
  Kalahari and Namibië, quiver-tree flowers and !nara melons in Namibië.
- A soft thock on a hit and a thud on landing. Reduce motion: smaller swings, no bounce.
- Fruit are not targets: no score, no penalty, and they never take a shot from a bird.

- Each fruit is drawn in detail: mottled, curved sausages with pale dots on rope stalks, velvety
  baobab pods, warty !nara melons, glossy ilala bunches, seeded pods and quiver-tree racemes. A
  dropped fruit leaves its stalk on the tree, lands to the side it swung, clear of the trunk, with
  a soft shadow under it.

### Changed
- The interim tree and prop art no longer has those fruit drawn in; they are sprites in a small
  sheet per biome (in the biome's download, or the late group for the Karoo and Kalahari).

## [1.7.1] — power-ups explained, and an Oupa switch (25 Oct 2026)

Decision record D-046. What the power-ups do and their numbers are unchanged. A crate's contents
are now rolled when it drops (so it can show them). The content hash is unchanged, so 1.7.0
replays, challenge links and the Daily's seeds still load; but a 1.7.0 hunt that left a crate
unshot gives its later crates different items when replayed now, so its events (and possibly its
score) differ. The golden replays were re-recorded: 36 of 37 keep their score.

### Added
- **Icons** for every power-up and crate gun: Chilli Biltong, Boeretroos, Bush Buckshot, Meerkat
  Spotter, Blitslaai, Oupa Laai, the Voorlaaier and the Mielie-Masjien.
- **Gun Shed → Power-ups**: a card for each one with its icon, what it does (numbers from the
  game's content), how to get it and a tip; ones not found yet are darker but still explained.
- **In the hunt:** a falling crate shows what it holds; picking something up shows a short card
  (the full explanation and a word from Oupa the first time); chips count down the seconds or
  shells left, blink at the end and chime when they run out; Boeretroos warms the screen's edges
  and slows the sound, Chilli Biltong shows ∞ on the belt and sparks at the muzzle, Bush Buckshot
  rings the crosshair; captions name the item; the tally lists the power-ups used.
- **Settings → Oupa's comments: On / Text only / Off.** Off silences his bubbles and voice
  everywhere; instructions still show. Also in the pause menu's Settings.

### Changed
- The Padstal shows what every item does, with its numbers.
- The "CRATE: …" banner gave way to the pickup card.

## [1.7.0] — meerkat colonies on the desert maps (25 Oct 2026)

Decision record D-044. The desert content changed (the colonies, and the crop sprayer over
Namibië), so replays from 1.6.1 are refused (new content hash) and the golden replays were
re-recorded: only the 7 desert cases changed their events.

### Added
- **Meerkat colonies** on every Kalahari and Namibië map, near and mid: 3–5 burrows on sand
  mounds and a family of 4–8, sometimes with a pup. They peek, keep a sentinel on the highest
  mound, dig, sunbathe at dawn, dash between burrows and dive.
- **They react:** a nearby shot or the Langloop sends them down (they come back a head at a
  time); a raptor or the crop sprayer overhead sets off the sentinel's alarm, which also alerts
  the nearest guineafowl flock.
- **Don't shoot them:** a shot meerkat is never hurt. It tumbles into a hole and scolds ("We're
  not guineafowl!"), for −10, at most once every 2 s per colony.
- **Familiefoto**, a new secret: hold your fire with a whole family out on screen and they line up
  for a photo (+25). It is in the Bird Book and the Notaboek.
- The Meerkat Spotter climbs out of a burrow on the desert maps.
- Interim art (a furry, rigged sheet drawn at 2×) and sounds (chirps, the alarm bark, digging,
  the camera click), in their own lazy download with either desert map. Voiced lines in
  English, Afrikaans and German; text in en/af/de/nl.

### Changed
- Oom Faan's crop sprayer sometimes crosses the Namibië sky too.
- The Kalahari's interim near, foreground and mid layers use smaller palettes, so a Kalahari hunt
  (its chunk plus the desert chunk) stays within 1.5 MB.

## [1.6.1] — reload power-ups (25 Oct 2026)

Decision record D-043. The crate weights changed, so replays from 1.6.0 are refused (new content
hash) and the golden replays were re-recorded.

### Added
- **Blitslaai** (Lightning Load): for 12 s every reload runs at 35 % of its time, with lightning
  glints on the belt and a quick zip.
- **Oupa Laai** (Oupa Loads): for 12 s an empty gun reloads by itself and per-shell guns top up
  after 0.6 s without a shot; Oupa's hand sits by the belt and he says so. A shot always cuts an
  auto reload.
- Both are in the crates and the Padstal (price 2), with icons on their HUD chips and voiced
  lines in English, Afrikaans and German.

## [1.6.0] — veld art pass (25 Oct 2026)

Decision record D-042. Rendering and loading only: the sim, the content hash, the Daily seeds and
every replay are unchanged.

### Added
- Every map's trees, shrubs, grass and fruit redrawn to the camelthorn's standard: sweet thorns,
  renosterbos and ganna (Karoo); baobab, marula and mopane (Bushveld); sausage tree,
  jackalberry, ilala palms, papyrus and water lilies (Okavango); shepherd's trees, camelthorn
  pods and Bushman grass (Kalahari); quiver trees in flower and !nara melons (Namibië).
- Distant animals with real anatomy and poses (giraffes with calves, springbok, gemsbok, zebra,
  wildebeest, elephants, lechwe, ostriches), crisp through a rifle scope.
- The windpomp's wheel turns with the wind and spins; a dassie and weathered granite; a dead
  camelthorn; soft drifting clouds.
- A small build stamp (version, commit, build time, area, day, art status) on every map.

### Fixed
- A hunt or the Skietbaan never starts on placeholder art (a slow or stale asset index); a new
  deploy offers a reload.
- The scope never shows the placeholder sight picture.

## [1.0.1] — cleanup (22 Oct 2026)

Cleanup after the soft launch build (decision record D-028). Gameplay, the sim and the content
hash are unchanged: every 1.0.0 replay, Daily seed and challenge link stays valid.

### Added
- **Oupa's barks:** 39 short lines in his EN/AF voice react to the hunt (streaks, misses, wrong
  birds, the Stampede, bosses, the quota, idling, the first hunt of the day) and to the tally, at
  most one every 6 s. Text bubbles now (en, af, de, nl); each line has a voice key for the
  recording.
- Capture mode (`?capture=1`) shows a short "S slow · F freeze · C pan" hint, then fades it out
  before any footage.

### Fixed
- `?e2e` on the public web build no longer gives fresh official Daily attempts, share cards or
  challenge links: it plays unranked like capture mode. Only CI test builds (`VITE_TEST_HOOKS=1`)
  record official Dailies under `?e2e`, and `npm run release` refuses to build with that flag.
- The Daily epoch (Daily #1) is one value in `content/meta/daily.json`: `content:validate` fails on
  a copy in code or tests, and `npm run release` warns (`--strict` fails) while it is still the
  placeholder or far from the build date.

### Performance
- Score pops and "POOF!" no longer create a canvas text per kill: pooled BitmapText pops from a
  glyph atlas built at start-up. At 4× CPU throttle a pop costs 0.6 ms on its kill frame instead
  of 6 ms.

### Balance
- Charm balance checked at 1 000 seeded Season Runs per charm policy: every season's pass rate
  is within ±10 points of the design targets, and charm Mult already compounds. No numbers
  changed.

## [1.0.0] — soft launch build (21 Oct 2026)

The first release for the Poki and CrazyGames soft launch and the web PWA. Gameplay is complete;
**art and audio are still procedural placeholders and synth sounds**. The swap path for
human-made art and recordings is built and tested (see "Known gaps").

### The game
- **Classic** (M2–M4): 90-second hunts on the Karoo farm. Pan across a six-layer panorama and
  shoot at three depths: near pop-ups, mid and far. Score pops, Frenzy tiers, wing shots, Twee
  Vlieë and the Stampede.
- **The Flock** (M3): helmeted guineafowl flocks forage, raise the alarm, run and flush, with
  whole-flock bonuses and slow-mo.
- **Biomes** (M4, M8): Karoo (autumn), Bushveld (winter), Okavango (spring) and Kalahari (summer),
  each with its own omen and weather, secrets, props and boss.
- **Arsenal** (M8): dubbelloop, Kettie, Plaas-Pomp, Windbuks, plus crate weapons (Voorlaaier,
  Mielie-Masjien), power-ups and the Vuvuzela.
- **Meta** (M5): Skiet-Skuur loadout, Bird Book, Notaboek goals, ranks and bests, saved on the
  device. FTUE "Oupa se Les".
- **Season Run** (M6, M8): a 12-hunt roguelite through four seasons, with charms, the Padstal shop,
  Boss Rules, quotas and save/resume.
- **Daily Hunt** (M7): one seeded hunt a day with a streak and freeze, a share card and challenge
  links.
- **Platforms** (M9): web PWA plus Poki and CrazyGames builds behind one `PlatformAdapter`. Ads
  only between hunts, rewarded offers in the Season Run, a privacy screen, and error reports
  kept on the device.
- **Performance** (M9): quality tiers with a title benchmark, render scale, lazy biome bundles,
  and a first download of 0.55 MB gzip.
- **Accessibility** (M9): reduce flashes, screen shake toggle, large text, high contrast, sound
  captions, colour-blind marks, hold to fire, left-handed layout, full keyboard menus, and touch
  aim assist that rescues near misses.
- **Languages** (M9): English, Afrikaans, German, Dutch.

### M10 — final art and audio integration
- **Asset pipeline:** `npm run assets:pack` turns `art-source/` into `public/assets/` and
  `asset-index.json`: PNG sprites, layer tiles, @1x/@2x multi-page bird atlases with the §3.4
  clips, and loudness-normalised Ogg + MP3. Any key with a delivered file uses it; every other
  key keeps its placeholder, with no code change. The artist spec is in
  `docs/06-ASSET-DELIVERY.md`.
- **Asset audit:** `npm run assets:audit` lists every key (final or placeholder, size, where it's
  used). `--strict` is the launch gate.
- **Audio:** recorded files with synth fallback; per-biome music stems (calm / build / stampede)
  crossfaded by intensity, ambience loops, Oupa's barks with music ducking, and a new **Voice**
  volume slider.
- **Juice pass:** tally ticks and the rank stamp thud, the Stampede's sky tint and ground rumble,
  all juice numbers in `content/client/feel.json`, and a shared budget of at most 3 large flashes
  a second.
- **Capture mode** for trailers: `?capture=1` (no HUD, fixed seed; S slow-mo, F freeze, C pan).
  Not in portal builds.
- **Fonts:** self-hosted Baloo 2 and Bangers (OFL), subset to the four languages.
- **Visual regression** baselines for 7 screens on desktop and Pixel 7.
- **Portal kit:** `npm run portal:shots` (covers, thumbnails, screenshots) and
  `docs/07-PORTAL-SUBMISSION.md` (store text in four languages, per-portal checklists).
- **Release:** `npm run release` (three builds, size check, audit report, zips in `release/`).
  The version is shown in Settings → Privacy.

### Known gaps (need a person)
- Human-made art, animation and recorded audio: delivery per `docs/06-ASSET-DELIVERY.md`, then
  `npm run assets:audit -- --strict` and new visual baselines.
- Poki's animated thumbnail and CrazyGames' preview videos (record from `?capture=1`).
- Real-device checks (low-end Android, iPhone), native-speaker review of af/de/nl, a legal check
  of the privacy text, the portal accounts, and the submissions themselves.
