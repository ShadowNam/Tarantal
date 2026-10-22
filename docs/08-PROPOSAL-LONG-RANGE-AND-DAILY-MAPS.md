# Design proposal: long range, sights and daily maps

**Status:** approved by the product owner on 22 Oct 2026; not built yet. It is built in four steps,
milestones v1.1–v1.4 in `04-BUILD-PLAN.md`. As each step is built, its rules move into
`01-GAME-DESIGN.md` (and `02-TECH-ARCHITECTURE.md` where the sim changes), with a decision entry in
`05-DECISIONS-AND-RESEARCH.md`. Until then, the game design doc is the rule book and this file is
the plan. Numbers here are starting points: `content/*.json` and the balance simulator decide.

## Summary

This proposal adds a different map for each day of the week with harder bonus maps, a long-range
stage, aiming through sights and scopes with zoom, and two new rifles. It also fixes the ammo
display and crosshairs so each gun shows its own.

| Feature | What the player gets | Changes game rules? |
| --- | --- | --- |
| Ammo display + crosshairs per gun | The right ammo and crosshair for each gun, drawn realistically | No |
| Day-of-week maps | Monday's map looks different from Tuesday's, the same for everyone | Yes (small) |
| Bonus maps | Play today's map well to unlock harder maps with birds further away | Yes |
| Sights and zoom | Iron sights, peep sight or scope; hold the fire button to zoom, let go to shoot | Yes |
| New guns | A .22 rifle with upgradable sights, and a long-range rifle with a scope | Yes |
| Long-range stage | The Namibië area: open pans and desert, birds far away | Yes (new area) |

## Day-of-week maps and bonus maps

Each area gets seven layouts, one per weekday, so a hunt on Monday looks and plays differently from
Tuesday. Today every area always has the same layout: the windpomp, bakkie and reservoir sit in the
same spots on every hunt. The Daily Hunt already changes area each day, in a 4-day cycle.

### What changes from day to day

- **Time of day and light:** dawn mist, bright midday, golden late afternoon, overcast, dusk.
- **Where things stand:** props, cover and secrets move, so the hiding spots and best angles change.
- **Where the birds are:** different feeding spots, fly-over routes and the mix of near, mid and far
  birds.
- **Weather:** calm, windy, or the area's own weather (dust devils, sun-showers, heat haze).

The day is counted in **UTC** like the Daily Hunt, so everyone in the world plays the same Monday
map. Challenge links and replays carry the map, so a shared hunt is always the identical map.

| Day | Light | Example: Karoo |
| --- | --- | --- |
| Monday | Dawn mist | Birds feed close to the reservoir; still air |
| Tuesday | Bright midday | Flocks spread across the open veld |
| Wednesday | Overcast | Bakkie parked by the fence; birds run more than fly |
| Thursday | Golden afternoon | Strong wind; long fly-over routes |
| Friday | Late afternoon | Flocks gather at the windpomp before roosting |
| Saturday | Dusk | Fewer birds, worth more; secrets glow |
| Sunday | Bright, calm | A relaxed map with extra pop-ups near you |

### Bonus maps: further and harder

Scoring well on today's map unlocks today's bonus maps, one step at a time:

1. **Verder (further):** the same place, seen from further back. More far birds, fewer near ones,
   wind stronger.
2. **Nog Verder (further still):** birds at a new, even greater distance appear. Shotguns struggle;
   the .22 with a peep sight or scope shines.
3. **Die Verste (the furthest):** long-range only. Birds are small dots unless you zoom in. Needs a
   scoped rifle.

The unlock is **beating the map's quota** (the same number the Season Run uses) on the map before
it. Unlocks reset each day, so there is always a reason to come back tomorrow. Each bonus map has
its own best score and counts for rank titles.

A weekday layout reuses the area's art and changes light, prop positions and weather, so it adds
almost nothing to the download.

## Long-range stage

A new, fourth distance band ("Ver", distant) sits behind today's far band, and the long-range stage
is built around it.

| Band | Bird size on screen | Points | Who can reach it |
| --- | --- | --- | --- |
| Near | 1.0 (largest) | 5 | Every gun |
| Mid | 0.5 | 10 | Every gun |
| Far | 0.22 | 25 | Every gun; shotguns lose pellets to spread |
| **Ver (new)** | **0.10** (a few pixels without zoom) | **50** | **Rifles only.** Shotgun pellets and slingshot stones fall short |

### Where it appears

- **In every area's bonus maps** (Nog Verder and Die Verste, above).
- **The Namibië pack** (already on the v1.x list): Etosha's white salt pan with mirages, quiver
  trees and the Namib dunes. It is wide open, so it is built for long range: most birds are far or
  Ver, flocks feed at a waterhole far out, and heat shimmer makes the long shots harder. It is
  unlocked by reaching Die Verste in any area.

### What makes long range feel different

- **Patience over speed:** fewer birds, worth more. A missed rifle shot alerts the whole flock far
  away, so the first shot matters.
- **Wind and mirage:** at Ver distance the bullet drifts with the wind, and the windsock tells you
  how much to hold off.
- **Spotting:** birds at Ver are tiny; you scan with the scope to find them. The Meerkat Spotter
  power-up marks them.

## Sights and zoom

Rifles are fired with **hold and release**: hold the fire button to raise the sight and zoom in,
aim, and the shot goes off when you let go; the view then zooms back out. Shotguns, the air rifle,
the slingshot and the crate guns stay as they are (they fire the moment you click or tap).

| Sight | Zoom | What you see | Steadiness | Raise time |
| --- | --- | --- | --- | --- |
| Iron sights (open) | 1.5× | Rear notch and front post; wide view | Steady | 0.15 s |
| Peep sight (aperture) | 2× | A small ring you look through; quick and precise | Steadier | 0.2 s |
| Small scope | 4× | Round scope view, black edge, fine crosshair | Some sway | 0.3 s |
| Variable scope (long-range rifle) | 3–9× | Scope view with range marks for holding over | More sway at 9× | 0.35 s |

### Controls

- **Desktop:** press and hold the left mouse button: the sight comes up and zooms in where you
  pointed. Move the mouse to aim while holding. Let go to fire; the view zooms back out. Scroll
  while holding to change zoom on the variable scope.
- **Phone:** press and hold on the screen: the sight comes up where your finger is. Drag to aim
  (finer than normal; holding near a screen edge pans). Lift your finger to fire. Tap the zoom label
  to switch the variable scope between 3×, 6× and 9×.
- **Quick tap = hip shot:** let go before the sight is fully up and the shot fires without zoom and
  with a wider spread, for close birds in a hurry.
- **Cancel without firing:** right-click while holding (desktop), or slide your finger onto the ammo
  display (phone).
- **Reload stays as it is:** right click or Space on desktop; flick down or tap the ammo on phones.

### Sway

While you hold, the view drifts slowly in a figure-eight, more at higher zoom. After about half a
second of holding, the shooter holds their breath and the sway settles for about 3 seconds; hold
longer and it grows again, so you can't camp on a bird. No extra button is needed. The sway is part
of the game rules (its own named RNG stream), so it is identical in a replay or challenge link.

### Upgrading sights

The .22 starts with iron sights. The peep sight and the small scope are earned through Notaboek
challenges and rank titles, and you choose which one is fitted in the Skiet-Skuur (the shed) before
a hunt. There is no paying for them; the Padstal stays a Season Run shop. A bigger zoom is not
simply better: the scope is slower to raise and sways more, so iron sights stay quicker for mid and
far birds.

## New guns

Two rifles join the four primary guns, each with its own job. Names are generic Afrikaans names,
with no real makes or models.

| Gun | Type | Shots / reload | Sights | Noise | Best at | Unlock (starting point) |
| --- | --- | --- | --- | --- | --- | --- |
| Dubbelloop (have) | Double-barrel shotgun | 8 shells / 0.9 s | Bead | Loud | Near and mid flocks | Start |
| Plaas-Pomp (have) | Pump shotgun | 6 / 0.7 s per shell | Bead | Loud | Mid, steady rhythm | Rank Plaaswerker |
| Windbuks (have) | Air rifle | 6 / 0.6 s per pellet | Open | Silent | Far, without alerting | Bag 50 far birds |
| Kettie (have) | Slingshot | Unlimited / 0.35 s draw | None | Quiet | Trick shots, ×2 score | Whole flock 3 times |
| **Die Twee-Twee (new)** | **.22 bolt-action rifle** | **5 rounds / 1.2 s magazine; 0.4 s bolt between shots** | **Iron → peep → small scope** | **Fairly quiet** | **Far and Ver with zoom** | **Unlock Nog Verder once** |
| **Die Langloop (new)** | **Long-range rifle** | **3 rounds / 1.5 s; 0.8 s bolt** | **Variable scope 3–9×** | **Very loud: alerts every flock** | **Ver, Die Verste, Namibië** | **Unlock Die Verste once** |

- **The Twee-Twee vs the Windbuks:** the air rifle is silent but its pellet drops and drifts at far
  range and cannot reach Ver. The .22 is flatter and reaches Ver with zoom, but every shot can alert
  nearby birds. GDD §10.5 cut a .22 for overlapping the air rifle; zoom and the Ver band now give it
  its own job, so that cut is reversed.
- **The Langloop is the only Ver specialist:** one loud, precise shot. You pick the right bird,
  because everything flies after it.
- Both shoot one bullet, so a hit is a hit; scores get ×1.5 on Ver for the Twee-Twee and ×2 for the
  Langloop to reward the harder shot (tuned in the balance simulator).

A rifle for birds is an arcade choice, like the 8-shell belt. The tone stays farm-humour, not
trophy hunting.

## Ammo display and crosshairs per gun

The ammo on the right side of the screen and the crosshair both change with the gun, and the ammo is
drawn realistically, not cartoony.

| Gun | Ammo shown on the right | Spent / empty look | Crosshair (normal aim) |
| --- | --- | --- | --- |
| Dubbelloop, Plaas-Pomp | 12-gauge shells: red plastic hull, brass base | Dull hull, fired primer | Open ring the size of the pellet spread (tighter ring for the Pomp) |
| Windbuks | Lead diabolo pellets, waisted shape | Gone (one less pellet) | Fine dot with a thin ring |
| Kettie | Round river stones in a small pile | Gone | Small V mark with a drop line showing where the stone falls |
| Voorlaaier (crate) | Paper cartridges with a lead ball | Torn paper | Very wide, rough ring |
| Mielie-Masjien (crate) | A hopper of dry mielie kernels that empties | Level drops | Jittery circle |
| Twee-Twee | .22 rimfire rounds: small brass case, grey lead nose | Empty brass case | Thin cross; the sight picture when zoomed |
| Langloop | Brass rifle cartridges with pointed bullets | Empty brass case | Thin cross; the scope picture when zoomed |

- **Looking through a sight** replaces the crosshair with that sight's picture: notch and post, the
  peep ring, or the scope reticle with range marks.
- **Crosshair styles** (a cosmetic planned for the Skiet-Skuur, not built yet) will recolour or
  restyle the normal crosshair, but keep its shape, so you can still read the gun's spread.
- **On phones** the offset crosshair option and touch aim assist work as now.

## What changes under the hood

| Change | Where | Risk and how it is handled |
| --- | --- | --- |
| Ammo display, crosshairs | Screen only | Low. No rule change; screenshot tests on desktop and phones |
| Day-of-week maps | Content: a layout per area and weekday | Medium. The map id joins the seed in replays and challenge links; old links keep the old map |
| Bonus maps | Content + saved progress on the device | Low. Unlocks are saved like Notaboek progress (`src/meta/storage.ts`) |
| Ver band | Sim: a fourth distance plane | Medium. New hit and scoring rules; golden replays re-recorded on purpose |
| Sights, zoom, sway | Sim: raising the sight and the zoom level become recorded commands; sway uses its own RNG stream | Medium. A zoomed tap must map to the same world point on every screen size (the Tech §3.3 rule) |
| New guns | Content + art + sound | Low to medium. Balance-simulator runs before and after |

- **Download size:** the weekday layouts reuse each area's art. The Namibië pack downloads only when
  you open it, like the other areas. The first download stays under 3 MB gzip.
- **Speed:** the scope view is one extra camera; it must keep 60 fps on the medium tier.

## Decisions taken (22 Oct 2026)

1. **Same map for everyone:** the weekday follows UTC, like the Daily Hunt.
2. **Bonus unlock rule:** beat the map's quota.
3. **Shotguns can't reach the Ver band:** pellets fall short.
4. **A .22 is added** (reverses the GDD §10.5 cut).
5. **Rifles use hold to zoom, release to fire;** reload stays on right click and Space. Only rifles
   work this way.
6. **Long-range rifle tone:** a generic long-range rifle named Die Langloop, farm-humour rather than
   trophy hunting.
