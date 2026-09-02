import { describe, it, expect } from 'vitest';
import { inferType } from '../../server/engine/inferType.js';

// inferType returns the narrowest type that EVERY non-empty value satisfies.
describe('inferType', () => {
  it('returns "number" when all values are numeric', () => {
    expect(inferType(['1', '2.5', '-3'])).toBe('number');
  });

  it('returns "text" when even one value is not numeric', () => {
    expect(inferType(['1', '2', 'abc'])).toBe('text');
  });

  it('returns "boolean" for yes/no style values', () => {
    expect(inferType(['yes', 'no', 'TRUE', '0'])).toBe('boolean');
  });

  it('returns "date" for ISO dates', () => {
    expect(inferType(['2024-01-15', '2023-12-01T10:30:00Z'])).toBe('date');
  });

  it('ignores nulls and empty strings when deciding', () => {
    expect(inferType([null, '', undefined, '42'])).toBe('number');
  });

  it('returns "empty" when there are no usable values', () => {
    expect(inferType([null, '', undefined])).toBe('empty');
    expect(inferType([])).toBe('empty');
  });

  it('prefers boolean over number for ambiguous 0/1 columns', () => {
    // '0' and '1' are valid numbers AND valid booleans — boolean wins.
    expect(inferType(['0', '1', '1'])).toBe('boolean');
  });
});
