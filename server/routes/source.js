import express from 'express';
import { createConnection } from '../db/connector.js';

const router = express.Router();

// Inline identifier guard. Mirrors validateIdent in db/connector.js but keeps
// the regex test in the same scope as the knex call so static analyzers can
// see the sanitization at the SQL sink.
const IDENT_RE = /^[\w$]{1,128}$/;
function safeIdent(name) {
  if (typeof name !== 'string' || !IDENT_RE.test(name)) {
    throw new Error(`Invalid identifier: "${name}"`);
  }
  return name;
}

async function withDb(cfg, fn) {
  const db = createConnection(cfg);
  try {
    return await fn(db);
  } finally {
    await db.destroy();
  }
}

async function listTables(db, type) {
  switch (type) {
    case 'postgres':
      return (
        await db('information_schema.tables')
          .select('table_name')
          .where('table_schema', 'public')
          .where('table_type', 'BASE TABLE')
          .orderBy('table_name')
      ).map((r) => r.table_name);
    case 'mysql':
      return (
        await db('information_schema.tables')
          .select('TABLE_NAME as table_name')
          .whereRaw('TABLE_SCHEMA = DATABASE()')
          .where('TABLE_TYPE', 'BASE TABLE')
          .orderBy('TABLE_NAME')
      ).map((r) => r.table_name);
    case 'mssql':
      return (
        await db('information_schema.tables')
          .select('table_name')
          .where('table_type', 'BASE TABLE')
          .orderBy('table_name')
      ).map((r) => r.table_name);
    case 'sqlite':
      return (
        await db('sqlite_master')
          .select('name as table_name')
          .where('type', 'table')
          .whereNot('name', 'like', 'sqlite_%')
          .orderBy('name')
      ).map((r) => r.table_name);
    default:
      throw new Error(`Unsupported type: ${type}`);
  }
}

// POST /api/source/connect — test connection and return table list
router.post('/source/connect', async (req, res) => {
  const { type, host, port, user, password, database, filename } = req.body;
  if (!type) return res.status(400).json({ error: 'type is required' });
  try {
    const tables = await withDb(
      { type, host, port, user, password, database, filename },
      (db) => listTables(db, type),
    );
    res.json({ tables });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/source/preview — first 50 rows + column names for a given table
router.post('/source/preview', async (req, res) => {
  const { type, host, port, user, password, database, filename, table } = req.body;
  if (!type || !table) return res.status(400).json({ error: 'type and table are required' });
  try {
    const safeTable = safeIdent(table);
    const result = await withDb(
      { type, host, port, user, password, database, filename },
      async (db) => {
        const info = await db(safeTable).columnInfo();
        const columns = Object.keys(info);
        const rows = await db(safeTable).select('*').limit(50);
        return { rows, columns };
      },
    );
    res.json({ ...result, rowCount: result.rows.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/source/extract — all rows for selected columns from a table
router.post('/source/extract', async (req, res) => {
  const { type, host, port, user, password, database, filename, table, columns } = req.body;
  if (!type || !table) return res.status(400).json({ error: 'type and table are required' });
  try {
    const safeTable = safeIdent(table);
    const safeCols =
      Array.isArray(columns) && columns.length ? columns.map(safeIdent) : null;
    const rows = await withDb(
      { type, host, port, user, password, database, filename },
      (db) => db(safeTable).select(safeCols || '*'),
    );
    const resultColumns = rows.length ? Object.keys(rows[0]) : (safeCols || []);
    res.json({ rows, columns: resultColumns, rowCount: rows.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/sql/write — write rows into a SQL table
router.post('/sql/write', async (req, res) => {
  const { type, host, port, user, password, database, filename, table, rows, mode, conflictColumn } = req.body;
  if (!type || !table) return res.status(400).json({ error: 'type and table are required' });
  if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'rows must be a non-empty array' });
  try {
    const safeTable = safeIdent(table);
    const safeConflict = conflictColumn ? safeIdent(conflictColumn) : null;

    await withDb({ type, host, port, user, password, database, filename }, async (db) => {
      if (mode === 'truncate') {
        await db(safeTable).truncate();
      }

      const BATCH = 200;
      if (mode === 'upsert' && safeConflict) {
        for (let i = 0; i < rows.length; i += BATCH) {
          await db(safeTable).insert(rows.slice(i, i + BATCH)).onConflict(safeConflict).merge();
        }
      } else {
        await db.batchInsert(safeTable, rows, BATCH);
      }
    });

    res.json({ written: rows.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
