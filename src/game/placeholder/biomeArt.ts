// What a biome's placeholder art provides (M8): one band painter per parallax layer id and a prop
// painter. Registered per biome id in ProceduralAssetFactory; a biome with no entry is not
// playable yet.

/** One parallax layer's painting: the design-y band it covers and how to fill it. */
export interface Band {
  readonly top: number;
  readonly bottom: number;
  /** Drawn at 1/scale resolution and displayed scaled up (soft layers like the sky). */
  readonly scale: number;
  draw(ctx: CanvasRenderingContext2D, width: number, rnd: () => number): void;
}

export interface BiomeArt {
  /** Keyed by layer id (sky, far_ridge, far_veld, mid, near, foreground). */
  readonly bands: Readonly<Record<string, Band>>;
  /** Draws a prop centred on its occluder box (w × h); unknown ids draw nothing. */
  drawProp(ctx: CanvasRenderingContext2D, id: string, w: number, h: number): void;
  /** Room around the occluder box for parts that stick out (canopies, crowns), per prop id. */
  readonly propPad?: Readonly<Record<string, { readonly top: number; readonly side: number }>>;
}

/**
 * v1.3 (D-036): the Ver plane's strip of distant veld at the foot of the far ridge (y ≈ 536–590,
 * birds stand at 552–566). Hazy and pale with distance (aerial perspective), no outlines:
 * a ground band fading up into the ridge, rows of tiny scrub and a bright heat line.
 */
export function verBand(colors: {
  readonly ground: string;
  readonly haze: string;
  readonly scrub: string;
}): Band {
  return {
    top: 528,
    bottom: 592,
    scale: 1,
    draw(ctx, width, rnd) {
      ctx.translate(0, -528);
      const g = ctx.createLinearGradient(0, 536, 0, 592);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.25, colors.haze);
      g.addColorStop(1, colors.ground);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 592);
      for (let x = 0; x <= width; x += 64) ctx.lineTo(x, 540 + rnd() * 6);
      ctx.lineTo(width, 592);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = colors.scrub;
      for (let x = 0; x < width; x += 6 + rnd() * 26) {
        const y = 550 + rnd() * 34;
        const r = 0.8 + rnd() * 1.6 * ((y - 540) / 50);
        ctx.globalAlpha = 0.35 + rnd() * 0.3;
        ctx.beginPath();
        ctx.ellipse(x, y, r * 1.6, r, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#FFF6E0';
      ctx.fillRect(0, 547, width, 1.5);
      ctx.globalAlpha = 1;
    },
  };
}
