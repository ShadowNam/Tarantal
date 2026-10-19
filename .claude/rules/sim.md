---
paths:
  - "src/sim/**/*.ts"
---

# Deterministic simulation rules

- The sim must produce identical results for identical (seed, content, command log) on every
  browser and in Node. Treat any nondeterminism as a bug.
- Forbidden here: imports from `phaser` or `src/game/**`, DOM/`window`/`document`, `Date`,
  `performance`, `setTimeout`/`setInterval`, `Math.random`, `async`/`await`, `Promise`.
- Transcendental math (`sin`, `cos`, `tan`, `atan2`, `exp`, `log`, `pow`) only through
  `src/sim/detmath.ts`. Plain `+ - * /` and `Math.sqrt`, `Math.floor`, `Math.round`, `Math.abs`,
  `Math.min`, `Math.max` are fine.
- Randomness only from named streams: `rng.stream('<system>')`. Adding a new random call to one
  system must not change another system's sequence.
- Iterate in stable order (arrays sorted by id/spawn order). Never let `Map`/`Set`/object key order
  decide gameplay outcomes unless insertion order is itself deterministic.
- The sim never sees the device viewport width; camera and plane geometry come only from
  `src/sim/camera.ts` (Tech §3.3). Fire commands carry `dx` from screen centre, not absolute x.
- Time is ticks (60 per second). Convert seconds → ticks with `secondsToTicks()` at load time only.
- Everything tunable comes from the validated content bundle passed in `SimConfig`.
- Emit a typed event for every gameplay-relevant change; the renderer and audio react to events,
  never to internal sim fields they are not given in `snapshot()`.
- Every new rule gets a unit test; anything that changes outcomes updates golden replays deliberately.
