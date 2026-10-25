// v1.7 look round (D-044): where the meerkat colonies stand on screen at each desert map's opening
// view, against the HUD corners and the first-person gun at rest, on desktop (16:9), the Pixel 7
// and the iPhone 14 in landscape (its notch and home-indicator insets), right- and left-handed.
// A colony's rect is its mounds and its meerkats standing tall on the highest mound, wide enough
// for their foraging trips. The near plane pans 1:1, so a colony can pass under a corner later in
// a hunt (as pop-up birds do); what a map opens on must be clear. Used by colonyHud.test.ts and
// by the placement search in tools (pure: no Phaser).
import { BONUS_MAP_IDS, WEEKDAY_IDS, type Biome, type ContentBundle } from '../../content/schemas';
import { planeToDx } from '../../sim/camera';
import { resolveMap } from '../../sim/maps';
import { CAMERA_MAX_X, CAMERA_MIN_X, coreWidth } from '../../sim/world';
import { CELL_W, MOUND_HEIGHT, MOUND_HOLE_X } from '../assets/desertAssets';
import { designSizeFor, safeAreaInDesignPx } from '../layout';
import { hudLayout, type HudSizing, type Rect } from './hudLayout';

export const DEVICES = [
  {
    name: 'desktop 16:9',
    vw: 1920,
    vh: 1080,
    touch: false,
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  },
  {
    name: 'Pixel 7',
    vw: 915,
    vh: 412,
    touch: true,
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  },
  {
    name: 'iPhone 14',
    vw: 844,
    vh: 390,
    touch: true,
    insets: { top: 0, right: 47, bottom: 21, left: 47 },
  },
] as const;

/** The first-person gun's box (420 × 520, grip at its bottom centre) at rest — aimed at the
 *  screen centre — placed and leaned as WeaponView.update does, as a screen rect. */
export function gunRect(gunX: number, height: number, width: number, touch: boolean): Rect {
  const scale = touch ? 0.8 : 1;
  const dx = width / 2 - gunX;
  const lean = Math.atan2(dx, Math.max(200, height - height / 2)) * 0.35;
  const gx = gunX + dx * 0.08;
  const gy = height + 520 * 0.12 * scale;
  const corners = [
    [-210, 0],
    [210, 0],
    [-210, -520],
    [210, -520],
  ].map(([x = 0, y = 0]) => [
    gx + (x * Math.cos(lean) - y * Math.sin(lean)) * scale,
    gy + (x * Math.sin(lean) + y * Math.cos(lean)) * scale,
  ]);
  const xs = corners.map((c) => c[0] ?? 0);
  const ys = corners.map((c) => c[1] ?? 0);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.min(height, Math.max(...ys)) - Math.min(...ys),
  };
}

const overlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** The map's opening camera centre (Sim.ts: cameraStartU, else the middle). */
export function openingCamera(b: Biome): number {
  const u = b.cameraStartU;
  return u === undefined
    ? (CAMERA_MIN_X + CAMERA_MAX_X) / 2
    : Math.round((CAMERA_MIN_X + u * (CAMERA_MAX_X - CAMERA_MIN_X)) * 2) / 2;
}

/** Each colony's rect on screen (design px) at camera `cx` on a screen `width` wide. */
export function colonyRects(
  content: ContentBundle,
  b: Biome,
  cx: number,
  width: number,
): { id: string; rect: Rect }[] {
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

/** Every clash of the biome's colonies with the HUD or the gun, over all its maps. `only`
 *  limits it to one map (a layout id, or 'plain' for the Season Run's biome as it is). */
export function colonyScreenClashes(
  content: ContentBundle,
  biome: Biome,
  sizing: HudSizing,
  only?: string,
): string[] {
  const fails: string[] = [];
  for (const layout of [...WEEKDAY_IDS, 'plain' as const]) {
    if (only !== undefined && layout !== only) continue;
    for (const bonus of [undefined, ...BONUS_MAP_IDS]) {
      // (layout 'plain' is the biome as the Season Run plays it.)
      const plain = (layout as string) === 'plain';
      if (plain && bonus !== undefined) continue;
      const map = resolveMap(biome, plain ? undefined : layout, bonus).biome;
      const cx = openingCamera(map);
      for (const d of DEVICES)
        for (const mirrored of [false, true]) {
          const size = designSizeFor(d.vw, d.vh);
          const insets = safeAreaInDesignPx(d.insets, { width: d.vw, height: d.vh }, size);
          const l = hudLayout(size.width, size.height, insets, sizing, mirrored);
          const hud: [string, Rect][] = [
            ['gadget', l.gadget],
            ['belt', l.belt],
            ['reload prompt', l.reloadPrompt],
            ['timer', l.timer],
            ['frenzy', l.frenzy],
            ['score', l.score],
            // The consumable slots show in Season Run hunts only: the plain biome's map.
            ...(plain ? l.items.map((r, i): [string, Rect] => [`item ${i}`, r]) : []),
            // The gun at rest, for the default (right-handed) layout. No colony position can
            // clear both the right- and the left-handed gun at the opening view (their boxes
            // cover the middle from either side, ~670 px of near colony doesn't fit between),
            // and the content is the same for every player, so colonies follow the default.
            ...(mirrored
              ? []
              : [['gun', gunRect(l.gun.x, size.height, size.width, d.touch)] as [string, Rect]]),
          ];
          for (const { id, rect } of colonyRects(content, map, cx, size.width))
            for (const [name, r] of hud)
              if (overlap(rect, r))
                fails.push(
                  `${layout}${bonus === undefined ? '' : `+${bonus}`} ${d.name}${mirrored ? ' (left-handed)' : ''}: ${id} under the ${name}`,
                );
        }
    }
  }
  return [...new Set(fails)];
}
