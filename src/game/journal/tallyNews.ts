// Reward and challenge announcements keep their existing priority; optional polish uses spare slots.
export function appendJournalNews(
  primary: readonly string[],
  optional: readonly string[],
): string | null {
  const lines = [...primary, ...optional].filter((line) => line !== '').slice(0, 2);
  return lines.length === 0 ? null : lines.join('  ·  ');
}
