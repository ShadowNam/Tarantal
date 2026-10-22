// D-029: interim bird frames line up with content/birds.json hitboxes (docs/06 §3): the body
// ellipse is covered by the drawing in every ground and flight pose, the head circle in rest
// poses, and nothing touches the frame edge (it would be cut off).
import { describe, expect, it } from 'vitest';
import type { BirdClip } from '../../src/game/assets/assetIndex';
import { BIRD_BOX, CLIP_SPEC } from '../assets/targets';
import { loadContent } from '../testContent';
import { birdShape, renderBirdFrame } from './birdFrames';
import { clipsFor, loadArtConfig } from './config';

const cfg = loadArtConfig();
const content = loadContent();

function coverage(
  img: { width: number; height: number; data: Uint8Array },
  inside: (x: number, y: number) => boolean,
): number {
  const k = img.width / BIRD_BOX.width;
  let n = 0;
  let hit = 0;
  for (let py = 0; py < img.height; py += 2)
    for (let px = 0; px < img.width; px += 2) {
      const x = px / k - BIRD_BOX.originX;
      const y = py / k - BIRD_BOX.originY;
      if (!inside(x, y)) continue;
      n++;
      if ((img.data[(py * img.width + px) * 4 + 3] ?? 0) > 128) hit++;
    }
  return n === 0 ? 0 : hit / n;
}

function edgeAlpha(img: { width: number; height: number; data: Uint8Array }): number {
  let max = 0;
  for (let x = 0; x < img.width; x++)
    for (const y of [0, img.height - 1])
      max = Math.max(max, img.data[(y * img.width + x) * 4 + 3] ?? 0);
  for (let y = 0; y < img.height; y++)
    for (const x of [0, img.width - 1])
      max = Math.max(max, img.data[(y * img.width + x) * 4 + 3] ?? 0);
  return max;
}

const BODY_CLIPS: readonly BirdClip[] = [
  'forage_walk',
  'alert',
  'run',
  'takeoff',
  'flap',
  'land',
  'peek',
];
const HEAD_CLIPS: readonly BirdClip[] = ['forage_walk', 'alert', 'run', 'flap', 'peek'];

describe('interim birds fit their hitboxes (D-029)', () => {
  for (const creature of Object.keys(cfg.birds.creatures)) {
    it(
      creature,
      () => {
        const s = birdShape(content, creature);
        const clips = clipsFor(cfg, creature);
        for (const clip of BODY_CLIPS.filter((c) => clips.includes(c))) {
          const img = renderBirdFrame(cfg, content, creature, 'mid', clip, 0);
          const body = coverage(
            img,
            (x, y) => (x / s.body.rx) ** 2 + ((y - s.body.oy) / s.body.ry) ** 2 <= 0.8,
          );
          // Squash-and-stretch clips (crouch, landing) may pull the body in a little.
          const min = clip === 'takeoff' || clip === 'land' ? 0.85 : 0.95;
          expect(body, `${creature} ${clip} body`).toBeGreaterThan(min);
          if (HEAD_CLIPS.includes(clip)) {
            const head = coverage(
              img,
              (x, y) => (x - s.head.x) ** 2 + (y - s.head.y) ** 2 <= (s.head.r * 0.7) ** 2,
            );
            expect(head, `${creature} ${clip} head`).toBeGreaterThan(0.5);
          }
          expect(edgeAlpha(img), `${creature} ${clip} touches the frame edge`).toBe(0);
        }
      },
      60_000,
    );
  }
});

// Reviewer (D-029): every packed frame of the base tarentaal on every plane keeps its body on the
// hitbox (squash, peck and flight included) and never touches the frame edge.
describe('every tarentaal frame on every plane (D-029)', () => {
  const s = birdShape(content, 'tarentaal');
  for (const plane of ['near', 'mid', 'far'] as const) {
    it(
      plane,
      () => {
        const clips = cfg.birds.planeClips[plane] ?? [];
        for (const clip of clipsFor(cfg, 'tarentaal').filter((c) => clips.includes(c))) {
          for (let k = 0; k < CLIP_SPEC[clip].frames; k++) {
            const img = renderBirdFrame(cfg, content, 'tarentaal', plane, clip, k);
            expect(edgeAlpha(img), `${plane} ${clip}/${k} touches the frame edge`).toBe(0);
            if (clip === 'hit_poof') continue; // the bird vanishes into the cloud
            const body = coverage(
              img,
              (x, y) => (x / s.body.rx) ** 2 + ((y - s.body.oy) / s.body.ry) ** 2 <= 0.7,
            );
            expect(body, `${plane} ${clip}/${k} body`).toBeGreaterThan(0.85);
          }
        }
      },
      120_000,
    );
  }
});
