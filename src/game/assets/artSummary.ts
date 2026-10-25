// v1.6 (D-042): one line on the art a manifest shows (the debug overlay, the build stamp):
// "final", "interim" or "placeholder" for the delivered art, and how many keys are placeholders.
import type { ManifestEntry } from './AssetManifest';

export function artSummary(entries: readonly ManifestEntry[]): string {
  let final = 0;
  let interim = 0;
  let placeholder = 0;
  for (const e of entries)
    if (e.status === 'final') final++;
    else if (e.status === 'interim') interim++;
    else placeholder++;
  const kind = interim > 0 ? 'interim' : final > 0 ? 'final' : 'placeholder';
  return `art: ${kind} · ${placeholder} placeholder`;
}
