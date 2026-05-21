import express from 'express';
import { dvRequest, dataverseBaseUrl } from '../auth/dataverseAuth.js';

const router = express.Router();

/**
 * POST /api/fetch-dataverse-view
 * Body: { entityCollection, savedQueryId, orgUrl?, top? }
 *
 * Uses Dataverse's first-class ?savedQuery= parameter to execute a system view.
 * This is more reliable than passing raw FetchXML because Dataverse resolves the
 * view server-side, returning all columns the view defines without encoding issues.
 */
router.post('/fetch-dataverse-view', async (req, res) => {
  const { entityCollection, savedQueryId, orgUrl = '', top = 5000, expectedColumns = [] } = req.body || {};

  if (!entityCollection) return res.status(400).json({ error: 'entityCollection is required' });
  if (!savedQueryId)     return res.status(400).json({ error: 'savedQueryId is required' });

  const maxRows  = Math.min(Number(top) || 5000, 50_000);
  const pageSize = Math.min(maxRows, 5000);
  const allRows  = [];

  try {
    const base    = `/${entityCollection}`;
    const params  = { savedQuery: savedQueryId, $top: pageSize };

    const first = await dvRequest({
      path:    base,
      params,
      orgUrl:  orgUrl || undefined,
      headers: { Prefer: `odata.maxpagesize=${pageSize}` },
    });

    appendRows(first.data.value || [], allRows, maxRows);

    let nextLink = first.data['@odata.nextLink'] || null;
    let page = 1;
    while (nextLink && allRows.length < maxRows && page < 20) {
      const r = await dvRequest({ path: nextLink, orgUrl: orgUrl || undefined });
      appendRows(r.data.value || [], allRows, maxRows);
      nextLink = r.data['@odata.nextLink'] || null;
      page++;
    }

    // Build column list: union of all keys seen across every row PLUS any
    // columns declared in the view's FetchXML (Dataverse omits null fields
    // entirely from the JSON response, so they'd be invisible otherwise).
    const colSet = new Set(Array.isArray(expectedColumns) ? expectedColumns : []);
    for (const row of allRows) {
      for (const key of Object.keys(row)) colSet.add(key);
    }
    const columns = Array.from(colSet);

    // Pad every row so null columns are explicit rather than absent.
    const paddedRows = allRows.map((row) => {
      const out = {};
      for (const col of columns) out[col] = Object.prototype.hasOwnProperty.call(row, col) ? row[col] : null;
      return out;
    });

    const debugUrl = `${dataverseBaseUrl(orgUrl || undefined)}${base}?savedQuery=${savedQueryId}`;
    console.log(`[fetch-dv-view] ${entityCollection} (view ${savedQueryId}) → ${paddedRows.length} rows, ${columns.length} cols`);
    res.json({ rows: paddedRows, columns, rowCount: paddedRows.length, _debugUrl: debugUrl });
  } catch (err) {
    const detail = err.response?.data?.error?.message || err.response?.data || err.message;
    console.error('[fetch-dv-view]', detail);
    res.status(err.response?.status || 500).json({ error: String(detail) });
  }
});

function appendRows(value, allRows, maxRows) {
  for (const row of value) {
    if (allRows.length >= maxRows) break;
    const clean = {};
    for (const [k, v] of Object.entries(row)) {
      if (!k.startsWith('@')) clean[k] = v;
    }
    allRows.push(clean);
  }
}

export default router;
