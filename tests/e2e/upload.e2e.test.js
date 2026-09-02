import { describe, it, expect, inject, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// The xlsx lib lives in server/node_modules — resolve it from there to build
// real workbook fixtures without adding a root dependency.
const XLSX = createRequire(new URL('../../server/index.js', import.meta.url))('xlsx');

const baseUrl = inject('baseUrl');
const uploadsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'server', 'uploads'
);

// Uploads land in server/uploads — remove what this run created. Tracked
// fileIds cover successful uploads; the mtime+name sweep also catches files
// multer wrote before a request failed (those responses carry no fileId).
const FIXTURE_NAMES = ['book.xlsx', 'bad.xlsx', 'people.csv', 'raw.csv', 'odd.csv', 'enc.csv'];
const suiteStart = Date.now();
const uploadedIds = [];
afterAll(() => {
  for (const id of uploadedIds) fs.rmSync(path.join(uploadsDir, id), { force: true });
  for (const name of fs.readdirSync(uploadsDir)) {
    const file = path.join(uploadsDir, name);
    if (
      FIXTURE_NAMES.some((f) => name.endsWith(`-${f}`)) &&
      fs.statSync(file).mtimeMs >= suiteStart
    ) {
      fs.rmSync(file, { force: true });
    }
  }
});

// POST a multipart body the way the client does. content === null → no file part.
async function upload(route, filename, content, fields = {}) {
  const form = new FormData();
  if (content !== null) form.append('file', new Blob([content]), filename);
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const res = await fetch(`${baseUrl}/api/${route}`, { method: 'POST', body: form });
  const body = await res.json();
  if (body.fileId) uploadedIds.push(body.fileId);
  return { res, body };
}

// Two-sheet workbook: People (id, name) and Cities (city).
function xlsxBuffer() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([{ id: 1, name: 'Ada' }, { id: 2, name: 'Bo' }]),
    'People'
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ city: 'Oslo' }]), 'Cities');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('POST /api/upload-csv', () => {
  it('parses a CSV with headers and returns fileId, columns, rowCount, and rows', async () => {
    const { res, body } = await upload('upload-csv', 'people.csv', 'email,name\na@x.com,Ada\nb@x.com,Bo');
    expect(res.status).toBe(200);
    expect(body.fileId).toBeTruthy();
    expect(body.columns).toEqual(['email', 'name']);
    expect(body.rowCount).toBe(2);
    expect(body.rows).toEqual([
      { email: 'a@x.com', name: 'Ada' },
      { email: 'b@x.com', name: 'Bo' },
    ]);
    expect(body.preview).toEqual(body.rows.slice(0, 5));
  });

  it('parses positional columns when header=false', async () => {
    const { res, body } = await upload('upload-csv', 'raw.csv', 'a@x.com,Ada\nb@x.com,Bo', {
      header: 'false',
    });
    expect(res.status).toBe(200);
    // Without headers Papa returns array rows; columns are the positional keys.
    expect(body.rows).toEqual([
      ['a@x.com', 'Ada'],
      ['b@x.com', 'Bo'],
    ]);
    expect(body.columns).toEqual(['0', '1']);
  });

  it('respects an explicit delimiter', async () => {
    // Comma data parsed with ';' — the passed delimiter must override
    // Papa's auto-detection, leaving one un-split column.
    const { res, body } = await upload('upload-csv', 'odd.csv', 'a,b\nx,y', { delimiter: ';' });
    expect(res.status).toBe(200);
    expect(body.columns).toEqual(['a,b']);
    expect(body.rows).toEqual([{ 'a,b': 'x,y' }]);
  });

  it('falls back to utf8 when an unsupported encoding is requested', async () => {
    const { res, body } = await upload('upload-csv', 'enc.csv', 'name\nAda', {
      encoding: 'banana',
    });
    expect(res.status).toBe(200);
    expect(body.rows).toEqual([{ name: 'Ada' }]);
  });

  it('returns 400 when no file is attached', async () => {
    const { res, body } = await upload('upload-csv', null, null);
    expect(res.status).toBe(400);
    expect(body.error).toBe('no file');
  });
});

describe('POST /api/upload-xlsx', () => {
  it('parses the first sheet and returns the full sheets list with fileId', async () => {
    const { res, body } = await upload('upload-xlsx', 'book.xlsx', xlsxBuffer());
    expect(res.status).toBe(200);
    expect(body.fileId).toBeTruthy();
    expect(body.sheets).toEqual(['People', 'Cities']);
    expect(body.sheetName).toBe('People');
    expect(body.columns).toEqual(['id', 'name']);
    expect(body.rows).toEqual([
      { id: 1, name: 'Ada' },
      { id: 2, name: 'Bo' },
    ]);
  });

  it('parses a requested sheet by name, falling back to the first for unknown names', async () => {
    const cities = await upload('upload-xlsx', 'book.xlsx', xlsxBuffer(), { sheet: 'Cities' });
    expect(cities.body.sheetName).toBe('Cities');
    expect(cities.body.rows).toEqual([{ city: 'Oslo' }]);

    const unknown = await upload('upload-xlsx', 'book.xlsx', xlsxBuffer(), { sheet: 'Nope' });
    expect(unknown.body.sheetName).toBe('People');
  });

  it('returns 400 when no file is attached', async () => {
    const { res, body } = await upload('upload-xlsx', null, null);
    expect(res.status).toBe(400);
    expect(body.error).toBe('no file');
  });

  it('returns 500 with an error message for a corrupt file, not a crash', async () => {
    // Starts like a zip (so it isn't mistaken for CSV) but is truncated garbage.
    const corrupt = Buffer.from('PK this is not a real workbook');
    const { res, body } = await upload('upload-xlsx', 'bad.xlsx', corrupt);
    expect(res.status).toBe(500);
    expect(body.error).toBeTruthy();
  });
});

describe('GET /api/xlsx-sheet', () => {
  const sheetUrl = (params) => `${baseUrl}/api/xlsx-sheet?${new URLSearchParams(params)}`;

  it('re-parses a previously uploaded file with a different sheet and header setting', async () => {
    const { body: uploaded } = await upload('upload-xlsx', 'book.xlsx', xlsxBuffer());

    const cities = await fetch(sheetUrl({ fileId: uploaded.fileId, sheet: 'Cities' }));
    expect(cities.status).toBe(200);
    expect(await cities.json()).toMatchObject({ sheetName: 'Cities', rows: [{ city: 'Oslo' }] });

    const raw = await fetch(sheetUrl({ fileId: uploaded.fileId, header: 'false' }));
    const rawBody = await raw.json();
    // header=false returns positional array rows, header row included.
    expect(rawBody.rows[0]).toEqual(['id', 'name']);
  });

  it('returns 400 when fileId is missing', async () => {
    const res = await fetch(`${baseUrl}/api/xlsx-sheet`);
    expect(res.status).toBe(400);
  });

  it('returns 404 for a fileId that was never uploaded', async () => {
    const res = await fetch(sheetUrl({ fileId: 'never-uploaded.xlsx' }));
    expect(res.status).toBe(404);
  });

  it('rejects a path-traversal fileId (../../etc/passwd) without leaking file contents', async () => {
    const res = await fetch(sheetUrl({ fileId: '../../etc/passwd' }));
    const text = await res.text();
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(text).not.toContain('root:');
  });
});
