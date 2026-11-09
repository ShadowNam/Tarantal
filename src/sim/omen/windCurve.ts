// v1.17 (D-079): the wind drift's plane curve, shared by the sim (wind.ts, in the lazy sim-systems
// chunk) and the fruit view (fruitHits.ts): [scroll factor, drift mul] by plane, highest first.
export type DriftCurve = readonly (readonly [number, number])[];

/** The drift multiplier at scroll factor `f`: the planes' driftPlaneMul, linear between them
 *  (a prop layer between two planes), the end values beyond (the sky beyond Ver). */
export function planeDriftMul(curve: DriftCurve, f: number): number {
  const first = curve[0];
  if (first === undefined) return 0;
  if (f >= first[0]) return first[1];
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1];
    const b = curve[i];
    if (a === undefined || b === undefined) break;
    if (f >= b[0]) return b[1] + ((a[1] - b[1]) * (f - b[0])) / (a[0] - b[0]);
  }
  return curve[curve.length - 1]?.[1] ?? 0;
}
