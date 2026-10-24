// v1.3 (D-036) placeholder sight pictures, drawn on canvases at runtime (no download). The interim
// art (tools/art/sights.ts) replaces them once the long-range chunk has loaded; these keep the
// same sizes and origins. Semi-realistic like D-035: no dark contours (edges in a darker shade of
// each part's own material), blued steel and glass, one key light from the upper left.
//   sight/iron_rear   the rear sight's notch, near the eye and out of focus (origin: notch top)
//   sight/iron_front  the front post on its ramp (origin: the post's tip = the aim point)
//   sight/peep        the aperture ring, dark and soft, clear in the middle (origin: centre)
//   sight/scope       the scope: dark tube ring and lens edge around clear glass (origin: centre)
import { TEX, type CanvasSpec } from '../assets/AssetManifest';

/** Texture px → design px for each picture (SightView draws them at this scale). */
export const SIGHT_SCALE = { ironRear: 1.2, ironFront: 1, peep: 2.4, scope: 2.2 } as const;
/** v1.3 review: the rear leaf sits this many design px below the post's tip (6 o'clock hold: the
 *  bird stays in view above the leaf, the post tip is the aim point). */
export const REAR_DROP_PX = 8;
/** sight/iron_rear's notch: its bottom (texture y) and sides (x 196 … 284). */
export const NOTCH = { depth: 78, left: 196, right: 284 } as const;
/** Radius (texture px) of the clear middle of the peep and the scope's glass. */
export const PEEP_CLEAR_R = 150;
export const SCOPE_GLASS_R = 206;
/** The colour beyond the pictures' edges (SightView fills the rest of the screen with it). */
export const PEEP_DARK = '#17191C';
export const SCOPE_DARK = '#070809';
/** The barrel below sight/iron_rear when the reticle is high (a flat mid tone of the steel). */
export const IRON_PLATE = '#262B31';

const BLUED = '#2C3138';
/** Texture x of the barrel's sides at the bottom of sight/iron_rear (SightView continues it). */
export const BARREL_BOTTOM = { left: 205, right: 275 } as const;
const BLUED_LIT = '#566070';
const BLUED_DARK = '#15181C';

export function sightSpecs(): CanvasSpec[] {
  return [
    {
      key: TEX.sightIronRear,
      width: 480,
      height: 320,
      originX: 240,
      originY: 40,
      draw(ctx) {
        // The rear leaf close to the eye, out of focus (soft): a slim blade with rounded ends,
        // its top edge at the origin, a wide square notch (light shows either side of the post),
        // on a small base block; a slim stem below it (the barrel, widening toward the eye).
        // Lit from the upper left: a bright top edge, darker toward the right.
        ctx.filter = 'blur(2px)';
        const stem = ctx.createLinearGradient(BARREL_BOTTOM.left, 0, BARREL_BOTTOM.right, 0);
        stem.addColorStop(0, BLUED_LIT);
        stem.addColorStop(0.3, BLUED);
        stem.addColorStop(1, BLUED_DARK);
        ctx.fillStyle = stem;
        ctx.beginPath();
        ctx.moveTo(222, 96);
        ctx.lineTo(258, 96);
        ctx.lineTo(BARREL_BOTTOM.right, 320);
        ctx.lineTo(BARREL_BOTTOM.left, 320);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = BLUED_DARK;
        ctx.fillRect(214, 78, 52, 22);
        const leaf = ctx.createLinearGradient(0, 40, 0, 84);
        leaf.addColorStop(0, BLUED_LIT);
        leaf.addColorStop(0.15, BLUED);
        leaf.addColorStop(1, BLUED_DARK);
        ctx.fillStyle = leaf;
        ctx.beginPath();
        ctx.moveTo(52, 84);
        ctx.quadraticCurveTo(40, 48, 64, 42);
        ctx.lineTo(196, 40);
        ctx.lineTo(196, NOTCH.depth);
        ctx.lineTo(284, NOTCH.depth);
        ctx.lineTo(284, 40);
        ctx.lineTo(416, 42);
        ctx.quadraticCurveTo(440, 48, 428, 84);
        ctx.closePath();
        ctx.fill();
        ctx.filter = 'none';
      },
    },
    {
      key: TEX.sightIronFront,
      width: 80,
      height: 320,
      originX: 40,
      originY: 6,
      draw(ctx) {
        // A broad square post (in focus) on a ramp: the lit face on the left, the shadow face a
        // darker shade of the same steel, a bright bevel along its top catching the key light.
        const post = ctx.createLinearGradient(16, 0, 64, 0);
        post.addColorStop(0, BLUED_LIT);
        post.addColorStop(0.45, BLUED);
        post.addColorStop(1, BLUED_DARK);
        ctx.fillStyle = post;
        ctx.fillRect(16, 6, 48, 150);
        ctx.fillStyle = '#9DB3C8';
        ctx.fillRect(16, 6, 48, 4);
        ctx.fillStyle = 'rgba(157,179,200,0.35)';
        ctx.fillRect(16, 10, 6, 140);
        const ramp = ctx.createLinearGradient(0, 150, 80, 150);
        ramp.addColorStop(0, BLUED_LIT);
        ramp.addColorStop(0.45, BLUED);
        ramp.addColorStop(1, BLUED_DARK);
        ctx.fillStyle = ramp;
        ctx.beginPath();
        ctx.moveTo(16, 150);
        ctx.lineTo(64, 150);
        ctx.lineTo(78, 320);
        ctx.lineTo(2, 320);
        ctx.closePath();
        ctx.fill();
      },
    },
    ring(TEX.sightPeep, PEEP_CLEAR_R, PEEP_DARK, false),
    ring(TEX.sightScope, SCOPE_GLASS_R, SCOPE_DARK, true),
  ];
}

/** A dark disc with a clear round middle; the scope adds its tube ring, lens edge and glare. */
function ring(key: string, clearR: number, dark: string, scope: boolean): CanvasSpec {
  return {
    key,
    width: 512,
    height: 512,
    originX: 256,
    originY: 256,
    draw(ctx) {
      const c = 256;
      ctx.fillStyle = dark;
      ctx.fillRect(0, 0, 512, 512);
      ctx.globalCompositeOperation = 'destination-out';
      // Soft edge for the peep (the aperture is out of focus), a crisp one for the scope.
      const soft = scope ? 2 : 46;
      const hole = ctx.createRadialGradient(c, c, clearR - soft, c, c, clearR + soft);
      hole.addColorStop(0, 'rgba(0,0,0,1)');
      hole.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = hole;
      ctx.beginPath();
      ctx.arc(c, c, clearR + soft, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      if (!scope) return;
      // Tube wall: a band of blued metal lit at the upper left, then the lens edge.
      const wall = ctx.createLinearGradient(c - clearR, c - clearR, c + clearR, c + clearR);
      wall.addColorStop(0, '#3D444E');
      wall.addColorStop(0.5, '#1A1D22');
      wall.addColorStop(1, '#0C0D0F');
      ctx.strokeStyle = wall;
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.arc(c, c, clearR + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(160,190,210,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c, c, clearR - 1, 0, Math.PI * 2);
      ctx.stroke();
      // A faint reflection on the glass (upper left).
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.arc(c, c, clearR - 30, Math.PI * 1.08, Math.PI * 1.42);
      ctx.stroke();
    },
  };
}
