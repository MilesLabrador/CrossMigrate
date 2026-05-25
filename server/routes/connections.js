import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nanoid } from 'nanoid';
import { startDeviceCodeFlow, getAuthState, getUserToken, resetPca } from '../auth/msalAuth.js';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONN_PATH = path.join(__dirname, '..', '..', 'connections.json');

function readStore() {
  if (!fs.existsSync(CONN_PATH)) return { activeId: null, connections: [] };
  try {
    return JSON.parse(fs.readFileSync(CONN_PATH, 'utf8'));
  } catch {
    return { activeId: null, connections: [] };
  }
}

function writeStore(store) {
  fs.writeFileSync(CONN_PATH, JSON.stringify(store, null, 2) + '\n');
}

// GET /api/connections
router.get('/connections', (_req, res) => {
  const store = readStore();
  res.json(store);
});

// POST /api/connections/sign-in — start device code flow to create a connection
router.post('/connections/sign-in', async (req, res) => {
  const { orgUrl } = req.body || {};
  try {
    const info = await startDeviceCodeFlow(orgUrl || '');
    res.json({
      userCode: info.userCode,
      verificationUri: info.verificationUri,
      message: info.message,
      expiresIn: info.expiresIn,
    });
  } catch (err) {
    console.error('[connections/sign-in]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/connections/sign-in/status — poll for completion, create connection on success
router.get('/connections/sign-in/status', async (_req, res) => {
  const state = await getAuthState();
  if (state.status === 'authenticated' && state.user) {
    const store = readStore();
    const existing = store.connections.find(
      (c) => c.username === state.user.username
    );
    if (!existing) {
      const conn = {
        id: nanoid(8),
        name: state.user.name || state.user.username,
        username: state.user.username,
      };
      store.connections.push(conn);
      store.activeId = conn.id;
      writeStore(store);
      res.json({ status: 'authenticated', user: state.user, connection: conn, isNew: true });
    } else {
      store.activeId = existing.id;
      writeStore(store);
      res.json({ status: 'authenticated', user: state.user, connection: existing, isNew: false });
    }
  } else {
    res.json(state);
  }
});

// POST /api/connections/:id/activate
router.post('/connections/:id/activate', (req, res) => {
  const store = readStore();
  const conn = store.connections.find((c) => c.id === req.params.id);
  if (!conn) return res.status(404).json({ error: 'Connection not found' });
  store.activeId = conn.id;
  writeStore(store);
  res.json({ ok: true, activeId: conn.id });
});

// DELETE /api/connections/:id
router.delete('/connections/:id', (req, res) => {
  const store = readStore();
  store.connections = store.connections.filter((c) => c.id !== req.params.id);
  if (store.activeId === req.params.id) {
    store.activeId = store.connections[0]?.id || null;
  }
  writeStore(store);
  res.json({ ok: true });
});

export default router;
