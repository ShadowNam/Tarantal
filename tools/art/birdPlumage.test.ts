// v1.15 (D-077): the helmeted guineafowl's plumage in every frame — a dense field of white spots
// lit like the body (the spots' own gradient), the same field whatever the pose (the spots stay
// put while the bird moves), and darker primaries on the folded and the flying wing.
import { describe, expect, it } from 'vitest';
import type { BirdClip } from '../../src/game/assets/assetIndex';
import type { ArtPlaneId } from '../../src/game/assets/artPlane';
import { loadContent } from '../testContent';
import { birdFrameSvg } from './birdFrames';
import { clipsFor, loadArtConfig } from './config';
import { clipPoses } from './poses';

const cfg = loadArtConfig();
const content = loadContent();

/** Spots drawn with the spots' gradient (each spot is one closed sub-path). */
function spots(svg: string): number {
  let n = 0;
  for (const m of svg.matchAll(/<path d="([^"]*)" fill="url\(#b-dotG\)"/g))
    n += (m[1] ?? '').split('Z').length - 1;
  return n;
}

describe('guineafowl plumage (D-077)', () => {
  const minSpots: Record<ArtPlaneId, number> = { near: 300, mid: 120, far: 30 };
  for (const plane of ['near', 'mid', 'far'] as const)
    it(`every ${plane} frame carries at least ${minSpots[plane]} lit white spots`, () => {
      for (const clip of clipsFor(cfg, 'tarentaal') as BirdClip[]) {
        const n = clipPoses(clip).length;
        for (let f = 0; f < n; f++) {
          const svg = birdFrameSvg(cfg, content, 'tarentaal', plane, clip, f);
          // The tumble's last frames and the poof hide the bird (alpha 0): no spots there.
          if (!svg.includes('b-dotG)')) continue;
          expect(spots(svg), `${plane} ${clip} ${f}`).toBeGreaterThanOrEqual(minSpots[plane]);
        }
      }
    });

  it('the spots follow the body light and the primaries are darker, in every morph', () => {
    for (const creature of Object.keys(cfg.birds.variants)) {
      const svg = birdFrameSvg(cfg, content, creature, 'mid', 'alert', 0);
      expect(svg).toContain('id="b-dotG"');
      const flap = birdFrameSvg(cfg, content, creature, 'mid', 'flap', 1);
      expect(flap).toContain('id="b-dotG"');
    }
  });
});
