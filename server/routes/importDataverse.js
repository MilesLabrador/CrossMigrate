import express from 'express';
import pLimit from 'p-limit';
import { dvRequest } from '../auth/dataverseAuth.js';

const router = express.Router();

// ── System-managed read-only fields Dataverse will reject if you try to set them ──
const SYSTEM_READONLY = new Set([
  'owninguser', 'owningbusinessunit', 'owningteam',
  'createdby', 'modifiedby', 'createdonbehalfby', 'modifiedonbehalfby',
  'versionnumber', 'importsequencenumber',
  'utcconversiontimezonecode', 'timezoneruleversionnumber',
]);

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isGuid = (v) => typeof v === 'string' && GUID_RE.test(v);

// Dataverse identifiers — used in OData literal strings and URL path segments.
// Reject anything that could break out of the single-quoted literal or inject
// path segments / query operators.
const LOGICAL_NAME_RE = /^[a-z][a-z0-9_]{0,63}$/;
const COLLECTION_NAME_RE = /^[a-z][a-z0-9_]{0,63}$/;
function safeLogical(name) {
  if (typeof name !== 'string' || !LOGICAL_NAME_RE.test(name)) {
    throw new Error(`invalid logical name: ${name}`);
  }
  return name;
}
function safeCollection(name) {
  if (typeof name !== 'string' || !COLLECTION_NAME_RE.test(name)) {
    throw new Error(`invalid entity collection: ${name}`);
  }
  return name;
}

// ── Fetch Lookup field → target collection mapping for an entity ─────────────
// e.g. { lm_bill: 'lm_bills', ownerid: 'systemusers' }
async function buildLookupMap(entityLogicalName, orgUrl) {
  try {
    safeLogical(entityLogicalName);
    // 1. Get all Lookup attributes and their target entity logical names
    const attrRes = await dvRequest({
      path: `/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=LogicalName,Targets`,
      orgUrl,
    });
    const lookups = attrRes.data.value || [];
    if (!lookups.length) return new Map();

    // 2. Collect all unique target entity logical names
    const targetNames = [...new Set(lookups.flatMap((l) => l.Targets || []))];
    if (!targetNames.length) return new Map();

    // 3. Resolve each target's LogicalCollectionName in one request.
    // Validate each name before interpolating into the OData filter literal.
    const filter = targetNames
      .filter((n) => LOGICAL_NAME_RE.test(n))
      .map((n) => `LogicalName eq '${n}'`)
      .join(' or ');
    if (!filter) return new Map();
    const entRes = await dvRequest({
      path: `/EntityDefinitions?$select=LogicalName,LogicalCollectionName&$filter=${filter}`,
      orgUrl,
    });
    const collectionByName = {};
    for (const e of entRes.data.value || []) {
      collectionByName[e.LogicalName] = e.LogicalCollectionName;
    }

    // 4. Build the map:  fieldLogicalName → collection name of first target
    const map = new Map();
    for (const l of lookups) {
      const target = l.Targets?.[0];
      if (target && collectionByName[target]) {
        map.set(l.LogicalName, collectionByName[target]);
      }
    }
    console.log(`[import] ${entityLogicalName}: ${map.size} lookup field(s) resolved`);
    return map;
  } catch (err) {
    console.warn('[import] could not fetch lookup metadata:', err.message);
    return new Map();
  }
}

// ── Transform one row before sending to Dataverse ────────────────────────────
// • Strips system read-only fields and internal "_" keys
// • Converts Lookup GUID values to @odata.bind format
function transformRow(row, lookupMap) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (key.startsWith('_') || SYSTEM_READONLY.has(key)) continue;
    if (value === null || value === undefined || value === '') continue;

    if (lookupMap.has(key) && isGuid(String(value))) {
      // e.g. lm_bill → lm_bills  ⇒  "lm_bill@odata.bind": "/lm_bills(guid)"
      out[`${key}@odata.bind`] = `/${lookupMap.get(key)}(${value})`;
    } else {
      out[key] = value;
    }
  }
  return out;
}

// ── Resolve entity logical name from its collection name ─────────────────────
async function resolveLogicalName(collectionName, orgUrl) {
  try {
    safeCollection(collectionName);
    const r = await dvRequest({
      path: `/EntityDefinitions?$select=LogicalName,LogicalCollectionName&$filter=LogicalCollectionName eq '${collectionName}'`,
      orgUrl,
    });
    return r.data.value?.[0]?.LogicalName || collectionName;
  } catch {
    return collectionName; // best-effort fallback
  }
}

// ── Retry-aware POST ─────────────────────────────────────────────────────────
async function createWithRetry(entity, row, maxRetries = 5, orgUrl) {
  let attempt = 0;
  while (true) {
    try {
      await dvRequest({ method: 'POST', path: `/${entity}`, data: row, orgUrl });
      return { ok: true };
    } catch (err) {
      const status = err.response?.status;
      attempt += 1;
      if (status === 429 && attempt <= maxRetries) {
        const retryAfter = Number(err.response?.headers?.['retry-after']) || 0;
        const backoff = retryAfter > 0 ? retryAfter * 1000 : Math.min(30_000, 2 ** attempt * 250);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      // Extract the first meaningful sentence from Dataverse's verbose error messages
      const raw = err.response?.data?.error?.message || err.message || '';
      const trimmed = raw.split(/\s*--->\s*InnerException\s*:/)[0]   // strip inner exception chain
                         .split(/\r?\n/)[0]                           // first line only
                         .trim();
      return { ok: false, error: trimmed || raw, status };
    }
  }
}

// ── SSE import endpoint ──────────────────────────────────────────────────────
router.post('/import-dataverse', async (req, res) => {
  const { entity, rows = [], orgUrl = '' } = req.body || {};
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  if (!entity) {
    send({ type: 'error', error: 'entity is required' });
    return res.end();
  }
  try {
    safeCollection(entity);
  } catch (err) {
    send({ type: 'error', error: err.message });
    return res.end();
  }

  // Resolve logicalName (needed for metadata queries)
  const entityLogicalName = await resolveLogicalName(entity, orgUrl || undefined);

  // Build lookup field map once for all rows
  const lookupMap = await buildLookupMap(entityLogicalName, orgUrl || undefined);

  const limit = pLimit(10);
  const total  = rows.length;
  let success  = 0;
  let failed   = 0;
  const failedRows = [];

  send({ type: 'start', total });

  await Promise.all(
    rows.map((row, idx) =>
      limit(async () => {
        const transformed = transformRow(row, lookupMap);
        const r = await createWithRetry(entity, transformed, 5, orgUrl || undefined);
        if (r.ok) {
          success += 1;
        } else {
          failed += 1;
          failedRows.push({ ...row, _error: r.error, _status: r.status });
        }
        send({ type: 'progress', processed: success + failed, success, failed, total, lastIndex: idx });
      })
    )
  );

  send({ type: 'done', success, failed, total, failedRows });
  res.end();
});

export default router;
