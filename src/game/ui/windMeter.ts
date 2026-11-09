// v1.17 (D-079): the HUD wind meter's bars — five, lit by the wind's strength now (the gust
// included: the same number the sim's drift uses). A breath of wind lights one bar.
export const WIND_BARS = 5;

export function windBars(strength: number): number {
  if (!(strength > 0)) return 0;
  return Math.max(1, Math.min(WIND_BARS, Math.round(strength * WIND_BARS)));
}
