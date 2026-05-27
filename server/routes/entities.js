import express from 'express';
import { dvRequest } from '../auth/dataverseAuth.js';

// Extract a plain string from Dataverse/axios error shapes
function normalizeError(err) {
  if (err.message?.startsWith('sign-in-required:')) return err.message; // from msalAuth
  const d = err.response?.data;
  if (!d) return err.message;
  if (typeof d === 'string') return d;
  return d?.error?.message || d?.message || JSON.stringify(d);
}

const router = express.Router();

// Dataverse logical names are lowercase letters, digits and underscores,
// optionally prefixed with a publisher prefix ("xx_"). Reject anything else
// so it can't break out of the single-quoted OData literal and inject extra
// filter clauses or path segments.
const LOGICAL_NAME_RE = /^[a-z][a-z0-9_]{0,63}$/;
function assertLogicalName(name) {
  if (typeof name !== 'string' || !LOGICAL_NAME_RE.test(name)) {
    const err = new Error('invalid logical name');
    err.status = 400;
    throw err;
  }
  return name;
}

router.get('/entities', async (req, res) => {
  const orgUrl = req.query.orgUrl || undefined;
  try {
    const r = await dvRequest({
      path: `/EntityDefinitions?$select=LogicalName,LogicalCollectionName,DisplayCollectionName&$filter=IsValidForAdvancedFind eq true`,
      orgUrl,
    });
    const list = (r.data.value || [])
      .map((e) => ({
        logicalName: e.LogicalName,
        logicalCollectionName: e.LogicalCollectionName,
        displayName: e.DisplayCollectionName?.UserLocalizedLabel?.Label || e.LogicalName,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
    res.json(list);
  } catch (err) {
    const detail = normalizeError(err);
    console.error('GET /entities failed:', detail);
    res.status(err.response?.status || 500).json({ error: detail });
  }
});

router.get('/entities/:logicalName/fields', async (req, res) => {
  const orgUrl = req.query.orgUrl || undefined;
  try {
    const logicalName = assertLogicalName(req.params.logicalName);
    const r = await dvRequest({
      path: `/EntityDefinitions(LogicalName='${logicalName}')/Attributes?$select=LogicalName,DisplayName,RequiredLevel,AttributeType`,
      orgUrl,
    });
    const list = (r.data.value || [])
      .filter((a) => a.AttributeType && a.AttributeType !== 'Virtual')
      .map((a) => ({
        logicalName: a.LogicalName,
        displayName: a.DisplayName?.UserLocalizedLabel?.Label || a.LogicalName,
        requiredLevel: a.RequiredLevel?.Value || 'None',
        attributeType: a.AttributeType,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
    res.json(list);
  } catch (err) {
    const detail = normalizeError(err);
    console.error('GET /entities/:n/fields failed:', detail);
    res.status(err.response?.status || 500).json({ error: detail });
  }
});

// GET /api/entities/:logicalName/views — returns public saved-queries for an entity
router.get('/entities/:logicalName/views', async (req, res) => {
  const orgUrl = req.query.orgUrl || undefined;
  let logicalName;
  try {
    logicalName = assertLogicalName(req.params.logicalName);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  try {
    const filter = [
      `returnedtypecode eq '${logicalName}'`,
      `querytype eq 0`,          // 0 = public/system view
      `statecode eq 0`,          // active only
    ].join(' and ');

    const r = await dvRequest({
      path: `/savedqueries?$filter=${encodeURIComponent(filter)}&$select=name,savedqueryid,fetchxml,description,layoutxml&$orderby=name asc`,
      orgUrl,
    });

    const list = (r.data.value || []).map((v) => ({
      id:          v.savedqueryid,
      name:        v.name,
      description: v.description || '',
      fetchXml:    v.fetchxml || '',
    }));
    res.json(list);
  } catch (err) {
    const detail = normalizeError(err);
    console.error('GET /entities/:n/views failed:', detail);
    res.status(err.response?.status || 500).json({ error: detail });
  }
});

export default router;
