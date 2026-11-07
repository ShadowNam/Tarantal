// v1.13 (D-075): the test-build preview's placing for the veld cameos (never shipped content).
/**
 * v1.13 (D-075, review round 2) test builds only: where `?cameoPreview=` puts each plane's cameos
 * (screen px from the centre) and how much slower they walk. Left of the centre, clear of the
 * first-person gun's barrel on screen (right-handed, 16:9–21:9; Brakkie's gun stripe is 65–360 px
 * to the right at near-ground height) and of the HUD's corners (the bottom belt starts 568 px out
 * on 16:9); a mid herd trailing to the right still ends left of the stripe. `maxWalkPx` caps the
 * walk (the ostrich's sprint at a quarter still crossed the gun's column within seconds).
 */
export const CAMEO_PREVIEW_SPOT = {
  startDxPx: { near: -360, mid: -300 },
  speedMul: 0.25,
  maxWalkPx: 40,
} as const;
