import { selectMap } from './transforms/select.js';
import { filterRows } from './transforms/filter.js';
import { fieldTransform } from './transforms/transform.js';
import { deduplicate, duplicateCount } from './transforms/deduplicate.js';

// Returns { rows, meta }
export function executeNode(node, inputRows) {
  const type = node.type;
  const cfg = node.data?.config || {};
  switch (type) {
    case 'csvInput':
    case 'manualData':
    case 'dataverseInput':
    case 'dataverseView': {
      // Source nodes carry their rows in node.data.rows (fetched before pipeline run)
      const rows = node.data?.rows || [];
      return { rows, meta: { rowCount: rows.length } };
    }
    case 'selectColumns': {
      const cols = cfg.columns || [];
      if (!cols.length) return { rows: inputRows, meta: { rowCount: inputRows.length } };
      const out = inputRows.map((row) => {
        const r = {};
        for (const c of cols) r[c] = row[c];
        return r;
      });
      return { rows: out, meta: { rowCount: out.length } };
    }
    case 'selectMap': {
      const out = selectMap(inputRows, cfg);
      return { rows: out, meta: { rowCount: out.length } };
    }
    case 'filter': {
      const out = filterRows(inputRows, cfg);
      return {
        rows: out,
        meta: { rowCount: out.length, matchedOf: inputRows.length },
      };
    }
    case 'transform': {
      const out = fieldTransform(inputRows, cfg);
      return { rows: out, meta: { rowCount: out.length } };
    }
    case 'deduplicate': {
      const out = deduplicate(inputRows, cfg);
      return {
        rows: out,
        meta: { rowCount: out.length, duplicatesRemoved: duplicateCount(inputRows, cfg) },
      };
    }
    case 'randomSample': {
      const size = Math.max(1, parseInt(cfg.size) || 100);
      if (inputRows.length <= size) {
        return { rows: inputRows, meta: { rowCount: inputRows.length, note: 'Input smaller than sample size — returned all rows' } };
      }
      const out = fisherYates(inputRows, size);
      return { rows: out, meta: { rowCount: out.length, sampledFrom: inputRows.length } };
    }
    case 'preview': {
      return { rows: inputRows, meta: { rowCount: inputRows.length } };
    }
    case 'previewColumns': {
      const schema = inferSchema(inputRows);
      return { rows: inputRows, meta: { rowCount: inputRows.length, schema } };
    }
    case 'fieldUsage': {
      const fieldStats = computeFieldStats(inputRows);
      return { rows: inputRows, meta: { rowCount: inputRows.length, fieldStats } };
    }
    case 'csvExport': {
      // Pass through; client handles download
      return { rows: inputRows, meta: { rowCount: inputRows.length } };
    }
    case 'dataverseOutput': {
      // Pipeline run does NOT import; client posts /api/import-dataverse afterwards
      return { rows: inputRows, meta: { rowCount: inputRows.length, ready: true } };
    }
    default:
      return { rows: inputRows, meta: { rowCount: inputRows.length, warning: `unknown node type ${type}` } };
  }
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

// ─── Schema inference ────────────────────────────────────────────────────────
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]+)?$/;
const BOOL_SET = new Set(['true', 'false', '1', '0', 'yes', 'no']);

function inferType(values) {
  const nonNull = values.filter((v) => v !== null && v !== undefined && v !== '');
  if (!nonNull.length) return 'empty';

  let isNum = true, isBool = true, isDate = true;
  for (const v of nonNull) {
    const s = String(v).trim().toLowerCase();
    if (isNum  && isNaN(Number(v)))            isNum  = false;
    if (isBool && !BOOL_SET.has(s))            isBool = false;
    if (isDate && !ISO_DATE.test(String(v)))   isDate = false;
    if (!isNum && !isBool && !isDate) break;
  }
  if (isBool) return 'boolean';
  if (isDate) return 'date';
  if (isNum)  return 'number';
  return 'text';
}

function inferSchema(rows) {
  if (!rows.length) return [];
  const sample = rows.slice(0, 100);
  const cols = Object.keys(rows[0]);
  return cols.map((col) => ({
    name: col,
    type: inferType(sample.map((r) => r[col])),
    nullCount: rows.filter((r) => r[col] === null || r[col] === undefined || r[col] === '').length,
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
