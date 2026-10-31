# New Year countdown — balance (D-065)

The New Year Daily (31 Dec / 1 Jan UTC) doubles every award in the hunt's last 10 s
(`feesdae.json` newyear `twist.countdown`: `lastSeconds: 10`, `mult: 2`). The Daily's
Stampede (×2, last 15 s) runs too, and the two **stack**: a bag in the last 10 s is ×4 before
Frenzy and charms; event bonuses (Twee Vlieë, Whole Flock, secrets, cans) are doubled too;
penalties never are.

## Run

`npx tsx tools/balance-sim.ts --mode daily --biome okavango-spring --layout thu [--feesdag newyear]
--seeds 100 --from 1|101|201|301|401 --workers 1` — 31 Dec 2026's map (the Okavango's Thursday),
500 seeds per bot in five chunks of 100 (the box kills larger runs), pointer input, omen on (as
the Daily). Means are pooled over the 500 hunts; the percentiles are the mean of the five chunks'
percentiles.

## Result

| bot | Daily (no special) mean · p15/p50/p85 | New Year mean · p15/p50/p85 | change |
|---|---|---|---|
| random | 300 · 170/285/422 | 344 · 184/320/499 | +14.9 % |
| plinker | 2762 · 2162/2682/3373 | 3294 · 2504/3193/4101 | +19.2 % |
| competent | 4838 · 3896/4784/5693 | 5593 · 4401/5442/6804 | +15.6 % |

## Choice

Stack (×4 in the last 10 s). The finale is the point of the day: the competent bot gains ~16 %,
the plinker ~19 %, the random bot ~15 %, so the spread between skill levels stays the same and
no bot leaves its rank band by more than the Christmas or Halloween bonuses' order. The
alternative (the larger of the two, ×2) would make the countdown invisible on a Daily, whose
last 15 s are already the Stampede. A New Year score is not compared with other days' (each
Daily has its own board), so the lift costs nothing.
