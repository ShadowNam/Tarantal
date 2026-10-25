import { describe, expect, it } from 'vitest';
import { repairSave } from './save';
import { markSeen } from './powerupsSeen';
import { defaultSave } from './saveSchema';

describe('first-pickup memory (D-046)', () => {
  it('the first pickup of an id is first; later ones are not', () => {
    const a = markSeen([], 'boeretroos');
    expect(a).toEqual({ seen: ['boeretroos'], first: true });
    const b = markSeen(a.seen, 'boeretroos');
    expect(b.first).toBe(false);
    expect(b.seen).toBe(a.seen);
    const c = markSeen(b.seen, 'voorlaaier');
    expect(c).toEqual({ seen: ['boeretroos', 'voorlaaier'], first: true });
  });

  it('a new save has seen nothing; an older save without the section gets the default', () => {
    expect(defaultSave().powerups.seen).toEqual([]);
    const old: Record<string, unknown> = { ...defaultSave() };
    delete old['powerups'];
    const { data, repaired } = repairSave(old);
    expect(data.powerups.seen).toEqual([]);
    expect(repaired).toEqual([]);
  });

  it('the memory survives a save round trip', () => {
    const d = { ...defaultSave(), powerups: { seen: ['oupa_laai'] } };
    const { data } = repairSave(JSON.parse(JSON.stringify(d)) as Record<string, unknown>);
    expect(data.powerups.seen).toEqual(['oupa_laai']);
  });
});
