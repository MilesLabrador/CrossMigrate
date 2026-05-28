import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (_req, file, cb) => cb(null, `${randomUUID()}-${path.basename(file.originalname)}`),
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
});

const router = express.Router();

function parseSheet(workbook, sheetName, header = true) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return { rows: [], columns: [] };
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: header ? undefined : 1,
    defval: '',
  });
  const columns = rows.length
    ? Object.keys(rows[0])
    : (sheet['!ref'] ? XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] || [] : []);
  return { rows, columns: columns.map(String) };
}

router.post('/upload-xlsx', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'no file' });
    const header = req.body.header !== 'false';
    const requestedSheet = req.body.sheet || null;

    const workbook = XLSX.readFile(req.file.path);
    const sheets = workbook.SheetNames;
    const sheetName = (requestedSheet && sheets.includes(requestedSheet))
      ? requestedSheet
      : sheets[0];

    const { rows, columns } = parseSheet(workbook, sheetName, header);

    res.json({
      fileId: path.basename(req.file.path),
      sheets,
      sheetName,
      columns,
      rowCount: rows.length,
      rows,
    });
  } catch (err) {
    console.error('upload-xlsx failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Re-parse a previously uploaded file with a different sheet or header setting
router.get('/xlsx-sheet', (req, res) => {
  try {
    const { fileId, sheet, header } = req.query;
    if (!fileId || typeof fileId !== 'string') return res.status(400).json({ error: 'fileId required' });
    // Strip any directory components — fileId must be a bare filename written
    // by /upload-xlsx. Without basename(), a caller could read arbitrary files
    // via "../../etc/passwd".
    const safeId = path.basename(fileId);
    const filePath = path.join(uploadsDir, safeId);
    // Defense-in-depth: ensure the resolved path is still inside uploadsDir.
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(uploadsDir) + path.sep)) {
      return res.status(400).json({ error: 'invalid fileId' });
    }
    if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'file not found' });

    const workbook = XLSX.readFile(resolved);
    const sheets = workbook.SheetNames;
    const sheetName = (sheet && sheets.includes(sheet)) ? sheet : sheets[0];
    const useHeader = header !== 'false';

    const { rows, columns } = parseSheet(workbook, sheetName, useHeader);
    res.json({ sheetName, columns, rowCount: rows.length, rows });
  } catch (err) {
    console.error('xlsx-sheet failed:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
