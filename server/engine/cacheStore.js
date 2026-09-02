// Disk-backed row cache for Cache nodes. Each cache entry is one JSON file at
// server/cache/<key>.json holding { rows, schema, cachedAt }, alongside a small
// <key>.meta.json sidecar holding just the summary (label, row count, columns,
// a few sample rows). The key defaults to the Cache node's id, so a snapshot
// survives server restarts and is shared across runs of the same pipeline.
// When a run finds a warm entry, the Cache node serves those stored rows
// instead of whatever arrived on its input, letting slow upstream sources (a
// remote table, a large file) be fetched once and replayed on later runs.
// A corrupt or missing file simply reads as a cold cache — the run falls back
// to live input and rebuilds the entry.
//
// The sidecar exists so the UI (and the Lookup node's cache picker) can list
// every cache with its columns without parsing megabytes of rows. Entries
// written before sidecars existed are summarized on first read and backfilled.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, '..', 'cache');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

// Rows kept in the sidecar so a picker can preview key → value pairs.
const SAMPLE_ROWS = 5;

// Same sanitization as the pipelines route — keys come from node ids/config.
// Dots are stripped, so a key can never collide with a ".meta.json" sidecar.
const safeKey = (key) => String(key).replace(/[^a-zA-Z0-9_-]/g, '_');
const fileFor = (key) => path.join(dir, `${safeKey(key)}.json`);
const metaFileFor = (key) => path.join(dir, `${safeKey(key)}.meta.json`);

// Column names for a cached table: the stored schema when there is one,
// otherwise the union of keys across the first rows.
function columnsOf(rows, schema) {
  if (schema?.length) return schema.map((s) => s.name);
  const seen = new Set();
  for (const row of rows.slice(0, 50)) for (const k of Object.keys(row || {})) seen.add(k);
  return [...seen];
}

function summarize(key, { rows = [], schema = [], label, cachedAt }) {
  return {
    key,
    label: label || key,
    cachedAt,
    rowCount: rows.length,
    columns: columnsOf(rows, schema),
    sample: rows.slice(0, SAMPLE_ROWS),
  };
}

function readMeta(key) {
  const f = metaFileFor(key);
  if (!fs.existsSync(f)) return null;
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null; // corrupt sidecar = summarize from the rows instead
  }
}

export function readCache(key) {
  const f = fileFor(key);
  if (!fs.existsSync(f)) return null;
  try {
    const { rows, schema, cachedAt, label } = JSON.parse(fs.readFileSync(f, 'utf8'));
    return { rows: rows || [], schema: schema || [], cachedAt, label };
  } catch {
    return null; // corrupt cache = cold cache
  }
}

export function writeCache(key, { rows, schema, label } = {}) {
  const cachedAt = Date.now();
  const entry = { rows, schema, cachedAt, label };
  fs.writeFileSync(fileFor(key), JSON.stringify(entry));
  fs.writeFileSync(metaFileFor(key), JSON.stringify(summarize(key, entry)));
  return cachedAt;
}

export function clearCache(key) {
  fs.rmSync(fileFor(key), { force: true });
  fs.rmSync(metaFileFor(key), { force: true });
}

// Summary for one cache: { exists } when cold, otherwise the sidecar fields
// (label, cachedAt, rowCount, columns, sample). Falls back to reading the rows
// when the sidecar is missing (pre-sidecar entry) and backfills it.
export function cacheInfo(key) {
  const exists = fs.existsSync(fileFor(key));
  if (!exists) return { exists: false };

  const meta = readMeta(key);
  if (meta) return { exists: true, ...meta };

  const hit = readCache(key);
  if (!hit) return { exists: false };
  const summary = summarize(key, hit);
  try {
    fs.writeFileSync(metaFileFor(key), JSON.stringify(summary));
  } catch {
    // Backfill is an optimisation — a read-only cache dir shouldn't break reads.
  }
  return { exists: true, ...summary };
}

// Every warm cache, newest first — used by the Lookup node to offer cached
// tables as mapping sources.
export function listCaches() {
  let files;
  try {
    files = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return files
    .filter((f) => f.endsWith('.json') && !f.endsWith('.meta.json'))
    .map((f) => cacheInfo(f.slice(0, -'.json'.length)))
    .filter((c) => c.exists)
    .sort((a, b) => (b.cachedAt || 0) - (a.cachedAt || 0));
}
