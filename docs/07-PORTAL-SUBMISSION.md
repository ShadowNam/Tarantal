# Tarantal Madness — Portal Submission Kit

Status: v1.0.0 soft launch · 21 Oct 2026. **For the person who submits.** Nothing in this repo
uploads or submits anything: every step marked ☐ is done by hand in the portal's own tool.

Requirements below are as each portal documented them on 21 Oct 2026 (sources at the end); check
the upload form again on the day, because portals change their rules.

## 1. Builds and files

| Portal | Build | Upload folder | Zip (from `npm run release`) |
|---|---|---|---|
| Poki | `npm run build:poki` | `dist-poki/` (its contents, `index.html` at the root) | `release/tarantal-madness-1.0.0-poki.zip` |
| CrazyGames | `npm run build:crazygames` | `dist-crazygames/` | `release/tarantal-madness-1.0.0-crazygames.zip` |
| Web (own site, PWA) | `npm run build` | `dist/` (GitHub Pages workflow deploys `main`) | `release/tarantal-madness-1.0.0-web.zip` |

- Portal builds carry no service worker, no PWA manifest and no test hooks. Capture mode is
  compiled out too (D-026, D-027).
- `npm run release` builds all three, runs the size check (`--strict`) and the asset audit
  (report), and writes the zips. The size report is `release/size-<platform>.txt`.
- Store images: `npm run portal:shots` → `release/portal-assets/` (covers, thumbnails,
  screenshots; capture mode, seed 42). **Re-render after the art swap**: today's images show the
  placeholder art.
- Trailer and GIF capture: open the web build with `?capture=1` (no HUD or reticle, seed 42).
  **S** cycles slow motion (1 → ½ → ¼), **F** freezes, **C** pans the camera; add `&gun=0` to
  hide the gun. Record the screen with your own recorder.

## 2. Store text

**Title:** Tarantal Madness

### Short description (≤ 150 characters)
- **en:** Pan across the African veld and outsmart a flock of helmeted guineafowl that forages, panics, runs and flushes. Quick, loud, comic shooting.
- **af:** Swaai oor die veld en oorlê 'n swerm tarentale wat wei, skrik, hardloop en opvlieg. Vinnige, lawaaierige, komiese skietpret.
- **de:** Schwenke über das afrikanische Veld und überliste einen Schwarm Perlhühner, der pickt, erschrickt, rennt und auffliegt. Schnell, laut, komisch.
- **nl:** Zwenk over de Afrikaanse veld en sla een zwerm parelhoenders te slim af die scharrelt, schrikt, rent en opvliegt. Snel, luid en komisch.

### Long description
**en**
> Tarantal Madness is a fast, comic shooting gallery set on a Southern African farm. Pan across a
> wide hand-drawn panorama and take on the helmeted guineafowl — the tarentaal — in flocks that
> behave like the real thing: they forage, raise the alarm, run for cover and burst into the air.
> Pick your moment: a whole flock bagged before it scatters earns the biggest bonus.
>
> - **Classic:** 90 seconds, the Karoo farm, chase your best score.
> - **Daily Hunt:** one seeded hunt a day, the same for everyone; share your card or send a
>   challenge link.
> - **Season Run:** a roguelite run through autumn, winter, spring and summer — four biomes with
>   their own weather, bosses and charms bought at the Padstal farm stall.
> - Secrets on every farm (ring Oupa's fence bell, knock the lid off the potjie), crates with
>   strange weapons, and the Stampede when the Frenzy runs hot.
>
> Plays with a mouse or a touch screen, in English, Afrikaans, German or Dutch, with options for
> reduced flashes, large text, high contrast, captions and colour-blind marks. Leave the
> go-away-bird alone.

**af**
> Tarantal Madness is 'n vinnige, komiese skietbaan op 'n plaas in Suider-Afrika. Swaai oor 'n wye
> handgetekende panorama en pak die tarentaal aan — in swerms wat soos die regte ding optree: hulle
> wei, slaan alarm, hardloop vir skuiling en bars die lug in. Kies jou oomblik: 'n hele swerm voor
> dit uitmekaar spat, gee die grootste bonus.
>
> - **Klassiek:** 90 sekondes op die Karoo-plaas — jaag jou beste telling.
> - **Daaglikse Jag:** een jag per dag, dieselfde vir almal; deel jou kaart of stuur 'n uitdaging.
> - **Seisoen-lopie:** 'n roguelite-lopie deur herfs, winter, lente en somer — vier streke met hul
>   eie weer, base en sjarms van die Padstal.
> - Geheime op elke plaas, kratte met vreemde wapens, en die Stormloop as die Frenzy warm loop.
>
> Speel met 'n muis of 'n raakskerm, in Engels, Afrikaans, Duits of Nederlands. Los die kwêvoël uit!

**de**
> Tarantal Madness ist eine schnelle, komische Schießbude auf einer Farm im südlichen Afrika.
> Schwenke über ein weites, handgezeichnetes Panorama und nimm es mit Helmperlhühnern auf, deren
> Schwärme sich wie echte verhalten: Sie picken, schlagen Alarm, rennen in Deckung und fliegen
> auf. Wähle deinen Moment — ein ganzer Schwarm, bevor er sich zerstreut, bringt den größten Bonus.
>
> - **Klassisch:** 90 Sekunden auf der Karoo-Farm, jage deinen Rekord.
> - **Tägliche Jagd:** eine Jagd pro Tag, für alle gleich; teile deine Karte oder fordere Freunde heraus.
> - **Saison-Lauf:** ein Roguelite durch Herbst, Winter, Frühling und Sommer — vier Gebiete mit
>   eigenem Wetter, Bossen und Glücksbringern vom Padstal-Hofladen.
> - Geheimnisse auf jeder Farm, Kisten mit seltsamen Waffen und die Stampede, wenn der Frenzy glüht.
>
> Mit Maus oder Touchscreen, auf Englisch, Afrikaans, Deutsch oder Niederländisch.

**nl**
> Tarantal Madness is een snelle, komische schiettent op een boerderij in zuidelijk Afrika. Zwenk
> over een breed, met de hand getekend panorama en neem het op tegen helmparelhoenders in zwermen
> die zich gedragen als echte: ze scharrelen, slaan alarm, rennen weg en vliegen op. Kies je
> moment — een hele zwerm voordat die uiteenvalt levert de grootste bonus op.
>
> - **Klassiek:** 90 seconden op de Karoo-boerderij, jaag je beste score na.
> - **Dagelijkse jacht:** één jacht per dag, voor iedereen gelijk; deel je kaart of daag vrienden uit.
> - **Seizoensrun:** een roguelite door herfst, winter, lente en zomer — vier gebieden met eigen
>   weer, bazen en bedels van de Padstal-boerderijwinkel.
> - Geheimen op elke boerderij, kratten met vreemde wapens en de Stampede als de Frenzy gloeit.
>
> Speel met muis of touchscreen, in het Engels, Afrikaans, Duits of Nederlands.

### Controls blurb
- **en:** Mouse: aim and click to shoot · right-click or Space to reload · A/D, arrow keys or the
  screen edges to look around · Q: Vuvuzela · Esc or P: pause. Touch (landscape): tap to shoot ·
  drag to look around · flick down or tap the shell belt to reload · Vuvuzela button bottom-left.
- **af:** Muis: mik en klik om te skiet · regsklik of spasie om te laai · A/D, pyltjies of die
  skermrande om rond te kyk · Q: vuvuzela · Esc of P: pouse. Raak (dwars): tik om te skiet · sleep
  om rond te kyk · flits af of tik die patroonband om te laai.
- **de:** Maus: zielen und klicken · Rechtsklick oder Leertaste: nachladen · A/D, Pfeiltasten oder
  Bildschirmrand: umsehen · Q: Vuvuzela · Esc oder P: Pause. Touch (quer): tippen zum Schießen ·
  ziehen zum Umsehen · nach unten wischen oder Patronengurt antippen zum Nachladen.
- **nl:** Muis: richten en klikken · rechtsklik of spatie: herladen · A/D, pijltjes of de
  schermranden: rondkijken · Q: vuvuzela · Esc of P: pauze. Touch (liggend): tikken om te schieten ·
  slepen om rond te kijken · omlaag vegen of op de patronengordel tikken om te herladen.

### Tags / categories
Shooting · Hunting (comic, no gore) · Arcade · Casual · Animals · Birds · Africa · Roguelite ·
Daily challenge · Mouse · Touch · Singleplayer. Content: cartoon slapstick (birds go "POOF"
into feathers; no blood). The age rating is set in each portal's form.

> Copy rules: no real brand names or logos, and never name another game series (the comparison
> some players will make stays out of every text and tag).

## 3. Images

| File (`release/portal-assets/`) | For | Rule |
|---|---|---|
| `crazygames-cover-16x9-1920x1080.png` | CrazyGames landscape cover | title only, no borders/logos/"Play" |
| `crazygames-cover-2x3-800x1200.png` | CrazyGames portrait cover | same visual family |
| `crazygames-cover-1x1-800x800.png` | CrazyGames square cover | same |
| `poki-thumbnail-1x1-628x628.png` / `-1256x1256.png` | Poki static thumbnail | full-bleed square ≥ 628 px, **no text**, not close to #83FFE7 |
| `screenshot-{title,hunt,tally}-1920x1080.png` | store screenshots | in-game, HUD on |

**Still needs a person:** Poki's **animated thumbnail** (1:1, 1080×1080, 4–6 s, ≥ 50 fps,
muted, .mp4, required before global release) and CrazyGames' **preview videos**. Record both
from `?capture=1` after the art swap. CrazyGames also advises against plain screenshots as
covers: the rendered covers are a starting point for the illustrator, not final key art.

## 4. Checklist — Poki

☐ **Account:** Poki for Developers account and a game entry (needs a person).
☐ **Build:** `npm run release` (or `npm run build:poki`); upload the **contents** of
`dist-poki/` (or the zip) as a new version.
☐ **Size:** initial download < 8 MB (Poki rule) — ours is about 0.55 MB gzip; `release/size-poki.txt`.
☐ **Poki Inspector** (Versions tab → open in Inspector, or open the folder directly):
  - **Event log:** on load `gameLoadingFinished`. When a hunt starts, `gameplayStart`. On
    pause, tally, quit and the start of an ad, `gameplayStop`. When the pause menu closes,
    `gameplayStart` again.
  - **Ads:** the tally's [Again] and the Season Run's next hunt trigger `commercialBreak`, only
    between hunts and never before the first hunt. Audio mutes while the ad plays and input is
    blocked. The Season Run's "double Doppies" and retry offers trigger `rewardedBreak`.
  - **Challenge link:** sharing returns a Poki `shareableURL`. Opening it shows the challenge
    card (`getURLParam('gdc')`).
  - **Scaling:** the device profiles and window sizes from 4:3 to 21:9. Portrait shows the
    "turn your phone" card.
  - **Mobile:** use the Inspector's QR code on a phone. Taps fire, drags pan, flick down
    reloads.
☐ **Tablet:** touch controls on an iPad-size screen (Poki rule: mobile controls on tablets).
☐ **Incognito:** play a hunt in a private window: the save may be refused, and the game must
still play (storage goes through `src/meta/storage.ts`).
☐ **Ad blocker on:** the game runs without ads or rewards; nothing hangs.
☐ **Thumbnail:** upload `poki-thumbnail-1x1-1256x1256.png` (no text). Add the animated
thumbnail before global release.
☐ **Soft launch:** submit for the web-fit test / soft launch (**the user does this**).

## 5. Checklist — CrazyGames

☐ **Account:** developer account and payout details (the portal asks before submission).
☐ **Build:** `npm run release` (or `npm run build:crazygames`); upload `dist-crazygames/` or the
zip in **Submit a game**.
☐ **Size:** initial ≤ 50 MB, total ≤ 250 MB, ≤ 1 500 files; the mobile homepage wants
initial ≤ 20 MB. Ours is about 0.55 MB gzip; see `release/size-crazygames.txt`.
☐ **Preview / QA tool:**
  - **SDK:** `loadingStart` at boot, then `loadingStop`. `gameplayStart` when a hunt starts.
    `gameplayStop` on pause, tally, quit and ads.
  - **Ads:** `requestAd('midgame')` between hunts only; `requestAd('rewarded')` for the Season
    Run offers. Audio mutes during ads. The portal mute (`settings.muteAudio`) silences the game.
  - **Invites:** `inviteLink` for challenge links, read back with `getInviteParam`.
  - **Adblock:** detected through `hasAdblock`; the game still plays.
  - **Visual QA:** no black bars beyond 21:9, nothing cut off at 4:3, and portrait shows the
    rotate card.
☐ **Mobile and tablet:** on a phone and a tablet (landscape): touch, pause button, belt reload,
Vuvuzela button. Left-handed mode mirrors the controls.
☐ **Incognito:** a full hunt in a private window.
☐ **Covers:** upload the three covers (1920×1080, 800×1200, 800×800) and the preview videos.
☐ **Content:** PEGI 12-compatible (it is: cartoon slapstick, no blood).
☐ **Submit for review** (**the user does this**). Basic Launch needs no SDK; ours is a Full
Launch build (SDK integrated).

## 6. Before either submission
☐ `npm run check` green; CI green on `main` (e2e matrix, visual baselines).
☐ `npm run assets:audit -- --strict` passes (**fails today**: art and audio not yet delivered;
see `docs/06-ASSET-DELIVERY.md`). Re-run `npm run portal:shots` and update the visual baselines
after the swap.
☐ Real-device check: a low-end Android phone and an iPhone (Safari, no fullscreen button, the
Add to Home Screen banner on the web build only).
☐ Native-speaker review of af, de and nl (store text above and `src/i18n/*.json`).
☐ Legal check of the privacy text (Settings → Privacy).

## Sources (checked 21 Oct 2026)
- CrazyGames cover requirements: https://docs.crazygames.com/requirements/game-covers/
- CrazyGames technical requirements: https://docs.crazygames.com/requirements/intro/
- CrazyGames docs (preview tool, SDK): https://docs.crazygames.com
- Poki game thumbnail guide: https://developers.poki.com/guide/game-thumbnail
- Poki animated thumbnails: https://sdk.poki.com/animated-thumbnails
- Poki Inspector: https://sdk.poki.com/poki-inspector
- Poki SDK events: https://sdk.poki.com/sdk-documentation
