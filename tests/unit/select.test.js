import { describe, it, expect } from 'vitest';
import { selectMap } from '../../server/engine/transforms/select.js';

describe('selectMap', () => {
  const rows = [{ email: 'a@x.com', name: 'Ada', age: 30 }];

  it('returns rows unchanged when there are no mappings', () => {
    expect(selectMap(rows, {})).toEqual(rows);
    expect(selectMap(rows, { mappings: [] })).toEqual(rows);
  });

  it('renames a source field to its target', () => {
    const out = selectMap(rows, { mappings: [{ source: 'email', target: 'mail' }] });
    expect(out).toEqual([{ mail: 'a@x.com' }]);
  });

  it('drops fields that are not in the mapping table', () => {
    const out = selectMap(rows, {
      mappings: [
        { source: 'email', target: 'email' },
        { source: 'name', target: 'name' },
      ],
    });
    expect(out).toEqual([{ email: 'a@x.com', name: 'Ada' }]);
  });

  it('ignores mappings marked skip and mappings without a target', () => {
    const out = selectMap(rows, {
      mappings: [
        { source: 'email', target: 'mail' },
        { source: 'name', target: 'name', skip: true },
        { source: 'age', target: '' },
      ],
    });
    expect(out).toEqual([{ mail: 'a@x.com' }]);
  });

  it('passes rows through when every mapping is skipped', () => {
    const out = selectMap(rows, {
      mappings: [{ source: 'email', target: 'mail', skip: true }],
    });
    expect(out).toEqual(rows);
  });

  it('maps a missing source field to undefined rather than throwing', () => {
    const out = selectMap(rows, { mappings: [{ source: 'phone', target: 'phone' }] });
    expect(out).toHaveLength(1);
    expect(out[0].phone).toBe(undefined);
  });
});
