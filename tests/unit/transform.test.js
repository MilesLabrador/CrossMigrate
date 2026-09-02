import { describe, it, expect } from 'vitest';
import { fieldTransform } from '../../server/engine/transforms/transform.js';

// Shorthand: apply one transform to one row and return the transformed value.
const apply = (value, type, opts) =>
  fieldTransform([{ v: value }], { fieldTransforms: [{ field: 'v', type, opts }] })[0].v;

describe('fieldTransform', () => {
  it('returns rows unchanged when fieldTransforms is empty', () => {
    const rows = [{ v: ' a ' }];
    expect(fieldTransform(rows, {})).toEqual(rows);
    expect(fieldTransform(rows, { fieldTransforms: [] })).toEqual(rows);
  });

  it('leaves null and undefined values untouched', () => {
    expect(apply(null, 'trim')).toBe(null);
    expect(apply(undefined, 'uppercase')).toBe(undefined);
  });

  it('skips transform entries that have no field', () => {
    const rows = [{ v: ' a ' }];
    expect(fieldTransform(rows, { fieldTransforms: [{ type: 'trim' }] })).toEqual(rows);
  });

  it('does not mutate the input rows', () => {
    const row = { v: ' a ' };
    fieldTransform([row], { fieldTransforms: [{ field: 'v', type: 'trim' }] });
    expect(row.v).toBe(' a ');
  });

  it('applies multiple transforms to the same field in order', () => {
    const out = fieldTransform([{ v: '  hi  ' }], {
      fieldTransforms: [
        { field: 'v', type: 'trim' },
        { field: 'v', type: 'uppercase' },
      ],
    });
    expect(out[0].v).toBe('HI');
  });

  describe('trim / uppercase / lowercase', () => {
    it('trims surrounding whitespace', () => {
      expect(apply('  hi  ', 'trim')).toBe('hi');
    });

    it('uppercases and lowercases string values', () => {
      expect(apply('MiXeD', 'uppercase')).toBe('MIXED');
      expect(apply('MiXeD', 'lowercase')).toBe('mixed');
    });

    it('stringifies non-string values before transforming', () => {
      expect(apply(42, 'trim')).toBe('42');
    });
  });

  describe('date_format', () => {
    it('reformats a date using an explicit input format', () => {
      expect(apply('31/12/2024', 'date_format', { input: 'DD/MM/YYYY', output: 'YYYY-MM-DD' }))
        .toBe('2024-12-31');
    });

    it('parses loosely when no input format is given', () => {
      expect(apply('2024-01-05T12:30:00', 'date_format', { output: 'DD/MM/YYYY' }))
        .toBe('05/01/2024');
    });

    it('defaults the output format to YYYY-MM-DD', () => {
      expect(apply('12/31/2024', 'date_format', { input: 'MM/DD/YYYY' })).toBe('2024-12-31');
    });

    it('returns the original string when the date does not parse', () => {
      expect(apply('not a date', 'date_format', { input: 'DD/MM/YYYY' })).toBe('not a date');
    });
  });

  describe('set', () => {
    it('replaces the value with opts.value', () => {
      expect(apply('old', 'set', { value: 'new' })).toBe('new');
    });

    it('falls back to empty string when opts.value is missing', () => {
      expect(apply('old', 'set', {})).toBe('');
    });
  });

  describe('replace', () => {
    it('replaces every occurrence of find, not just the first', () => {
      expect(apply('a-b-a', 'replace', { find: 'a', replace: 'z' })).toBe('z-b-z');
    });

    it('is a no-op when find is empty', () => {
      expect(apply('abc', 'replace', { find: '', replace: 'z' })).toBe('abc');
    });
  });

  describe('regex_extract', () => {
    it('returns capture group 1 by default', () => {
      expect(apply('id:123', 'regex_extract', { pattern: 'id:(\\d+)' })).toBe('123');
    });

    it('returns the group named by opts.group, falling back to the whole match', () => {
      expect(apply('bob@example', 'regex_extract', { pattern: '(\\w+)@(\\w+)', group: 2 }))
        .toBe('example');
      // No capture group at all — m[1] is undefined, so the whole match wins.
      expect(apply('abc123', 'regex_extract', { pattern: '\\d+' })).toBe('123');
    });

    it('returns the original string when nothing matches', () => {
      expect(apply('abc', 'regex_extract', { pattern: 'xyz' })).toBe('abc');
    });

    it('returns the original string on an invalid pattern instead of throwing', () => {
      expect(apply('abc', 'regex_extract', { pattern: '(' })).toBe('abc');
    });
  });
});
