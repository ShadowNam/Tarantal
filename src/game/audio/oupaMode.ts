// v1.7b (D-046): Settings → Oupa's comments. "on": his speech bubble and his voice; "text": the
// bubble without the voice; "off": no barks or bubbles anywhere (hunts, tally, Padstal, Gun
// Shed). Instructions the player needs (the lesson's prompts, a first pickup's card) never come
// through Oupa, so they show whatever this says. The Oupa Laai power-up keeps its hand either way.
import type { Settings } from '../../meta/saveSchema';

export type OupaMode = Settings['oupa'];

/** Oupa's speech bubble (and a secret's bark text) shows. */
export function oupaShows(mode: OupaMode): boolean {
  return mode !== 'off';
}

/** Oupa's voice plays (the AudioDirector also needs the voice volume up). */
export function oupaSpeaks(mode: OupaMode): boolean {
  return mode === 'on';
}
