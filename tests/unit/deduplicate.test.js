import { describe, it, expect } from 'vitest';
import { deduplicate, duplicateCount } from '../../server/engine/transforms/deduplicate.js';

describe('deduplicate', () => {
  const rows = [
    { email: 'a@x.com', name: 'Alice', city: 'Boston' },
    { email: 'a@x.com', name: 'Alice v2', city: 'Denver' },
    { email: 'b@x.com', name: 'Bob', city: 'Boston' },
  ];

  it('returns rows unchanged when no fields are configured', () => {
    expect(deduplicate(rows, {})).toEqual(rows);
    expect(deduplicate(rows, { fields: [] })).toEqual(rows);
    // Even identical all-null rows pass through — an unconfigured node must
    // never drop data.
    const nulls = [{ key: null }, { key: null }];
    expect(deduplicate(nulls)).toEqual(nulls);
  });

  it('keeps the first occurrence by default', () => {
    const out = deduplicate(rows, { fields: ['email'] });
    expect(out).toHaveLength(2);
    expect(out[0].name).toBe('Alice');
  });

  it('keeps the last occurrence with strategy "last"', () => {
    const out = deduplicate(rows, { fields: ['email'], strategy: 'last' });
    expect(out).toHaveLength(2);
    expect(out.find((r) => r.email === 'a@x.com').name).toBe('Alice v2');
  });

  it('dedupes on the combination of multiple fields', () => {
    const out = deduplicate(rows, { fields: ['email', 'city'] });
    // All three rows differ on (email, city), so nothing is removed.
    expect(out).toHaveLength(3);
  });

  it('does not confuse adjacent field values across columns', () => {
    // ("a b", "c") must not collide with ("a", "b c") — the NUL-separator
    // guard in the implementation. A regression here silently drops rows.
    const tricky = [
      { first: 'a b', second: 'c' },
      { first: 'a', second: 'b c' },
    ];
    expect(deduplicate(tricky, { fields: ['first', 'second'] })).toHaveLength(2);
  });

  it('treats null and missing values as equal keys', () => {
    const sparse = [{ email: null }, { email: undefined }, {}];
    expect(deduplicate(sparse, { fields: ['email'] })).toHaveLength(1);
  });

  it('duplicateCount reports how many rows were removed', () => {
    expect(duplicateCount(rows, { fields: ['email'] })).toBe(1);
    expect(duplicateCount(rows, { fields: ['email', 'city'] })).toBe(0);
  });
});
