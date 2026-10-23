// Content of the development history (docs/history/Tarantal-Development-History.docx).
// Add a new entry to `stages` (and images to docs/history/img/) after each milestone, then run
//   NODE_PATH=$(npm root -g) node docs/history/build-history.cjs
// Times are UTC. Images are JPEGs in img/; a missing image is skipped with a warning.

const meta = {
  title: 'Tarantal Madness',
  subtitle: 'Development history',
  tagline: 'How the game came together, from the first commit to today',
  updated: '23 October 2026, 18:10 UTC',
  period: '19–23 October 2026',
};

// "By the numbers" on 23 Oct 2026 (main at 067f013).
const numbers = [
  ['Days since the first commit', '4'],
  ['Commits on main', '524'],
  ['Pull requests', '51 opened, all merged'],
  ['Game code (TypeScript, without tests)', 'about 31,000 lines'],
  ['Automated tests', '851 unit tests in 94 files, 35 browser test suites on 3 device profiles'],
  ['Hunting areas', '4 (Karoo, Bushveld, Okavango, Kalahari), each with 7 weekday maps and a bonus map'],
  ['Guns', '6 (Dubbelloop, Windbuks, Kettie, Plaas-Pomp, Voorlaaier, Mielie-Masjien)'],
  ['Creatures', '13 (guineafowl and variants, bosses, flyers)'],
  ['Languages', 'English, Afrikaans, German, Dutch'],
  ['Design decisions logged', '35 (D-001 to D-035)'],
];

const roles = [
  ['Product owner', 'Sets the direction, approves looks, gives feedback; anything that needs an account, money, a real phone or a person'],
  ['Tank', 'Coding agent on the product owner’s server: writes the game code, interim art and sound, tests and docs for each job'],
  ['Claude', 'Writes each job’s brief, checks in every 20 minutes, reviews looks and code, fixes small test and CI problems, merges on green tests, keeps the status doc and this history current'],
  ['GitHub CI', 'Runs the tests on every pull request (about 15 minutes) and the full suite on every merge; publishes the test build to GitHub Pages'],
];

// The same moment of a hunt (fixed seed and tick, desktop) recorded at each stage.
const evolution = [
  { img: 'evo-1-v100', caption: 'v1.0.0 (21 Oct): code-drawn placeholder art.' },
  { img: 'evo-2-gfx1', caption: 'Graphics pass 1 (22 Oct): detailed guineafowl and a long double-barrel.' },
  { img: 'evo-3-gfx2', caption: 'Graphics pass 2 (23 Oct): interim Karoo landscape, farmstead, water tank, bushes and sky.' },
  { img: 'evo-4-v11', caption: 'v1.1 (23 Oct): real shotgun shells in the ammo belt.' },
  { img: 'evo-5-v12', caption: 'v1.2 (23 Oct): a weekday map (overcast light, the bakkie moved).' },
  { img: 'evo-6-gfx3', caption: 'Graphics pass 3 (23 Oct): rounded hills, the farmstead whole, semi-realistic guineafowl and gun.' },
];

// Each stage: title, when (UTC), prs, decision, intro, bullets, feedback (what the product owner
// asked for, optional), images [{img, caption}] (renders/ = rebuilt from that commit later).
const stages = [
  {
    part: 'Foundations',
    title: 'M0 — Scaffold and guardrails',
    when: '19 Oct 2026, 20:33',
    prs: '#1',
    decision: 'D-017',
    intro: 'The project started from a build kit: the game design, architecture, art bible and build plan, written before any code.',
    bullets: [
      'Phaser 4 (pinned), TypeScript in strict mode, Vite, Zod for content, Vitest and Playwright for tests, ESLint and Prettier.',
      'The ground rule: the game’s rules ("the sim") are pure, deterministic code that never touches the screen, so every hunt can be replayed exactly.',
      'All tuning numbers live in JSON content files, checked by schemas.',
    ],
  },
  {
    title: 'M1 — Deterministic game engine',
    when: '19 Oct 2026, 21:15',
    prs: '#2',
    decision: 'D-018',
    intro: 'A whole hunt ran without graphics: from a seed, the content and the player’s inputs to a result.',
    bullets: [
      '60 ticks per second; named random streams so spawns, pellets and events never disturb each other.',
      'Own sine, cosine and exponent maths, so every browser and phone computes the same numbers.',
      'Scoring, guns, pellet spread, hit tests and replays; "golden" replays fail the tests if any rule changes by accident.',
    ],
  },
  {
    title: 'M2 — First playable hunt',
    when: '20 Oct 2026, 11:10',
    prs: '#3',
    decision: 'D-019',
    intro: 'The game became playable in the browser with placeholder art.',
    bullets: [
      'A 90-second Classic hunt on a panning, layered landscape (near, middle and far planes).',
      'Click or tap to shoot, right-click or tap the shell belt to reload; timer, score and shells on screen.',
      'Desktop and phone (Pointer Events, no browser zoom or scrolling).',
    ],
    images: [
      { img: 'renders/m02-title', caption: 'M2: the start card.' },
      { img: 'renders/m02-hunt', caption: 'M2: the first playable hunt.' },
    ],
  },
  {
    title: 'M3 — The Flock',
    when: '20 Oct 2026, 13:17',
    prs: '#4',
    decision: 'D-020',
    intro: 'The signature mechanic: guineafowl behave like a real flock.',
    bullets: [
      'Forage, then alert, then run, then flush into the air; the flock reacts to shots and misses.',
      'Juice pass 2: hit feedback, feathers, score pops.',
    ],
    images: [{ img: 'renders/m03-extra-shot', caption: 'M3: the first foraging flock, a moment after a shot: "POOF!" and score pops.' }],
  },
  {
    title: 'M4 — The Karoo',
    when: '20 Oct 2026, 16:19',
    prs: '#5',
    decision: 'D-021',
    intro: 'The home level, built entirely from content files.',
    bullets: [
      'Secrets to shoot: the windpomp, the spare wheel, the potjie, the fence bell.',
      'Events (a hadeda, a crop sprayer you must not hit) and the area’s omen.',
    ],
    images: [{ img: 'renders/m04-extra-pan', caption: 'M4: panning right along the Karoo level shows the bakkie, an agave and a bottle to shoot.' }],
  },
  {
    title: 'M5 — Menus, saves and the tutorial',
    when: '20 Oct 2026, 18:41',
    prs: '#6',
    decision: 'D-022',
    bullets: [
      'Safe saving (works even when the browser blocks storage), the title screen, the Skiet-Skuur (gun shed), settings and pause.',
      'A first-time tutorial for new players.',
    ],
    images: [{ img: 'renders/m05-title', caption: 'M5: the first real title screen, with the Skiet-Skuur and Settings.' }],
  },
  {
    part: 'Game modes',
    title: 'M6 — Season Run',
    when: '21 Oct 2026, 05:14 and 06:58',
    prs: '#7, #8 (and #9: the playable test build on GitHub Pages)',
    decision: 'D-023',
    intro: 'A roguelite run through four seasons.',
    bullets: [
      'Quotas per hunt, charms that change the rules, boss hunts and omen hunts.',
      'The Padstal (farm stall) between hunts to buy charms; save and resume a run.',
      'From 21 Oct every merge is playable on the GitHub Pages test build.',
    ],
    images: [
      { img: 'renders/m06-extra-season-intro', caption: 'M6: the card before a Season Run hunt: autumn, hunt 1 of 3, the bag quota.' },
      { img: 'renders/m06-extra-season-padstal', caption: 'M6: the Padstal between hunts, with four charms on offer.' },
    ],
  },
  {
    title: 'M7 — Daily Hunt',
    when: '21 Oct 2026, 10:27 and 11:08',
    prs: '#10, #11',
    decision: 'D-024',
    bullets: [
      'The same seeded hunt for everyone each day, with a streak (and a streak freeze).',
      'A share card and challenge links ("beat this score").',
    ],
    images: [
      { img: 'renders/m07-title', caption: 'M7: the title gains the Daily button and Season Run.' },
      { img: 'renders/m07-extra-daily', caption: 'M7: a Daily Hunt, with its tag and the wind sock.' },
    ],
  },
  {
    part: 'Content and platform',
    title: 'M8 — Three more areas and the arsenal',
    when: '21 Oct 2026, 14:05–17:04',
    prs: '#12–#16',
    decision: 'D-025',
    bullets: [
      'New guns: the Kettie (catapult, stones fly a moment before they land), the Plaas-Pomp and the Windbuks.',
      'Winter in the Bushveld: running flocks, dassie and boulder secrets, the boss Ou Grys, winter glare.',
      'Spring in the Okavango: splashing water, sun-showers, crested guineafowl hopping out of the reeds, the boss Kuifkop Koning.',
      'Summer in the Kalahari: heat haze turning into a storm, lightning, Die Stormvoël, a weaver nest.',
      'The Season Run now travels through all four real seasons.',
    ],
    images: [
      { img: 'renders/m08-hunt-bushveld-winter', caption: 'M8: winter in the Bushveld (placeholder art).' },
      { img: 'renders/m08-hunt-okavango-spring', caption: 'M8: spring in the Okavango (placeholder art).' },
      { img: 'renders/m08-hunt-kalahari-summer', caption: 'M8: summer in the Kalahari (placeholder art).' },
    ],
  },
  {
    title: 'M9 — Platform, speed, accessibility, languages',
    when: '21 Oct 2026, 20:30–21:31',
    prs: '#17–#21',
    decision: 'D-026',
    bullets: [
      'Builds for the web, Poki and CrazyGames; ads only between hunts, a rewarded retry, a privacy screen.',
      'Quality tiers for slower phones, areas downloaded only when needed, a size budget enforced by the tests.',
      'Accessibility checklist; German and Dutch translations; Afrikaans complete.',
      'Touch aim assist that rescues a near miss instead of widening every shot.',
    ],
    images: [{ img: 'renders/m09-hunt', caption: 'M9: the quality tiers add a vignette and colour grade.' }],
  },
  {
    part: 'Version 1.0',
    title: 'M10 — v1.0.0, ready for a soft launch',
    when: '22 Oct 2026, 01:25',
    prs: '#22–#29',
    decision: 'D-027',
    bullets: [
      'An asset pipeline with one switch between final and placeholder art; an audit of every asset.',
      'Recorded audio with a fallback, music and ambience per area; a juice pass on the tally and the Stampede.',
      'A capture mode for trailers, self-hosted fonts, visual regression tests, and the portal submission kit.',
    ],
    images: [
      { img: 'title-v100', caption: 'v1.0.0: the title screen (visual test baseline).' },
      { img: 'renders/m10-hunt-mobile', caption: 'v1.0.0 on an iPhone-sized screen.' },
    ],
  },
  {
    title: 'v1.0.1 — Clean-up',
    when: '22 Oct 2026, 08:34–14:19',
    prs: '#30, #31, #33, #34, #37, #38',
    decision: 'D-028',
    bullets: [
      'The public build keeps the Daily unranked until launch; the Daily start date is one content value.',
      'Faster score pops; a key hint in capture mode.',
      'Oupa’s barks: 43 lines as text now, voice later.',
      'A balance check across all modes (no changes needed).',
    ],
  },
  {
    title: 'Faster delivery',
    when: '22 Oct 2026, 16:04',
    prs: '#39',
    decision: 'D-030',
    intro: 'The product owner found the build loop too slow. Tests on a pull request went from about 48 minutes to about 15.',
    bullets: [
      'A quick test lane on pull requests and the full suite on every merge to main.',
      'Tests run inside the official Playwright image (installing browsers had cost up to 22 minutes per job).',
      'Working rules: one or two pull requests per job, check-ins every 20 minutes, and a stalled agent turn is restarted at once.',
    ],
  },
  {
    part: 'The look',
    title: 'Graphics pass 1 — detailed guns and guineafowl',
    when: '22 Oct 2026, 16:45–17:19',
    prs: '#32, #35, #36',
    decision: 'D-029',
    intro: 'An art generator and atlas pipeline, six first-person guns with recoil and reload, and detailed guineafowl. Human art can replace it later.',
    feedback: [
      'Birds looked grey and washed out → back to dark slate with bright cobalt faces so they pop against the veld.',
      'The shotgun read as a stubby revolver from behind → redrawn as a long double-barrel pointing into the scene.',
      'Download size and memory rose sharply → trimmed for low-end phones.',
    ],
    images: [
      { img: 'gfx1-dubbelloop', caption: 'Before | after: the Dubbelloop.' },
      { img: 'gfx1-flock', caption: 'Before | after: a foraging flock.' },
      { img: 'gfx1-generaal', caption: 'Before | after: the boss Generaal.' },
    ],
  },
  {
    title: 'The long-range plan',
    when: '22 Oct 2026, 18:54',
    prs: '#40',
    intro: 'The product owner’s list after graphics pass 1 became an approved plan (docs/08), split into v1.1 to v1.4.',
    feedback: [
      'Ammo on screen must match each gun and look real: shells, stones, air-rifle pellets, .22 rounds.',
      'Sound effects are very important.',
      'The crosshair should change per gun.',
      'A .22 long rifle, targets much further away, iron sights, peep sight and a low-power scope with zoom.',
      'Voices for Oupa through a text-to-speech subscription (needs the product owner’s account; later).',
    ],
  },
  {
    title: 'Graphics pass 2 — landscapes for all four areas',
    when: '22 Oct 2026, 23:18 and 23 Oct 00:05',
    prs: '#41, #42',
    decision: 'D-031',
    intro: 'Interim landscapes, props, other creatures and effects for the Karoo, Bushveld, Kalahari and Okavango.',
    feedback: [
      'Grass was stamped in a repeating pattern → varied tufts, stones and stalks in irregular clusters.',
      'Bushes were flat green blobs → twiggy Karoo bossies with light and shadow.',
      'The sky was plain → an autumn gradient with soft cumulus.',
      'A dark band behind the Kalahari dunes read as a glitch → a distant thunderhead.',
      '"Karoo approved, carry on with the other areas" (22 Oct, evening), together with the standing instruction to keep development going around the clock.',
    ],
    images: [
      { img: 'gfx2-karoo', caption: 'Before | after: the Karoo.' },
      { img: 'gfx2-bushveld', caption: 'Before | after: the Bushveld.' },
      { img: 'gfx2-kalahari', caption: 'Before | after: the Kalahari.' },
      { img: 'gfx2-okavango', caption: 'Before | after: the Okavango.' },
    ],
  },
  {
    part: 'Version 1.x',
    title: 'v1.1 — Gun feel',
    when: '23 Oct 2026, 04:24 and 04:40',
    prs: '#43, #44 (and #45: a CI fix)',
    decision: 'D-032',
    bullets: [
      'Realistic ammo per gun: shotgun shells, stones, air-rifle pellets, paper cartridges, a mielie-kernel hopper.',
      'A crosshair per gun that shows its spread; an offset crosshair on touch screens so the finger doesn’t hide the target.',
      '30 interim sound effects, plus music and ambience for each area.',
    ],
    images: [
      { img: 'v11-dubbelloop', caption: 'Before | after: the Dubbelloop’s shells and crosshair.' },
      { img: 'v11-kettie', caption: 'Before | after: the Kettie’s stones and crosshair.' },
      { img: 'renders/v11-hunt', caption: 'v1.1: the shotgun crosshair over the flock.' },
    ],
  },
  {
    title: 'v1.2 — Day-of-week maps and the bonus map Verder',
    when: '23 Oct 2026, 11:57',
    prs: '#47 (includes #46)',
    decision: 'D-033',
    bullets: [
      'Seven layouts per area, one per weekday (UTC): light, props, feeding spots, fly-over routes and weather change.',
      'Classic and the Daily play today’s map; replays and challenge links remember it.',
      'Beat the day’s target to unlock Verder, a bonus map further out; it resets at midnight UTC.',
    ],
    feedbackLabel: 'Look review before merging',
    feedback: [
      'Claude’s look review: make each weekday’s light clearly different (Monday haze, Tuesday clear midday, Wednesday overcast, Thursday golden afternoon, Friday dusty wind, Saturday dusk, Sunday bright); give Saturday a real dusk glow; vary the feeding spots. All done before merging.',
    ],
    images: [
      { img: 'renders/v12-title', caption: 'v1.2: the title names today’s map and the score that unlocks Verder.' },
      { img: 'v12-sheet1', caption: 'The Karoo, Monday to Thursday.' },
      { img: 'v12-sheet2', caption: 'The Karoo, Friday to Sunday and Verder.' },
      { img: 'renders/v12-hunt-bonus-verder', caption: 'Verder: the flock far out at the horizon, in haze.' },
    ],
  },
  {
    title: 'Playtest admin page',
    when: '23 Oct 2026, 13:30 (requested 11:50, live 13:32)',
    prs: '#48',
    decision: 'D-034',
    intro: 'Open the test site with ?admin=1 to reach every level directly.',
    feedback: [
      '"I want an ADMIN url that I can activate in my browser that enables access to all the levels to test them … select a level, review and test them one by one and give feedback." (spelling tidied)',
    ],
    bullets: [
      'Lists all 49 levels: each area plain, its seven weekday maps and Verder, the Daily on any date, and every Season Run stage.',
      'Choose the gun, seed, hunt length and weather; Play; come back to rate it (OK or Needs work, 1–5 stars, notes).',
      '"Send to GitHub" opens a pre-filled feedback issue; "Copy report" copies it. Admin hunts never touch normal progress. Web test build only.',
    ],
    images: [{ img: 'renders/admin-extra-admin-list', caption: 'The admin page: every map grouped by area and day, with options, review, stars and notes.' }],
  },
  {
    title: 'Speed tests run alone',
    when: '23 Oct 2026, 14:10',
    prs: '#50',
    intro: 'A low-end-phone speed test kept failing on the shared test machine. Run alone, the frame cost is 11 ms against a 20 ms budget, so the game itself was fine; the test now runs in its own job.',
  },
  {
    title: 'Graphics pass 3 — towards semi-realistic',
    when: '23 Oct 2026, 17:58 (started 11:59)',
    prs: '#49',
    decision: 'D-035',
    feedback: [
      '"The farmhouse seems half cut, layers issue. Also the mountains can’t all be flat, look at mountains in Namibia and make them more interesting. The car detail needs to be better. And the detail on the guns needs a more realistic touch, they look too cartoony; the same applies for the birds. I see there is even a bird that has no texture at all." (23 Oct, about 11:40; spelling tidied)',
    ],
    bullets: [
      'Round 1 (done 15:05): the farmhouse stands whole; every area has varied, Namibia-inspired hills (layered mesas, granite domes like Spitzkoppe, a massif like the Brandberg); a detailed old bakkie with no badge; finer guns and guineafowl; the bird with no texture was the kwêvoël (grey go-away-bird) and is now textured.',
      'Round 2 (done 15:36, after Claude’s review notes): guns without cartoon outlines, with fine wood grain, blued steel, a real stock shape and a slim pump slide; a hump-backed, egg-shaped guineafowl with a small head on a slim barred neck, a small eye, ringed spots and a soft edge; rounded, lopsided koppies instead of cones; Kalahari dunes with curved crests and slip faces.',
      'Code review fixes (done 17:33): the gun shed draws small picture icons instead of loading whole gun image sheets (about 1 MB instead of 16 MB or more; 101 MB in total after a hunt on a low-end phone, against a 128 MB limit); the last near-black gun edges went; the bakkie\u2019s spare wheel now hangs where it can be seen and shot.',
      'Merged at 17:58 with all tests green: 851 unit tests, first download 2.9 MB of 3 MB. The game\u2019s rules did not change.',
    ],
    images: [
      { img: 'gfx3-mountains', caption: 'Round 1, before | after: hills in the Karoo, Kalahari, Bushveld and Okavango, and the farmhouse.' },
      { img: 'gfx3-bakkie', caption: 'Round 1, before | after: the bakkie.' },
      { img: 'gfx3-birds', caption: 'Round 1, before | after: guineafowl (near and middle distance), the kwêvoël and the hadeda.' },
      { img: 'gfx3-guns', caption: 'Round 1, before | after: the Dubbelloop and the Pomp.', width: 380 },
      { img: 'gfx3-r2-guns', caption: 'v1.2 | round 1 | round 2: the Dubbelloop (top) and the Pomp (bottom).', width: 520 },
      { img: 'gfx3-r2-birds', caption: 'v1.2 | round 1 | round 2: the guineafowl near (top) and at middle distance (bottom).' },
      { img: 'gfx3-r2-ridges', caption: 'Round 2: rounded Karoo koppies (top) and Kalahari dunes with curved crests (bottom).' },
      { img: 'gfx3-final-karoo', caption: 'Before | after, in the game: the Karoo at the start of a hunt.' },
      { img: 'gfx3-shed-iphone', caption: 'The Skiet-Skuur gun cards with their new pictures, on an iPhone 14 held sideways.' },
    ],
  },
];

// The product owner's requests, in order.
const requests = [
  ['22 Oct', 'Fix the birds and the gun before merging graphics pass 1', 'Done in graphics pass 1 (#35, #36)'],
  ['22 Oct', 'Realistic ammo per gun, sound effects, crosshairs per gun, a .22 with far targets, sights and zoom', 'Plan approved (#40); ammo, crosshairs and sound in v1.1; long range in v1.3 and v1.4'],
  ['22 Oct', 'Karoo look: fix the grass, bushes and sky', 'Done in graphics pass 2 (#41, #42)'],
  ['22 Oct, evening', '"Karoo approved … keep pushing, 24/7"', 'Claude checks in every 20 minutes, with an hourly backup check'],
  ['23 Oct, 11:40', 'Farmhouse cut off, flat mountains, bakkie, guns and birds too cartoony, a bird with no texture', 'Graphics pass 3, merged at 17:58 (#49) after two look rounds and a code review'],
  ['23 Oct, 11:50', 'An admin URL to test every level and give feedback', 'Live at 13:32 (#48)'],
  ['23 Oct, 12:00', 'A document of what is built, what is not, estimates and who does what', 'The Build Status doc, updated at every change'],
  ['23 Oct, 15:05', 'A training ground to test different guns, near and far', 'Queued after v1.3'],
  ['23 Oct, 15:20', 'A Word document with the build pictures and history', 'This document'],
];

const next = [
  ['v1.3 Long range (running since 18:00, 23 Oct)', 'First a memory fix (gun pictures freed after a hunt); a far layer only rifles reach; iron sight 1.5×, peep 2×, small scope 4×; hold to zoom with sway; the .22 (Die Twee-Twee); bonus maps Nog Verder and Die Verste', 'Tank', '6–8 h, about 02:00–04:00 UTC on 24 Oct'],
  ['Training ground (Skietbaan)', 'Try every gun on targets and birds at near, middle and far distance; hit statistics and spread; from the admin page', 'Tank', '3–4 h'],
  ['v1.4 Die Langloop + Namibië', 'A long rifle with a 3–9× scope; the Namibië area (Etosha salt pan with mirages, quiver trees, Namib dunes, a far waterhole)', 'Tank', '6–8 h'],
];

const decisions = [
  ['D-001–D-016', 'Before code: engine, the sim/render split, data-driven content, landscape only, mobile input, no fullscreen on iPhone, monetisation, art direction, budget, name, flock tempo, charm order, build order'],
  ['D-017', 'M0 toolchain and scaling'],
  ['D-018', 'M1 game rules in the engine'],
  ['D-019', 'M2 game-layer rules'],
  ['D-020', 'M3 flock rules and balance'],
  ['D-021', 'M4 Karoo rules'],
  ['D-022', 'M5 saves, menus, tutorial'],
  ['D-023', 'M6 Season Run'],
  ['D-024', 'M7 Daily Hunt, share card, challenge links'],
  ['D-025', 'M8 remaining areas and arsenal'],
  ['D-026', 'M9 platform, performance, accessibility, languages'],
  ['D-027', 'M10 final art and audio integration'],
  ['D-028', 'v1.0.1 clean-up'],
  ['D-029', 'Graphics pass 1'],
  ['D-030', 'Faster delivery: CI lanes and working rules'],
  ['D-031', 'Graphics pass 2'],
  ['D-032', 'v1.1 gun feel'],
  ['D-033', 'v1.2 day-of-week maps and Verder'],
  ['D-034', 'Playtest admin page'],
  ['D-035', 'Art direction: semi-realistic (graphics pass 3)'],
];

const glossary = [
  ['Tarentaal', 'Helmeted guineafowl, the game’s quarry'],
  ['Dubbelloop', 'Double-barrelled shotgun'],
  ['Plaas-Pomp', 'Farm pump-action shotgun'],
  ['Windbuks', 'Air rifle'],
  ['Kettie', 'Catapult (slingshot)'],
  ['Voorlaaier', 'Muzzle-loader'],
  ['Mielie-Masjien', 'A home-made gun that fires maize kernels'],
  ['Die Twee-Twee / Die Langloop', 'The .22 rifle / the long rifle (v1.3, v1.4)'],
  ['Skiet-Skuur', 'Gun shed: pick and unlock guns'],
  ['Padstal', 'Farm stall: the shop between Season Run hunts'],
  ['Skietbaan', 'Shooting range (the planned training ground)'],
  ['Oupa', 'Grandpa, who comments on your hunt'],
  ['Bakkie', 'Pickup truck'],
  ['Koppie', 'Small rocky hill'],
  ['Verder', '"Further": the bonus map'],
  ['Kwêvoël', 'Grey go-away-bird'],
  ['Generaal, Ou Grys, Kuifkop Koning, Die Stormvoël', 'Boss birds'],
];

module.exports = { meta, numbers, roles, evolution, stages, requests, next, decisions, glossary };
