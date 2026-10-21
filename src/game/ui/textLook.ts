// Text size and contrast for player-facing text (M9 accessibility, GDD §18.3). One look for the
// whole game, set from Settings (main.ts → setTextLook); menus, tally, captions, prompts and
// world call-outs read it when they create their text. HUD numbers (timer, score) keep their
// size: they sit in fixed signs and are already large.
const look = { scale: 1, contrast: false, strokeRatio: 0.2 };

export function setTextLook(scale: number, contrast: boolean, strokeRatio: number): void {
  look.scale = scale;
  look.contrast = contrast;
  look.strokeRatio = strokeRatio;
}

export function textScale(): number {
  return look.scale;
}

export function highContrast(): boolean {
  return look.contrast;
}

/** A font size in px for `size` design px at the current text size. */
export function fontPx(size: number, scaled = true): string {
  return `${Math.round(scaled ? size * look.scale : size)}px`;
}

/** A dark text colour (#RRGGBB, luminance < 0.35): it sits on light plates and needs no outline. */
export function isDarkColor(color: string): boolean {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (m?.[1] === undefined) return false;
  const n = parseInt(m[1], 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum < 0.35;
}

/**
 * The outline for text of `size`: with high contrast a black stroke of `strokeRatio` × size
 * (at least `existing`), else `existing` (0 = none). Dark text (`textColor`) gets no contrast
 * outline: it already contrasts with the light plate it sits on.
 */
export function outline(
  size: number,
  existing = 0,
  color = '#1B1410',
  textColor = '#F3EAD3',
): { stroke?: string; strokeThickness?: number } {
  if (look.contrast && !isDarkColor(textColor))
    return {
      stroke: '#000000',
      strokeThickness: Math.max(existing, Math.round(size * look.scale * look.strokeRatio)),
    };
  return existing > 0 ? { stroke: color, strokeThickness: existing } : {};
}
