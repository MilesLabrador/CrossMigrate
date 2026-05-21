import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, '..', 'mappings');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const router = express.Router();
const fileFor = (entity) => path.join(dir, `${entity.replace(/[^a-z0-9_-]/gi, '_')}.json`);

router.get('/mappings/:entity', (req, res) => {
  const f = fileFor(req.params.entity);
  if (!fs.existsSync(f)) return res.json(null);
  try {
    res.json(JSON.parse(fs.readFileSync(f, 'utf8')));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/mappings/:entity', (req, res) => {
  const f = fileFor(req.params.entity);
  fs.writeFileSync(f, JSON.stringify(req.body, null, 2));
  res.json({ ok: true });
});

export default router;
