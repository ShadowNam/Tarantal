# 1.9.3 balance: makalani nuts and the far-fence cans (D-056)

500 seeds per cell, Classic, pointer input, the day's layout, the Dubbelloop unless the cell says
otherwise (`npx tsx tools/makalani-sweep.ts --tag t500 --seeds 500 --only <cell>`, one cell per
process; raw numbers in `docs/balance/makalani/t500.json`, 100-seed iteration runs in
`t100.json`; the table: `--tag t500 --table`). Content at 1.9.3: `scoring.json → nuts`
(crack-off 5, air hit 10 + 3 a step up to chain 8, pop 12, Weg! 18, × plane near 0.8 / mid 1.3;
× Stampede only) and `birds.json → makalani`.

Bots: **competent** (GDD §13.8); **nut-happy** — the competent bot that shoots every nut in view
first (one in the air led along its arc, else a hanging one), gives up on a hanging nut after three
misses as a player would, and also shoots every can (it wraps the can-happy bot); on the Karoo the
**can-happy** bot, which since 1.9.3 shoots the far fence's cans too. "before" = the same map
without its palms (Okavango) or without the far fence's cans (Karoo Wednesday).

## Gates

| gate | result | detail |
|---|---|---|
| cans + nuts ≤ ~10 % of the competent bot's score, every map | PASS | worst 0.2 % (Okavango Monday, Tuesday) |
| a competent hunt with palms stays within ±3 % of the map without them | PASS | +0.0 % … +0.8 % |
| cans + nuts ≤ ~10 % of the nut-happy (can-happy) bot's score, Dubbelloop | PASS | worst 8.9 % (Okavango Tuesday) |
| the same with the .22 (a rifle bullet pops a nut) | PASS | 4.0 % |
| the same with the Pomp | over (stress case) | 15.1 % of a 1 776 mean: with its slow per-shell reload the nut-happy bot spends most of the hunt juggling nuts instead of hunting (its score falls by over half); a player who juggles that much has chosen the toy over the birds |

## Table (500 seeds)

| map | competent before | competent after | change | cans + nuts share | nut-happy (can-happy on the Karoo) | its cans + nuts share | crack-offs / air hits / pops per hunt |
|---|---|---|---|---|---|---|---|
| Okavango mon (3 palm groups) | 4 604 | 4 639 | 0.8 % | 0.2 % | 3 889 | 6.4 % | 24.37 / 7.80 / 0.53 |
| Okavango tue (3 palm groups) | 3 637 | 3 662 | 0.7 % | 0.2 % | 3 029 | 8.9 % | 25.57 / 7.98 / 0.52 |
| Okavango wed (2 palm groups) | 4 326 | 4 330 | 0.1 % | 0.0 % | 3 613 | 4.0 % | 14.60 / 2.52 / 0.01 |
| Okavango thu (2 palm groups) | 4 771 | 4 776 | 0.1 % | 0.0 % | 4 268 | 3.7 % | 16.19 / 5.22 / 0.40 |
| Okavango fri (2 palm groups) | 4 292 | 4 311 | 0.5 % | 0.1 % | 3 648 | 6.9 % | 22.89 / 10.00 / 0.92 |
| Okavango sat (2 palm groups) | 5 125 | 5 130 | 0.1 % | 0.0 % | 4 564 | 3.0 % | 14.69 / 2.31 / 0.01 |
| Okavango sun (2 palm groups) | 3 938 | 3 947 | 0.2 % | 0.1 % | 3 564 | 5.2 % | 16.86 / 7.00 / 0.58 |
| Karoo wed (near + far fence) | 4 328 | 4 329 | 0.0 % | 0.0 % | 3 900 | 6.1 % | 0.00 / 0.00 / 0.00 |

| caps: gun cell | mean | cans + nuts share | pops per hunt |
|---|---|---|---|
| Okavango mon · twee_twee iron · nut-happy | 2 382 | 4.0 % | 5.94 |
| Okavango mon · pomp · nut-happy | 1 776 | 15.1 % | 0.77 |

History: the crack-off paid 6 at first; the nut-happy bot's nuts reached 10.9 % of its score on
Okavango Tuesday (100 seeds), so it pays a can's 5. The give-up rule came in with the review fixes
(before it the nut-happy bot spent whole Pomp hunts on tiny mid-plane nuts: mean 300).
