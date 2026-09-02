import { describe, it, expect } from 'vitest';
import { filterRows } from '../../server/engine/transforms/filter.js';

describe('filterRows', () => {
  it('returns rows unchanged when there are no conditions', () => {
    const rows = [{ a: 1 }, { a: 2 }];
    expect(filterRows(rows, {})).toEqual(rows);
    expect(filterRows(rows, { conditions: [] })).toEqual(rows);
  });

  describe('row-value operators', () => {
    it('equals compares values as strings (number 5 matches "5")', () => {
      const rows = [{ n: 5 }, { n: 6 }];
      const out = filterRows(rows, { conditions: [{ field: 'n', op: 'equals', value: '5' }] });
      expect(out).toEqual([{ n: 5 }]);
    });

    it('contains / starts_with / ends_with are case-insensitive', () => {
      const rows = [{ name: 'Alice' }, { name: 'Bob' }];
      const cfg = (op, value) => ({ conditions: [{ field: 'name', op, value }] });
      expect(filterRows(rows, cfg('contains', 'LIC'))).toEqual([{ name: 'Alice' }]);
      expect(filterRows(rows, cfg('starts_with', 'al'))).toEqual([{ name: 'Alice' }]);
      expect(filterRows(rows, cfg('ends_with', 'CE'))).toEqual([{ name: 'Alice' }]);
    });

    it('greater_than and friends coerce both sides with Number()', () => {
      // As strings '10' < '9'; as numbers 10 > 9 — numeric coercion must win.
      const rows = [{ age: '10' }, { age: '3' }];
      const out = filterRows(rows, {
        conditions: [{ field: 'age', op: 'greater_than', value: '9' }],
      });
      expect(out).toEqual([{ age: '10' }]);
    });

    it('is_empty matches null, undefined, and whitespace-only strings', () => {
      const rows = [{ v: null }, { v: undefined }, { v: '   ' }, { v: 0 }, { v: 'x' }];
      const out = filterRows(rows, { conditions: [{ field: 'v', op: 'is_empty' }] });
      expect(out).toEqual([{ v: null }, { v: undefined }, { v: '   ' }]);
    });

    it('is_not_empty is the exact negation of is_empty', () => {
      const rows = [{ v: null }, { v: '   ' }, { v: 0 }, { v: 'x' }];
      const out = filterRows(rows, { conditions: [{ field: 'v', op: 'is_not_empty' }] });
      expect(out).toEqual([{ v: 0 }, { v: 'x' }]);
    });

    it('an unknown op is treated as a pass (row is kept)', () => {
      const rows = [{ v: 1 }, { v: 2 }];
      const out = filterRows(rows, {
        conditions: [{ field: 'v', op: 'no_such_op', value: 1 }],
      });
      expect(out).toEqual(rows);
    });

    it('a condition on a field the row lacks compares against undefined, not throws', () => {
      const rows = [{ a: 1 }];
      // undefined stringifies to '' in every op, so equals '' matches it.
      expect(
        filterRows(rows, { conditions: [{ field: 'missing', op: 'equals', value: '' }] })
      ).toEqual(rows);
      expect(
        filterRows(rows, { conditions: [{ field: 'missing', op: 'is_empty' }] })
      ).toEqual(rows);
    });
  });

  describe('combinator', () => {
    const rows = [
      { city: 'Boston', active: 'yes' },
      { city: 'Boston', active: 'no' },
      { city: 'Denver', active: 'yes' },
    ];
    const conditions = [
      { field: 'city', op: 'equals', value: 'Boston' },
      { field: 'active', op: 'equals', value: 'yes' },
    ];

    it('AND keeps only rows matching every condition', () => {
      expect(filterRows(rows, { conditions, combinator: 'AND' })).toEqual([rows[0]]);
    });

    it('OR keeps rows matching any condition', () => {
      // Every row matches at least one of the two conditions.
      expect(filterRows(rows, { conditions, combinator: 'OR' })).toEqual(rows);
    });
  });

  describe('field-stat conditions (column pruning)', () => {
    it('drops columns whose fill_pct fails the condition', () => {
      const rows = [
        { full: 'a', sparse: '' },
        { full: 'b', sparse: null },
        { full: 'c', sparse: 'x' },
        { full: 'd', sparse: '' },
      ];
      const out = filterRows(rows, {
        conditions: [{ scope: 'field', stat: 'fill_pct', op: 'greater_equal', value: 100 }],
      });
      expect(out).toEqual([{ full: 'a' }, { full: 'b' }, { full: 'c' }, { full: 'd' }]);
    });

    it('keeps columns by name with the name stat', () => {
      const rows = [{ email: 'a@x.com', internal_id: 7 }];
      const out = filterRows(rows, {
        conditions: [{ scope: 'field', stat: 'name', op: 'not_equals', value: 'internal_id' }],
      });
      expect(out).toEqual([{ email: 'a@x.com' }]);
    });

    it('type stat compares against the inferred column type', () => {
      const rows = [
        { age: 1, name: 'Ada' },
        { age: 2, name: 'Bo' },
      ];
      const out = filterRows(rows, {
        conditions: [{ scope: 'field', stat: 'type', op: 'equals', value: 'number' }],
      });
      expect(out).toEqual([{ age: 1 }, { age: 2 }]);
    });

    it('prunes columns before applying row conditions in the same config', () => {
      const rows = [
        { keep: 'yes', junk: 'x' },
        { keep: 'no', junk: 'y' },
      ];
      const out = filterRows(rows, {
        combinator: 'AND',
        conditions: [
          { scope: 'field', stat: 'name', op: 'not_equals', value: 'junk' },
          { field: 'keep', op: 'equals', value: 'yes' },
        ],
      });
      expect(out).toEqual([{ keep: 'yes' }]);
    });

    it('does nothing on empty input rows (no crash computing stats)', () => {
      const out = filterRows([], {
        conditions: [{ scope: 'field', stat: 'fill_pct', op: 'greater_than', value: 50 }],
      });
      expect(out).toEqual([]);
    });
  });
});
