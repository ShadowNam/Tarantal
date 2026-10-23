// Renders interim bird masters (D-029): creature × plane × clip × frame → RGBA at masterScale × the
// plane's @1x frame (docs/06 §3: box 620 × 400, sim position at (310, 230)).
import type { BirdClip } from '../../src/game/assets/assetIndex';
import type { ContentBundle } from '../../src/content/schemas';
import type { PlaneId } from '../../src/sim/types';
import { BIRD_BOX } from '../assets/targets';
import type { Rgba } from '../assets/image';
import { drawBird, type BirdShape, type Look } from './bird';
import { paletteFor, type ArtConfig } from './config';
import { clipPoses } from './poses';
import { renderSvg, tint } from './raster';
import { svgDoc, wobbleFilter, g } from './svg';

export function birdShape(content: ContentBundle, creature: string): BirdShape {
  const c = content.birds.creatures.find((x) => x.id === creature);
  const hb = c !== undefined && 'hitbox' in c ? c.hitbox : null;
  if (hb === null || hb.head === undefined) throw new Error(`${creature}: no body+head hitbox`);
  return {
    body: { rx: hb.body.rx, ry: hb.body.ry, oy: hb.body.oy },
    head: { x: hb.head.ox, y: hb.head.oy, r: hb.head.r },
  };
}

/** D-035: the outline colour for a bird whose darkest plumage tone is `shadow`. */
export function softInk(cfg: ArtConfig, shadow: string): string {
  const p = (h: string, k: number): number => parseInt(h.slice(k, k + 2), 16);
  const t = cfg.birds.softInk;
  return `#${[1, 3, 5]
    .map((k) =>
      Math.round(p(cfg.ink, k) + (p(shadow, k) - p(cfg.ink, k)) * t)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

export function planeLook(cfg: ArtConfig, content: ContentBundle, plane: PlaneId): Look {
  const p = content.scoring.planes[plane];
  // D-035: thinner outlines than the plane's comic line weight.
  const line = (p.lineWeightPx / p.scale) * cfg.birds.outline[plane];
  return {
    line,
    inner: line * cfg.birds.innerLine,
    dotR: cfg.birds.dots[plane].r,
    dotSpacing: cfg.birds.dots[plane].spacing,
    scallops: plane === 'near',
  };
}

/** Master size for a plane: the @1x frame × masterScale (far rounds to keep the 31:20 aspect). */
export function masterSize(
  cfg: ArtConfig,
  content: ContentBundle,
  plane: PlaneId,
): { w: number; h: number } {
  const s = content.scoring.planes[plane].scale * cfg.masterScale;
  return { w: Math.round(BIRD_BOX.width * s), h: Math.round(BIRD_BOX.height * s) };
}

export function birdFrameSvg(
  cfg: ArtConfig,
  content: ContentBundle,
  creature: string,
  plane: PlaneId,
  clip: BirdClip,
  frame: number,
): string {
  const poses = clipPoses(clip);
  const pose = poses[frame];
  if (pose === undefined) throw new Error(`${clip} has no frame ${frame}`);
  const v = cfg.birds.variants[creature];
  if (v === undefined) throw new Error(`no variant ${creature} in tools/art/config.json`);
  const { w, h } = masterSize(cfg, content, plane);
  const wob = cfg.birds.wobble[plane];
  let seed = 7;
  for (let k = 0; k < creature.length; k++) seed = (seed * 31 + creature.charCodeAt(k)) % 9973;
  const pal = paletteFor(cfg, creature);
  const body = drawBird({
    pose,
    look: planeLook(cfg, content, plane),
    pal,
    parts: v.parts,
    dotScale: v.dotScale ?? 1,
    shape: birdShape(content, creature),
    // D-035: soft ink, leaning toward the bird's own shadow colour.
    cfg: { ...cfg, ink: softInk(cfg, pal.shadow) },
    seed,
    frame,
    id: 'b',
  });
  const filter = wobbleFilter('wob', cfg.birds.wobble.frequency, wob, 11);
  return svgDoc(
    w,
    h,
    [-BIRD_BOX.originX, -BIRD_BOX.originY, BIRD_BOX.width, BIRD_BOX.height],
    filter,
    g(filter === '' ? {} : { filter: 'url(#wob)' }, body),
  );
}

export function renderBirdFrame(
  cfg: ArtConfig,
  content: ContentBundle,
  creature: string,
  plane: PlaneId,
  clip: BirdClip,
  frame: number,
): Rgba {
  const img = renderSvg(birdFrameSvg(cfg, content, creature, plane, clip, frame));
  return plane === 'far' ? tint(img, cfg.birds.skyTint.colour, cfg.birds.skyTint.far) : img;
}
