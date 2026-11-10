// v1.22.1 (D-086): the size factors the views multiply into an animal's drawn size, by size-knob id
// (src/game/sizes/sizeKnobs.ts). In a hunt they are 1, except for the owner's saved sizes of the
// animals whose size is not a content value the view reads (the far herds, whose sheets are drawn
// at their size; the baobab's residents: code constants) when "Use my sizes in the game" is on; in
// the size editor (?admin=1&sizes=<area>) they are the owner's working sizes, so a press of +10 %
// shows at once. In the first download, so it stays tiny.
const factors = new Map<string, number>();
let version = 0;
let edits = 0;

/** The factor for one size knob (1 = as the content says). */
export function sizeFactor(id: string): number {
  return factors.get(id) ?? 1;
}

/** Bumped on every change: a view that sets a scale once re-reads its factors when it moves. */
export function sizeFactorVersion(): number {
  return version;
}

/** Replaces every factor (null or empty: none). */
export function setSizeFactors(next: Readonly<Record<string, number>> | null): void {
  factors.clear();
  if (next !== null)
    for (const [id, f] of Object.entries(next))
      if (Number.isFinite(f) && f > 0 && f !== 1) factors.set(id, f);
  version++;
}

/** The owner's size edits in use on this device (the build line's "⇲ n"; 0: none). */
export function sizeEditCount(): number {
  return edits;
}

export function setSizeEditCount(n: number): void {
  edits = n;
}
