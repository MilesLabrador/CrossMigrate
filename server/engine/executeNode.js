import { selectMap } from './transforms/select.js';
import { filterRows } from './transforms/filter.js';
import { fieldTransform } from './transforms/transform.js';
import { deduplicate, duplicateCount } from './transforms/deduplicate.js';
import { inferType } from './inferType.js';
import { applySchema, coerceValue, inferSchema, mergeSchemas, projectSchema } from './schema.js';
import { readCache, writeCache } from './cacheStore.js';

// Returns { rows, meta, schema } — schema is the column-type metadata that
// travels with the rows (see schema.js). convertTypes additionally returns
// { errorRows, errorSchema }: rows diverted to its error output.
export function executeNode(node, inputRows, handleInputs = {}, inputSchema = [], handleSchemas = {}) {
  const type = node.type;
  const cfg = node.data?.config || {};
  switch (type) {
    case 'csvInput':
    case 'xlsxInput':
    case 'sqlInput':
    case 'manualData':
    case 'dataverseInput':
    case 'dataverseView': {
      // Source nodes carry their rows in node.data.rows (fetched before pipeline run)
      return executeSource(node, cfg);
    }
    case 'selectColumns': {
      const cols = cfg.columns || [];
      if (!cols.length) return { rows: inputRows, meta: { rowCount: inputRows.length }, schema: inputSchema };
      const out = inputRows.map((row) => {
        const r = {};
        for (const c of cols) r[c] = row[c];
        return r;
      });
      return { rows: out, meta: { rowCount: out.length }, schema: projectSchema(inputSchema, out) };
    }
    case 'selectMap': {
      const out = selectMap(inputRows, cfg);
      return { rows: out, meta: { rowCount: out.length }, schema: selectMapSchema(inputSchema, cfg, out) };
    }
    case 'filter': {
      const out = filterRows(inputRows, cfg);
      return {
        rows: out,
        meta: { rowCount: out.length, matchedOf: inputRows.length },
        schema: projectSchema(inputSchema, out),
      };
    }
    case 'transform': {
      const out = fieldTransform(inputRows, cfg);
      // Transformed fields may have changed type (date_format, set, …) —
      // re-infer those; everything else keeps its upstream spec.
      const touched = new Set((cfg.fieldTransforms || []).map((t) => t.field).filter(Boolean));
      const schema = projectSchema(inputSchema, out).map((s) =>
        touched.has(s.name)
          ? { name: s.name, type: inferType(out.slice(0, 100).map((r) => r[s.name])) }
          : s
      );
      return { rows: out, meta: { rowCount: out.length }, schema };
    }
    case 'convertTypes': {
      return convertTypes(inputRows, cfg, inputSchema);
    }
    case 'lookup': {
      return lookupRows(inputRows, cfg, inputSchema);
    }
    case 'cache': {
      return cacheNode(node, inputRows, cfg, inputSchema);
    }
    case 'deduplicate': {
      const out = deduplicate(inputRows, cfg);
      return {
        rows: out,
        meta: { rowCount: out.length, duplicatesRemoved: duplicateCount(inputRows, cfg) },
        schema: projectSchema(inputSchema, out),
      };
    }
    case 'join': {
      return joinRows(handleInputs, cfg, handleSchemas);
    }
    case 'randomSample': {
      const size = Math.max(1, parseInt(cfg.size) || 100);
      if (cfg.withReplacement) {
        const out = sampleWithReplacement(inputRows, size);
        return { rows: out, meta: { rowCount: out.length, sampledFrom: inputRows.length }, schema: projectSchema(inputSchema, out) };
      }
      if (inputRows.length <= size) {
        return {
          rows: inputRows,
          meta: { rowCount: inputRows.length, note: 'Input smaller than sample size — returned all rows' },
          schema: inputSchema,
        };
      }
      const out = fisherYates(inputRows, size);
      return { rows: out, meta: { rowCount: out.length, sampledFrom: inputRows.length }, schema: projectSchema(inputSchema, out) };
    }
    case 'preview': {
      return { rows: inputRows, meta: { rowCount: inputRows.length }, schema: inputSchema };
    }
    case 'previewColumns': {
      const schema = schemaWithNullCounts(inputRows, inputSchema);
      return { rows: inputRows, meta: { rowCount: inputRows.length, schema }, schema: projectSchema(inputSchema, inputRows) };
    }
    case 'fieldUsage': {
      const fieldStats = computeFieldStats(inputRows);
      return { rows: inputRows, meta: { rowCount: inputRows.length, fieldStats }, schema: projectSchema(inputSchema, inputRows) };
    }
    case 'csvExport': {
      // Pass through; client handles download
      return { rows: inputRows, meta: { rowCount: inputRows.length }, schema: inputSchema };
    }
    case 'dataverseOutput': {
      // Pipeline run does NOT import; client posts /api/import-dataverse afterwards
      return { rows: inputRows, meta: { rowCount: inputRows.length, ready: true }, schema: inputSchema };
    }
    case 'sqlOutput': {
      // Pipeline run does NOT write; client posts /api/sql/write afterwards
      return { rows: inputRows, meta: { rowCount: inputRows.length, ready: true }, schema: inputSchema };
    }
    default:
      return { rows: inputRows, meta: { rowCount: inputRows.length, warning: `unknown node type ${type}` }, schema: inputSchema };
  }
}

// ─── Sources: pinned types + drift detection ─────────────────────────────────
// cfg.schema = [{ name, type, format? }] pinned by the user in the source
// config panel. Pinned columns are coerced on the way in (softly — values
// that won't convert stay as-is and are counted in meta.coercionErrors).
// Pinned columns missing from the actual data are reported as meta.drift.
function executeSource(node, cfg) {
  const raw = node.data?.rows || [];
  const pinned = Array.isArray(cfg.schema) ? cfg.schema.filter((s) => s?.name) : [];

  const { rows, errors } = applySchema(raw, pinned);

  const pinnedByName = new Map(pinned.map((s) => [s.name, s]));
  const schema = inferSchema(rows).map((s) =>
    pinnedByName.has(s.name)
      ? { ...s, type: pinnedByName.get(s.name).type, format: pinnedByName.get(s.name).format, pinned: true }
      : s
  );

  const meta = { rowCount: rows.length };
  if (Object.keys(errors).length) meta.coercionErrors = errors;
  if (pinned.length && rows.length) {
    const actual = new Set(Object.keys(rows[0]));
    const missing = pinned.map((s) => s.name).filter((n) => !actual.has(n));
    if (missing.length) meta.drift = { missing };
  }
  return { rows, meta, schema };
}

// selectMap renames columns — carry each source column's spec to its target name.
function selectMapSchema(inputSchema, cfg, outRows) {
  const mappings = (cfg.mappings || []).filter((m) => !m.skip && m.target);
  if (!mappings.length) return inputSchema;
  const byName = new Map(inputSchema.map((s) => [s.name, s]));
  return mappings.map((m) => {
    const src = byName.get(m.source);
    return src
      ? { ...src, name: m.target }
      : { name: m.target, type: inferType(outRows.slice(0, 100).map((r) => r[m.target])) };
  });
}

// ─── Convert Types (explicit per-column casts) ───────────────────────────────
// cfg.conversions = [{ field, type, format?, onError: 'fail'|'null'|'redirect' }]
// Walks every row and runs each configured field through coerceValue, writing
// the converted value back in place. A value that cannot be converted triggers
// that field's error disposition:
//   fail     — throw immediately, aborting the node (the run surfaces a node
//              error naming the row, field, and value); this is the default
//   null     — set the offending value to null, count it, and continue
//   redirect — divert the whole ORIGINAL row (untouched, plus an _error column
//              explaining the failure) to the node's error output, skipping
//              any remaining conversions for that row
// The output schema reflects the configured types for converted fields; the
// error output keeps the input schema (rows there were never converted) with
// _error appended.
function convertTypes(inputRows, cfg, inputSchema) {
  const conversions = (cfg.conversions || []).filter((c) => c?.field && c?.type);
  if (!conversions.length) {
    return {
      rows: inputRows,
      meta: { rowCount: inputRows.length, warning: 'No conversions configured — passing rows through' },
      schema: inputSchema,
      errorRows: [],
      errorSchema: inputSchema,
    };
  }

  const out = [];
  const errorRows = [];
  let nulled = 0;
  for (let i = 0; i < inputRows.length; i++) {
    const row = inputRows[i];
    let next = { ...row };
    let diverted = false;
    for (const c of conversions) {
      const { ok, value } = coerceValue(next[c.field], c.type, c.format);
      if (ok) {
        next[c.field] = value;
        continue;
      }
      const onError = c.onError || 'fail';
      if (onError === 'fail') {
        throw new Error(
          `Convert Types: row ${i + 1}: cannot convert "${row[c.field]}" in "${c.field}" to ${c.type}`
        );
      }
      if (onError === 'null') {
        next[c.field] = null;
        nulled++;
        continue;
      }
      // redirect — original row, untouched, with the reason attached
      errorRows.push({ ...row, _error: `cannot convert "${row[c.field]}" in "${c.field}" to ${c.type}` });
      diverted = true;
      break;
    }
    if (!diverted) out.push(next);
  }

  const converted = new Map(conversions.map((c) => [c.field, c]));
  const schema = projectSchema(inputSchema, out.length ? out : inputRows).map((s) =>
    converted.has(s.name)
      ? { name: s.name, type: converted.get(s.name).type, format: converted.get(s.name).format }
      : s
  );

  return {
    rows: out,
    meta: {
      rowCount: out.length,
      converted: conversions.map((c) => c.field),
      nulled,
      diverted: errorRows.length,
    },
    schema,
    errorRows,
    // Redirected rows are the ORIGINAL rows plus _error, so they keep the
    // input schema, not the converted one.
    errorSchema: [...inputSchema, { name: '_error', type: 'text' }],
  };
}

// ─── Lookup (inject values from a mapping table) ─────────────────────────────
// cfg: { lookupColumn, targetColumn?, mappingSource: 'inline'|'cache',
//        mappings: [{ from, to }], cacheKey, cacheKeyColumn?, cacheValueColumn?,
//        caseInsensitive, noMatch: 'keep'|'null'|'default'|'redirect',
//        defaultValue }
// The { from → to } pairs come from one of two places:
//   inline — the pairs typed into the node's config (the default)
//   cache  — every row of a warm Cache entry, read as two of its columns: one
//            holding the value to match, one holding the value to inject. Both
//            columns are optional; when blank they're detected from the cached
//            table (see pickCacheColumns), so caching a two-column reference
//            table (genre code → genre name) and pointing a Lookup at it needs
//            no per-value configuration at all.
// Keys are trimmed (and lowered when caseInsensitive); the first pair wins on
// duplicate keys. Each row's lookupColumn value is matched against the table
// and the mapped value written into targetColumn — or over lookupColumn itself
// when targetColumn is blank.
// A row whose key isn't in the table follows the noMatch disposition:
//   keep     — copy the original lookup value into the target column (default)
//   null     — write null into the target column
//   default  — write cfg.defaultValue into the target column
//   redirect — divert the row (plus an _error column naming the unmatched
//              value) to the node's error output
// Meta reports matched/unmatched counts and up to 5 sample unmatched values,
// plus which table the mappings came from.
// The target column's type is re-inferred from the mapped output, since the
// mapping may change it (e.g. text codes mapped to numbers).

// Loose column-name comparison — "GenreCode", "genre_code" and "genre code"
// are the same column as far as auto-detection is concerned.
const loose = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Which cached columns hold the keys and the values. An explicit choice always
// wins; otherwise the key column is the one whose name matches the column being
// looked up (or the first column), and the value column is the next column
// along — the shape a two-column reference table already has.
export function pickCacheColumns(columns, { lookupColumn, cacheKeyColumn, cacheValueColumn } = {}) {
  const has = (c) => c && columns.includes(c);
  const keyColumn = has(cacheKeyColumn)
    ? cacheKeyColumn
    : columns.find((c) => loose(c) === loose(lookupColumn)) || columns[0];
  const valueColumn = has(cacheValueColumn)
    ? cacheValueColumn
    : columns.find((c) => c !== keyColumn) || keyColumn;
  return { keyColumn, valueColumn };
}

// Builds the { from → to } table for a lookup. Returns { pairs, meta, error }:
// `pairs` is an array of [from, to]; `error` is a human-readable reason the
// table couldn't be built (which makes the node a pass-through with a warning).
function lookupPairs(cfg) {
  const { mappingSource = 'inline', lookupColumn } = cfg;

  if (mappingSource !== 'cache') {
    const valid = (cfg.mappings || []).filter(
      (m) => m && m.from !== undefined && m.from !== null && String(m.from) !== ''
    );
    if (!valid.length) return { pairs: [], error: 'Lookup not configured — passing rows through' };
    return { pairs: valid.map((m) => [m.from, m.to]), meta: { mappingSource: 'inline' } };
  }

  const cacheKey = cfg.cacheKey || '';
  if (!cacheKey) return { pairs: [], error: 'No lookup cache selected — passing rows through' };

  const hit = readCache(cacheKey);
  if (!hit) {
    return { pairs: [], error: `Lookup cache "${cacheKey}" is cold — run its Cache node first` };
  }

  const columns = hit.schema.length
    ? hit.schema.map((s) => s.name)
    : [...new Set(hit.rows.slice(0, 50).flatMap((r) => Object.keys(r || {})))];
  if (!columns.length) {
    return { pairs: [], error: `Lookup cache "${cacheKey}" has no columns — passing rows through` };
  }

  const { keyColumn, valueColumn } = pickCacheColumns(columns, {
    lookupColumn,
    cacheKeyColumn: cfg.cacheKeyColumn,
    cacheValueColumn: cfg.cacheValueColumn,
  });

  const pairs = hit.rows
    .filter((r) => r && r[keyColumn] !== undefined && r[keyColumn] !== null && String(r[keyColumn]) !== '')
    .map((r) => [r[keyColumn], r[valueColumn]]);
  if (!pairs.length) {
    return {
      pairs: [],
      error: `Lookup cache "${cacheKey}" has no values in "${keyColumn}" — passing rows through`,
    };
  }

  return {
    pairs,
    meta: {
      mappingSource: 'cache',
      cacheKey,
      cacheKeyColumn: keyColumn,
      cacheValueColumn: valueColumn,
      cachedAt: hit.cachedAt,
    },
  };
}

function lookupRows(rows, cfg, inputSchema) {
  const {
    lookupColumn, targetColumn = '',
    caseInsensitive = false, noMatch = 'keep', defaultValue = '',
  } = cfg;

  const { pairs, meta: sourceMeta = {}, error } = lookupPairs(cfg);

  if (!lookupColumn || error) {
    return {
      rows,
      meta: {
        rowCount: rows.length,
        ...sourceMeta,
        warning: lookupColumn ? error : 'Lookup not configured — passing rows through',
      },
      schema: inputSchema,
      errorRows: [],
      errorSchema: inputSchema,
    };
  }

  const target = targetColumn || lookupColumn;
  const norm = (v) => {
    const s = String(v ?? '').trim();
    return caseInsensitive ? s.toLowerCase() : s;
  };
  const map = new Map();
  for (const [from, to] of pairs) {
    const k = norm(from);
    if (!map.has(k)) map.set(k, to); // first mapping wins on duplicates
  }

  let matched = 0;
  const unmatchedSamples = [];
  const out = [];
  const errorRows = [];
  for (const row of rows) {
    const k = norm(row[lookupColumn]);
    if (map.has(k)) {
      matched++;
      out.push({ ...row, [target]: map.get(k) });
      continue;
    }
    if (unmatchedSamples.length < 5) unmatchedSamples.push(row[lookupColumn] ?? '(empty)');
    switch (noMatch) {
      case 'null':
        out.push({ ...row, [target]: null });
        break;
      case 'default':
        out.push({ ...row, [target]: defaultValue });
        break;
      case 'redirect':
        errorRows.push({ ...row, _error: `no lookup match for "${row[lookupColumn] ?? ''}" in "${lookupColumn}"` });
        break;
      default: // 'keep' — original value flows through to the target column
        out.push({ ...row, [target]: row[lookupColumn] });
    }
  }

  // The target column's type comes from what the mapping produces, not from
  // what went in.
  const schema = projectSchema(inputSchema, out.length ? out : rows).map((s) =>
    s.name === target
      ? { name: target, type: inferType(out.slice(0, 100).map((r) => r[target])) }
      : s
  );
  if (!schema.some((s) => s.name === target) && out.length) {
    schema.push({ name: target, type: inferType(out.slice(0, 100).map((r) => r[target])) });
  }

  return {
    rows: out,
    meta: {
      rowCount: out.length,
      ...sourceMeta,
      mappingCount: map.size,
      matched,
      unmatched: rows.length - matched,
      diverted: errorRows.length,
      unmatchedSamples,
    },
    schema,
    errorRows,
    errorSchema: [...inputSchema, { name: '_error', type: 'text' }],
  };
}

// ─── Cache (persist rows to disk and replay them on later runs) ──────────────
// Snapshots the node's input (rows + schema) into a JSON file on the server
// (see cacheStore.js) keyed by cfg.cacheKey, defaulting to the node id.
// cfg: { mode: 'auto'|'refresh'|'bypass', cacheKey? }
//   auto    — serve from the warm cache if one exists (upstream may then run
//             empty without refetching); otherwise cache this run's input
//   refresh — always overwrite the cache with this run's input
//   bypass  — plain pass-through, cache untouched
// A warm entry is also readable by name elsewhere in the app: a Lookup node can
// use a cached reference table as its mapping table (see lookupPairs), which is
// what cfg.cacheKey is for — a stable, human-chosen name to point at.
function cacheNode(node, inputRows, cfg, inputSchema) {
  const key = cfg.cacheKey || node.id;
  const mode = cfg.mode || 'auto';

  if (mode === 'bypass') {
    return { rows: inputRows, meta: { rowCount: inputRows.length, bypassed: true }, schema: inputSchema };
  }

  if (mode === 'auto') {
    const hit = readCache(key);
    if (hit) {
      return {
        rows: hit.rows,
        meta: { rowCount: hit.rows.length, fromCache: true, cachedAt: hit.cachedAt },
        schema: hit.schema.length ? hit.schema : inputSchema,
      };
    }
    if (!inputRows.length) {
      // Cold cache and nothing arrived — never cache emptiness by accident.
      return {
        rows: inputRows,
        meta: { rowCount: 0, warning: 'Cache is cold and no rows arrived — nothing cached' },
        schema: inputSchema,
      };
    }
  }

  // The label is what a cache picker shows (the Lookup node's, say) — a
  // renamed node reads better in that list than a generated node id.
  const label = cfg.cacheKey || node.data?.name || node.id;
  const cachedAt = writeCache(key, { rows: inputRows, schema: inputSchema, label });
  return {
    rows: inputRows,
    meta: { rowCount: inputRows.length, fromCache: false, cached: true, cachedAt },
    schema: inputSchema,
  };
}

// ─── Join (enrich left-input rows from a second, right input) ────────────────
// joinType: 'left' keeps all left rows (blank fills on no match), 'inner'
// keeps only rows whose keys matched.
function joinRows(handleInputs, cfg, handleSchemas = {}) {
  const left = handleInputs.left || [];
  const right = handleInputs.right || [];
  const { leftColumn, rightColumn, pullColumns = [], joinType = 'left', prefix = '', caseInsensitive = false } = cfg;
  const leftSchema = handleSchemas.left || [];
  const rightSchema = handleSchemas.right || [];

  if (!leftColumn || !rightColumn) {
    return { rows: left, meta: { rowCount: left.length, warning: 'Join not configured — passing left input through' }, schema: projectSchema(leftSchema, left) };
  }
  if (!right.length) {
    return { rows: left, meta: { rowCount: left.length, warning: 'Right join input is empty — passing left input through' }, schema: projectSchema(leftSchema, left) };
  }

  const normKey = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const s = String(v).trim();
    return caseInsensitive ? s.toLowerCase() : s;
  };

  // First occurrence wins on duplicate right-side keys
  const index = new Map();
  let duplicateKeys = 0;
  for (const r of right) {
    const k = normKey(r[rightColumn]);
    if (k === null) continue;
    if (index.has(k)) duplicateKeys++;
    else index.set(k, r);
  }

  const pulls = pullColumns.length
    ? pullColumns
    : Object.keys(right[0]).filter((c) => c !== rightColumn);

  let matched = 0;
  const unmatchedSamples = [];
  const out = [];
  for (const row of left) {
    const k = normKey(row[leftColumn]);
    const hit = k === null ? undefined : index.get(k);
    if (hit) {
      matched++;
      const add = {};
      for (const c of pulls) add[prefix + c] = hit[c];
      out.push({ ...row, ...add });
    } else {
      if (unmatchedSamples.length < 5) unmatchedSamples.push(row[leftColumn] ?? '(empty)');
      if (joinType === 'inner') continue;
      const add = {};
      for (const c of pulls) add[prefix + c] = null;
      out.push({ ...row, ...add });
    }
  }

  // Output columns = left columns + pulled right columns (prefixed), keeping
  // each side's specs.
  const rightByName = new Map(rightSchema.map((s) => [s.name, s]));
  const schema = mergeSchemas([
    projectSchema(leftSchema, left),
    pulls.map((c) => {
      const spec = rightByName.get(c);
      return spec ? { ...spec, name: prefix + c } : { name: prefix + c, type: inferType(right.slice(0, 100).map((r) => r[c])) };
    }),
  ]);

  return {
    rows: out,
    meta: {
      rowCount: out.length,
      matched,
      unmatched: left.length - matched,
      leftRows: left.length,
      rightRows: right.length,
      duplicateKeys,
      unmatchedSamples,
    },
    schema,
  };
}

// ─── Random sample (Fisher-Yates) ────────────────────────────────────────────
function fisherYates(arr, n) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

function sampleWithReplacement(arr, n) {
  if (!arr.length) return [];
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ ...arr[Math.floor(Math.random() * arr.length)] });
  }
  return out;
}

// ─── Schema inference (previewColumns UI: types + null counts) ───────────────
// Uses the pipeline schema for types (so pinned/converted types show through)
// and only counts nulls itself.
function schemaWithNullCounts(rows, inputSchema) {
  if (!rows.length) return [];
  const specs = projectSchema(inputSchema, rows);
  return specs.map((s) => ({
    name: s.name,
    type: s.type,
    nullCount: rows.filter((r) => r[s.name] === null || r[s.name] === undefined || r[s.name] === '').length,
  }));
}

function computeFieldStats(rows) {
  if (!rows.length) return [];
  const sample = rows.slice(0, 500);
  const cols = Object.keys(rows[0]);
  return cols.map((col) => {
    const values = rows.map((r) => r[col]);
    const nonEmpty = values.filter((v) => v !== null && v !== undefined && v !== '');
    const nullCount = values.length - nonEmpty.length;
    const uniqueCount = new Set(nonEmpty.map((v) => String(v))).size;
    const type = inferType(sample.map((r) => r[col]));
    // Up to 3 representative sample values (distinct, non-null)
    const seen = new Set();
    const samples = [];
    for (const v of nonEmpty) {
      const s = String(v);
      if (!seen.has(s)) { seen.add(s); samples.push(v); }
      if (samples.length >= 3) break;
    }
    return { name: col, type, nullCount, uniqueCount, samples };
  });
}
