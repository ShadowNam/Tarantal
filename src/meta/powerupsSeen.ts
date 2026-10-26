// v1.7b (D-046): first-pickup memory. The first time a power-up or crate gun is picked up on this
// save, its pickup card stays longer and explains it in full (and Oupa says a line about it, when
// his comments are on). Pure; the HUD writes the result through the SaveStore.

/** Ids seen after picking up `id`, and whether this was its first pickup on the save. */
export function markSeen(
  seen: readonly string[],
  id: string,
): { readonly seen: readonly string[]; readonly first: boolean } {
  if (seen.includes(id)) return { seen, first: false };
  return { seen: [...seen, id], first: true };
}
