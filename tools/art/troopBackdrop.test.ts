// v1.8c (D-063, review round 1 item 11): the Harvest's koppie troop never lines up with the
// farmhouse, the tractor or a tree of the far veld (they'd seem to sit on its roof). Scoped to the
// Harvest's map: the area maps' far layers were placed before this check (their troops sit on
// ridges high above their far veld, troopLineOfFire covers the targets).
import { describe, expect, it } from 'vitest';
import { loadContent } from '../testContent';
import { troopBackdropIssues } from './troopBackdrop';

const content = loadContent();
const oes = content.biomes.find((b) => b.id === content.modes.modes.harvest.biome);

describe('the troop clear of the far veld behind it (D-063)', () => {
  it('on the Harvest map nothing of the far veld rises behind the troop over the sweep', () => {
    if (oes === undefined) throw new Error('no Harvest map');
    expect(troopBackdropIssues(content, oes)).toEqual([]);
  });

  it('catches the farmhouse moved behind the troop', () => {
    if (oes === undefined) throw new Error('no Harvest map');
    const moved = {
      ...oes,
      props: oes.props.map((p) => (p.id === 'farmhouse' ? { ...p, u: 0.2 } : p)),
    };
    expect(troopBackdropIssues(content, moved).length).toBeGreaterThan(0);
  });
});
