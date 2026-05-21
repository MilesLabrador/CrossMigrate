import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';
import { randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (_req, file, cb) => cb(null, `${randomUUID()}-${file.originalname}`),
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
});

const router = express.Router();

router.post('/upload-csv', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'no file' });
    const delimiter = req.body.delimiter || '';
    const header = req.body.header !== 'false';
    const encoding = req.body.encoding || 'utf8';
    const text = fs.readFileSync(req.file.path, encoding);
    const parsed = Papa.parse(text, {
      header,
      delimiter: delimiter || undefined,
      skipEmptyLines: true,
    });
    const rows = parsed.data;
    const columns = header
      ? parsed.meta.fields || (rows[0] ? Object.keys(rows[0]) : [])
      : rows[0]
        ? Object.keys(rows[0])
        : [];
    res.json({
      fileId: path.basename(req.file.path),
      columns,
      rowCount: rows.length,
      preview: rows.slice(0, 5),
      rows, // include full rows so client can hold parsed data
    });
  } catch (err) {
    console.error('upload-csv failed:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
