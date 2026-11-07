// Client/meta-only rollout tuning. It never enters the sim bundle or content hash.
import { z } from 'zod';
import raw from '../../content/client/journal.json' with { type: 'json' };

export const JournalConfigSchema = z.object({
  maxRecords: z.number().int().min(1).max(128),
  maxRivals: z.number().int().min(1).max(32),
  minAccuracyShots: z.number().int().positive(),
  scoreStep: z.number().positive(),
  scoreGrowth: z.number().positive(),
  accuracyStep: z.number().positive().max(1),
  maxFlockGoal: z.number().int().positive(),
  minCleanBag: z.number().int().positive(),
  maxCleanBagGoal: z.number().int().positive(),
  coachHunts: z.number().int().nonnegative(),
  lowAccuracy: z.number().min(0).max(1),
  feedbackCooldownTicks: z.number().int().positive(),
  sightingAlpha: z.number().positive().max(1),
  fileTimeoutMs: z.number().int().positive(),
  species: z.array(z.object({
    id: z.string().regex(/^[a-zA-Z]+$/),
    // v1.13 (D-075): the veld cameos' habitats, one per area.
    habitat: z.enum([
      'baobab',
      'colony',
      'namibie',
      'veldBushveld',
      'veldKaroo',
      'veldKalahari',
      'veldNamibie',
      'veldOkavango',
    ]),
    /** The portrait (a sheet and frame; none: the ★ only — the far elephants have no sheet). */
    sheet: z.string().min(1).optional(),
    frame: z.string().min(1).optional(),
  })).min(1),
  plaques: z.array(z.object({
    id: z.string().regex(/^[a-z]+$/),
    metric: z.enum(['sightings', 'bagged', 'accuracy', 'wholeFlocks', 'cleanBag', 'rivalWins']),
    target: z.number().positive(),
  })).min(1),
}).superRefine((v, ctx) => {
  for (const [name, entries] of [['species', v.species], ['plaques', v.plaques]] as const)
    if (new Set(entries.map(e => e.id)).size !== entries.length)
      ctx.addIssue({ code: 'custom', path: [name], message: 'IDs must be unique' });
  if (v.minCleanBag > v.maxCleanBagGoal)
    ctx.addIssue({code:'custom', path:['maxCleanBagGoal'], message:'Must cover the minimum clean bag'});
});
export const JOURNAL = JournalConfigSchema.parse(raw);
