---
paths:
  - "src/game/**/*.ts"
  - "src/platform/**/*.ts"
  - "src/meta/**/*.ts"
---

# Phaser / platform layer rules

- This is Phaser 4. Check `.claude/skills/` (Phaser skills) for scenes, loader, input, cameras,
  filters, particles and tint before writing code from memory.
- Render from `sim.snapshot()` with interpolation between the last two ticks; never write into sim
  state. Input becomes `Command`s via `src/game/input/InputMapper.ts` only.
- Layout from the design height (1080) and the current width; anchor HUD to safe areas. Test at
  16:9, 19.5:9 and 4:3.
- Touch: tap = fire, horizontal drag = pan, flick-down or belt tap = reload. Keep tap targets
  ≥ 64 design px. Mirror bottom-left buttons in left-handed mode.
- All art goes through the `AssetManifest`; placeholders from `ProceduralAssetFactory` must keep
  working until final assets replace them.
- Respect quality tiers (particles, filters, layer merges) from `QualityManager`.
- Audio through `AudioDirector` only; mute on visibility change, pause and ads.
- Storage only via `src/meta/storage.ts`. Portal calls only via `PlatformAdapter`.
- No user-visible strings in code — i18n keys only.
