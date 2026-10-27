// D-053: which textures some object still draws, across every scene (containers included), so a
// texture swapped out by AssetManifest.applyHd() is only removed once nothing draws it (removing
// one under a live object froze hunts: D-046).
import type * as Phaser from 'phaser';

interface Drawn {
  readonly texture?: { readonly key: string };
  readonly list?: readonly unknown[];
}

/** Texture keys drawn by any object of any scene of `game` now. */
export function texturesInUse(game: Phaser.Game): Set<string> {
  const out = new Set<string>();
  const visit = (o: unknown): void => {
    if (o === null || typeof o !== 'object') return;
    const d = o as Drawn;
    if (d.texture !== undefined) out.add(d.texture.key);
    // Containers (and layers) hold their children in `list`.
    if (Array.isArray(d.list)) for (const c of d.list) visit(c);
  };
  for (const scene of game.scene.scenes) for (const o of scene.children.list) visit(o);
  return out;
}
