# Changelog

All notable changes to Tarantal Madness. Versions follow [Semantic Versioning](https://semver.org).
Decision records for each milestone are in `docs/05-DECISIONS-AND-RESEARCH.md` (D-017 … D-028).

## [1.14.0] — v1.11: Die Braai, the day ends at Oupa's fire (31 Oct 2026)

Decision record D-068. From the product owner's list of 24 Oct: "Die Braai: results told by Oupa at
the fire, vastrap dance for a perfect hunt".

- **Die Braai**: Classic and Daily hunts (and the Harvest) end at night at Oupa's fire under the
  Milky Way and the Southern Cross, the area's skyline dark on the horizon and the bakkie parked
  beside it. The chalk slate with every number and button stands in front, as before.
- **Oupa tells the hunt**: after the count-up, two to four lines from the result — the bag, a new
  best or rank up, a bird way out at the horizon, a whole flock, a Blikkies chain, the flying-ant
  feast, a meerkat's scolding, a near miss on the record — the same result always telling the
  same story. Voiced in English, Afrikaans and German (captions in all four languages). A tap off
  the buttons or Esc skips it.
- **Vastrap**: a perfect hunt (the top rank, or no miss with at least 10 birds) or a rank up gets
  Oupa on his feet for a little vastrap with a concertina sting ("reduce motion" leaves it out).
- **Sounds**: the hunt's music fades into the fire's crackle, crickets, a far fiery-necked nightjar
  and a soft original guitar.
- A Feesdae Daily keeps its framed slate and its decorations join the fire (Santa or party hat,
  a present, a pumpkin lantern). The Daily's share card puts the braai round the score (🔥 … 🌌).
- The Season Run's day end (the Padstal) and Oupa se Les keep their own screens.
- Nothing new in the first download but strings and a little code: the braai's art, sounds and
  voice lines are lazy groups fetched when a hunt starts; until they are in, the plain slate shows.
- The Daily streak says "Streak: 1 day" (was "1 days").

## [1.13.0] — v1.10: Reënbui, the first rain and the flying ants (31 Oct 2026)

Decision record D-067. From the product owner's list of 24 Oct: "Reënbui: summer storm, first
rain, flying ants, every flock feeds".

- **Reënbui**: some hunts a summer storm rolls in — towering clouds, the light dimming, distant
  thunder — then the first fat drops hit the dust, the ground darkens, and flying ants (alates)
  pour out of the ground in shimmering columns. Every nearby flock comes down to feast, calmer
  than usual, and up to two more flocks run in. **Every bag scores ×1.3** while the alates fly;
  then the rain eases, the sky clears and the wet ground dries.
- **Where:** the Kalahari (45 % of hunts), the Okavango (35 %), Namibië (15 %), the Karoo (5 %);
  never the winter Bushveld or the Harvest; always on the overcast Wednesday in the Kalahari and
  the Okavango, never on calm days. Classic, the Daily and the Season Run's plain and omen hunts.
  In a Kalahari storm hunt the ants rise when the Donderstorm breaks; on the Okavango the
  sun-showers make way.
- **Sounds:** thunder, rain on the sinkdak, the swarm's buzz and the excited birds; the veld's own
  calls go quiet for the storm. Oupa: "Smell that rain?!" and two more lines (voiced en/af/de).
- **Extras:** a Notaboek challenge (bag 10 during one Reënbui), the alates in the Bird Book.
- Lightning stays a small fork far off (never a screen flash; "reduce flashes" dims it, "reduce
  motion" leaves it out). Nothing new in the first download: the art is in the late group, the
  sounds in the soundscape's lazy group, the view in its own lazy chunk.
- Golden replays re-recorded (a new sim event; the content hash moved). Balance:
  `docs/balance/v1.10-reenbui.md`.

## [1.12.0] — v1.9: the veld soundscape and local music (31 Oct 2026)

Decision record D-066. From the product owner's list of 24 Oct: "Veld soundscape per area and time
of day, plus marimba, mbira and drum layers."

- **The veld sounds alive**: over each area's ambience, the birds, insects and weather of that
  place at that time of day — Cape turtle doves and laughing doves everywhere, hadedas far off at
  dawn and dusk, cicadas in the heat; the fish eagle, reed frogs at dusk and a distant hippo on the
  Okavango; wind, a windpomp and sheep in the Karoo; barking geckos and a korhaan in the Kalahari
  and Namibië; francolins at dawn and a go-away-bird far off in the Bushveld. Near, mid and far
  calls, spread across the screen; the title plays the area too, more calmly.
- The hadeda, fish eagle and kwêvoël only ever call far off in the soundscape, and fall silent
  before and while the real one appears: its own call stays your warning.
- **Local music**: a pennywhistle over an mbira in the calm music, a marimba joining as the flocks
  run, hand drums in the Stampede — each area with its own colour.
- The soundscape is a small download of its own after the hunt starts; nothing new in the first
  download but a few lines of code. Effects volume, mute and pause apply.

## [1.11.2] — Feesdae: New Year countdown (31 Dec–1 Jan) (30 Oct 2026)

Decision record D-065. The product owner picked it on 27 Oct from the Feesdae list of 24 Oct: "a
countdown hunt with party hats, small fireworks on the horizon (never full-screen flashes), double
points in the last 10 s; 31 Dec–1 Jan UTC." The third special on the Feesdae system (D-048), after
Halloween's Spookjag and Christmas in the sun.

- **New Year / Nuwejaar** on 31 Dec and 1 Jan (UTC): the Daily becomes the countdown for everyone
  — the day's map at a warm dusk that turns to blue hour as the hunt goes on, the stars coming out,
  the same seed and first-attempt rules; the title's Daily shows "New Year countdown!" with Oupa in
  a party hat, a party blower in his hand.
- **The countdown** (the twist, in the sim): in the last 10 s every award is doubled — bags and
  bonuses, never penalties — on top of the Stampede (×4). A big "10 … 1" counts down on the HUD
  with a "×2" tag by the score and a tick on the last 3 s.
- **Fireworks** low over the far horizon: small bursts in gold, red, green and white, a few at a
  time and more in the countdown, never more than 3 a second and never a large flash; fewer on the
  low tier, and only a dim twinkle with "reduce flashes". Some guineafowl wear striped party hats.
- Oupa's New Year lines (voiced in English, Afrikaans and German), "Auld Lang Syne" on the
  pennywhistle at the start and on the tally, soft distant pops; captions for both.
- The tally says **"Happy New Year!"** in a New Year frame (streamers, Oupa's head, a firework);
  the share card is framed 🎊🥳 … 🎆🎊 and titled with the year that starts ("New Year 2027").
- A special's date can now cover several days. New Year's art and sounds are their own lazy
  download (Standard in HD); a Halloween or Christmas hunt never fetches them.

## [1.11.1] — Feesdae: Christmas in the sun (25 Dec) (30 Oct 2026)

Decision record D-064. The product owner picked it on 27 Oct from the Feesdae list: "Christmas,
25 Dec: 'Christmas in the sun': heat haze, tinsel on the camelthorn, Oupa in a Santa hat and
shorts, presents hidden as secrets, carols on the pennywhistle." The second special on the Feesdae
system (D-048), after Halloween's Spookjag.

- **Christmas in the sun / Kersfees in die son** on 25 Dec (UTC): the Daily becomes the special for
  everyone — the day's map under a bright, hot midsummer light, the same seed and first-attempt
  rules; the title's Daily shows its badge.
- **Presents hidden as secrets** (the twist, in the sim): 3–5 wrapped presents tucked in behind the
  day's props (under the big tree, behind a rock, at the windpomp or the bakkie), partly covered
  but never wholly. Shoot one and it opens (the lid and bow pop off, a puff of paper confetti); find
  them all for **Presents found! +25**, once.

## [1.11.0] — Die Oes (The Harvest): a new 30-second mode on a farm field (30 Oct 2026)

Decision record D-063. The product owner (25 Oct): "A very good level we could do, and call it the
harvest … everything flocks to it and tries to eat as much as possible. You've got 30 seconds to
shoot as many animals for points as possible to keep them out while the fence gets repaired."

- **Die Oes / The Harvest** on the title (a fifth button, after the first hunt): a 3-s intro on sim
  time (a warthog family barges through the fence; a tap skips it), then 30 s of animals pouring
  into the crops (guineafowl flocks, fly-overs, warthogs, v1.8b's baboon raiders after the mielies)
  while the farm workers mend the gap. The crop meter drains per eating animal; the fence closes at
  30 s and the crop saved pays a bonus. Its own tally (bagged by kind, crop saved, crop bonus) and a
  local best.
- **Warthogs:** 2 hits bag one (3 × a guineafowl's base, × Frenzy), the first sends it running.
  Piglets trail their mother, never come in alone and are never targets.
- **Workers and piglets** cost points only from a shot aimed at them (the baboon mothers' rule); a
  stray pellet makes a worker duck. The workers stand out of every target's line of fire over the
  whole camera sweep (`tools/art/harvestLineOfFire.ts`).
- The Harvest's map (`oes`), its sheet, sim system and view are lazy: the first download only
  carries the title button, its strings and the mode's content.

## [1.10.0] — Bobbejane: baboon troops on the ridges; raiders that come down to cause trouble (30 Oct 2026)

Decision record D-062. The product owner (25 Oct): "It's important in these maps that the African
baboon is also present, maybe sitting at the back of the mountains … Pop up and do something
naughty that might get them to eat a bullet or two." Decided the same evening: a shot baboon goes
down and is bagged like a guineafowl.

### Added
- **Baboon troops:** 5–10 chacma baboons on the far ridge of every Karoo, Bushveld, Okavango and
  Namibië map (and now and then on the Kalahari's rocky outcrop): the big male on lookout, mothers
  with a baby on their back, youngsters playing, males grooming and dozing. Never targets up there:
  a shot aimed at a mother costs 15 (a stray pellet or stone costs nothing), and any hit (or the Langloop) sends the troop over the ridge for a
  while.
- **Raids:** about once a minute the lookout barks and a male (sometimes two) climbs down to cause
  trouble: Oupa's hat off the bakkie, the tap, the fruit tree, a mielie cob, fruit thrown at the
  guineafowl, a fence-post moon, a chase. Two hits bag a raider: 3 × a guineafowl's points on its
  plane, and +15 if you stop it before the mischief is done ("Caught in the act!"). No blood: the
  guineafowl's tumble and puff.
- Oupa's lines for each raid, a bagged raider and a hit mother (voiced in English, Afrikaans and
  German; Dutch text); the baboons' sounds (the lookout's wa-hoo, screeches, each raid's own sound).
- The Bird Book's "Bobbejaan · chacma baboon" entry with its rule.

### Changed
- The baboons', ostriches' and tell animals' game code loads in the background after the first
  download (the first download did not grow).
- On the low graphics tier a far ridge with a troop is drawn as its own layer.

## [1.9.8] — Realistic Bushveld rocks and middle distance; tell animals instead of the secret star (29 Oct 2026)

Decision record D-061. The product owner (25 Oct): "In the Bushveld, the rocks and the middle
distances also look a little bit childish, cartoonish. They need to look more realistic. And I also
don't like this little star effect … Either a very unique animal that always appears there, or
something." Cue option A (a tell animal at each secret) stands: the recommended option.

### Added
- **Tell animals:** every secret that pays has a small, unique creature that always lives there and
  does its small action every few seconds: a drongo flicking its tail on the baobab, a blue-headed
  rock agama doing push-ups by the dassie, a striped skink on the cracked boulder, a lilac-breasted
  roller on the Kalahari windpomp sign, a chameleon in the dead camelthorn, a rock kestrel on the
  Karoo windpomp, a wagtail on the bakkie, a striped mouse by the potjie, a fiscal on the bell's
  post, a pied crow in the quiver tree, a malachite kingfisher on the mokoro pole, an oxpecker on
  the hippo and a jacana on a lily leaf. Shoot one and it costs nothing: it flies or scurries off
  and comes back a few seconds later; once its secret has paid out it stays away.
- Their names in Afrikaans, English, German and Dutch.

### Changed
- **Bushveld rocks:** weathered granite without ink outlines: soft light and shade, darker rims,
  undercuts and contact shadows, peeling shells, black rain streaks, iron stains, lichen, cracks and
  grass at the foot (the boulders, the dassie's koppie, the cracked boulder, the foreground piles).
- **Bushveld far hills:** real bushveld koppies and ridges in three haze rows, their skylines made
  of tree crowns, with grey granite faces and boulder knobs, instead of smooth orange cones.
- **Bushveld middle distance:** bare red earth and pale grass, a game path, termite mounds and low
  granite sheets in the dry winter grass; no black lines between the planes any more.
- **Oupa se Kaart** (and a dusk map, and the Meerkat Spotter) gives the tell animals a soft warm
  outline instead of rings on the secrets.
- The Bushveld baobab is 1× in Standard graphics (its 2× drawing is in the HD pack).

### Removed
- The secret "hint glint" (the four-point star every 4 s).

### Sizes
- First download 2,972.3 KB (unchanged); Bushveld chunk 1,525.0 → 1,480.5 KB; late group 1,412.3 →
  1,428.9 KB (the tell sheet); TellView is a lazy chunk (1.3 KB).

## [1.9.7] — Namibië veld life: grass and sand, ostriches, oryx in the mirage, balloons (29 Oct 2026)

Decision record D-059. The product owner (25 Oct): "In the Namibia map … at least two ostriches
with somewhere an ostrich nest … some oryx antelopes … roaming somewhere far away in the distance,
and there needs to be some mirage attached to that. And maybe some hot air balloons drifting by."
And: "The grass landscapes in the Namibia one also look very rough still, it needs to be much more
detailed, enhanced."

### Added
- **Namibië ground redrawn** (no ink): red Namib sand with soft dune swells, wind ripples, fine
  grain, gravel plains with pebbles, a quartz-pebble patch now and then and animal tracks, paler and
  cooler into the distance; the hard black seam between the planes is now a lit sand ridge over a
  soft shadow with grass breaking over it.
- **Bushman grass** (Stipagrostis): golden-straw clumps of fine blades with silvery feathery seed
  plumes, lit tops, shaded bases, darker grass edges, contact shadows, dry broken stems and litter;
  small tufts to big clumps, denser and bigger near, sparse with bare sand between. Dollar bush
  (Zygophyllum) and dead branches too. Drawn as a small sheet of variants placed over the sand
  (VeldView), Standard and HD.
- **Ostriches and their nest** on the pan edge of every Namibië map: a black-and-white cock and a
  grey-brown hen, a scrape with 8–15 cream eggs. The hen sits by day while the cock stands guard;
  they walk, peck, look round and swap on the nest, and the cock fans his wings and booms. A shot
  nearby (or the Langloop) sends them running; they come back after a few seconds.
- **Don't shoot them:** an ostrich or the nest costs 10 points (2 s cooldown, like the meerkats);
  never hurt — a puff of feathers or sand, a hiss: "Leave my eggs alone!" / "Los my eiers uit!".
- **Oryx in the mirage:** a gemsbok herd walks slowly across the far pan and back, with a faint
  upside-down reflection and a gentle waver that breathe with the heat (full on the mirage days,
  none at dawn, dusk or under cloud).
- **Hot-air balloons:** now and then 1–3 balloons in warm stripes drift high across the far sky
  with the wind (more often on the calm early-light days), the burner flaring now and then. A hit
  costs 25 (with a cooldown); the burner roars and a passenger shakes a fist: "Oi! We're on
  holiday!" / "Hei! Ons is op vakansie!".

### Changed
- Namibië's camelthorn and quiver-tree props are 1× in Standard with their 2× twins in the HD
  pack (room in the Namibië chunk for the veld life).

### Fixed
- Android test app: the back button works from the first moment in the browser build (its
  listeners are registered one at a time).

## [1.9.6] — Season Run: Save & leave (29 Oct 2026)

Decision record D-060. The product owner, after playing the Android test app: the Farm Stall had
no way out but "Next hunt", and nothing said the bottle caps were kept.

### Added
- **Save & leave** on the hunt card, the run tally and the Farm Stall: back to the title with the
  run kept exactly as it is (caps, charms, consumables, rented gun, the stall's offers).
  **Continue run** on the title picks it up on the same screen; a line over the button shows the
  run's season, next hunt and caps ("Autumn · hunt 2 of 3 · 12 caps").
- The Escape key and the Android back button do the same on those screens (on the stall they
  close its help card first); the stall's help card says so.

### Changed
- On the Farm Stall, Reroll moves next to Save & leave and Sell moves up a row. The hunt card's
  Menu button is now Save & leave.

## [1.9.5] — Android test app: an installable APK for friends (28 Oct 2026)

Decision record D-058. The product owner (27 Oct): "Yes, add the Android test app" — friends
install the game on their Android phones from a link, before any store account exists.

### Added
- **Tarantal Madness for Android (test build).** The game as an Android app (Capacitor 8.5.3,
  `na.tarantal.madness`): landscape, full screen with the system bars hidden, the screen stays on
  while you hunt. Every picture and sound, Standard and HD, is inside the app: it works offline
  and never downloads art. The Standard/HD choice still shows on the loading screen.
- **Back button:** in a hunt it opens the pause menu, in the pause menu it resumes, in menus it
  goes back; on the title screen the app goes to the background. It never quits a hunt.
- **Going to the background** mutes the sound and pauses the hunt, as hiding a browser tab does.
- **Sharing** uses the phone's share sheet; challenge links point at the web test build.
- **App icon and launch screen** from the guineafowl art on the Karoo colours.
- **Download page** on the test build: `/android/` (English, Afrikaans, German, Dutch) with the
  APK, its version and size, and how to install it.
- **CI:** `.github/workflows/android.yml` builds and signs the APK (PRs with the label `android`,
  and every push to main through the Pages deploy) and uploads `tarantal-madness-<version>.apk`
  (14 days). `npm run build:android` builds `dist-android/` and syncs the Android project.

### Notes
- The APK (about 30 MB) is signed with a committed **test-only** key so updates install over each
  other. It is not a store release; the Play Store needs the product owner's own private key
  (docs/ANDROID-TEST-APP.md).
- The web first download is unchanged; `/android/` is never part of it.

## [1.9.4] — Tree life: a living baobab, a better sausage tree and a busy weaver colony (28 Oct 2026)

Decision record D-057. The product owner (26 Oct): the Bushveld baobab "needs a bit more detail
… maybe the tree needs a few holes where a little mouse can look out"; the Kalahari weaver tree
needs "some little birds fly around there also to make it look a bit more alive".

### Added
- **A living baobab** in the Bushveld: redrawn as one smooth, fluted, buttressed trunk that flows
  into thick root-like limbs, with wrinkled grey-pink bark, old elephant scars and lichen. Its
  fruit are small, hairy pods hanging on long stalks in little groups (they still swing and drop
  when shot).
- **Residents in its hollows** (not targets): a bushbaby peeks out (more often at dawn and dusk),
  a tree squirrel runs up a limb and back, a barn owl looks out of the big cavity, a yellow-billed
  hornbill feeds the female sealed in her nest, buffalo weavers come and go at their stick nests,
  and bees swirl at a crack. Shoot close to one and it ducks back in, or flies off and comes back
  later. They never score and never get in the way of a shot.
- **The weaver colonies come alive** (Kalahari and Namibië): sociable weavers dart in and out of
  the nest, perch on the branches and the roof, and hop about on the sand below; a pygmy falcon
  visits now and then, and in Namibië a pair of rosy-faced lovebirds sits nearby. A near shot
  scatters them; they trickle back a few seconds later. Shooting the nest still costs 10.

### Changed
- **The Okavango sausage tree**: a spreading, layered crown with light on it, smooth bark, and
  heavy curved sausages in several sizes on long rope stalks (they still swing and drop).
- The Kalahari nest tree loads in Standard at 1× (its 2× art is in the HD pack), which makes room
  for the colony; the first download is a little smaller than before.

### Fixed
- The dawn mist no longer paints a hard light band across tall props (the baobab's trunk): mist
  bands now lie under a layer's props.

## [1.9.3] — Makalani palms in the Okavango: nuts that crack off, juggle and pop (28 Oct 2026)

Decision record D-056. The product owner (26 Oct): "Since it's Okavango, I want us to add some
makalani trees … If somebody manages to hit such a small makalani, maybe it can do a small
blow-up, or fall down … Be creative." And (27 Oct): "one or two cans on the further-away fence".

### Added
- **Makalani palms** in the Okavango: tall, slender grey trunks with faint rings, crowns of stiff
  grey-green fan leaves on spiny stalks, dry fronds hanging below; one to three groups on every
  weekday map (near and mid), the crowns swaying a little in the wind. Palms by the water are
  reflected in the channel with a gentle ripple. The distant palms on the horizon are makalani too.
- **Makalani nuts** hang in clusters of 3–8 under the crowns (mostly glossy brown, some orange and
  green). One or two pellets crack a nut off with a "tok": it drops spinning. Hit it again in the
  air and it juggles like a tin can, higher with every hit; it bounces hard and rolls when it lands.
  Three pellets at once, or a rifle bullet, pop it into husk and ivory chips with a "krak!".
  Points for each, a little more than a can. Nuts never block a shot at a bird behind them.
- **Secret "Hard soos 'n makalani"**: pop or juggle out three nuts in one hunt (+25), with a line
  from Oupa.
- **Blikkies on the far fence**: on the Karoo map with the near fence (Wednesday), two more cans on
  the farther fence, smaller and further away, worth more per hit.

## [1.9.2] — Playtest fixes: crate icons, the ten-second call, and the red dot sight (28 Oct 2026)

Decision record D-055. From the product owner's playtest on 27 Oct.

### Added
- **Rooikol, the red dot sight** (Red Dot / Rotpunkt / Rode Stip): a power-up for the rifles (the
  .22 and the Langloop). For 15 s the rifle aims through a red dot instead of its sight: ready the
  moment you press (no zooming in or out), a calm dot, and 75 % of the time between shots. No
  magnification, so far birds stay small. It drops from crates only while you carry a rifle; not
  sold at the Padstal. Its own icon (with an HD twin), pickup card, HUD chip, a Gun Shed card and a
  line from Oupa (text only for now).

### Fixed
- **The crate's power-up picture** sat in a screen layer at a hand-worked position: during a pan,
  through a scope or in a screen shake it showed beside the crate, and while falling it showed
  twice (on the canopy and on the box). It now sits in the crate's own layer, once: on the canopy
  while it falls, on the box once it lands.
- **"Ten seconds!"** waited out Oupa's 6 s gap behind the Stampede's call (said at 15 s left), so it
  often came at 6 s or less. It is now said the moment the clock shows 0:10, cutting any line
  playing, or not at all if it can't be said by 9.5 s. The hunt clock itself was right (60 ticks a
  second, also through the Stampede; the HUD rounds up, 9.9 s shows 0:10).

## [1.9.1] — Far animals in HD: realistic herds on every map (27 Oct 2026)

Decision record D-054. The product owner (26 Oct): "The zebras, giraffes and elephants look very
cartoony … The details need to be put into HD mode so it looks more realistic." And: "the animals
that are in a far distance … still look too much like stick figures."

### Changed
- **Every far animal redrawn** on all five maps (incl. Namibië's waterhole): elephants, giraffes,
  zebra, wildebeest, gemsbok, springbok, red lechwe and ostriches drawn from their anatomy —
  jointed legs and hooves, real silhouettes (the elephant's domed head, big ragged ear, trunk and
  tusks; the giraffe's sloping back and ossicones; the wildebeest's beard and horns; the
  gemsbok's mask and two long horns), their own coats and markings, light from above and a soft
  shadow, thin outlines instead of a heavy cartoon line.
- **Sized for the distance**: every far animal in proportion to the guineafowl beside it and
  to each other, then a little smaller so the distance reads (a far zebra 61 px at the shoulder,
  an elephant 144, a giraffe 225 tall, an ostrich 89), in loose herds facing both ways where no head crosses
  another animal, with young ones, cows and hens; lechwe wade in shallow water. Every animal
  stands out from the bright horizon and clouds.
- **They live a little**: grazing bites, ear flicks, tail swishes, an elephant's ears and trunk, a
  browsing giraffe — on game time (a paused or held frame holds still; reduce motion is calmer).
- **HD**: every herd has a 2× twin in its area's HD pack.

### Fixed
- **HD on phones**: a hunt in another area no longer keeps the title's Karoo landscape in HD on the
  graphics chip (about 100 MB); the far ridge, far veld and Ver strips and the rare special birds
  stay Standard in HD. Every area's HD hunt now fits the medium phone budget, and the HD downloads
  are smaller.
- **Far elephants' heads** no longer break into flickering pieces on some graphics chips (a
  workaround for a shader bug in the game engine).

### Unchanged
- Positions, hits, scores and replays (decor only). The first download shrinks (2,996.0 →
  2,992.1 KB gzip, web: the Karoo's herds load just after it); every area chunk stays under
  1.5 MB (two big camelthorn images at 128 colours, no visible change, make the room).

## [1.9.0] — HD graphics: Standard or HD (27 Oct 2026)

Decision record D-053. The product owner: "When the game loads, it should ask you standard quality
or HD … a tick box that says save preset … why not use high-quality graphics if it's possible?"

### Added
- **Standard or HD** on a light loading screen at the first start: Standard (fast, works on every
  device) or HD (sharper art, a larger download — the real size for your area). The game
  pre-selects what suits your connection, device and screen; on a device that looks too weak the
  HD button says it may be slow. **Remember my choice** (ticked) skips the question next time.
- **Settings → Graphics**: Standard / HD / Ask on start (English, Afrikaans, German, Dutch).
- **HD art**: every area's landscapes, props, far animals, sprites and the guineafowl's flight at
  twice the resolution, loading with the area behind the loading screen (a bar and the MB). After
  4 s **Play now in Standard** starts straight away and the HD art swaps in during play.
- The Bushveld's aloes in HD (2×); in Standard they stay at 1×.

### Unchanged
- Every standard area chunk, positions, hits, scores and replays. Standard never downloads an HD
  file. The first download grows by 4.7 KB (2,990.7 → 2,995.4 KB gzip on the web build) for the
  choice itself; the card, the HD code and the HD file list load only when needed. The guns, close-up pop-ups and rare birds stay Standard (memory).

## [1.8.1] — Karoo polish: HD aloes and a boiling potjie (27 Oct 2026)

Decision record D-051. The product owner (26 Oct): "These aloes … need to become HD." And: "The
braai pot … add a small bit of animation … as if … the pot is boiling a little bit. And when it's
shot, at least the deksel should fall off."

### Changed
- **HD aloes**: the Karoo's aloe clumps are redrawn as bitter aloes (Aloe ferox) at 2×: fleshy
  blue-green leaves with reddish teeth, a skirt of dry leaves, and candelabras of orange-red
  flower spikes, with thin painterly outlines. They load after the hunt starts and swap in when
  they arrive (the first download stays under 3 MB). The Bushveld's red aloes get the same drawing.
- **The potjie** is a round cast-iron pot with a sheen on a fire of glowing coals and logs.

### Added
- **The potjie simmers**: steam drifts with the wind, the coals flicker, and every few seconds the
  lid rattles with a puff and a soft clatter; bubbles while it is on screen.
- **Shoot the lid**: it pops off, tumbles and lands beside the pot with a clang and a big puff of
  steam; the pot steams freely for the rest of the hunt. The +5 s and Oupa's line are unchanged.
- Reduce motion makes the potjie calmer (rarer, smaller rattles, less steam).

## [1.8.0] — Blikkies: tin cans on the fence posts (26 Oct 2026)

Decision record D-050. The product owner: "On maps with fence posts, have some cans standing on
them that can be shot off. They somersault when hit … if you hit them again they continue
spinning up … till you don't see them anymore."

### Added
- **Blikkies**: a farm fence of 3–6 posts with a tin can on each on 3–4 weekday layouts of the
  Karoo, Bushveld, Kalahari and Namibië (near, mid or far by day; Verder, Nog Verder and Die
  Verste push it back). A hit knocks a can off away from the hit side, somersaulting.
- **The juggle**: hit it again in the air and it flies higher, spins faster and drifts more with
  every hit; the 10th air hit always sends it out of the top — **"Weg!"**. A good shot keeps a
  near can up for 3–5 hits; far cans are the hardest. A landed can lies there for the hunt.
- Scoring as event bonuses (× Stampede; a can-only shot leaves Frenzy alone and is no miss):
  knock-off 5, air hit 8 + 2 a step, Weg! 15, × plane (near 0.8 … Ver 2.5). Cans stay under
  ~9 % of a good score even for a bot that juggles every can.
- Chain pops ("3× in the air!"), dents where the pellets struck, can sounds, Oupa's "Hou hom in
  die lug!", a Notaboek challenge (5 in the air), the **Blikkiesdans** secret (a chain of 8, once a
  hunt), and a Blikkies target at every Skietbaan distance with knock-off and air-hit stats.
- Names: Tin Cans (en), Blechdosen (de), Blikjes (nl), Blikkies (af and the Afrikaans-names toggle).

### Changed
- HUD score pops age on sim time (a paused or held hunt keeps them on screen).

### Tools
- `apexJuggler` balance bot (shoots a flying can at the top of its arc, 100 ms late, with aim
  error, cooldown and reloads) beside `canHappy`; `tools/juggle-check.ts` per plane;
  `tools/blikkies-sweep.ts`; tables in `docs/balance/v1.8-blikkies.md`.

## [1.7.4] — Perspective: birds get smaller with distance (26 Oct 2026)

Decision record D-049. The product owner: far guineafowl stood taller than the ostriches and
zebras beside them. Birds now shrink with every plane back, and the far animals stand in proportion.

### Changed
- **Plane scales**: mid 0.5 → 0.42, far 0.22 → 0.15, Ver 0.1 → 0.07 (near pop-ups unchanged).
  Flock spacing, speeds, alert radii and crate drops shrink with the birds on every plane
  (`scoring.tuningRefScale`).
- **Far animals** show at 3× (their art is drawn at 3×); the Namibië waterhole's animals are drawn
  5× taller in place. A far guineafowl no longer stands taller than an ostrich or a springbok.
- **Still shootable**: a far target's body is hit within at least 18 px, a Ver target's within
  10 px (mouse and touch; don't-shoot birds and the Spookjag owl stay as drawn, its bats and
  lanterns get the floor too); touch assist far 12 px (mid 14); far birds score 22 (was 25); the
  Langloop scores ×0.72 on mid and ×1.15 on far, so its Classic mean stays in range.
- Bird atlases are packed at the new plane sizes (first download −106 KB).
- Feathers, alarm bubbles, POOF and score pops follow the plane scales (far text never below
  0.45×). The Namibië waterhole animals stand head up so they read at their new size.

### Tools
- `tools/perspective-audit.ts` (proportions per biome and plane) and `tools/perspective-sweep.ts`
  (the balance cells); tables in `docs/balance/perspective.md`.
- Dev/e2e `?planeScale=v17` shows the old sizes for before/after screenshots.

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
