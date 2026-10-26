import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../testContent';
import { loadArtConfig } from './config';
import { hatAnchors } from './hatAnchors';

describe('witch-hat head anchors (D-048)', () => {
  it('src/game/feesdae/hatAnchors.json is what the bird art draws (art:interim --only feesdae)', () => {
    const file = join(import.meta.dirname, '..', '..', 'src', 'game', 'feesdae', 'hatAnchors.json');
    const saved = JSON.parse(readFileSync(file, 'utf8')) as unknown;
    expect(saved).toEqual(hatAnchors(loadArtConfig(), loadContent()));
  });

  it('puts the head forward of and above the body, inside its hit circle, in every frame', () => {
    const a = hatAnchors(loadArtConfig(), loadContent());
    const [hx, hy, , hr] = a.placeholder;
    for (const [clip, frames] of Object.entries(a.clips)) {
      if (clip === 'hit_poof' || clip === 'tumble') continue;
      for (const [x, y] of frames) {
        expect(x).toBeGreaterThan(60);
        expect(Math.hypot(x - hx, y - hy)).toBeLessThanOrEqual(hr);
      }
    }
  });
});
