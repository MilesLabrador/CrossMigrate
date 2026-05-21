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
    case 'manualData': {
      // Source nodes already carry their rows in node.data.rows
      const rows = node.data?.rows || [];
      return { rows, meta: { rowCount: rows.length } };
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
    case 'preview': {
      // Pass-through; UI handles displaying
      return { rows: inputRows, meta: { rowCount: inputRows.length } };
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
