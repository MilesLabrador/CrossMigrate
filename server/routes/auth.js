import express from 'express';
import { startDeviceCodeFlow, getAuthState, logout } from '../auth/msalAuth.js';

const router = express.Router();

// POST /api/auth/start
// Kicks off device-code flow; returns { userCode, verificationUri } immediately.
// Auth completes in the background — poll /api/auth/status.
router.post('/auth/start', async (req, res) => {
  const { orgUrl } = req.body || {};
  try {
    const info = await startDeviceCodeFlow(orgUrl || '');
    res.json({
      userCode:        info.userCode,
      verificationUri: info.verificationUri,
      message:         info.message,
      expiresIn:       info.expiresIn,
    });
  } catch (err) {
    console.error('[auth/start]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/status
// Returns { status, user, error }
router.get('/auth/status', async (_req, res) => {
  res.json(await getAuthState());
});

// POST /api/auth/logout
router.post('/auth/logout', async (_req, res) => {
  await logout();
  res.json({ ok: true });
});

export default router;
