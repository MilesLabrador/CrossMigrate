// Filter rows by chained conditions
// config: { combinator: 'AND'|'OR', conditions: [{ field, op, value }] }
const OPS = {
  equals: (a, b) => String(a ?? '') === String(b ?? ''),
  not_equals: (a, b) => String(a ?? '') !== String(b ?? ''),
  contains: (a, b) => String(a ?? '').toLowerCase().includes(String(b ?? '').toLowerCase()),
  not_contains: (a, b) => !String(a ?? '').toLowerCase().includes(String(b ?? '').toLowerCase()),
  starts_with: (a, b) => String(a ?? '').toLowerCase().startsWith(String(b ?? '').toLowerCase()),
  ends_with: (a, b) => String(a ?? '').toLowerCase().endsWith(String(b ?? '').toLowerCase()),
  greater_than: (a, b) => Number(a) > Number(b),
  less_than: (a, b) => Number(a) < Number(b),
  is_empty: (a) => a === null || a === undefined || String(a).trim() === '',
  is_not_empty: (a) => !(a === null || a === undefined || String(a).trim() === ''),
};

export function filterRows(rows, config = {}) {
  const { conditions = [], combinator = 'AND' } = config;
  if (!conditions.length) return rows;
  return rows.filter((row) => {
    const results = conditions.map((c) => {
      const fn = OPS[c.op];
      if (!fn) return true;
      return fn(row[c.field], c.value);
    });
    return combinator === 'OR' ? results.some(Boolean) : results.every(Boolean);
  });
}

export const filterOps = Object.keys(OPS);
