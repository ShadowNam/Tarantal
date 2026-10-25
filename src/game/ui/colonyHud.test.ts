// v1.7 look round (D-044): every meerkat colony stays clear of the HUD at each desert map's
// opening view, on desktop (16:9), the Pixel 7 and the iPhone 14 in landscape (its notch and home
// indicator insets), right- and left-handed. A colony's rect is its mounds and its meerkats
// standing tall on the highest mound, wide enough for their foraging trips. The near plane pans
// 1:1, so a colony can pass under a corner later in a hunt (as pop-up birds do); what a map opens
// on must be clear.
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import { BONUS_MAP_IDS, WEEKDAY_IDS, type Biome } from '../../content/schemas';
import { planeToDx } from '../../sim/camera';
import { resolveMap } from '../../sim/maps';
import { hasColonies } from '../../sim/meerkats/colony';
import { CAMERA_MAX_X, CAMERA_MIN_X, coreWidth } from '../../sim/world';
import { CELL_W, MOUND_HEIGHT, MOUND_HOLE_X } from '../assets/desertAssets';
import { designSizeFor, safeAreaInDesignPx } from '../layout';
import { hudLayout, type Rect } from './hudLayout';

const content = loadContent();
const feel = {
  marginPx: 28,
  beltTapMinPx: 64,
  gadgetPx: 120,
  chipW: 260,
  chipH: 48,
  zoomButtonPx: 88,
};
const DEVICES = [
  { name: 'desktop 16:9', vw: 1920, vh: 1080, insets: { top: 0, right: 0, bottom: 0, left: 0 } },
  { name: 'Pixel 7', vw: 915, vh: 412, insets: { top: 0, right: 0, bottom: 0, left: 0 } },
  { name: 'iPhone 14', vw: 844, vh: 390, insets: { top: 0, right: 47, bottom: 21, left: 47 } },
] as const;

const overlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** The map's opening camera centre (Sim.ts: cameraStartU, else the middle). */
function openingCamera(b: Biome): number {
  const u = b.cameraStartU;
  return u === undefined
    ? (CAMERA_MIN_X + CAMERA_MAX_X) / 2
    : Math.round((CAMERA_MIN_X + u * (CAMERA_MAX_X - CAMERA_MIN_X)) * 2) / 2;
}

/** Each colony's rect on screen (design px) at camera `cx` on a screen `width` wide. */
function colonyRects(b: Biome, cx: number, width: number): { id: string; rect: Rect }[] {
  const mk = content.birds.meerkats;
  const tall = mk.hitboxes.tall;
  const standing = -Math.min(
    tall.body.oy - tall.body.ry,
    (tall.head?.oy ?? 0) - (tall.head?.r ?? 0),
  );
  return (b.colonies ?? []).map((c) => {
    const layer = b.layers.find((l) => l.id === c.layer);
    const plane = layer?.plane ?? 'mid';
    const sf = layer?.scrollFactor ?? 1;
    const k = content.scoring.planes[plane].scale;
    const xs = c.burrows.map((x) => c.u * coreWidth(sf) + x.dx);
    // Mounds reach MOUND_HOLE_X either side of a hole; meerkats forage further out.
    const reach = Math.max(MOUND_HOLE_X * 0.85, mk.forageRadiusPx + CELL_W / 2) * k;
    const highest = Math.max(...c.burrows.map((x) => x.mound));
    const left = width / 2 + planeToDx(cx, sf, Math.min(...xs) - reach);
    const right = width / 2 + planeToDx(cx, sf, Math.max(...xs) + reach);
    const top = c.y - highest - standing * k;
    const bottom = c.y + MOUND_HEIGHT * k;
    return { id: c.id, rect: { x: left, y: top, w: right - left, h: bottom - top } };
  });
}

describe('meerkat colonies stay clear of the HUD (v1.7 look round, D-044)', () => {
  for (const biome of content.biomes.filter(hasColonies))
    it(`${biome.id}: every map's opening view on every device`, () => {
      const fails: string[] = [];
      for (const layout of WEEKDAY_IDS)
        for (const bonus of [undefined, ...BONUS_MAP_IDS]) {
          const map = resolveMap(biome, layout, bonus).biome;
          const cx = openingCamera(map);
          for (const d of DEVICES)
            for (const mirrored of [false, true]) {
              const size = designSizeFor(d.vw, d.vh);
              const insets = safeAreaInDesignPx(d.insets, { width: d.vw, height: d.vh }, size);
              const l = hudLayout(size.width, size.height, insets, feel, mirrored);
              const hud: [string, Rect][] = [
                ['gadget', l.gadget],
                ['belt', l.belt],
                ['reload prompt', l.reloadPrompt],
                ['timer', l.timer],
                ['frenzy', l.frenzy],
                ['score', l.score],
                ...l.items.map((r, i): [string, Rect] => [`item ${i}`, r]),
              ];
              for (const { id, rect } of colonyRects(map, cx, size.width))
                for (const [name, r] of hud)
                  if (overlap(rect, r))
                    fails.push(
                      `${layout}${bonus === undefined ? '' : `+${bonus}`} ${d.name}${mirrored ? ' (left-handed)' : ''}: ${id} under the ${name}`,
                    );
            }
        }
      expect([...new Set(fails)]).toEqual([]);
    });
});
