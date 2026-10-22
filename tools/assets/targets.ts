// Delivery targets the pack tool checks and applies (M10). From the art bible (§3.4 clips, §4.1
// layers, §10 mix) and Tech §10 (loudness); docs/06-ASSET-DELIVERY.md prints them for artists.
import type { AudioKind, BirdClip } from '../../src/game/assets/assetIndex';

/** §3.4 frame counts and playback per clip (a delivery may use other counts; fps/loop as here). */
export const CLIP_SPEC: Readonly<Record<BirdClip, { frames: number; fps: number; loop: boolean }>> =
  {
    forage_walk: { frames: 8, fps: 12, loop: true },
    peck: { frames: 6, fps: 12, loop: true },
    alert: { frames: 4, fps: 10, loop: false },
    run: { frames: 8, fps: 18, loop: true },
    takeoff: { frames: 6, fps: 20, loop: false },
    flap: { frames: 6, fps: 16, loop: true },
    glide: { frames: 2, fps: 6, loop: true },
    land: { frames: 4, fps: 14, loop: false },
    hit_poof: { frames: 6, fps: 24, loop: false },
    tumble: { frames: 4, fps: 16, loop: true },
    peek: { frames: 6, fps: 12, loop: true },
  };

/**
 * Every bird frame is drawn in the same box as the placeholder birds: 620 × 400 units with the
 * bird's sim position (hitbox origin, content/birds.json) at (310, 230). Masters may be any
 * multiple of it (bible: 512 px tall ≈ 1.28×); the tool scales each plane to box × plane scale
 * for @1x and twice that for @2x.
 */
export const BIRD_BOX = { width: 620, height: 400, originX: 310, originY: 230 } as const;

/** Atlas page limits per atlas set (Tech §5: @1x ≤ 2048², @2x ≤ 4096²). */
export const ATLAS_MAX = { x1: 2048, x2: 4096 } as const;

/** Layer tiles are cut at this width (art bible §4.1). */
export const TILE_WIDTH = 2048;

/** Integrated loudness targets (LUFS) and the true-peak ceiling (dBTP), art bible §10 / Tech §10. */
export const LOUDNESS: Readonly<Record<AudioKind, number>> = {
  music: -16,
  ambience: -20,
  sfx: -14,
  voice: -16,
};
export const TRUE_PEAK_CEILING_DB = -1;
