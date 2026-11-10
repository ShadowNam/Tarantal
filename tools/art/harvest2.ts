// v1.18 (D-081, art bible §5.4) Die Oes, Phase 2: the interim art of the second Harvest sheet
// (src/game/view/harvest/harvest2Sheet.ts), drawn from the same posed skeletons as the warthogs
// (tools/art/harvest.ts) and the baboons (tools/art/baboons.ts) so they match: a warthog's jump
// over the fence (rising with the forelegs tucked, landing with them reaching), a warthog and a
// piglet pushing head-down under the wire, a baboon climbing a post (two steps, head up) and
// dropping off it, and the small hole's patch (a square of new mesh wired to the posts' bay and
// a flat stone over the burrow). Frames face right with the feet at the origin. Pure.
import {
  BABOON2_H,
  HARVEST2_SHEET_H,
  HARVEST2_SHEET_W,
  harvest2Frames,
  type Harvest2Frame,
} from '../../src/game/view/harvest/harvest2Sheet';
import { PIGLET_H, WARTHOG_H } from '../../src/game/view/harvest/harvestSheet';
import type { Rgba } from '../assets/image';
import { drawBaboon, MALE, walkPose } from './baboons';
import { ADULT, digPose, drawHog, gaitPose, PIGLET } from './harvest';
import { renderSvg } from './raster';
import { nextId, shade } from './scenery';
import { el, g, polyD, r2, svgDoc } from './svg';

/** The hogs' line width (as the Harvest sheet). */
const HOG_W = 0.009;

function hog(frame: 'wh_jump_a' | 'wh_jump_b' | 'wh_squeeze' | 'pg_squeeze', seed: number) {
  if (frame === 'pg_squeeze')
    return g(
      { transform: `scale(${PIGLET_H})` },
      drawHog(digPose(0.015), PIGLET, true, seed, HOG_W),
    );
  if (frame === 'wh_squeeze')
    return g(
      { transform: `scale(${WARTHOG_H})` },
      drawHog(digPose(0.015), ADULT, false, seed, HOG_W),
    );
  // In the air: no contact shadow; the body tips up as it rises, down as it lands, round its
  // middle (the origin stays the feet's line the sim's arc moves).
  const rising = frame === 'wh_jump_a';
  const pose = gaitPose(rising ? 0.12 : 0.62, true, false);
  const tip = rising ? -18 : 16;
  return g(
    { transform: `scale(${WARTHOG_H})` },
    g({ transform: `rotate(${tip} 0 -0.45)` }, drawHog(pose, ADULT, false, seed, HOG_W, false)),
  );
}

function baboon(frame: 'bb_climb_a' | 'bb_climb_b' | 'bb_drop', seed: number): string {
  // Up a post: the walking frames turned head-up (the hands above, the feet on the post);
  // dropping off it: a running frame tipped head-down.
  const climb = frame !== 'bb_drop';
  const pose = climb
    ? walkPose(frame === 'bb_climb_a' ? Math.PI / 2 : (3 * Math.PI) / 2)
    : walkPose(0.4, true);
  const tip = climb ? -66 : 38;
  // On the fence: no ground under it, so no contact shadow (the pose's own is clipped off).
  return g(
    { transform: `scale(${BABOON2_H})` },
    g({ transform: `rotate(${tip} 0 -0.05)` }, drawBaboon(pose, MALE, false, seed, false)),
  );
}

/** The patch over the small hole: new galvanised mesh across the bay's bottom and a stone on
 *  the burrow (mid layer px 1:1; origin on the fence's ground line, the hole's middle). */
function patch(): string {
  const mesh: string[] = [];
  const w = 58;
  const h = 104;
  for (let x = -w; x <= w; x += 13) mesh.push(`M${x} 0L${x + 26} ${-h}`, `M${x} ${-h}L${x + 26} 0`);
  const wire = '#A9B2B6';
  const stone = '#8C857A';
  const clip = nextId();
  return g(
    {},
    el('clipPath', { id: clip }, el('rect', { x: -w, y: -h, width: w * 2, height: h })),
    g(
      { 'clip-path': `url(#${clip})` },
      el('path', { d: mesh.join(''), stroke: wire, 'stroke-width': 1.6, fill: 'none' }),
    ),
    el('path', {
      d: `M${-w} ${-h}L${w} ${-h}M${-w} 0L${w} 0M${-w} ${-h / 2}L${w} ${-h / 2}`,
      stroke: shade(wire, -0.2),
      'stroke-width': 2.4,
    }),
    // Twists of wire holding it to the posts.
    el('path', {
      d: `M${-w - 3} ${-h + 6}l6 4M${-w - 3} -8l6 4M${w - 3} ${-h + 6}l6 4M${w - 3} -8l6 4`,
      stroke: shade(wire, -0.45),
      'stroke-width': 2.2,
    }),
    el('path', {
      d: polyD([
        [-46, 4],
        [-38, -16],
        [-8, -24],
        [30, -19],
        [46, -4],
        [40, 6],
      ]),
      fill: stone,
      stroke: shade(stone, -0.4),
      'stroke-width': 1.6,
    }),
    el('path', { d: 'M-30 -14L18 -18', stroke: shade(stone, 0.25), 'stroke-width': 2 }),
  );
}

/** One frame's drawing in design px (feet at 0). */
export function drawFrame2(frame: Harvest2Frame, seed: number): string {
  switch (frame) {
    case 'wh_jump_a':
    case 'wh_jump_b':
    case 'wh_squeeze':
    case 'pg_squeeze':
      return hog(frame, seed);
    case 'bb_climb_a':
    case 'bb_climb_b':
    case 'bb_drop':
      return baboon(frame, seed);
    case 'hole_patch':
      return patch();
  }
}

/** A frame's seed (stable whatever the packing order). */
export function frameSeed2(name: string): number {
  let h = 211;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 9973;
  return h;
}

/** The sheet at `k` texture px per design px (1: the delivered file; no HD twin). */
export function renderHarvest2Sheet(k: number): Rgba {
  const cells = harvest2Frames().map((f) => {
    const id = nextId();
    return g(
      {},
      el('clipPath', { id }, el('rect', { x: f.x, y: f.y, width: f.w, height: f.h })),
      g(
        { 'clip-path': `url(#${id})` },
        g(
          { transform: `translate(${r2(f.x + f.ox)} ${r2(f.y + f.oy)})` },
          drawFrame2(f.name, frameSeed2(f.name)),
        ),
      ),
    );
  });
  return renderSvg(
    svgDoc(
      HARVEST2_SHEET_W * k,
      HARVEST2_SHEET_H * k,
      [0, 0, HARVEST2_SHEET_W, HARVEST2_SHEET_H],
      '',
      g({}, ...cells),
    ),
  );
}
