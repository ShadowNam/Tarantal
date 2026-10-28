# 1.9.2 balance: the Rooikol (red dot sight, D-055)

Pointer input, Classic on the Karoo (Monday layout for the bonus maps), `--workers 1`. The rifle
bot aims under the red dot at 1× (its aim error is not divided by a zoom). Final numbers:
`fireCooldownMul` 0.75, `redDotSwayMul` 0.6, 15 s, crate weight 14 (rifle hunts only).
Outputs (summaries): `docs/balance/rooikol/*.json`.

Gates: clearly worth picking (the competent bot scores more with it than with a crate that does
nothing), no change to non-rifle hunts, and the bonus-map cap (competent ≤ 4 500, v1.3) holds
even when every crate is a Rooikol.

## Final table (500 seeds, competent / plinker means)

| Run | Before | After |
|---|---|---|
| Classic, .22 (small scope), real crate table | 3 413 / 2 406 | 3 398 / 2 405 |
| Classic, Langloop, real crate table | 2 587 / 2 399 | 2 612 / 2 378 |

Before = the table without the Rooikol; after = with it (weight 14 of 114 in a rifle hunt). Two
crates a hunt, so most hunts never see it: both rows are within noise.

**What the Rooikol itself is worth** (500 seeds, every crate holds it, against a crate holding a
power-up with no effect):

| Gun | No-op crate | Rooikol | Difference |
|---|---|---|---|
| .22 (small scope) | 3 426 / 2 521 | 3 537 / 2 371 | **+111** / −150 |
| Langloop | 2 568 / 2 392 | 2 953 / 2 357 | **+385** / −35 |

**Cap check** (500 seeds, competent, every crate a Rooikol): Nog Verder .22 3 982, Langloop
3 962; Die Verste .22 3 551, Langloop 3 617. All under 4 500. PASS.

Shotgun hunts: unchanged. The Rooikol weighs nothing in their crate table, so the draw is the same
(unit test `rooikol.test.ts`), and every shotgun golden replay kept its events.

## How the numbers were chosen (100 seeds, every crate a Rooikol)

| Effect | .22 | Langloop |
|---|---|---|
| no-op crate | 3 306 / 2 575 | 2 540 / 2 323 |
| red dot only (instant, sway × 0.6) | 3 371 / 2 395 | 2 747 / 2 363 |
| cooldown × 0.5 only (no red dot) | 3 213 / 2 089 | — |
| red dot + cooldown × 0.5 | 3 004 / 2 116 | 2 873 / 2 273 |
| red dot + cooldown × 0.6 | 2 992 / 2 022 | 2 863 / 2 247 |
| **red dot + cooldown × 0.75** | **3 408 / 2 412** | **2 896 / 2 253** |

- The instant red dot is worth points by itself; the Langloop (0.35 s raise, 0.8 s bolt) gains most.
- A much shorter time between shots costs the .22's bots points: they fire the moment the gun is
  ready, and every shot alarms the flocks around it, so at 0.2 s between shots they scatter
  their own birds. × 0.75 keeps the gain on both guns. Sway (× 0 vs × 0.6) made no difference.
- The plinker loses a little on the .22: it relies on the scope's magnification for its far
  shots. The bots also don't model the time a player spends finding a bird in a zoomed view,
  which is what the product owner wanted gone, so these gains are the low end.
