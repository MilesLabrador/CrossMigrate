import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

import authRouter from './routes/auth.js';
import entitiesRouter from './routes/entities.js';
import uploadCsvRouter from './routes/uploadCsv.js';
import runPipelineRouter from './routes/runPipeline.js';
import importDataverseRouter from './routes/importDataverse.js';
import fetchDataverseRouter from './routes/fetchDataverse.js';
import mappingsRouter from './routes/mappings.js';

// Allow .env at repo root in addition to server/.env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootEnv = path.join(__dirname, '..', '.env');
if (fs.existsSync(rootEnv)) {
  const dotenv = await import('dotenv');
  dotenv.config({ path: rootEnv, override: false });
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '100mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api', authRouter);
app.use('/api', entitiesRouter);
app.use('/api', uploadCsvRouter);
app.use('/api', runPipelineRouter);
app.use('/api', importDataverseRouter);
app.use('/api', fetchDataverseRouter);
app.use('/api', mappingsRouter);

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`[crossmigrate] server listening on http://localhost:${port}`);
  if (!process.env.CLIENT_SECRET) {
    console.warn('[crossmigrate] WARNING: CLIENT_SECRET is not set; Dataverse calls will fail until you add it to .env');
  }
});
