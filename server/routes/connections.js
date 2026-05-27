import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nanoid } from 'nanoid';
import { startDeviceCodeFlow, getAuthState, getUserToken, resetPca, logout } from '../auth/msalAuth.js';

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

// In-memory snapshot of the auth params tied to the most recent sign-in
// attempt, so the polling endpoint can persist them onto the resulting
// connection record.
let pending = { orgUrl: '', clientId: '', tenantId: '' };

// POST /api/connections/sign-in — start device code flow to create a connection
router.post('/connections/sign-in', async (req, res) => {
  const { orgUrl, clientId, tenantId } = req.body || {};
  try {
    pending = {
      orgUrl:   (orgUrl   || '').trim(),
      clientId: (clientId || '').trim(),
      tenantId: (tenantId || '').trim(),
    };
    const info = await startDeviceCodeFlow(pending.orgUrl, {
      clientId: pending.clientId,
      tenantId: pending.tenantId,
    });
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
    const orgUrl   = pending.orgUrl   || process.env.ORG_URL  || '';
    const clientId = pending.clientId || process.env.CLIENT_ID || '';
    const tenantId = pending.tenantId || process.env.TENANT_ID || '';
    if (!existing) {
      const conn = {
        id: nanoid(8),
        name: state.user.name || state.user.username,
        username: state.user.username,
        orgUrl,
        clientId,
        tenantId,
      };
      store.connections.push(conn);
      store.activeId = conn.id;
      writeStore(store);
      res.json({ status: 'authenticated', user: state.user, connection: conn, isNew: true });
    } else {
      // Keep the existing values unless this sign-in supplied new ones.
      if (orgUrl   && existing.orgUrl   !== orgUrl)   existing.orgUrl   = orgUrl;
      if (clientId && existing.clientId !== clientId) existing.clientId = clientId;
      if (tenantId && existing.tenantId !== tenantId) existing.tenantId = tenantId;
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
router.delete('/connections/:id', async (req, res) => {
  const store = readStore();
  const wasActive = store.activeId === req.params.id;
  store.connections = store.connections.filter((c) => c.id !== req.params.id);
  if (wasActive) {
    store.activeId = store.connections[0]?.id || null;
    // Drop the underlying MSAL session too — otherwise /api/auth/status keeps
    // reporting the removed user and stale UI (e.g. the toolbar chip) stays
    // signed in.
    try { await logout(); } catch { /* best effort */ }
  }
  writeStore(store);
  res.json({ ok: true });
});

export default router;
