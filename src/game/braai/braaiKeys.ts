// v1.11 (D-068): Die Braai's keys, group and sheet size only — what the first download needs (the
// tally asks for the lazy chunk, the asset audit and the pack tool read the keys). The frame table
// (braaiSheet.ts) stays with the lazy BraaiView. braaiSheet.test.ts checks these against it.

/** The braai's asset group (lazy: its own chunk in tools/size-check; the HD twin `braai-hd`). */
export const BRAAI_GROUP = 'braai';
/** Oupa's story lines, one lazy pack per voice language (`braai-voice-<lang>`). */
export const BRAAI_VOICE_GROUP_PREFIX = 'braai-voice-';
export const braaiVoiceGroup = (lang: string): string => `${BRAAI_VOICE_GROUP_PREFIX}${lang}`;

/** Every braai frame on one sheet (texture key). */
export const BRAAI_SHEET = 'braai/sheet';
/** Sheet size at 1× (sheet px). The HD twin is 2× (1024 × 864). */
export const BRAAI_SHEET_W = 512;
export const BRAAI_SHEET_H = 432;

/** Sounds through the AudioDirector (recordings from the lazy group; silent until they arrive). */
export const BRAAI_SOUNDS = {
  /** The bed: the fire's crackle and the crickets, a seamless loop (the ambience bus). */
  fire: 'sfx/braai_fire',
  /** A soft original guitar loop under the story (the music bus). */
  guitar: 'sfx/braai_guitar',
  /** A far fiery-necked nightjar ("Good Lord, deliver us"), now and then. */
  nightjar: 'sfx/braai_nightjar',
  /** The vastrap's concertina sting. */
  vastrap: 'sfx/braai_vastrap',
} as const;
export type BraaiSound = keyof typeof BRAAI_SOUNDS;
