import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, '..', 'pipelines');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const router = express.Router();
const fileFor = (id) => path.join(dir, `${id.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);

router.get('/pipelines/:id', (req, res) => {
  const f = fileFor(req.params.id);
  if (!fs.existsSync(f)) return res.json(null);
  try {
    res.json(JSON.parse(fs.readFileSync(f, 'utf8')));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/pipelines/:id', (req, res) => {
  const { projectName, nodes, edges } = req.body || {};
  if (!Array.isArray(nodes) || !Array.isArray(edges)) {
    return res.status(400).json({ error: 'nodes and edges arrays are required' });
  }
  const f = fileFor(req.params.id);
  const payload = { projectName: projectName || 'Untitled pipeline', nodes, edges, updatedAt: Date.now() };
  fs.writeFileSync(f, JSON.stringify(payload, null, 2));
  res.json({ ok: true, updatedAt: payload.updatedAt });
});

export default router;
