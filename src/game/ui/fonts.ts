// Waits for the self-hosted fonts (index.html @font-face, tools/make-fonts.ts) before the first
// text is drawn (M10). Resolves true when all loaded, false on timeout or without the Font Loading
// API — the game then uses the system font, as it did before M10.
const FACES = ['600 32px "Baloo 2"', '800 32px "Baloo 2"', '400 32px Bangers'];

export function loadFonts(timeoutMs: number): Promise<boolean> {
  // Old browsers lack the Font Loading API (the DOM types say it's always there).
  const fonts = (document as Partial<Pick<Document, 'fonts'>>).fonts;
  if (fonts === undefined) return Promise.resolve(false);
  const all = Promise.all(FACES.map((f) => fonts.load(f))).then(
    (sets) => sets.every((s) => s.length > 0),
    () => false,
  );
  const timeout = new Promise<boolean>((resolve) => {
    window.setTimeout(() => {
      resolve(false);
    }, timeoutMs);
  });
  return Promise.race([all, timeout]);
}
