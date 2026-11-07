// v1.13 (D-075, art bible §5.7) interim art for the veld cameos: one small sheet per area (layout in
// src/game/cameos/cameoSheet.ts), drawn at `k`× (1 = the Standard pack, 2 = its HD twin; every
// frame is authored at half size and shown ×2). The drawings live in cameosHoofed.ts (warthogs,
// springbok, gemsbok) and cameosSmall.ts (the dung beetle, the tortoise, the ostrich and its dust);
// this file lays them out on the sheets.
// Coordinates: design px round each frame's origin (the feet), facing right, y down.
import { CAMEO_SHEET_SIZE, type CameoSheetArea } from '../../src/game/cameos/cameoKeys';
import {
  cameoFrames,
  sheetRect,
  type CameoFrame,
  type CameoFrameRect,
} from '../../src/game/cameos/cameoSheet';
import type { Rgba } from '../assets/image';
import { hoofedFrameArt, isHoofedFrame } from './cameosHoofed';
import { smallFrameArt } from './cameosSmall';
import { renderSvg } from './raster';
import { el, g, r2, svgDoc } from './svg';

/** One frame's drawing round its origin: gradient defs (ids unique per call) and the shapes. */
export interface CameoArt {
  readonly defs: string;
  readonly body: string;
}

/** A frame's drawing (design px round its feet, facing right). */
export function cameoFrameArt(name: CameoFrame): CameoArt {
  return isHoofedFrame(name) ? hoofedFrameArt(name) : smallFrameArt(name);
}

/** An area's whole sheet as SVG (sheet px viewBox, rendered at `k`×). */
export function cameoSheetSvg(area: CameoSheetArea, k = 1): string {
  const defs: string[] = [];
  const parts: string[] = [];
  cameoFrames(area).forEach((f: CameoFrameRect, i) => {
    const id = `cmcell${i}`;
    const c = sheetRect(f);
    const art = cameoFrameArt(f.name);
    defs.push(art.defs);
    parts.push(
      g(
        {},
        el('clipPath', { id }, el('rect', { x: c.x, y: c.y, width: c.w, height: c.h })),
        g(
          { 'clip-path': `url(#${id})` },
          g(
            {
              transform: `translate(${r2(f.x + f.ox * f.res)} ${r2(f.y + f.oy * f.res)}) scale(${f.res})`,
            },
            art.body,
          ),
        ),
      ),
    );
  });
  const { w, h } = CAMEO_SHEET_SIZE[area];
  return svgDoc(w * k, h * k, [0, 0, w, h], defs.join(''), parts.join(''));
}

export function renderCameoSheet(area: CameoSheetArea, k = 1): Rgba {
  return renderSvg(cameoSheetSvg(area, k));
}

/** One frame alone at `k`× its drawn size (previews, the art tests). */
export function cameoFrameSvg(area: CameoSheetArea, name: CameoFrame, k = 1): string {
  const f = cameoFrames(area).find((x) => x.name === name);
  if (f === undefined) throw new Error(`no cameo frame ${area}/${name}`);
  const art = cameoFrameArt(name);
  return svgDoc(
    f.w * k,
    f.h * k,
    [0, 0, f.w, f.h],
    art.defs,
    g({ transform: `translate(${r2(f.ox)} ${r2(f.oy)})` }, art.body),
  );
}
