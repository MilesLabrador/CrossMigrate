import express from 'express';
import fs      from 'node:fs';
import path    from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetPca } from '../auth/msalAuth.js';

const router     = express.Router();
const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH   = path.join(__dirname, '..', '..', '.env');

const EDITABLE = ['TENANT_ID', 'CLIENT_ID', 'CLIENT_SECRET', 'ORG_URL'];

function parseEnvFile() {
  if (!fs.existsSync(ENV_PATH)) return {};
  const out = {};
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return out;
}

function writeEnvFile(updates) {
  let lines = fs.existsSync(ENV_PATH)
    ? fs.readFileSync(ENV_PATH, 'utf8').split('\n')
    : [];

  const written = new Set();
  lines = lines.map((line) => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return line;
    const eq = t.indexOf('=');
    if (eq === -1) return line;
    const key = t.slice(0, eq).trim();
    if (key in updates) {
      written.add(key);
      return `${key}=${updates[key]}`;
    }
    return line;
  });

  for (const [key, val] of Object.entries(updates)) {
    if (!written.has(key)) lines.push(`${key}=${val}`);
  }

  fs.writeFileSync(ENV_PATH, lines.join('\n'));
}

// GET /api/settings — returns current values; CLIENT_SECRET is masked if set
router.get('/settings', (_req, res) => {
  const env = parseEnvFile();
  const result = {};
  for (const key of EDITABLE) {
    result[key] = key === 'CLIENT_SECRET' && env[key] ? '***' : (env[key] || '');
  }
  // also surface whether a secret is currently configured
  result._hasSecret = !!(parseEnvFile().CLIENT_SECRET);
  res.json(result);
});

// POST /api/settings — persists changes to .env and live-updates process.env
router.post('/settings', (req, res) => {
  const updates = {};
  let msalNeedsReset = false;

  for (const key of EDITABLE) {
    if (!(key in req.body)) continue;
    const val = String(req.body[key] ?? '').trim();
    // Don't overwrite a real secret with the masked placeholder
    if (key === 'CLIENT_SECRET' && val === '***') continue;
    if ((key === 'CLIENT_ID' || key === 'TENANT_ID') && val !== process.env[key]) {
      msalNeedsReset = true;
    }
    updates[key] = val;
    process.env[key] = val;
  }

  try {
    writeEnvFile(updates);
    if (msalNeedsReset) resetPca();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
