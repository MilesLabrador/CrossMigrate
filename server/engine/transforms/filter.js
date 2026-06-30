// Filter rows by chained conditions, optionally drop columns by field-stat conditions
// config: {
//   combinator: 'AND'|'OR',
//   conditions: [
//     { scope?: 'row',   field, op, value },                              // row-value (default)
//     { scope:  'field', stat: 'fill_pct'|'unique_count'|'null_count'|'type'|'name', op, value }
//   ]
// }
const OPS = {
  equals: (a, b) => String(a ?? '') === String(b ?? ''),
  not_equals: (a, b) => String(a ?? '') !== String(b ?? ''),
  contains: (a, b) => String(a ?? '').toLowerCase().includes(String(b ?? '').toLowerCase()),
  not_contains: (a, b) => !String(a ?? '').toLowerCase().includes(String(b ?? '').toLowerCase()),
  starts_with: (a, b) => String(a ?? '').toLowerCase().startsWith(String(b ?? '').toLowerCase()),
  ends_with: (a, b) => String(a ?? '').toLowerCase().endsWith(String(b ?? '').toLowerCase()),
  greater_than: (a, b) => Number(a) > Number(b),
  less_than: (a, b) => Number(a) < Number(b),
  greater_equal: (a, b) => Number(a) >= Number(b),
  less_equal: (a, b) => Number(a) <= Number(b),
  is_empty: (a) => a === null || a === undefined || String(a).trim() === '',
  is_not_empty: (a) => !(a === null || a === undefined || String(a).trim() === ''),
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]+)?$/;
const BOOL_SET = new Set(['true', 'false', '1', '0', 'yes', 'no']);
function inferType(values) {
  const nonNull = values.filter((v) => v !== null && v !== undefined && v !== '');
  if (!nonNull.length) return 'empty';
  let isNum = true, isBool = true, isDate = true;
  for (const v of nonNull) {
    const s = String(v).trim().toLowerCase();
    if (isNum  && isNaN(Number(v)))          isNum  = false;
    if (isBool && !BOOL_SET.has(s))          isBool = false;
    if (isDate && !ISO_DATE.test(String(v))) isDate = false;
    if (!isNum && !isBool && !isDate) break;
  }
  if (isBool) return 'boolean';
  if (isDate) return 'date';
  if (isNum)  return 'number';
  return 'text';
}

function computeColumnStats(rows) {
  if (!rows.length) return {};
  const cols = Object.keys(rows[0]);
  const out = {};
  const sample = rows.slice(0, 500);
  for (const col of cols) {
    const values = rows.map((r) => r[col]);
    const nonEmpty = values.filter((v) => v !== null && v !== undefined && v !== '');
    const nullCount = values.length - nonEmpty.length;
    const uniqueCount = new Set(nonEmpty.map((v) => String(v))).size;
    const type = inferType(sample.map((r) => r[col]));
    const fillPct = rows.length ? ((rows.length - nullCount) / rows.length) * 100 : 0;
    out[col] = { name: col, type, nullCount, uniqueCount, fillPct };
  }
  return out;
}

function statValue(stats, stat) {
  switch (stat) {
    case 'fill_pct':     return stats.fillPct;
    case 'unique_count': return stats.uniqueCount;
    case 'null_count':   return stats.nullCount;
    case 'type':         return stats.type;
    case 'name':         return stats.name;
    default: return null;
  }
}

export function filterRows(rows, config = {}) {
  const { conditions = [], combinator = 'AND' } = config;
  if (!conditions.length) return rows;

  const fieldConds = conditions.filter((c) => c.scope === 'field');
  const rowConds   = conditions.filter((c) => c.scope !== 'field');

  let working = rows;

  // 1. Column pruning by field-stat conditions
  if (fieldConds.length && working.length) {
    const stats = computeColumnStats(working);
    const cols = Object.keys(working[0]);
    const keep = cols.filter((col) => {
      const s = stats[col];
      const results = fieldConds.map((c) => {
        const fn = OPS[c.op];
        if (!fn) return true;
        return fn(statValue(s, c.stat), c.value);
      });
      return combinator === 'OR' ? results.some(Boolean) : results.every(Boolean);
    });
    if (keep.length !== cols.length) {
      working = working.map((row) => {
        const r = {};
        for (const c of keep) r[c] = row[c];
        return r;
      });
    }
  }

  // 2. Row filtering by row-value conditions
  if (rowConds.length) {
    working = working.filter((row) => {
      const results = rowConds.map((c) => {
        const fn = OPS[c.op];
        if (!fn) return true;
        return fn(row[c.field], c.value);
      });
      return combinator === 'OR' ? results.some(Boolean) : results.every(Boolean);
    });
  }

  return working;
}

export const filterOps = Object.keys(OPS);
export const fieldStatKeys = ['fill_pct', 'unique_count', 'null_count', 'type', 'name'];
