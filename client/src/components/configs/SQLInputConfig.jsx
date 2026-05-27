import React, { useState } from 'react';
import { usePipelineStore } from '../../store/usePipelineStore';
import { sqlConnect, sqlPreview, sqlExtract } from '../../lib/api';

const DEFAULTS = { type: 'postgres', host: 'localhost', port: '5432', user: '', password: '', database: '', filename: '' };

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

export default function SQLInputConfig({ nodeId }) {
  const { nodes, updateNodeConfig, updateNodeData } = usePipelineStore();
  const node = nodes.find((n) => n.id === nodeId);
  const cfg = node?.data?.config || {};
  const tables = node?.data?.tables || [];
  const columns = node?.data?.columns || [];
  const rows = node?.data?.rows || [];

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const conn = { ...DEFAULTS, ...cfg };

  function set(key, value) {
    updateNodeConfig(nodeId, { [key]: value });
    // Reset loaded data when connection details change (but not table selection)
    if (!['table', 'columns'].includes(key)) {
      updateNodeData(nodeId, { tables: [], rows: [], columns: [], _error: null });
    }
  }

  async function handleConnect() {
    setErr(null);
    setBusy(true);
    try {
      const { tables: list } = await sqlConnect(conn);
      updateNodeData(nodeId, { tables: list, rows: [], columns: [], _error: null });
      if (list.length === 1) handleSelectTable(list[0]);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSelectTable(table) {
    updateNodeConfig(nodeId, { table, columns: [] });
    setErr(null);
    setBusy(true);
    try {
      const { rows: preview, columns: cols } = await sqlPreview({ ...conn, table });
      updateNodeData(nodeId, { columns: cols, rows: [], _previewRows: preview, _error: null });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleLoad() {
    const table = cfg.table;
    if (!table) return;
    setErr(null);
    setBusy(true);
    updateNodeData(nodeId, { _loading: true, _error: null });
    try {
      const selectedCols = cfg.columns?.length ? cfg.columns : null;
      const { rows: all, columns: cols } = await sqlExtract({
        ...conn,
        table,
        columns: selectedCols,
      });
      updateNodeData(nodeId, { rows: all, columns: cols, _loading: false, _error: null });
    } catch (e) {
      setErr(e.message);
      updateNodeData(nodeId, { _loading: false, _error: e.message });
    } finally {
      setBusy(false);
    }
  }

  const isSqlite = conn.type === 'sqlite';

  return (
    <div className="space-y-3">
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
        {busy && !cfg.table ? 'Connecting…' : 'Connect'}
      </button>

      {err && <div className="text-rose-400 text-xs break-words">{err}</div>}

      {/* Table selector */}
      {tables.length > 0 && (
        <div className="border-t border-slate-700 pt-3">
          <Label>Table ({tables.length})</Label>
          <select
            value={cfg.table || ''}
            onChange={(e) => handleSelectTable(e.target.value)}
            className="w-full bg-cardalt border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200"
          >
            <option value="">— select a table —</option>
            {tables.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Column info + Load button */}
      {columns.length > 0 && (
        <div className="border-t border-slate-700 pt-3 space-y-3">
          <div>
            <Label>Columns ({columns.length})</Label>
            <div className="text-[11px] text-slate-300 max-h-28 overflow-y-auto leading-snug">
              {columns.join(', ')}
            </div>
          </div>

          {rows.length > 0 ? (
            <div className="text-[11px] text-slate-400">
              {rows.length} rows loaded &mdash;{' '}
              <button
                className="text-sky-400 hover:underline"
                onClick={handleLoad}
                disabled={busy}
              >
                Reload
              </button>
            </div>
          ) : (
            <button
              onClick={handleLoad}
              disabled={busy || !cfg.table}
              className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-medium py-1.5 rounded transition"
            >
              {busy ? 'Loading…' : 'Load Table'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
