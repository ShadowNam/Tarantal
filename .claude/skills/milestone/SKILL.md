---
name: milestone
description: Run one build milestone from docs/04-BUILD-PLAN.md end to end — plan, implement, verify with evidence, adversarial review. Use when the user types /milestone <n> or asks to start or continue a milestone.
disable-model-invocation: true
---

Milestone to run: $ARGUMENTS

1. Read the milestone section for "$ARGUMENTS" in `docs/04-BUILD-PLAN.md`, then only the doc
   sections it references (GDD / Tech / Art bible). Read the relevant `content/` files.
2. Check prior milestones' "Done when" items still hold (`npm run check`). If something is broken,
   report it and fix it first.
3. Produce a plan: files to add/change, interfaces, tests to write, how each acceptance criterion
   will be proven. List any open question that blocks the work and ask it now. Wait for approval if
   in plan mode.
4. Implement in small commits. Write tests alongside code. Keep `src/sim/` pure (see
   `.claude/rules/sim.md`). Verify unfamiliar Phaser 4 APIs against the Phaser skills.
5. Verify every acceptance criterion and show evidence:
   - `npm run check` output (tail)
   - relevant test names and results
   - Playwright screenshots (desktop + Pixel 7 + iPhone 14 landscape) for anything visual
   - balance-sim summary for gameplay/tuning milestones
6. Run the `playtest-reviewer` subagent with the milestone name and the diff since the milestone
   started. Fix gaps that affect correctness or acceptance criteria; list the rest as follow-ups.
7. Update docs if a rule changed; append a decision entry to `docs/05-DECISIONS-AND-RESEARCH.md`.
8. Finish with a short report: what was built, evidence, follow-ups, and the suggested next milestone.
