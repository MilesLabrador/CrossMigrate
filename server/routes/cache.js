import express from 'express';
import { cacheInfo, clearCache, listCaches } from '../engine/cacheStore.js';

const router = express.Router();

// Cache node support: the client polls status to show warm/cold state (and to
// know a source behind a warm cache can skip fetching), and clears on demand.
router.get('/cache-status', (req, res) => {
  const { key } = req.query;
  if (!key || typeof key !== 'string') return res.status(400).json({ error: 'key required' });
  res.json(cacheInfo(key));
});

// Every warm cache, newest first — the Lookup node's cache picker lists these
// (each entry carries its columns and a few sample rows, so picking a mapping
// table needs no extra round trip).
router.get('/caches', (req, res) => {
  res.json({ caches: listCaches() });
});

router.delete('/cache', (req, res) => {
  const { key } = req.query;
  if (!key || typeof key !== 'string') return res.status(400).json({ error: 'key required' });
  clearCache(key);
  res.json({ ok: true });
});

export default router;
