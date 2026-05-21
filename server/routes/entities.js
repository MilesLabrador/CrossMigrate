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
    const { logicalName } = req.params;
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

export default router;
