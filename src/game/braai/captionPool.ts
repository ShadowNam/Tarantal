// v1.11 (D-068, perf): Oupa's story bubbles, one per caption, made and laid out when the braai is
// built (a canvas Text render with word wrap costs milliseconds at 4× throttle, CI review): telling
// a line in the braai's per-frame update only takes the prepared one and shows it. Pure (the maker
// is given), so the unit test can count the renders.
export class CaptionPool<T> {
  private readonly items = new Map<string, T>();
  /** How many items were made (each one a text render). */
  made = 0;

  constructor(private readonly make: (text: string) => T) {}

  /** Makes an item for every caption not made yet. */
  prepare(texts: readonly string[]): void {
    for (const t of texts)
      if (!this.items.has(t)) {
        this.items.set(t, this.make(t));
        this.made++;
      }
  }

  /** The prepared item for `text` (made now only if it was never prepared). */
  take(text: string): T {
    const got = this.items.get(text);
    if (got !== undefined) return got;
    const item = this.make(text);
    this.made++;
    this.items.set(text, item);
    return item;
  }

  all(): IterableIterator<T> {
    return this.items.values();
  }
}
