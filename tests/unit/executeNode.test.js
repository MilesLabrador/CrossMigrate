import { describe, it, expect, afterAll } from 'vitest';
import { executeNode } from '../../server/engine/executeNode.js';
import { clearCache, writeCache } from '../../server/engine/cacheStore.js';

// The logic that lives directly in executeNode.js (join, randomSample).
// Transforms it delegates to are covered by their own unit files.

const join = (config, left, right) =>
  executeNode({ id: 'j', type: 'join', data: { config } }, [], { left, right });

const sample = (config, rows) =>
  executeNode({ id: 's', type: 'randomSample', data: { config } }, rows);

describe('executeNode', () => {
  describe('join', () => {
    const people = [
      { id: 1, name: 'Ada' },
      { id: 2, name: 'Bo' },
    ];
    const cities = [{ id: 1, city: 'Oslo' }];

    it('left join keeps unmatched left rows with null-filled pull columns', () => {
      const { rows, meta } = join({ leftColumn: 'id', rightColumn: 'id' }, people, cities);
      expect(rows).toEqual([
        { id: 1, name: 'Ada', city: 'Oslo' },
        { id: 2, name: 'Bo', city: null },
      ]);
      expect(meta.matched).toBe(1);
      expect(meta.unmatched).toBe(1);
    });

    it('inner join drops left rows whose key has no match', () => {
      const { rows } = join(
        { leftColumn: 'id', rightColumn: 'id', joinType: 'inner' },
        people,
        cities
      );
      expect(rows).toEqual([{ id: 1, name: 'Ada', city: 'Oslo' }]);
    });

    it('passes left input through with a warning when leftColumn/rightColumn are not set', () => {
      const { rows, meta } = join({}, people, cities);
      expect(rows).toEqual(people);
      expect(meta.warning).toMatch(/not configured/i);
    });

    it('passes left input through with a warning when the right input is empty', () => {
      const { rows, meta } = join({ leftColumn: 'id', rightColumn: 'id' }, people, []);
      expect(rows).toEqual(people);
      expect(meta.warning).toMatch(/right join input is empty/i);
    });

    it('matches keys case-insensitively when caseInsensitive is set', () => {
      const left = [{ k: 'ABC' }];
      const right = [{ k: 'abc', v: 9 }];
      const cfg = { leftColumn: 'k', rightColumn: 'k' };

      expect(join({ ...cfg, caseInsensitive: true }, left, right).rows).toEqual([
        { k: 'ABC', v: 9 },
      ]);
      // Without the flag the same keys must NOT match.
      expect(join(cfg, left, right).rows).toEqual([{ k: 'ABC', v: null }]);
    });

    it('trims whitespace around join keys before matching', () => {
      const { rows } = join(
        { leftColumn: 'k', rightColumn: 'k' },
        [{ k: ' a ' }],
        [{ k: 'a', v: 1 }]
      );
      expect(rows).toEqual([{ k: ' a ', v: 1 }]);
    });

    it('never matches rows whose join key is null, undefined, or empty', () => {
      const left = [{ k: null, n: 1 }, { k: '', n: 2 }];
      const right = [{ k: null, v: 'nope' }, { k: '', v: 'nope' }, { k: 'x', v: 'yes' }];
      const cfg = { leftColumn: 'k', rightColumn: 'k' };

      // Left join: empty-keyed left rows survive but pull nothing.
      expect(join(cfg, left, right).rows).toEqual([
        { k: null, n: 1, v: null },
        { k: '', n: 2, v: null },
      ]);
      // Inner join: they are dropped entirely.
      expect(join({ ...cfg, joinType: 'inner' }, left, right).rows).toEqual([]);
    });

    it('prefixes pulled columns with cfg.prefix', () => {
      const { rows } = join(
        { leftColumn: 'id', rightColumn: 'id', prefix: 'city_' },
        [{ id: 1 }],
        [{ id: 1, city: 'Oslo' }]
      );
      expect(rows).toEqual([{ id: 1, city_city: 'Oslo' }]);
    });

    it('defaults pullColumns to every right column except the join key', () => {
      const right = [{ id: 1, city: 'Oslo', zip: '0150' }];
      const cfg = { leftColumn: 'id', rightColumn: 'id' };

      expect(join(cfg, [{ id: 1 }], right).rows).toEqual([
        { id: 1, city: 'Oslo', zip: '0150' },
      ]);
      // An explicit pullColumns list narrows it.
      expect(join({ ...cfg, pullColumns: ['city'] }, [{ id: 1 }], right).rows).toEqual([
        { id: 1, city: 'Oslo' },
      ]);
    });

    it('first occurrence wins on duplicate right-side keys, counted in meta.duplicateKeys', () => {
      const right = [
        { id: 1, v: 'first' },
        { id: 1, v: 'second' },
      ];
      const { rows, meta } = join({ leftColumn: 'id', rightColumn: 'id' }, [{ id: 1 }], right);
      expect(rows).toEqual([{ id: 1, v: 'first' }]);
      expect(meta.duplicateKeys).toBe(1);
    });

    it('meta reports matched, unmatched, and at most 5 unmatchedSamples', () => {
      const left = [
        { id: null },
        { id: 'u1' }, { id: 'u2' }, { id: 'u3' }, { id: 'u4' }, { id: 'u5' }, { id: 'u6' },
      ];
      const { meta } = join(
        { leftColumn: 'id', rightColumn: 'id' },
        left,
        [{ id: 'other', v: 1 }]
      );
      expect(meta.matched).toBe(0);
      expect(meta.unmatched).toBe(7);
      expect(meta.unmatchedSamples).toEqual(['(empty)', 'u1', 'u2', 'u3', 'u4']);
    });
  });

  describe('source schema pinning', () => {
    const source = (rows, config = {}) =>
      executeNode({ id: 's', type: 'manualData', data: { rows, config } }, []);

    it('coerces pinned columns on the way in and reports unconvertible values', () => {
      const { rows, meta } = source(
        [{ age: '30' }, { age: 'unknown' }],
        { schema: [{ name: 'age', type: 'number' }] }
      );
      expect(rows).toEqual([{ age: 30 }, { age: 'unknown' }]);
      expect(meta.coercionErrors).toEqual({ age: 1 });
    });

    it('marks pinned columns in the output schema and infers the rest', () => {
      const { schema } = source(
        [{ age: '30', name: 'Ada' }],
        { schema: [{ name: 'age', type: 'number' }] }
      );
      expect(schema).toEqual([
        { name: 'age', type: 'number', format: undefined, pinned: true },
        { name: 'name', type: 'text' },
      ]);
    });

    it('reports pinned columns missing from the data as meta.drift', () => {
      const { meta } = source(
        [{ name: 'Ada' }],
        { schema: [{ name: 'age', type: 'number' }, { name: 'name', type: 'text' }] }
      );
      expect(meta.drift).toEqual({ missing: ['age'] });
    });

    it('infers the schema with no drift or errors when nothing is pinned', () => {
      const { schema, meta } = source([{ id: 7 }]);
      expect(schema).toEqual([{ name: 'id', type: 'number' }]);
      expect(meta.drift).toBeUndefined();
      expect(meta.coercionErrors).toBeUndefined();
    });
  });

  describe('convertTypes', () => {
    const convert = (config, rows, inputSchema = []) =>
      executeNode({ id: 'c', type: 'convertTypes', data: { config } }, rows, {}, inputSchema);

    const rows = [{ amount: '10' }, { amount: 'oops' }, { amount: '30' }];

    it('passes rows through with a warning when no conversions are configured', () => {
      const { rows: out, meta } = convert({}, rows);
      expect(out).toEqual(rows);
      expect(meta.warning).toMatch(/no conversions/i);
    });

    it('converts values and defaults to failing the node on an unconvertible value', () => {
      expect(() =>
        convert({ conversions: [{ field: 'amount', type: 'number' }] }, rows)
      ).toThrow(/row 2.*"oops".*"amount".*number/);
    });

    it('onError "null" nulls the offending value and continues', () => {
      const { rows: out, meta } = convert(
        { conversions: [{ field: 'amount', type: 'number', onError: 'null' }] },
        rows
      );
      expect(out).toEqual([{ amount: 10 }, { amount: null }, { amount: 30 }]);
      expect(meta.nulled).toBe(1);
    });

    it('onError "redirect" sends the original row to the error output with an _error reason', () => {
      const { rows: out, errorRows, meta } = convert(
        { conversions: [{ field: 'amount', type: 'number', onError: 'redirect' }] },
        rows
      );
      expect(out).toEqual([{ amount: 10 }, { amount: 30 }]);
      expect(errorRows).toEqual([
        { amount: 'oops', _error: 'cannot convert "oops" in "amount" to number' },
      ]);
      expect(meta.diverted).toBe(1);
      expect(meta.rowCount).toBe(2);
    });

    it('overrides converted fields in the output schema and appends _error to the error schema', () => {
      const inputSchema = [{ name: 'amount', type: 'text' }];
      const { schema, errorSchema } = convert(
        { conversions: [{ field: 'amount', type: 'number', onError: 'redirect' }] },
        rows,
        inputSchema
      );
      expect(schema).toEqual([{ name: 'amount', type: 'number', format: undefined }]);
      expect(errorSchema).toEqual([
        { name: 'amount', type: 'text' },
        { name: '_error', type: 'text' },
      ]);
    });
  });

  describe('lookup', () => {
    const lookup = (config, rows, inputSchema = []) =>
      executeNode({ id: 'l', type: 'lookup', data: { config } }, rows, {}, inputSchema);

    const rows = [{ code: 'US' }, { code: 'NO' }, { code: 'XX' }];
    const mappings = [
      { from: 'US', to: 'United States' },
      { from: 'NO', to: 'Norway' },
    ];

    it('passes rows through with a warning when not configured', () => {
      const { rows: out, meta } = lookup({}, rows);
      expect(out).toEqual(rows);
      expect(meta.warning).toMatch(/not configured/i);
    });

    it('replaces the lookup column in place when no target column is set', () => {
      const { rows: out, meta } = lookup({ lookupColumn: 'code', mappings }, rows);
      expect(out).toEqual([
        { code: 'United States' },
        { code: 'Norway' },
        { code: 'XX' }, // keep (default) — original value flows through
      ]);
      expect(meta.matched).toBe(2);
      expect(meta.unmatched).toBe(1);
      expect(meta.unmatchedSamples).toEqual(['XX']);
    });

    it('writes into a new target column, leaving the lookup column intact', () => {
      const { rows: out } = lookup(
        { lookupColumn: 'code', targetColumn: 'country', mappings },
        [{ code: 'US' }]
      );
      expect(out).toEqual([{ code: 'US', country: 'United States' }]);
    });

    it('matches keys case-insensitively and trims whitespace when asked', () => {
      const { rows: out } = lookup(
        { lookupColumn: 'code', mappings, caseInsensitive: true },
        [{ code: ' us ' }]
      );
      expect(out).toEqual([{ code: 'United States' }]);
    });

    it('noMatch "null" and "default" substitute for unmatched values', () => {
      const nulled = lookup({ lookupColumn: 'code', mappings, noMatch: 'null' }, [{ code: 'XX' }]);
      expect(nulled.rows).toEqual([{ code: null }]);

      const defaulted = lookup(
        { lookupColumn: 'code', mappings, noMatch: 'default', defaultValue: 'Unknown' },
        [{ code: 'XX' }]
      );
      expect(defaulted.rows).toEqual([{ code: 'Unknown' }]);
    });

    it('noMatch "redirect" sends unmatched rows to the error output with a reason', () => {
      const { rows: out, errorRows, meta } = lookup(
        { lookupColumn: 'code', mappings, noMatch: 'redirect' },
        rows
      );
      expect(out).toEqual([{ code: 'United States' }, { code: 'Norway' }]);
      expect(errorRows).toEqual([
        { code: 'XX', _error: 'no lookup match for "XX" in "code"' },
      ]);
      expect(meta.diverted).toBe(1);
    });

    it('first mapping wins on duplicate keys', () => {
      const { rows: out } = lookup(
        { lookupColumn: 'code', mappings: [{ from: 'US', to: 'first' }, { from: 'US', to: 'second' }] },
        [{ code: 'US' }]
      );
      expect(out).toEqual([{ code: 'first' }]);
    });

    it('re-infers the target column type from the mapped values', () => {
      const { schema } = lookup(
        { lookupColumn: 'code', targetColumn: 'region_id', mappings: [{ from: 'US', to: 840 }, { from: 'NO', to: 578 }] },
        [{ code: 'US' }, { code: 'NO' }],
        [{ name: 'code', type: 'text' }]
      );
      expect(schema).toEqual([
        { name: 'code', type: 'text' },
        { name: 'region_id', type: 'number' },
      ]);
    });

    // Mapping tables that come from a warm Cache entry instead of typed pairs.
    // Keys are unique per run so a real cache dir is safe to write into.
    describe('mappings from a cache', () => {
      const cacheKey = `lookuptest-${Date.now().toString(36)}`;
      const genres = [
        { genre: 'RCK', genre_name: 'Rock' },
        { genre: 'JZZ', genre_name: 'Jazz' },
      ];
      const warm = (rows, schema = []) => writeCache(cacheKey, { rows, schema });
      afterAll(() => clearCache(cacheKey));

      it('maps every cached row without any per-value configuration', () => {
        warm(genres);
        const { rows: out, meta } = lookup(
          { lookupColumn: 'genre', mappingSource: 'cache', cacheKey },
          [{ genre: 'RCK' }, { genre: 'JZZ' }, { genre: 'ZZZ' }]
        );
        expect(out).toEqual([{ genre: 'Rock' }, { genre: 'Jazz' }, { genre: 'ZZZ' }]);
        expect(meta.mappingCount).toBe(2);
        expect(meta.matched).toBe(2);
      });

      it('auto-detects the key column by name and takes the next column as the value', () => {
        warm(genres);
        const { meta } = lookup(
          { lookupColumn: 'Genre', mappingSource: 'cache', cacheKey },
          [{ Genre: 'RCK' }]
        );
        expect(meta.mappingSource).toBe('cache');
        expect(meta.cacheKeyColumn).toBe('genre');
        expect(meta.cacheValueColumn).toBe('genre_name');
      });

      it('falls back to the first column when no cached column matches the lookup column', () => {
        warm(genres);
        const { rows: out, meta } = lookup(
          { lookupColumn: 'code', mappingSource: 'cache', cacheKey },
          [{ code: 'RCK' }]
        );
        expect(meta.cacheKeyColumn).toBe('genre');
        expect(out).toEqual([{ code: 'Rock' }]);
      });

      it('honours explicitly chosen key and value columns', () => {
        warm(genres);
        const { rows: out, meta } = lookup(
          {
            lookupColumn: 'genre',
            mappingSource: 'cache',
            cacheKey,
            cacheKeyColumn: 'genre_name',
            cacheValueColumn: 'genre',
          },
          [{ genre: 'Rock' }]
        );
        expect(meta.cacheKeyColumn).toBe('genre_name');
        expect(out).toEqual([{ genre: 'RCK' }]);
      });

      it('reads columns from the cached rows when the entry has no schema', () => {
        warm([{ a: '1', b: 'one' }], []);
        const { rows: out } = lookup(
          { lookupColumn: 'a', mappingSource: 'cache', cacheKey },
          [{ a: '1' }]
        );
        expect(out).toEqual([{ a: 'one' }]);
      });

      it('applies case-insensitive matching to cached keys too', () => {
        warm(genres);
        const { rows: out } = lookup(
          { lookupColumn: 'genre', mappingSource: 'cache', cacheKey, caseInsensitive: true },
          [{ genre: ' rck ' }]
        );
        expect(out).toEqual([{ genre: 'Rock' }]);
      });

      it('writes into a separate target column, leaving the matched column intact', () => {
        warm(genres);
        const { rows: out } = lookup(
          { lookupColumn: 'genre', targetColumn: 'genre_label', mappingSource: 'cache', cacheKey },
          [{ genre: 'RCK' }]
        );
        expect(out).toEqual([{ genre: 'RCK', genre_label: 'Rock' }]);
      });

      it('passes rows through with a warning when the cache is cold', () => {
        clearCache(cacheKey);
        const rows = [{ genre: 'RCK' }];
        const { rows: out, meta } = lookup(
          { lookupColumn: 'genre', mappingSource: 'cache', cacheKey },
          rows
        );
        expect(out).toEqual(rows);
        expect(meta.warning).toMatch(/cold/i);
      });

      it('passes rows through with a warning when no cache is selected', () => {
        const { meta } = lookup({ lookupColumn: 'genre', mappingSource: 'cache' }, [{ genre: 'RCK' }]);
        expect(meta.warning).toMatch(/no lookup cache/i);
      });
    });
  });

  describe('randomSample', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: i }));

    it('returns all rows (with a note) when input is smaller than the sample size', () => {
      const small = rows.slice(0, 3);
      const { rows: out, meta } = sample({}, small); // default size 100
      expect(out).toEqual(small);
      expect(meta.note).toMatch(/smaller than sample size/i);
    });

    it('returns exactly size distinct input rows when sampling without replacement', () => {
      const { rows: out, meta } = sample({ size: 4 }, rows);
      expect(out).toHaveLength(4);
      expect(new Set(out.map((r) => r.id)).size).toBe(4);
      for (const r of out) expect(rows).toContainEqual(r);
      expect(meta.sampledFrom).toBe(10);
    });

    it('withReplacement returns size rows even when the input is smaller', () => {
      const small = [{ id: 'a' }, { id: 'b' }];
      const { rows: out } = sample({ size: 5, withReplacement: true }, small);
      expect(out).toHaveLength(5);
      for (const r of out) expect(small).toContainEqual(r);
    });

    it('clamps a missing or invalid size to the default of 100, minimum 1', () => {
      const small = rows.slice(0, 3);
      // Unparseable size falls back to 100 → whole (smaller) input returned.
      expect(sample({ size: 'abc' }, small).rows).toEqual(small);
      // Negative size clamps up to 1.
      expect(sample({ size: -5 }, rows).rows).toHaveLength(1);
    });
  });
});
