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
