// v1.12 (D-069): Brakkie's keys, group and sheet size only — what the first download needs (a
// hunt asks for the lazy chunk; the asset audit and the pack tool read the keys). The frame table
// (brakkieSheet.ts) stays with the lazy view; brakkieSheet.test.ts checks these against it.

/** Brakkie's asset group (lazy: its own chunk in tools/size-check; the HD twin `brakkie-hd`). */
export const BRAKKIE_GROUP = 'brakkie';

/** Every Brakkie frame on one sheet (texture key). */
export const BRAKKIE_SHEET = 'brakkie/sheet';
/** Sheet size at 1× (sheet px; frames at half size, drawn ×2). The HD twin is 2× (1024 × 896).
 *  v1.17 (D-079): 512 × 448 (was 256 rows) for the companion's frames and the smoother cycles. */
export const BRAKKIE_SHEET_W = 512;
export const BRAKKIE_SHEET_H = 448;

/** Sounds through the AudioDirector (recordings from the lazy group; silent until they arrive). */
export const BRAKKIE_SOUNDS = {
  /** Two short, sharp terrier barks (alternated). */
  bark: 'sfx/brakkie_bark',
  bark2: 'sfx/brakkie_bark2',
  /** The startled yelp when a shot hits near him (never a cry of pain: he isn't hurt). */
  yelp: 'sfx/brakkie_yelp',
  /** Happy panting when he's back from a fetch. */
  pant: 'sfx/brakkie_pant',
  /** v1.17 (D-079): Oupa's whistle, and the happy yap as he delivers a bird. */
  whistle: 'sfx/brakkie_whistle',
  yap: 'sfx/brakkie_yap',
} as const;
export type BrakkieSound = keyof typeof BRAKKIE_SOUNDS;
