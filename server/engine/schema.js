// Field-type metadata that travels through the pipeline alongside rows.
// Every node's output carries a schema describing its columns, so downstream
// nodes (and the UI) always know each column's name and type without
// re-scanning the data.
//
// A schema is an array of column specs:
//   { name, type: 'text'|'number'|'boolean'|'date'|'empty', format?, pinned? }
// `pinned: true` marks a type the user set explicitly at a source node;
// everything else is inferred from a sample and treated as a suggestion.
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
import { inferType } from './inferType.js';

dayjs.extend(customParseFormat);

export const SCHEMA_TYPES = ['text', 'number', 'boolean', 'date'];

const TRUE_SET = new Set(['true', '1', 'yes']);
const FALSE_SET = new Set(['false', '0', 'no']);

// Infer a full schema from rows. Sample-based: only the first 100 rows are
// examined, and each column gets the narrowest type every sampled value in it
// satisfies (see inferType). Column order follows the first row's keys.
export function inferSchema(rows) {
  if (!rows.length) return [];
  const sample = rows.slice(0, 100);
  const cols = Object.keys(rows[0]);
  return cols.map((name) => ({
    name,
    type: inferType(sample.map((r) => r[name])),
  }));
}

// Try to convert one value to a schema type. Returns { ok, value }.
// null/undefined/'' pass through unchanged — emptiness is nullability's
// business, not the type system's.
export function coerceValue(value, type, format) {
  if (value === null || value === undefined || value === '') return { ok: true, value };
  switch (type) {
    case 'text':
      return { ok: true, value: String(value) };
    case 'number': {
      const n = Number(value);
      return Number.isNaN(n) ? { ok: false, value } : { ok: true, value: n };
    }
    case 'boolean': {
      if (typeof value === 'boolean') return { ok: true, value };
      const s = String(value).trim().toLowerCase();
      if (TRUE_SET.has(s)) return { ok: true, value: true };
      if (FALSE_SET.has(s)) return { ok: true, value: false };
      return { ok: false, value };
    }
    case 'date': {
      const s = String(value);
      const d = format ? dayjs(s, format, true) : dayjs(s);
      if (!d.isValid()) return { ok: false, value };
      const hasTime = d.hour() || d.minute() || d.second();
      return { ok: true, value: d.format(hasTime ? 'YYYY-MM-DDTHH:mm:ss' : 'YYYY-MM-DD') };
    }
    default:
      return { ok: true, value };
  }
}

// Apply user-pinned column types to source rows. Enforcement is deliberately
// soft: each value is run through coerceValue, converted values are written
// back, and a value that won't convert is left exactly as it arrived — only
// counted, never nulled or dropped, so no data is lost at the source. The
// counts come back as { rows, errors } with errors = { [field]: failCount },
// and the UI surfaces them as warnings. Strict handling of bad values (abort,
// null out, or divert the row) belongs to the Convert Types node, which offers
// those choices per field.
export function applySchema(rows, pinned = []) {
  const specs = pinned.filter((s) => s?.name && SCHEMA_TYPES.includes(s.type));
  if (!specs.length) return { rows, errors: {} };
  const errors = {};
  const out = rows.map((row) => {
    let changed = false;
    const next = { ...row };
    for (const spec of specs) {
      if (!(spec.name in next)) continue;
      const { ok, value } = coerceValue(next[spec.name], spec.type, spec.format);
      if (!ok) {
        errors[spec.name] = (errors[spec.name] || 0) + 1;
      } else if (value !== next[spec.name]) {
        next[spec.name] = value;
        changed = true;
      }
    }
    return changed ? next : row;
  });
  return { rows: out, errors };
}

// Schema for a node's output: keep the input spec for every surviving column,
// infer specs only for columns the node introduced. This is how metadata
// survives filters, dedupes, samples, and other row-level transforms.
export function projectSchema(inputSchema, rows) {
  if (!rows.length) return inputSchema;
  const byName = new Map(inputSchema.map((s) => [s.name, s]));
  const sample = rows.slice(0, 100);
  return Object.keys(rows[0]).map(
    (name) => byName.get(name) || { name, type: inferType(sample.map((r) => r[name])) }
  );
}

// Union of several upstream schemas (nodes merging multiple inputs).
// First spec wins on a name collision.
export function mergeSchemas(schemas) {
  const byName = new Map();
  for (const schema of schemas) {
    for (const spec of schema || []) {
      if (!byName.has(spec.name)) byName.set(spec.name, spec);
    }
  }
  return Array.from(byName.values());
}
