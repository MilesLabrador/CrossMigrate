import { describe, it, expect } from 'vitest';
import {
  coerceValue,
  applySchema,
  inferSchema,
  projectSchema,
  mergeSchemas,
} from '../../server/engine/schema.js';

describe('coerceValue', () => {
  it('passes null, undefined, and empty string through untouched for every type', () => {
    for (const type of ['text', 'number', 'boolean', 'date']) {
      expect(coerceValue(null, type)).toEqual({ ok: true, value: null });
      expect(coerceValue(undefined, type)).toEqual({ ok: true, value: undefined });
      expect(coerceValue('', type)).toEqual({ ok: true, value: '' });
    }
  });

  it('converts numeric strings to numbers and fails on non-numeric', () => {
    expect(coerceValue('42.5', 'number')).toEqual({ ok: true, value: 42.5 });
    expect(coerceValue('abc', 'number')).toEqual({ ok: false, value: 'abc' });
  });

  it('accepts true/false/1/0/yes/no as booleans, case-insensitively', () => {
    expect(coerceValue('Yes', 'boolean')).toEqual({ ok: true, value: true });
    expect(coerceValue('0', 'boolean')).toEqual({ ok: true, value: false });
    expect(coerceValue(true, 'boolean')).toEqual({ ok: true, value: true });
    expect(coerceValue('maybe', 'boolean')).toEqual({ ok: false, value: 'maybe' });
  });

  it('parses dates with a strict format and normalizes date-only values to YYYY-MM-DD', () => {
    expect(coerceValue('31/12/2024', 'date', 'DD/MM/YYYY')).toEqual({ ok: true, value: '2024-12-31' });
    // Strict: a value that does not match the format fails instead of guessing.
    expect(coerceValue('2024-12-31', 'date', 'DD/MM/YYYY').ok).toBe(false);
  });

  it('keeps the time component when the value has one', () => {
    expect(coerceValue('2024-12-31T10:30:00', 'date')).toEqual({ ok: true, value: '2024-12-31T10:30:00' });
  });

  it('stringifies any value for text', () => {
    expect(coerceValue(42, 'text')).toEqual({ ok: true, value: '42' });
  });
});

describe('applySchema', () => {
  const rows = [
    { age: '30', active: 'yes' },
    { age: 'unknown', active: 'no' },
  ];

  it('coerces pinned columns and counts (but keeps) unconvertible values', () => {
    const { rows: out, errors } = applySchema(rows, [
      { name: 'age', type: 'number' },
      { name: 'active', type: 'boolean' },
    ]);
    expect(out).toEqual([
      { age: 30, active: true },
      { age: 'unknown', active: false }, // original kept, not nulled
    ]);
    expect(errors).toEqual({ age: 1 });
  });

  it('returns rows unchanged when nothing is pinned', () => {
    expect(applySchema(rows, [])).toEqual({ rows, errors: {} });
    expect(applySchema(rows)).toEqual({ rows, errors: {} });
  });

  it('ignores pins for columns the rows lack and pins with unknown types', () => {
    const { rows: out, errors } = applySchema(rows, [
      { name: 'ghost', type: 'number' },
      { name: 'age', type: 'guid' },
    ]);
    expect(out).toEqual(rows);
    expect(errors).toEqual({});
  });
});

describe('inferSchema', () => {
  it('infers a type per column from a sample', () => {
    const schema = inferSchema([
      { id: 1, name: 'Ada', when: '2024-01-01' },
      { id: 2, name: 'Bo', when: '2024-02-01' },
    ]);
    expect(schema).toEqual([
      { name: 'id', type: 'number' },
      { name: 'name', type: 'text' },
      { name: 'when', type: 'date' },
    ]);
  });

  it('returns an empty schema for no rows', () => {
    expect(inferSchema([])).toEqual([]);
  });
});

describe('projectSchema', () => {
  const input = [
    { name: 'id', type: 'number', pinned: true },
    { name: 'name', type: 'text' },
  ];

  it('keeps input specs for surviving columns and infers specs for new ones', () => {
    const out = projectSchema(input, [{ id: 1, extra: 'x' }]);
    expect(out).toEqual([
      { name: 'id', type: 'number', pinned: true },
      { name: 'extra', type: 'text' },
    ]);
  });

  it('returns the input schema unchanged when there are no rows', () => {
    expect(projectSchema(input, [])).toEqual(input);
  });
});

describe('mergeSchemas', () => {
  it('unions schemas with first-spec-wins on name collisions', () => {
    const merged = mergeSchemas([
      [{ name: 'id', type: 'number' }],
      [{ name: 'id', type: 'text' }, { name: 'city', type: 'text' }],
    ]);
    expect(merged).toEqual([
      { name: 'id', type: 'number' },
      { name: 'city', type: 'text' },
    ]);
  });
});
