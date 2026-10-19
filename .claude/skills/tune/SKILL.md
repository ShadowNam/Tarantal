---
name: tune
description: Safely change gameplay tuning (quotas, scores, speeds, spawn rates, charm values) in content/ JSON, then validate and measure the effect with the balance simulator. Use when the user types /tune or asks to rebalance or change game numbers.
---

Tuning request: $ARGUMENTS

1. Identify which `content/*.json` values implement the request. Never change code to tune numbers;
   if a value is hard-coded, move it into content first (separate commit).
2. Run the balance sim before the change and save the summary:
   `npx tsx tools/balance-sim.ts --seeds 500 --out tmp/balance-before.json`
3. Edit the JSON. Keep `$comment` notes accurate.
4. `npm run content:validate` and `npm run test`. Golden replays will change if scoring or spawning
   changed — update them with `npm run golden:update` and state why.
5. Re-run the balance sim (`--out tmp/balance-after.json`) and report a before/after table per mode
   and hunt: mean, p25, p75 score; quota pass rate per bot; wing-shot share; whole-flock rate.
6. Check the targets in docs/01-GAME-DESIGN.md (§13.8 and the M3/M6 criteria in the build plan).
   If a change breaks a target, say so plainly and propose an alternative.
7. Commit as `tune(<area>): <what> — <effect>` with the before/after table in the body.
