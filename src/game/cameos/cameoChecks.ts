// v1.13 (D-075, review round 2): content ↔ view. The view draws a hunt's cameos from its area's one
// sheet (CAMEO_AREA_OF) and each kind lives on one sheet (CAMEO_KIND_AREA); a kind listed for a
// biome whose sheet doesn't hold it would walk the sim undrawn and still cost −10 when shot at.
// tools/validate-content.ts runs this (npm run content:validate), and so does a unit test.
import type { Cameos } from '../../content/schemas';
import { CAMEO_KIND_AREA } from './cameoAnim';
import { CAMEO_AREA_OF } from './cameoKeys';

/** Problems with cameos.json's areas against the sheets (empty: none). */
export function cameoSheetErrors(cameos: Pick<Cameos, 'areas'>): string[] {
  const out: string[] = [];
  for (const a of cameos.areas) {
    const area = CAMEO_AREA_OF[a.biome];
    if (area === undefined) {
      out.push(`${a.biome} has cameos but no cameo area (src/game/cameos/cameoKeys.ts)`);
      continue;
    }
    for (const k of a.cameos) {
      if (k === 'elephants') {
        if (area !== 'okavango')
          out.push(`${a.biome}: the elephants answer only the Okavango's far herd`);
        continue;
      }
      if (CAMEO_KIND_AREA[k] !== area)
        out.push(
          `${a.biome}: ${k} is drawn on the ${CAMEO_KIND_AREA[k]} sheet, not ${area}'s (it would walk undrawn)`,
        );
    }
  }
  return out;
}
