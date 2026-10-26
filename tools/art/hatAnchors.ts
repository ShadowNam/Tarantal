// D-048: where a guineafowl's head is in every frame of every clip, for the Spookjag's witch
// hats. The interim bird art draws the head from the pose (tools/art/bird.ts headPose); this
// takes the same numbers and writes them into src/game/feesdae/hatAnchors.json (the lazy
// Halloween chunk reads it), so a hat sits on the head the frame shows — forward in a peck, up
// in an alert, back in a run. Bird units: the sim position is (0, 0), facing right, scale 1 (the
// near plane); the game scales by the plane and mirrors by facing. Pure.
import { BIRD_CLIPS } from '../../src/game/assets/assetIndex';
import type { ContentBundle } from '../../src/content/schemas';
import { headPose, REST, type Pose } from './bird';
import { birdShape } from './birdFrames';
import type { ArtConfig } from './config';
import { clipPoses } from './poses';

/** [x, y, rot (degrees), r]: the head's centre, tilt and drawn radius. */
export type HeadAnchor = readonly [number, number, number, number];

export interface HatAnchors {
  /** The placeholder frames (procedural art): the head as the hitbox has it. */
  readonly placeholder: HeadAnchor;
  readonly clips: Readonly<Record<string, readonly HeadAnchor[]>>;
}

const round = (n: number): number => Math.round(n * 10) / 10;

function anchor(pose: Pose, cfg: ArtConfig, content: ContentBundle): HeadAnchor {
  const shape = birdShape(content, 'tarentaal');
  const h = headPose({ pose, shape, cfg });
  // The whole-bird spin and scale (a tumble) turn the head about the body centre, as in drawBird.
  const cy = shape.body.oy;
  const a = (pose.spin * Math.PI) / 180;
  const x = h.x * pose.scale;
  const y = (h.y - cy) * pose.scale;
  return [
    round(x * Math.cos(a) - y * Math.sin(a)),
    round(cy + x * Math.sin(a) + y * Math.cos(a)),
    round(h.rot + pose.spin),
    round(h.r * pose.scale),
  ];
}

export function hatAnchors(cfg: ArtConfig, content: ContentBundle): HatAnchors {
  const hb = birdShape(content, 'tarentaal').head;
  const clips: Record<string, HeadAnchor[]> = {};
  for (const clip of BIRD_CLIPS) clips[clip] = clipPoses(clip).map((p) => anchor(p, cfg, content));
  return { placeholder: [hb.x, hb.y, 0, hb.r], clips };
}

/** The rest pose's anchor (tests). */
export function restAnchor(cfg: ArtConfig, content: ContentBundle): HeadAnchor {
  return anchor(REST, cfg, content);
}
