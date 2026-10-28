# Names in each language (v1.5, D-041)

Every player-facing name has an Afrikaans, English, German and Dutch form. Afrikaans keeps the
names the game always had; English, German and Dutch get their own, keeping the farm humour
rather than translating word for word. The tables show the text each language file holds.

- **Source of truth:** `src/i18n/<lang>.json`. `src/i18n/names.test.ts` checks that every row
  below matches those files, so this table and the game can't drift apart.
- **Place names stay** (Karoo, Kalahari, Okavango, Etosha, Namib; Namibië → Namibia / Namibia /
  Namibië). So do Oupa, Ouma and the neighbour's names (Faan, Bles).
- **"Afrikaans names" toggle** (Settings → Sound & game, off by default): in English, German or
  Dutch it brings back the Afrikaans flavour names. It does this per key: `src/i18n/flavour/afNames.json`
  holds the pre-v1.5 text of every key this change renamed (the names and the sentences that use
  them), and `t()` uses it while the toggle is on. Afrikaans text is unaffected.
- **Oupa's barks** keep their Afrikaans exclamations in every language ("Mooi skoot!", "Ag nee
  man!", "Die hele swerm!"): he is an Afrikaans farmer (art bible §10). Only the lines that say a
  rank follow the new rank names.
- **Not translated:** the Skietbaan (admin-only playtest tool) and onomatopoeia (KEK!, KWÊ-KWÊ!).
- **Allow-list:** the names test scans every en/de string for Afrikaans name words. A word that
  is also correct English or German, or a place or person's name, is on the allow-list in
  `src/i18n/names.test.ts` with its reason (e.g. "Windleser" is good German; "hadeda" is the
  bird's English name).
- **No real brand names** (CLAUDE.md).
- German and Dutch are a first pass for native review before launch (as D-026).

### Guns

| Key | af | en | de | nl | Note |
|---|---|---|---|---|---|
| `weapon.dubbelloop` | Dubbelloop | Double Barrel | Doppelflinte | Dubbelloops | dubbel + loop = double barrel |
| `weapon.pomp` | Plaas-Pomp | Farm Pump | Hof-Pumpe | Boerenpomp | the farm's pump-action shotgun; plaas = farm |
| `weapon.kettie` | Kettie | Slingshot | Schleuder | Katapult | kettie = SA slingshot |
| `weapon.windbuks` | Windbuks | Air Rifle | Luftgewehr | Windbuks | "windbuks" is also the Dutch word, so nl keeps it |
| `weapon.langloop` | Die Langloop | The Long Rifle | Die Lange | De Lange Loop | lang + loop = long barrel; de "Die Lange" = the long one |
| `weapon.twee_twee` | Twee-Twee | The Twenty-Two | Kleinkaliber | De Tweeëntwintig | SA slang for a .22 rifle; German shooters call a .22 "Kleinkaliber" |
| `item.voorlaaier` | Die Voorlaaier | The Muzzle-Loader | Der Vorderlader | De Voorlader | crate gun; voorlaaier = muzzle-loader |
| `item.mielie_masjien` | Mielie-Masjien | Corn Cannon | Mais-Maschine | Graankanon | crate gun that fires maize (mielies); nl avoids "maïs" (no new glyph) |

### Sights

| Key | af | en | de | nl | Note |
|---|---|---|---|---|---|
| `sight.iron` | Oop visier | Iron sights | Kimme und Korn | Open vizier | already translated in every language |
| `sight.peep` | Loergatvisier | Peep sight | Diopter | Diopter |  |
| `sight.scope_small` | Klein teleskoop | Small scope | Kleines Zielfernrohr | Kleine kijker |  |
| `sight.scope_var` | Verstelbare teleskoop 3–9× | Variable scope 3–9× | Variables Zielfernrohr 3–9× | Variabele kijker 3–9× |  |

### Areas and bonus maps

| Key | af | en | de | nl | Note |
|---|---|---|---|---|---|
| `biome.karoo_autumn` | Karooplaas — Herfs | Karoo Farm — Autumn | Karoo-Farm — Herbst | Karoo-boerderij — Herfst | place names stay |
| `biome.bushveld_winter` | Bosveld — Winter | Bushveld — Winter | Buschveld — Winter | Bosveld — Winter | the German and Dutch words for the bushveld |
| `share.biome.bushveld_winter` | Bosveld | Bushveld | Buschveld | Bosveld |  |
| `biome.okavango_spring` | Okavango — Lente | Okavango — Spring | Okavango — Frühling | Okavango — Lente |  |
| `biome.kalahari_summer` | Kalahari — Somer | Kalahari — Summer | Kalahari — Sommer | Kalahari — Zomer |  |
| `biome.namibie` | Namibië — Etosha en Namib | Namibia — Etosha & Namib | Namibia — Etosha & Namib | Namibië — Etosha & Namib | Namibië → Namibia / Namibia / Namibië |
| `share.biome.namibie` | Namibië | Namibia | Namibia | Namibië |  |
| `map.verder` | Verder | Further | Weiter | Verder | bonus map 1; "verder" is also Dutch |
| `title.verder` | Verder | Further | Weiter | Verder |  |
| `map.nog_verder` | Nog Verder | Further Still | Noch weiter | Nog Verder | bonus map 2 |
| `title.nog_verder` | Nog Verder | Further Still | Noch weiter | Nog Verder |  |
| `map.die_verste` | Die Verste | The Furthest | Am weitesten | Het Verst | bonus map 3 |
| `title.die_verste` | Die Verste | The Furthest | Am weitesten | Het Verst |  |

### Modes and places

| Key | af | en | de | nl | Note |
|---|---|---|---|---|---|
| `title.season_run` | Seisoenjag | Season Run | Saisonjagd | Seizoensrun | de: "Saisonjagd" reads more naturally than "Saison-Lauf" |
| `tally.season_run` | Seisoenjag | Season Run | Saisonjagd | Seizoensrun |  |
| `share.daily` | Daaglikse Jag #{n} | Daily #{n} | Tagesjagd #{n} | Dagjacht #{n} |  |
| `share.classic` | Klassiek · {biome} | Classic · {biome} | Klassik · {biome} | Klassiek · {biome} |  |
| `title.shed` | Skiet-Skuur | Gun Shed | Waffenschuppen | Schietschuur | skiet = shoot, skuur = shed |
| `shed.tab.notaboek` | Notaboek | Notebook | Notizbuch | Notitieboek | Oupa's goal book |
| `shed.tab.birdbook` | Voëlboek | Bird Book | Vogelbuch | Vogelboek | already translated |
| `run.padstal` | Padstal | Farm Stall | Hofladen | Stalletje | padstal = roadside farm stall (the Season Run shop) |
| `tally.title` | Bakkie-telling | Pickup Tally | Pick-up-Bilanz | Pick-up-telling | the bakkie (pickup truck) is where the bag is counted |
| `ftue.title` | Oupa se Les | Oupa's Lesson | Oupas Lektion | Oupa's Les | the tutorial |
| `run.ad_retry_title` | Oupa se tweede kans! | Oupa's second chance! | Oupas zweite Chance! | Oupa's tweede kans! |  |
| `admin.range` | Skietbaan | Skietbaan | Skietbaan | Skietbaan | Skietbaan: admin-only playtest tool, not translated |

### Creatures (Bird Book)

| Key | af | en | de | nl | Note |
|---|---|---|---|---|---|
| `creature.tarentaal` | Gewone tarentaal | Helmeted guineafowl | Helmperlhuhn | Helmparelhoen | tarentaal = guineafowl / Perlhuhn |
| `creature.tarentaal_wit` | Wit tarentaal | White guineafowl | Weißes Perlhuhn | Wit parelhoen |  |
| `creature.tarentaal_lavendel` | Laventel-tarentaal | Lavender guineafowl | Lavendel-Perlhuhn | Lavendelparelhoen |  |
| `creature.kuifkop` | Kuifkoptarentaal | Crested guineafowl | Haubenperlhuhn | Kuifparelhoen |  |
| `creature.generaal` | Generaal Tarentaal | General Guineafowl | General Perlhuhn | Generaal Parelhoen | boss with a pot helmet |
| `creature.ou_grys` | Ou Grys | Old Grey | Der Alte Graue | Ouwe Grijze | boss; ou grys = old grey |
| `creature.kuifkop_koning` | Kuifkop Koning | Crest King | Haubenkönig | Kuifkoning | boss; kuifkop = crested |
| `creature.stormvoel` | Die Stormvoël | The Storm Bird | Der Sturmvogel | De Stormvogel | boss of the summer storm |
| `creature.kwevoel` | Kwêvoël | Go-away-bird | Graulärmvogel | Lawaaivogel | Go-away-bird / Graulärmvogel (named for its "kwê" call) |
| `creature.hadeda` | Hadeda | Hadeda | Hadeda-Ibis | Hadada-ibis | the real English name; onomatopoeic |
| `creature.sproeier` | Oom Faan se sproeivliegtuig | Uncle Faan's crop sprayer | Onkel Faans Sprühflieger | Ome Faans sproeivliegtuig | oom = uncle (the neighbour); Faan is a name |
| `creature.visarend` | Visarend | Fish eagle | Schreiseeadler | Schreeuwarend |  |
| `creature.meerkat` | Meerkat | Meerkat | Erdmännchen | Stokstaartje |  |

### Secrets

| Key | af | en | de | nl | Note |
|---|---|---|---|---|---|
| `secret.windpomp` | Oupa se windpomp | Oupa's wind pump | Oupas Windpumpe | Oupa's windpomp | windpomp = wind pump (also Dutch) |
| `secret.windpomp_sign` | Die windpompbord | The wind pump sign | Das Windpumpen-Schild | Het windpompbord |  |
| `secret.bakkie` | Die bakkie se noodwiel | The pickup's spare wheel | Das Reserverad vom Pick-up | Het reservewiel van de pick-up | bakkie = pickup truck |
| `secret.potjie` | Die potjie | The three-legged pot | Der Dreibeintopf | De driepoot | potjie = three-legged cast-iron pot |
| `secret.fence_bell` | Die heiningklok | The fence bell | Die Zaunglocke | De hekbel |  |
| `secret.weaver_camelthorn` | Die versamelvoëls se nes (moenie!) | The weavers' nest (don't!) | Das Webernest (lass das!) | Het wevernest (niet doen!) |  |
| `secret.dead_camelthorn` | Die dooie kameeldoringtak | The dead camelthorn branch | Der tote Kameldorn-Ast | De dode kameeldoorntak |  |
| `secret.mokoro_pole` | Die mokoro-paal se vlag | The mokoro marker's flag | Die Fahne am Mokoro-Pfahl | Het vlaggetje van de mokoro-paal | mokoro (dugout canoe) is the Setswana word used in English too |
| `secret.hippo` | Die water by die seekoei | The water by the hippo | Das Wasser beim Flusspferd | Het water bij het nijlpaard |  |
| `secret.lily_frog` | Die padda se waterlelie | The frog's lily pad | Das Seerosenblatt des Froschs | Het lelieblad van de kikker |  |
| `secret.baobab` | Die kremetartboom se vrug | The baobab's cream-of-tartar pod | Die Frucht am Affenbrotbaum | De vrucht van de apenbroodboom | kremetart = cream of tartar, the baobab fruit |
| `secret.dassie_koppie` | Die dassie op die koppie | The rock hyrax on the hill | Der Klippschliefer auf dem Hügel | De klipdas op de heuvel | dassie = rock hyrax, koppie = small rocky hill |
| `secret.boulder_crack` | Die gekraakte rots | The cracked boulder | Der gespaltene Felsbrocken | Het gebarsten rotsblok |  |
| `secret.nest_camelthorn` | Die versamelvoëls se nes (moenie!) | The weavers' family nest (don't!) | Das Nest der Siedelweber (nicht!) | Het nest van de republikeinwevers (niet doen!) |  |
| `secret.quiver_egg` | Die volstruiseier-waterfles in die kokerboom | The ostrich-egg flask in the quiver tree | Die Straußenei-Flasche im Köcherbaum | De struisvogelei-veldfles in de kokerboom |  |
| `secret.familiefoto` | Die meerkatte se familiefoto | The meerkats' family photo | Das Familienfoto der Erdmännchen | De familiefoto van de stokstaartjes | v1.7: the meerkats' secret; the toggle shows "Familiefoto" |
| `hud.familiefoto` | FAMILIEFOTO! | FAMILY PHOTO! | FAMILIENFOTO! | FAMILIEFOTO! | v1.7: the banner when it is taken |

### Charms (Season Run)

| Key | af | en | de | nl | Note |
|---|---|---|---|---|---|
| `charm.oupa_se_bril` | Oupa se Bril | Oupa's Specs | Oupas Brille | Oupa's Bril | bril = glasses |
| `charm.ekstra_bandolier` | Ekstra Bandolier | Extra Bandolier | Extra-Patronengurt | Extra Bandelier |  |
| `charm.snelhand` | Snelhand | Quick Hands | Flinke Hand | Snelle Hand | snel = quick |
| `charm.grondwerk` | Grondwerk | Groundwork | Bodenarbeit | Grondwerk | pun: ground shots; "grondwerk" is also Dutch |
| `charm.vlerkskoot` | Vlerkskoot | Wing Shot | Flügelschuss | Vleugelschot |  |
| `charm.fluitjie` | Fluitjie | Little Whistle | Pfeifchen | Fluitje |  |
| `charm.spaarblik` | Spaarblik | Savings Tin | Spardose | Spaarpot | blik = tin |
| `charm.rooi_patrone` | Rooi Patrone | Red Shells | Rote Patronen | Rode Patronen |  |
| `charm.laaste_patroon` | Laaste Patroon | Last Shell | Letzte Patrone | Laatste Patroon |  |
| `charm.stil_loop` | Stil Loop | Silent Barrel | Stiller Lauf | Stille Loop |  |
| `charm.bles_die_plaashond` | Bles die Plaashond | Bles the Farm Dog | Bles der Hofhund | Bles de Boerenhond | Bles is the dog's name (a white blaze) |
| `charm.konsertina` | Konsertina | Concertina | Konzertina | Concertina | boeremusiek squeezebox |
| `charm.hadeda_fluit` | Hadeda-Fluit | Hadeda Whistle | Hadeda-Pfeife | Hadada-fluit |  |
| `charm.windleser` | Windleser | Wind Reader | Windleser | Windlezer | "Windleser" is also good German, so de keeps it (allow-listed) |
| `charm.haelstorm` | Haelstorm | Hailstorm | Hagelsturm | Hagelstorm | pun: hael = hail and birdshot |
| `charm.padstal_vriend` | Padstal-Vriend | Farm Stall Friend | Hofladen-Freund | Stalletjesvriend |  |
| `charm.stampede_kenner` | Stampede-Kenner | Stampede Expert | Stampeden-Profi | Stampedekenner |  |
| `charm.hele_swerm` | Hele Swerm | Whole Flock | Ganzer Schwarm | Hele Zwerm |  |
| `charm.kettingreaksie` | Kettingreaksie | Chain Reaction | Kettenreaktion | Kettingreactie |  |
| `charm.oupa_se_kaart` | Oupa se Kaart | Oupa's Map | Oupas Karte | Oupa's Kaart |  |
| `charm.boeretroos_fles` | Boeretroos-Fles | Coffee Flask | Kaffeeflasche | Koffiefles | boeretroos ("farmers' comfort") = coffee |
| `charm.kwevoel_se_seen` | Kwêvoël se Seën | Go-away Blessing | Lärmvogel-Segen | Lawaaivogelzegen | seën = blessing |
| `charm.geheime_resep` | Oupa se Geheime Resep | Oupa's Secret Recipe | Oupas Geheimrezept | Oupa's Geheime Recept |  |
| `charm.generaal_se_pot` | Generaal se Pot | The General's Pot | Der Topf des Generals | De Pot van de Generaal | the boss's pot helmet |

### Crate items and consumables

| Key | af | en | de | nl | Note |
|---|---|---|---|---|---|
| `item.chilli_biltong` | Chilli-biltong | Chilli Jerky | Chili-Dörrfleisch | Chili-droogvlees | biltong = SA dried meat |
| `item.boeretroos` | Boeretroos | Farm Coffee | Farmerkaffee | Boerenkoffie | boeretroos = coffee |
| `item.bush_buckshot` | Bos-hael | Bush Buckshot | Busch-Schrot | Bos-hagel | already translated |
| `item.meerkat_spotter` | Meerkat-uitkyk | Meerkat Spotter | Erdmännchen-Späher | Stokstaartjes-spotter | helper; already translated |
| `item.blitslaai` | Blitslaai | Lightning Load | Blitzladung | Bliksemlading | v1.6b (D-043): blits = lightning, laai = load |
| `item.oupa_laai` | Oupa Laai | Oupa Loads | Oupa lädt | Oupa laadt | v1.6b (D-043): Oupa loads for you (auto reload) |
| `item.rooikol` | Rooikol | Red Dot | Rotpunkt | Rode Stip | 1.9.2 (D-055): rooi kol = red dot (the red dot sight) |

### Power-ups explained and Oupa's switch (v1.7b, D-046)

The power-up and crate-gun names are the "Crate items" rows above. Their sentences — what each one
does (`guide.effect.<id>`), the pickup card's short line (`pickup.<id>`), the tip
(`guide.tip.<id>`), how to get it (`guide.how.*`), the captions (`caption.pu.<id>`) and Oupa's
first-pickup lines (`bark.pu.<id>`) — carry no names of their own: numbers come from content
(`{s}`, `{n}`, `{x}`, `{pct}`, `{speed}`, `{idle}`, `{p}`, `{r}`, `{price}`) and names from
other keys (`{item}`, `{stall}` = `run.padstal`, `{run}` = `title.season_run`), so the "Afrikaans
names" toggle reaches them too. Oupa's first-pickup lines name the item through `{item}` too ("Ahh, {item}. Everything slows down
now."), so with the toggle on he says Boeretroos when the card does. Decimals use
a comma in af, de and nl ("0,6 s").

| Key | af | en | de | nl | Note |
|---|---|---|---|---|---|
| `shed.tab.powerups` | Krag-ops | Power-ups | Power-ups | Power-ups | the Gun Shed tab (v1.7b, D-046) |
| `guide.not_found` | Nog nie gekry nie | Not found yet | Noch nicht gefunden | Nog niet gevonden | a card the player has not picked up yet |
| `pickup.new` | Nuut! | New! | Neu! | Nieuw! | the first pickup card's tag |
| `tally.powerups` | Krag-ops gebruik | Power-ups used | Genutzte Power-ups | Gebruikte power-ups | the tally row |
| `settings.oupa` | Oupa se kommentaar | Oupa's comments | Oupas Sprüche | Oupa's opmerkingen | Settings → Sound & game |
| `settings.oupa.on` | Aan | On | An | Aan |  |
| `settings.oupa.text` | Net teks | Text only | Nur Text | Alleen tekst | bubble, no voice |
| `settings.oupa.off` | Af | Off | Aus | Uit | no barks or bubbles |
| `guide.half` | halwe | half | halber | halve | Boeretroos' {speed} at 50 % |
| `caption.pu_end` | [{item} is uitgewerk] | [{item} wears off] | [{item} lässt nach] | [{item} is uitgewerkt] | {item} is the item's name (follows the toggle) |

### Special days (Feesdae, D-048)

The special's name stays Afrikaans in every language, like the Gun Shed's names: "Spookjag" (spook
= ghost, jag = hunt) is the Halloween Daily's name on the title, the HUD, the tally and the share
card. Oupa's Spookjag lines keep his Afrikaans exclamations ("Spookjag, my kind!").

| Key | af | en | de | nl | Note |
|---|---|---|---|---|---|
| `feesdag.halloween.name` | Spookjag | Spookjag | Spookjag | Spookjag | spook + jag = ghost hunt |
| `feesdag.halloween.badge` | Spookjag vanaand! | Spookjag tonight! | Heute Nacht: Spookjag! | Vanavond Spookjag! | the title's badge |
| `feesdag.lanterns_out` | Lanterns uit! | Lanterns out! | Laternen aus! | Lantaarns uit! | every lantern shot dark |
| `feesdag.bat` | Vlermuis! | Bat! | Fledermaus! | Vleermuis! | a bat's +15 pop |
| `feesdag.owl` | Uil! Beskermd | Owl! Protected | Eule! Geschützt | Uil! Beschermd | the owl's −10 pop |

### Ranks

| Key | af | en | de | nl | Note |
|---|---|---|---|---|---|
| `rank.stadsjapie` | Stadsjapie | City Slicker | Stadtkind | Stadsmens | stadsjapie = city slicker (gentle teasing) |
| `rank.plaaswerker` | Plaaswerker | Farmhand | Farmhelfer | Boerenknecht |  |
| `rank.bosveldjagter` | Bosveldjagter | Bushveld Hunter | Buschjäger | Bosveldjager |  |
| `rank.bosveld_legend` | Bosveld-legende | Bushveld Legend | Buschveld-Legende | Bosveldlegende |  |
| `share.rank.stadsjapie` | Stadsjapie | City Slicker | Stadtkind | Stadsmens | share card |
| `share.rank.plaaswerker` | Plaaswerker | Farmhand | Farmhelfer | Boerenknecht |  |
| `share.rank.bosveldjagter` | Bosveldjagter | Bushveld Hunter | Buschjäger | Bosveldjager |  |
| `share.rank.bosveld_legend` | Bosveld-legende | Bushveld Legend | Buschveld-Legende | Bosveldlegende |  |

### Seasons and omens

| Key | af | en | de | nl | Note |
|---|---|---|---|---|---|
| `season.herfs` | Herfs | Autumn | Herbst | Herfst | the Afrikaans gloss in brackets goes (the toggle brings it back) |
| `season.winter` | Winter | Winter | Winter | Winter |  |
| `season.lente` | Lente | Spring | Frühling | Lente | "lente" is also Dutch |
| `season.somer` | Somer | Summer | Sommer | Zomer |  |
| `run.kind.omen` | Voorteken: die weer draai | Omen hunt: the weather turns | Omen-Jagd: das Wetter kippt | Voortekenjacht: het weer slaat om | omens have no names of their own; their text is already translated |

### Bonuses and currency

| Key | af | en | de | nl | Note |
|---|---|---|---|---|---|
| `hud.whole_flock` | DIE HELE SWERM! | THE WHOLE FLOCK! | DER GANZE SCHWARM! | DE HELE ZWERM! | whole-flock stamp; Oupa still shouts "Die hele swerm!" |
| `tally.whole_flocks` | Hele swerms | Whole flocks | Ganze Schwärme | Hele zwermen |  |
| `share.whole_flocks` | {n}× hele swerm | {n}× whole flock | {n}× ganzer Schwarm | {n}× hele zwerm |  |
| `run.doppies` | {n} doppies | {n} caps | {n} Kronkorken | {n} dopjes | doppies = bottle caps, the Season Run currency |

### Sentences that use a name

These follow the names above (and the toggle brings back their pre-v1.5 text too).

| Key | af | en | de | nl | Note |
|---|---|---|---|---|---|
| `ftue.secret` | Hmm, Oupa se windpomp… | Hmm, Oupa's wind pump… | Hmm, Oupas Windpumpe… | Hmm, Oupa's windpomp… | |
| `title.verder_locked` | Klop {quota} om Verder oop te sluit | Beat {quota} to unlock Further | Schlag {quota}, dann ist Weiter frei | Versla {quota} om Verder te openen | |
| `title.verder_best` | Verder-beste: {score} | Further best: {score} | Weiter-Rekord: {score} | Verder-record: {score} | |
| `tally.verder_unlocked` | Verder is vandag oop! | Further unlocked for today! | Weiter ist heute frei! | Verder vandaag open! | |
| `caption.meerkat_alarm` | [brandwag se alarmblaf — meerkatte duik] | [sentinel's alarm bark — meerkats dive] | [Alarmruf des Wächters — Erdmännchen tauchen ab] | [alarmroep van de wachter — stokstaartjes duiken weg] | v1.7: brandwag = the meerkat sentinel; the toggle says "brandwag" |
| `notaboek.familiefoto` | Neem die meerkatte se familiefoto (hou jou vuur) | Take the meerkats' family photo (hold your fire) | Mach das Familienfoto der Erdmännchen (nicht schießen) | Maak de familiefoto van de stokstaartjes (niet schieten) | v1.7 |
| `hud.tag_verder` | Verder · vêrder weg | Further · bonus map | Weiter · Bonuskarte | Verder · bonuskaart | |
| `title.nog_verder_best` | Nog Verder-beste: {score} | Further Still best: {score} | Noch-weiter-Rekord: {score} | Nog Verder-record: {score} | |
| `title.die_verste_best` | Die Verste-beste: {score} | The Furthest best: {score} | Am-weitesten-Rekord: {score} | Het Verst-record: {score} | |
| `tally.nog_verder_unlocked` | Nog Verder is vandag oop! | Further Still unlocked for today! | Noch weiter ist heute frei! | Nog Verder is vandaag open! | |
| `tally.die_verste_unlocked` | Die Verste is vandag oop! | The Furthest unlocked for today! | Am weitesten ist heute frei! | Het Verst is vandaag open! | |
| `hud.tag_nog_verder` | Nog Verder · nog verder weg | Further Still · bonus map | Noch weiter · Bonuskarte | Nog Verder · bonuskaart | |
| `hud.tag_die_verste` | Die Verste · die heel verste | The Furthest · bonus map | Am weitesten · Bonuskarte | Het Verst · bonuskaart | |
| `notaboek.unlock_nog_verder` | Sluit Nog Verder oop | Unlock Further Still | Schalte Noch weiter frei | Ontgrendel Nog Verder | |
| `notaboek.unlock_die_verste` | Sluit Die Verste oop | Unlock The Furthest | Schalte Am weitesten frei | Ontgrendel Het Verst | |
| `tally.notaboek_done` | Notaboek: {goal} | Notebook: {goal} | Notizbuch: {goal} | Notitieboek: {goal} | |
| `tally.charm_unlocked` | Nuwe gelukbringer by die Padstal: {charm} | New charm for the farm stall: {charm} | Neuer Talisman im Hofladen: {charm} | Nieuwe charm voor het stalletje: {charm} | |
| `run.no_charms` | Nog geen gelukbringers nie — koop hulle by die Padstal | No charms yet — buy them at the farm stall | Noch keine Talismane — kauf sie im Hofladen | Nog geen charms — koop ze bij het stalletje | |
| `run.to_padstal` | Na die Padstal | To the farm stall | Zum Hofladen | Naar het stalletje | |
| `run.help_title` | Hoe die Padstal werk | How the farm stall works | So funktioniert der Hofladen | Zo werkt het stalletje | |
| `run.pay.total` | Doppies verdien | Caps earned | Kronkorken verdient | Dopjes verdiend | |
| `run.ad_double` | ▶ Advertensie: dubbel Doppies (+{n}) | ▶ Ad: double caps (+{n}) | ▶ Werbung: doppelte Kronkorken (+{n}) | ▶ Advertentie: dubbele dopjes (+{n}) | |
| `run.help_doppies` | Doppies is bottelproppe wat jy in elke jag verdien: meer as jy die kwota klop, plus rente op wat jy spaar. Spandeer hulle hier. | Bottle caps are what you earn in every hunt: more for beating the quota, plus interest on what you save. Spend them here. | Kronkorken verdienst du in jeder Jagd: mehr fürs Übertreffen des Solls, dazu Zinsen auf Erspartes. Hier gibst du sie aus. | Dopjes verdien je in elke jacht: meer als je het quotum haalt, plus rente op wat je spaart. Hier geef je ze uit. | |
| `privacy.stored` | Jou instellings en vordering (jagte, beste tellings, range, Voëlboek, Notaboek, Seisoenrit en Daaglikse Jag-reeks) word net in hierdie blaaier gestoor. As jy jou blaaierdata uitvee, of die knoppie hieronder druk, is dit weg. | Your settings and progress (hunts, bests, ranks, Bird Book, Notebook, Season Run and Daily Hunt streak) are saved in this browser only. Clearing your browser data, or the button below, removes them. | Deine Einstellungen und dein Fortschritt (Jagden, Rekorde, Ränge, Vogelbuch, Notizbuch, Saisonjagd und Tagesjagd-Serie) werden nur in diesem Browser gespeichert. Wenn du die Browserdaten löschst oder die Taste unten drückst, sind sie weg. | Je instellingen en voortgang (jachten, records, rangen, Vogelboek, Notitieboek, Seizoensrun en Dagjacht-reeks) worden alleen in deze browser bewaard. Je browsergegevens wissen, of de knop hieronder, verwijdert ze. | |
| `charm.haelstorm.desc` | Elke 8ste skoot is 'n Voorlaaier-knal | Every 8th shot is a Muzzle-Loader blast | Jeder 8. Schuss ist ein Vorderlader-Knall | Elk 8e schot is een Voorlader-knal | |
| `charm.kettingreaksie.desc` | Elke Twee Vlieë: +0,2 Maal vir die jag | Each two-in-one shot: +0.2 Mult for the hunt | Jeder Doppeltreffer: +0,2 Mult für die Jagd | Elk twee-in-één-schot: +0,2 Mult voor de jacht | |
| `charm.kwevoel_se_seen.desc` | Kwêvoël 3× so dikwels; alles ×2 terwyl hy roep | Go-away-bird 3× as often; all bags ×2 while it calls | Lärmvogel 3× so oft; alle Vögel ×2, solange er ruft | Lawaaivogel 3× zo vaak; alle vangsten ×2 als hij roept | |
| `admin.sight_default` | Skiet-Skuur's | Gun Shed's | Wie im Waffenschuppen | Zoals in de Schietschuur | |
| `bark.legend` | Bosveld-legende! | Bushveld Legend! | Buschveld-Legende! | Bosveldlegende! | |
| `bark.run_won` | Die hele jaar! Bosveld-legende, my kind! | The whole year! Bushveld Legend, my kind! | Das ganze Jahr! Buschveld-Legende, Kind! | Het hele jaar! Bosveldlegende, m'n kind! | |

