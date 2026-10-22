// Review sheets of the interim birds (D-029): every clip of the tarentaal per plane, the hitbox
// overlay (content/birds.json, so the fit can be checked by eye), every variant, and the
// silhouette line-up against the kwêvoël and hadeda (bible §1 rule 6).
import type { ContentBundle } from '../../src/content/schemas';
import type { BirdClip } from '../../src/game/assets/assetIndex';
import type { PlaneId } from '../../src/sim/types';
import { NEAR_CLIPS } from '../assets/pack';
import { BIRD_BOX, CLIP_SPEC } from '../assets/targets';
import type { Rgba } from '../assets/image';
import { birdShape, renderBirdFrame } from './birdFrames';
import { clipsFor, type ArtConfig } from './config';
import { contactSheet, type SheetRow } from './sheets';
import { el } from './svg';

function frames(
  cfg: ArtConfig,
  content: ContentBundle,
  creature: string,
  plane: PlaneId,
  clip: BirdClip,
): Rgba[] {
  return Array.from({ length: CLIP_SPEC[clip].frames }, (_, k) =>
    renderBirdFrame(cfg, content, creature, plane, clip, k),
  );
}

function hitboxOverlay(content: ContentBundle, creature: string) {
  const s = birdShape(content, creature);
  return (w: number): string => {
    const k = w / BIRD_BOX.width;
    const ox = BIRD_BOX.originX * k;
    const oy = BIRD_BOX.originY * k;
    const style = { fill: 'none', stroke: '#E0218A', 'stroke-width': 2, 'stroke-dasharray': '6 4' };
    return [
      el('ellipse', {
        cx: ox,
        cy: oy + s.body.oy * k,
        rx: s.body.rx * k,
        ry: s.body.ry * k,
        ...style,
      }),
      el('circle', { cx: ox + s.head.x * k, cy: oy + s.head.y * k, r: s.head.r * k, ...style }),
      el('circle', { cx: ox, cy: oy, r: 4, fill: '#E0218A' }),
    ].join('');
  };
}

export function birdSheets(
  cfg: ArtConfig,
  content: ContentBundle,
  only?: string,
): [string, Uint8Array][] {
  const out: [string, Uint8Array][] = [];
  if (only === undefined || only === 'tarentaal') {
    const clips = clipsFor(cfg, 'tarentaal');
    const mid: SheetRow[] = clips.map((c) => ({
      label: `${c} (${CLIP_SPEC[c].frames} @ ${CLIP_SPEC[c].fps})`,
      frames: frames(cfg, content, 'tarentaal', 'mid', c),
    }));
    out.push([
      'tarentaal-clips-mid.png',
      contactSheet(cfg, 'Tarentaal — mid plane, all 11 clips (interim, D-029)', mid, 200),
    ]);
    const near: SheetRow[] = clips
      .filter((c) => NEAR_CLIPS.includes(c))
      .map((c) => ({ label: c, frames: frames(cfg, content, 'tarentaal', 'near', c) }));
    out.push([
      'tarentaal-clips-near.png',
      contactSheet(cfg, 'Tarentaal — near plane (pop-ups)', near, 300),
    ]);
    const far: SheetRow[] = clips.map((c) => ({
      label: c,
      frames: frames(cfg, content, 'tarentaal', 'far', c),
    }));
    out.push([
      'tarentaal-clips-far.png',
      contactSheet(
        cfg,
        'Tarentaal — far plane at 1:1 (fewer, larger dots; 2 px ink; sky tint)',
        far.map((r) => ({ ...r, frames: r.frames })),
        88,
      ),
    ]);
    const fit: SheetRow[] = (['forage_walk', 'alert', 'run', 'flap', 'peek'] as BirdClip[]).map(
      (c) => ({
        label: c,
        frames: frames(cfg, content, 'tarentaal', 'mid', c),
        overlay: hitboxOverlay(content, 'tarentaal'),
      }),
    );
    out.push([
      'tarentaal-hitboxes.png',
      contactSheet(
        cfg,
        'Hitbox fit — content/birds.json body + head (dashed), sim position (dot)',
        fit,
        200,
      ),
    ]);
  }
  const variants = Object.keys(cfg.birds.creatures).filter(
    (c) => c !== 'tarentaal' && (only === undefined || only === c),
  );
  if (variants.length > 0) {
    const rows: SheetRow[] = variants.map((v) => ({
      label: v,
      frames: clipsFor(cfg, v).map((c) => renderBirdFrame(cfg, content, v, 'mid', c, 0)),
      overlay: hitboxOverlay(content, v),
    }));
    out.push([
      'variants.png',
      contactSheet(
        cfg,
        'Variants — first frame of each clip (mid plane), hitboxes dashed',
        rows,
        200,
      ),
    ]);
  }
  return out;
}
