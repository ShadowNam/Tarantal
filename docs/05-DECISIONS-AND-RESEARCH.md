# Tarantal Madness — Decisions & Research Log

Append new decisions at the bottom (`D-0xx`). Never rewrite history; supersede instead.

## 1. What changed from the Gemini spec, and why

| Gemini spec | Decision | Reason |
|---|---|---|
| Phaser 3 (v3.80+) | **Phaser 4** (≥ 4.2.1) | Phaser 4.0.0 shipped 10 Apr 2026 (rebuilt renderer, Filters, GPU layers, built-in AI-agent skills); 4.2.1 is current on phaser.io; Spine's v4 runtime needs ≥ 4.2.1 |
| 1920×1080 fixed, `Scale.FIT` | Design **height** 1080, flexible width 4:3–21:9 with a viewport-independent camera | Modern phones are ~19.5:9; FIT letterboxes them. Portals want full-screen coverage on mobile; tablets are 4:3 |
| Phaser-coupled game logic | **Deterministic pure-TS sim core** | Enables daily seeds, replays, golden tests, balance bots, server-validated leaderboards, future renderer swaps and mods |
| "Tarantal" random flyers | **Flock behaviour** as the signature mechanic | Real guineafowl run in flocks and flush only when pressed — gives a skill layer Moorhuhn lacks and makes the setting matter |
| Single 90 s mode | Classic **+ Season Run roguelite + Daily Hunt + challenge links** | Retention: run-based build-crafting ("one more run") + shared daily seed and frictionless sharing |
| 13+ weapons | **4 launch weapons + Vuvuzela + 2 crate weapons**; rest parked | Each weapon must change how you treat the flock; fewer, deeper tools |
| Loadout shop paid with points | Shed = loadout/collection; **unlocks from challenges** | Avoids grind and pay-to-skip pressure; Balatro-style "widen the pool, not the power" |
| Generaal as armoured hulk (one image) | **Pot-helmet bird** on the shared rig | Readability as a bird, cheaper (skin on one rig), matches 3 of 4 images |
| Over-and-under default gun | **Side-by-side Dubbelloop** | Matches every gameplay mock-up; reads better first-person |
| Okavango jacarandas, Karoo baobabs/giraffes, hanging weaver balls | **Biome-accurate flora/fauna** | Authenticity is a pillar; locals will notice. Jacaranda is a South American listed invader |
| Season order Summer→Spring | Run order **Herfs → Winter → Lente → Somer** | Follows the South African guineafowl hunting season (historically ~April–July) and ends on the summer storm finale |
| "Climax" windmill, real-looking bakkie | Fictional badges | Trademark hygiene |
| "Tarentaal Verschrikker" | "Tarentaal-Verskrikker" | Afrikaans spelling (sk, not sch) |

Kept as-is: name *Tarantal Madness*; 90 s Classic; 8-shell belt; 5/10/25 distance scoring; parallax
panning; 4 seasons/biomes; Kettie ×2 / Windbuks ×1.5 identities; Chilli Biltong, Boeretroos,
Bush Buckshot, Meerkat Spotter; Kwêvoël penalty; windpomp & spare-wheel secrets; Bakkie Tally;
rank titles; procedural placeholder assets first; asset manifest for hot-swapping art.

## 2. Decision records

**D-001 Engine:** Phaser 4 + TypeScript + Vite. Alternatives (PixiJS, Godot web, Unity WebGL,
Construct/GameMaker) rejected — see Tech §1.
**D-002 Sim/render split** with fixed 60 Hz deterministic core; transcendental math via `detmath`.
**D-003 Data-driven content** (JSON + Zod); `contentHash` gates leaderboards; mods data-only in v1.
**D-004 Landscape only** in v1 with a rotate card in portrait. Risk: portal portrait traffic — revisit
after Poki/CrazyGames tests (a portrait "tall sky" layout is possible later).
**D-005 Mobile input:** tap = fire at finger, horizontal drag = pan, flick-down / belt tap = reload;
optional tilt-to-look; touch aim assist by plane.
**D-006 No element fullscreen on iPhone:** PWA + Add-to-Home-Screen banner instead.
**D-007 Monetisation:** portal ads only between hunts + optional rewarded; premium wrapper builds later;
no loot boxes, no paid currency, no energy.
**D-008 Art direction B (inked comic) locked;** AI images are reference only; final assets human-
authored with sources kept.
**D-009 Spine** recommended for character animation (skins for variants/bosses); frame-by-frame fallback.
**D-010 Budget:** first playable ≤ 5 MB compressed (Poki target < 8 MB); lazy-load other biomes.
**D-011 Name:** keep *Tarantal Madness*. "Tarantal" is an attested South African English spelling of
*tarentaal*; use *Tarentaal* in Afrikaans in-game text. International players may misread it as
"tarantula" — use a subtitle in stores ("Guineafowl Mayhem in the African Bush"). Run a proper
trademark search before launch (a quick web search found no game with this name; that is not a
clearance).
**D-012 Viewport-independent sim:** fire commands carry `dx` from screen centre; camera range and
layer geometry use a fixed 1920 reference + 300 px bleed (Tech §3.3); `inputKind` is part of
`SimConfig` and the replay. Found in internal review: otherwise Daily/replays differ per device.
**D-013 Flock tempo rule:** one threat per shot per flock, 1.5 s escalation window, window expiry
calms ALERT → FORAGE. Makes patient plinking and fast escalation both valid styles.
**D-014 Charm order matters:** charms apply left → right (add then multiply in sequence), system
multipliers last — Balatro-style ordering decisions.
**D-015 Single Stampede source + fractional windows:** `scoring.json → stampede.lastSeconds`; all
content windows are fractions of hunt length so 60 s and 90 s hunts share biome data.
**D-016 Build order:** crate weapons move to M4; M6 runs all seasons on a Karoo stand-in until M8.

## 3. Research notes (with sources)

**Moorhuhn / Crazy Chicken**
- Began as a Johnnie Walker advergame (1998–99) by Art Department and Witan; went viral partly
  because the ~2 MB game could be emailed. Registered trademarks now held by ak tronic Software &
  Services; 2025 remasters by Higgs Games (Moorhuhn 2 at $7.99, rated E10+).
- Core: 90 s rounds; points by distance (farthest birds 25); hidden secret targets, bonus-time
  objects, penalty targets (planes, zeppelins); late-round hits worth more in Moorhuhn 2.
- Sources: [Wikipedia — Crazy Chicken](https://en.wikipedia.org/wiki/Crazy_Chicken) ·
  [Giant Bomb — The Original Moorhuhn Hunt](https://giantbomb.com/wiki/Games/The_Original_Moorhuhn_Hunt) ·
  [Steam — Moorhuhn 2](https://store.steampowered.com/sub/1187934) ·
  [Nintendo — Moorhuhn 2](https://www.nintendo.com/games/detail/moorhuhn-2-switch) ·
  [Deku Deals — Moorhuhn 2](https://www.dekudeals.com/items/moorhuhn-2) ·
  [Home of the Underdogs — Moorhuhn Jagd 2](https://www.homeoftheunderdogs.net/game.php?id=2112)

**Helmeted guineafowl behaviour**
- Gregarious; flocks of ~25 outside breeding (6–20 commonly seen); terrestrial; prefer to run rather
  than fly when alarmed; when pressed burst from cover in steep flight with "kek-kek" alarm calls;
  roost communally in trees. Afrikaans: *Gewone Tarentaal*; crested guineafowl: *Kuifkoptarentaal*.
  DSAE lists *tarantal* as a South African English variant spelling; historical hunting season
  April–July.
- Sources: [Wikipedia — Helmeted guineafowl](https://en.wikipedia.org/wiki/Helmeted_guinea_fowl) ·
  [NZ Birds Online — Helmeted guineafowl](https://nzbirdsonline.org.nz/species/helmeted-guineafowl) ·
  [DSAE — tarentaal](https://dsae.co.za/entry/tarentaal/e07080) ·
  [Roberts VII names (UCT)](https://science.uct.ac.za/media/197450)

**Engine & platforms**
- Phaser 4: [v4.0.0 release](https://github.com/phaserjs/phaser/releases/tag/v4.0.0) ·
  [Phaser 4 releases list](https://phaser.io/download/phaser4) ·
  [spine-phaser-v4 + Mesh2D](https://esotericsoftware.com/blog/phaser-mesh2d-in-spine-phaser-v4)
- Godot/Unity web trade-offs: [Godot web export docs](https://docs.godotengine.org/en/stable//tutorials/export/exporting_for_web.html) ·
  [Godot vs Unity for web (2026)](https://app.cinevva.com/guides/godot-vs-unity-web-games)
- Portals: [Poki requirements](https://sdk.poki.com/new-requirements) ·
  [CrazyGames technical requirements](https://docs.crazygames.com/requirements/technical) ·
  [How to get on Poki (2026 guide)](https://app.cinevva.com/guides/publish-game-poki) ·
  [Portal size budgets overview](https://www.summerengine.com/make-great-games/publish-an-html5-game)
- iPhone fullscreen: [WebKit bug 206854](https://www2.webkit.org/show_bug.cgi?id=206854) ·
  [Apple Developer Forums thread](https://developer.apple.com/forums/thread/133248?page=2)
- DeviceOrientation permission on iOS: [OpenReplay guide](https://blog.openreplay.com/understanding-device-orientation-api/)

**Design references**
- Balatro as the model for "one more run" build-crafting and ethical (no microtransaction) compulsion:
  [Mechanics of Magic critical play](https://mechanicsofmagic.com/2026/05/22/critical-play-on-games-of-chance-and-addiction-balatro/)
- Game feel: Jan Willem Nijman, "The Art of Screenshake" (2013); Jonasson & Purho, "Juice it or lose
  it" (2012) — classic talks on feedback/juice.

**Legal**
- AI-generated assets and copyright / platform disclosure:
  [Promise Legal — AI game assets 2026](https://blog.promise.legal/ai-game-assets-copyright-steam-disclosure-2026/) ·
  [Perkins Coie — AI visual content in games](https://legacy.perkinscoie.com/insights/article/copyright-ai-generated-visual-content-video-games)
- Jacaranda invasive status: [Wikipedia](https://en.wikipedia.org/wiki/Jacaranda_mimosifolia) ·
  [Stellenbosch Botanical Garden](https://sun.gardenexplorer.org/taxon-1837.aspx)

**Claude Code practice** (applied in `CLAUDE.md`, `.claude/`):
[Memory & CLAUDE.md](https://code.claude.com/docs/en/memory) ·
[Best practices](https://code.claude.com/docs/en/best-practices) — CLAUDE.md under ~200 lines,
path-scoped rules in `.claude/rules/`, skills for repeatable workflows, a fresh-context reviewer
subagent, verification Claude can run itself, plan mode for multi-file work.

## 4. Open questions for the product owner
1. Portrait support in v1? (Default: no.)
2. Primary launch market and languages beyond EN/AF/DE/NL?
3. Budget for a human illustrator, animator, voice actor and composer (art bible §9–10)?
4. Which portal first: Poki (curated, strict size) or CrazyGames (open basic launch)?
5. Keep the hunting framing for all markets, or offer a "camera safari" reskin for sensitive markets?
