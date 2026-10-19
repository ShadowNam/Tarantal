# Tarantal — Tarantal Madness

A browser-based game to hunt the famous Tarantal (helmeted guineafowl).

This repository is set up for building with Claude Code — locally or in Claude Code cloud sessions.

Everything needed to build *Tarantal Madness* with Claude Code, locally or in **Claude Code cloud
sessions**: project memory, design, architecture, art/audio direction, milestone plan, starter
content data, and Claude Code skills/rules/subagent/hooks.

```
CLAUDE.md                       project memory Claude Code loads every session (< 200 lines)
.claude/settings.json           SessionStart hook → scripts/install_pkgs.sh (cloud-only npm install)
.claude/rules/                  path-scoped rules (sim purity, content, game layer)
.claude/skills/milestone/       /milestone <n>  — run a milestone end to end with evidence
.claude/skills/tune/            /tune <request> — change tuning safely + balance report
.claude/skills/<28 folders>     Phaser 4 agent skills (v4.2.1, MIT — see PHASER-SKILLS-LICENSE.md)
.claude/agents/playtest-reviewer.md   fresh-context reviewer for each milestone
scripts/install_pkgs.sh         dependency install for cloud sessions (no-op locally)
docs/01-GAME-DESIGN.md          the game: pillars, flock mechanic, modes, Season Run, charms, FTUE
docs/02-TECH-ARCHITECTURE.md    Phaser 4 + TS, deterministic sim, content system, mobile, portals
docs/03-ART-AUDIO-BIBLE.md      locked style, concept-art review & fixes, specs, prompt pack, audio
docs/04-BUILD-PLAN.md           milestones M0–M10 with acceptance criteria and prompts
docs/05-DECISIONS-AND-RESEARCH.md   what changed from the Gemini spec, why, and sources
content/                        starting tuning data (scoring, birds, weapons, power-ups, charms, run, Karoo biome)
```

## Build in Claude Code cloud sessions (recommended)

1. **Connect GitHub to Claude** once (claude.ai/code onboarding, which installs the Claude GitHub
   App — make sure it has access to this repo), or run `/web-setup` from a local Claude Code CLI.
2. Open **claude.ai/code** (or the Code tab in the Claude app, or `claude --cloud` from a terminal),
   pick the **ShadowNam/Tarantal** repository and the **Default** environment (Trusted network access is enough
   for npm).
3. Start the first session with: `/milestone M0`. Review the plan, then let it run; it works on a
   branch and you open a PR from the session when the evidence looks right. Merge, then start a new
   session for `/milestone M1` (cloud sessions don't support `/clear` — a new session is the reset).
4. Dependencies install automatically at session start (`.claude/settings.json` → SessionStart hook
   → `scripts/install_pkgs.sh`, cloud sessions only, cached by lockfile hash).
5. **Playwright browsers:** their download hosts may not be on the Trusted allowlist. If e2e tests
   can't install browsers, switch the environment's network access to **Custom**, keep the defaults,
   and add the hosts printed by `npx playwright install --dry-run chromium webkit`; or put
   `npx playwright install --with-deps chromium webkit` in the environment's **setup script** so
   it's cached.
   Seen in M0: Chromium is preinstalled in cloud sessions (Playwright 1.56.1 matches it), but the
   WebKit download from `playwright.download.prss.microsoft.com` is blocked on Trusted. Without
   WebKit, local e2e runs the iPhone/Safari profiles on Chromium emulation; GitHub Actions always
   runs the real WebKit.
6. Optional: install the Claude GitHub App with **Auto-fix** so cloud sessions fix CI failures and
   review comments on their own PRs.

## Build locally instead

1. Install Node 22 LTS (or newer) and Claude Code; clone this repo; run `claude` in it.
2. Type `/milestone M0`; approve the plan; review the evidence; `/clear`; continue with
   `/milestone M1`, and so on. Ask for `/tune` when balancing.

## Keeping the Phaser skills current
`.claude/skills/` contains the 28 Phaser 4 agent skills from the Phaser repo at tag v4.2.1. When you
upgrade Phaser, replace those folders with the matching tag's `skills/` folder.

## Commands (from M0)
`npm run dev` · `npm run check` (typecheck + lint + unit tests + content validation) ·
`npm run test:e2e` · `npm run build` · `npm run size` · `npm run content:validate [-- --strict]`.

## After M0
Ask Claude to add hooks that enforce the rules — e.g. "write a PostToolUse hook that runs
`npm run typecheck` after edits to `src/**`". Hooks are deterministic; CLAUDE.md is advice.

## The game in one paragraph
Moorhuhn meets Balatro in the African bushveld: 90-second slapstick shooting-gallery hunts across a
panning South African panorama, where realistic guineafowl flocks forage, alert, run and finally
*flush* into steep take-offs — so flushing on purpose, chasing wing shots and wiping whole flocks
becomes the skill. Around that: a four-season roguelite **Season Run** with charm build-crafting and
boss birds, a shared **Daily Hunt** with a one-tap share card, and challenge links.

## Decisions you can still change
See `docs/05-DECISIONS-AND-RESEARCH.md §4` (portrait support, launch portal, languages, art/audio
budget, hunting vs camera-safari framing per market).
