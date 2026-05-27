import React, { useState } from 'react';
import { Upload } from 'lucide-react';
import { usePipelineStore } from '../../store/usePipelineStore';
import { sqlConnect, sqlWrite } from '../../lib/api';

const DEFAULTS = { type: 'postgres', host: 'localhost', port: '5432', user: '', password: '', database: '', filename: '', table: '', mode: 'insert', conflictColumn: '' };

function Label({ children }) {
  return (
    <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1.5 font-semibold">
      {children}
    </div>
  );
}

function Input({ label, ...props }) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        className="w-full bg-cardalt border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-sky-500"
        {...props}
      />
    </div>
  );
}

export default function SQLOutputConfig({ nodeId }) {
  const { nodes, updateNodeConfig, updateNodeData } = usePipelineStore();
  const node = nodes.find((n) => n.id === nodeId);
  const cfg = node?.data?.config || {};
  const conn = { ...DEFAULTS, ...cfg };
  const producedRows = node?.data?._producedRows || [];
  const progress = node?.data?._writeProgress;

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [tables, setTables] = useState([]);

  function set(key, value) {
    updateNodeConfig(nodeId, { [key]: value });
  }

  async function handleConnect() {
    setErr(null);
    setBusy(true);
    try {
      const { tables: list } = await sqlConnect(conn);
      setTables(list);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleWrite() {
    if (!producedRows.length || !conn.table) return;
    setErr(null);
    setBusy(true);
    updateNodeData(nodeId, { _writeProgress: { status: 'writing' } });
    try {
      const { written } = await sqlWrite({
        ...conn,
        rows: producedRows,
      });
      updateNodeData(nodeId, { _writeProgress: { status: 'done', written } });
    } catch (e) {
      setErr(e.message);
      updateNodeData(nodeId, { _writeProgress: { status: 'error', error: e.message } });
    } finally {
      setBusy(false);
    }
  }

  const isSqlite = conn.type === 'sqlite';

  return (
    <div className="space-y-3 text-xs">
      {/* Connection type */}
      <div>
        <Label>Database type</Label>
        <select
          value={conn.type}
          onChange={(e) => set('type', e.target.value)}
          className="w-full bg-cardalt border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200"
        >
          <option value="postgres">PostgreSQL</option>
          <option value="mysql">MySQL</option>
          <option value="mssql">SQL Server</option>
          <option value="sqlite">SQLite</option>
        </select>
      </div>

      {isSqlite ? (
        <Input
          label="File path"
          placeholder="/path/to/database.db"
          value={conn.filename || conn.database || ''}
          onChange={(e) => set('filename', e.target.value)}
        />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Input
                label="Host"
                placeholder="localhost"
                value={conn.host}
                onChange={(e) => set('host', e.target.value)}
              />
            </div>
            <Input
              label="Port"
              placeholder={conn.type === 'mssql' ? '1433' : conn.type === 'mysql' ? '3306' : '5432'}
              value={conn.port}
              onChange={(e) => set('port', e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="User"
              placeholder="username"
              value={conn.user}
              onChange={(e) => set('user', e.target.value)}
              autoComplete="off"
            />
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={conn.password}
              onChange={(e) => set('password', e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <Input
            label="Database"
            placeholder="my_database"
            value={conn.database}
            onChange={(e) => set('database', e.target.value)}
          />
        </>
      )}

      <button
        onClick={handleConnect}
        disabled={busy}
        className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-sm font-medium py-1.5 rounded transition"
      >
        {busy && !conn.table ? 'Connecting…' : 'Connect to browse tables'}
      </button>

      {/* Target table — free-text or picked from list */}
      <div>
        <Label>Target table</Label>
        {tables.length > 0 ? (
          <select
            value={conn.table}
            onChange={(e) => set('table', e.target.value)}
            className="w-full bg-cardalt border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200"
          >
            <option value="">— select or type below —</option>
            {tables.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        ) : (
          <input
            value={conn.table}
            onChange={(e) => set('table', e.target.value)}
            placeholder="table_name"
            className="w-full bg-cardalt border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-sky-500"
          />
        )}
        {tables.length > 0 && (
          <input
            value={conn.table}
            onChange={(e) => set('table', e.target.value)}
            placeholder="Or type a new table name"
            className="w-full mt-1.5 bg-cardalt border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-sky-500"
          />
        )}
      </div>

      {/* Write mode */}
      <div>
        <Label>Write mode</Label>
        <select
          value={conn.mode}
          onChange={(e) => set('mode', e.target.value)}
          className="w-full bg-cardalt border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200"
        >
          <option value="insert">Insert (append)</option>
          <option value="truncate">Truncate then insert</option>
          <option value="upsert">Upsert (insert or update)</option>
        </select>
      </div>

      {conn.mode === 'upsert' && (
        <Input
          label="Conflict column (primary key)"
          placeholder="id"
          value={conn.conflictColumn}
          onChange={(e) => set('conflictColumn', e.target.value)}
        />
      )}

      {err && <div className="text-rose-400 text-xs break-words">{err}</div>}

      {/* Write button */}
      <button
        onClick={handleWrite}
        disabled={busy || !conn.table || !producedRows.length}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-md bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition"
      >
        <Upload size={14} />
        Write {producedRows.length || 0} rows to {conn.table || '—'}
      </button>

      {!producedRows.length && (
        <div className="text-[11px] text-slate-500">
          Run the pipeline first to stage rows for writing.
        </div>
      )}

      {progress?.status === 'done' && (
        <div className="flex items-center gap-2 text-emerald-400 text-xs">
          <span>✓ {progress.written} rows written successfully</span>
        </div>
      )}
    </div>
  );
}
