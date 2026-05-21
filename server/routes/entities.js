import express from 'express';
import { dvRequest } from '../auth/dataverseAuth.js';

const router = express.Router();

router.get('/entities', async (_req, res) => {
  try {
    const r = await dvRequest({
      path: `/EntityDefinitions?$select=LogicalName,LogicalCollectionName,DisplayCollectionName&$filter=IsValidForAdvancedFind eq true`,
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
    console.error('GET /entities failed:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

router.get('/entities/:logicalName/fields', async (req, res) => {
  try {
    const { logicalName } = req.params;
    const r = await dvRequest({
      path: `/EntityDefinitions(LogicalName='${logicalName}')/Attributes?$select=LogicalName,DisplayName,RequiredLevel,AttributeType`,
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
    console.error('GET /entities/:n/fields failed:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

export default router;
