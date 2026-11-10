// v1.22.1 (D-086): the owner's animal sizes from the size editor (admin page → Sizes → Open in game,
// `?admin=1&sizes=<area>`). Kept on this device only (storage.ts, key `sizeEdits.v1` in the
// device-wide namespace, shared by the admin page and the game like the text edits, D-076), never in
// the save file and never sent anywhere: the owner exports them as a file and `npm run sizes:apply`
// writes them into content/ (or reports the code constant). With "Use my sizes in the game" on, boot
// applies them as content overrides on this device — the sim's hit shapes grow with the drawing (a
// content hit box set named by the edit is scaled with it; the others are × the size in the sim) —
// and the game is unranked. Each edit names its own value (src/content/sizePaths.ts), so no list of
// animals is needed to apply it. This module is the store (first download, kept small); the
// override is src/meta/sizeApply.ts.
import { isSizeEdit } from './sizeApply';
import { onDevice, readValue, writeValue } from './storage';

export const SIZE_EDITS_KEY = 'sizeEdits.v1';

export interface SizeEdit {
  /** The size knob (src/game/sizes/sizeKnobs.ts), e.g. `cameo_ostrich`. A knob with several values
   *  (the colony's wingspan per plane) has one edit per value, all with its id. */
  readonly id: string;
  /** The area it was set in (`karoo`, … `oes`). */
  readonly area: string;
  /** `content/<file>.json#<keys>` or `code:<file>#<CONSTANT>.<key>`. */
  readonly path: string;
  /** The value when the edit was made (the apply tool and boot skip an edit whose `from` changed). */
  readonly from: number;
  readonly to: number;
  /** The real size the animal stands for (m), for the record. */
  readonly realM?: number;
  /** Hit box sets in the same file drawn in px (× to / from with the size). */
  readonly hitboxes?: readonly string[];
}

export interface SizeEditStore {
  readonly version: 1;
  /** "Use my sizes in the game" (off by default). */
  readonly apply: boolean;
  readonly edits: readonly SizeEdit[];
}

export const EMPTY_SIZE_EDITS: SizeEditStore = { version: 1, apply: false, edits: [] };

/** The store's shell (each edit is checked on its own: one bad edit never loses the others). */
function isShell(v: unknown): v is { version: 1; apply: boolean; edits: unknown[] } {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  return s['version'] === 1 && typeof s['apply'] === 'boolean' && Array.isArray(s['edits']);
}

export function loadSizeEdits(): SizeEditStore {
  const s = onDevice(() => readValue(SIZE_EDITS_KEY, null, isShell));
  return s === null
    ? EMPTY_SIZE_EDITS
    : { version: 1, apply: s.apply, edits: s.edits.filter(isSizeEdit) };
}

export function storeSizeEdits(s: SizeEditStore): void {
  onDevice(() => {
    writeValue(SIZE_EDITS_KEY, s);
  });
}
