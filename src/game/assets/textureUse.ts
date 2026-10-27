// D-053: which textures some object still draws, across every scene (containers included), so a
// texture swapped out by AssetManifest.applyHd() is only removed once nothing draws it (removing
// one under a live object froze hunts: D-046).
import type * as Phaser from 'phaser';

interface Drawn {
  readonly texture?: { readonly key: string };
  readonly list?: readonly unknown[];
  /** A particle emitter's frames (new particles take these) and its live particles. */
  readonly frames?: readonly unknown[];
  readonly alive?: readonly unknown[];
}

interface FrameLike {
  readonly texture?: { readonly key: string } | null;
}

/** Texture keys drawn by any object of any scene of `game` now. */
export function texturesInUse(game: Phaser.Game): Set<string> {
  const out = new Set<string>();
  const addFrame = (f: unknown): void => {
    const key = (f as FrameLike | null | undefined)?.texture?.key;
    if (typeof key === 'string') out.add(key);
  };
  const visit = (o: unknown): void => {
    if (o === null || typeof o !== 'object') return;
    const d = o as Drawn;
    if (d.texture !== undefined) out.add(d.texture.key);
    // Containers (and layers) hold their children in `list`.
    if (Array.isArray(d.list)) for (const c of d.list) visit(c);
    // Particle emitters: each live particle keeps the frame it was born with, and new ones take
    // the emitter's frames, whatever its own texture says. Freeing a texture under them stopped
    // the game (Phaser reads frame.source.glTexture of a destroyed frame, D-046 class).
    if (Array.isArray(d.frames)) for (const f of d.frames) addFrame(f);
    if (Array.isArray(d.alive))
      for (const p of d.alive) addFrame((p as { frame?: unknown } | null)?.frame);
  };
  for (const scene of game.scene.scenes) for (const o of scene.children.list) visit(o);
  return out;
}
