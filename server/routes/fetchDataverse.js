import express from 'express';
import { dvRequest, dataverseBaseUrl } from '../auth/dataverseAuth.js';

const router = express.Router();

// Reject anything that isn't a plain entity-set name. Prevents the caller from
// appending path segments ("entity/(guid)/Microsoft.Dynamics.CRM...") or
// hopping to a fully-qualified URL via the `path.startsWith('http')` branch in
// dvRequest.
const COLLECTION_RE = /^[a-z][a-z0-9_]{0,63}$/;

// POST /api/fetch-dataverse
// Body: { entity, select?, filter?, top? }
// Fetches rows from a Dataverse table, following OData nextLink pages up to `top` rows.
router.post('/fetch-dataverse', async (req, res) => {
  const { entity, select = '', filter = '', top = 5000, orgUrl = '' } = req.body || {};

  if (!entity) {
    return res.status(400).json({ error: 'entity is required' });
  }
  if (!COLLECTION_RE.test(entity)) {
    return res.status(400).json({ error: 'invalid entity name' });
  }

  const maxRows = Math.min(Number(top) || 5000, 50_000);
  const pageSize = Math.min(maxRows, 5000);

  const params = { $top: pageSize };
  if (select) params.$select = select;
  if (filter) params.$filter = filter;

  const allRows = [];
  let nextLink = null;

  try {
    // First page
    const first = await dvRequest({
      path: `/${entity}`,
      params,
      orgUrl: orgUrl || undefined,
      headers: { Prefer: `odata.maxpagesize=${pageSize}` },
    });

    const append = (value) => {
      for (const row of value) {
        if (allRows.length >= maxRows) break;
        // Strip OData internal fields
        const clean = {};
        for (const [k, v] of Object.entries(row)) {
          if (!k.startsWith('@')) clean[k] = v;
        }
        allRows.push(clean);
      }
    };

    append(first.data.value || []);
    nextLink = first.data['@odata.nextLink'] || null;

    // Follow pages
    let page = 1;
    while (nextLink && allRows.length < maxRows && page < 20) {
      const r = await dvRequest({
        path: nextLink,
        orgUrl: orgUrl || undefined,
        headers: { Prefer: `odata.maxpagesize=${pageSize}` },
      });
      append(r.data.value || []);
      nextLink = r.data['@odata.nextLink'] || null;
      page++;
    }

    const columns = allRows.length > 0 ? Object.keys(allRows[0]) : [];
    const debugUrl = `${dataverseBaseUrl(orgUrl || undefined)}/${entity}?${Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
    console.log(`[fetch-dataverse] ${entity} → ${allRows.length} rows  (${debugUrl})`);
    res.json({ rows: allRows, columns, rowCount: allRows.length, _debugUrl: debugUrl });
  } catch (err) {
    const detail = err.response?.data?.error?.message || err.response?.data || err.message;
    console.error('[fetch-dataverse]', detail);
    res.status(err.response?.status || 500).json({ error: String(detail) });
  }
});

export default router;
