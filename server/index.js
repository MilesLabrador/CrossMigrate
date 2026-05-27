import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

import authRouter from './routes/auth.js';
import entitiesRouter from './routes/entities.js';
import uploadCsvRouter from './routes/uploadCsv.js';
import uploadXlsxRouter from './routes/uploadXlsx.js';
import runPipelineRouter from './routes/runPipeline.js';
import importDataverseRouter from './routes/importDataverse.js';
import fetchDataverseRouter from './routes/fetchDataverse.js';
import mappingsRouter from './routes/mappings.js';
import connectionsRouter       from './routes/connections.js';
import fetchDataverseViewRouter from './routes/fetchDataverseView.js';
import sourceRouter             from './routes/source.js';

// Allow .env at repo root in addition to server/.env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootEnv = path.join(__dirname, '..', '.env');
if (fs.existsSync(rootEnv)) {
  const dotenv = await import('dotenv');
  dotenv.config({ path: rootEnv, override: false });
}

const app = express();

// CORS — only the local Vite dev server and same-origin requests.
// The production setup proxies /api through Vite, so cross-origin requests
// from a browser should never legitimately hit this server. Restricting the
// allow-list prevents a malicious page in the user's browser from reaching
// localhost endpoints (DB credentials, SSRF, file reads).
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: (origin, cb) => {
      // Same-origin / curl / native clients send no Origin header — allow.
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error(`Origin not allowed: ${origin}`));
    },
    credentials: false,
  }),
);
// Pipeline runs can ship large row payloads, but cap to mitigate JSON-parse
// DoS. Override with JSON_LIMIT if you genuinely need bigger payloads.
app.use(express.json({ limit: process.env.JSON_LIMIT || '100mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Exposes non-secret server config so the UI knows whether ORG_URL is set.
// When unset, the connection manager prompts for the org host at sign-in.
app.get('/api/config', (_req, res) => {
  // `defaultClientId`/`defaultTenantId` reflect either explicit env overrides
  // or the built-in public-client defaults baked into the auth module. The UI
  // surfaces these so users can confirm what app registration they'd be
  // signing in through, and override per connection if desired.
  res.json({
    defaultOrgUrl:  process.env.ORG_URL  || '',
    defaultClientId: process.env.CLIENT_ID || '',
    defaultTenantId: process.env.TENANT_ID || '',
  });
});

app.use('/api', authRouter);
app.use('/api', entitiesRouter);
app.use('/api', uploadCsvRouter);
app.use('/api', uploadXlsxRouter);
app.use('/api', runPipelineRouter);
app.use('/api', importDataverseRouter);
app.use('/api', fetchDataverseRouter);
app.use('/api', mappingsRouter);
app.use('/api', connectionsRouter);
app.use('/api', fetchDataverseViewRouter);
app.use('/api', sourceRouter);

const port = process.env.SERVER_PORT || 3001;
// Bind to loopback by default so DB credentials / file-read endpoints are not
// reachable from other machines on the LAN. Override with HOST=0.0.0.0 only
// when intentionally exposing the service.
const host = process.env.HOST || '127.0.0.1';
app.listen(port, host, () => {
  console.log(`[crossmigrate] server listening on http://${host}:${port}`);
});
