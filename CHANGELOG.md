# Changelog

All notable changes to Tarantal Madness. Versions follow [Semantic Versioning](https://semver.org).
Decision records for each milestone are in `docs/05-DECISIONS-AND-RESEARCH.md` (D-017 … D-028).

## [1.0.1] — unreleased

Cleanup after the soft launch build (decision record D-028).

### Fixed
- `?e2e` on the public web build no longer gives fresh official Daily attempts, share cards or
  challenge links: it plays unranked like capture mode. Only CI test builds (`VITE_TEST_HOOKS=1`)
  record official Dailies under `?e2e`.
- The Daily epoch (Daily #1) is one value in `content/meta/daily.json`: `content:validate` fails on
  a copy in code, and `npm run release` warns (`--strict` fails) while it is still the placeholder.

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
