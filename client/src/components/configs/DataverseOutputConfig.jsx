import React, { useEffect, useState } from 'react';
import Papa from 'papaparse';
import { Download, Upload, ChevronDown, ChevronRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { distance } from 'fastest-levenshtein';
import { fetchEntities, fetchEntityFields, importToDataverseSSE } from '../../lib/api';
import { usePipelineStore, getUpstreamColumns } from '../../store/usePipelineStore';

function fuzzy(source, candidates) {
  const s = source.toLowerCase().replace(/[_\s-]/g, '');
  let best = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    const cc = c.toLowerCase().replace(/[_\s-]/g, '');
    const d = distance(s, cc);
    const score = d / Math.max(s.length, cc.length);
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return bestScore <= 0.35 ? best : null;
}

export default function DataverseOutputConfig({ nodeId }) {
  const state = usePipelineStore();
  const node = state.nodes.find((n) => n.id === nodeId);
  const cfg = node?.data?.config || {};
  const incoming = getUpstreamColumns(nodeId, state);
  const [entities, setEntities] = useState([]);
  const [fields, setFields] = useState([]);
  const [loadingEntities, setLoadingEntities] = useState(false);
  const [loadingFields, setLoadingFields] = useState(false);
  const [failedRows, setFailedRows] = useState(null);
  const [errorsOpen, setErrorsOpen] = useState(true);  // auto-expand on failure

  useEffect(() => {
    setLoadingEntities(true);
    fetchEntities(cfg.orgUrl || '')
      .then(setEntities)
      .catch((e) => console.error(e))
      .finally(() => setLoadingEntities(false));
  }, [cfg.orgUrl]);

  useEffect(() => {
    if (!cfg.entity) return;
    setLoadingFields(true);
    fetchEntityFields(entityLogicalFromCollection(cfg.entity, entities), cfg.orgUrl || '')
      .then((f) => {
        setFields(f);
        if (!cfg.fieldMappings?.length || cfg.fieldMappings.length !== incoming.length) {
          // Auto-populate mappings from incoming + fuzzy match
          const candidates = f.map((x) => x.logicalName);
          const auto = incoming.map((src) => ({ source: src, target: fuzzy(src, candidates) || '' }));
          state.updateNodeConfig(nodeId, { fieldMappings: auto });
        }
      })
      .catch((e) => console.error(e))
      .finally(() => setLoadingFields(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.entity, entities.length]);

  // Pull from upstream SelectMap if present
  useEffect(() => {
    const incomingEdges = state.edges.filter((e) => e.target === nodeId);
    for (const e of incomingEdges) {
      const up = state.nodes.find((n) => n.id === e.source);
      if (up?.type === 'selectMap') {
        const upstreamMaps = up.data?.config?.mappings || [];
        if (upstreamMaps.length && !cfg.fieldMappings?.length) {
          const next = upstreamMaps
            .filter((m) => !m.skip && m.target)
            .map((m) => ({ source: m.target, target: m.target }));
          state.updateNodeConfig(nodeId, { fieldMappings: next });
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId]);

  const setMapping = (i, patch) => {
    const next = (cfg.fieldMappings || []).map((m, idx) => (idx === i ? { ...m, ...patch } : m));
    state.updateNodeConfig(nodeId, { fieldMappings: next });
  };

  const startImport = async () => {
    const rows = node?.data?._producedRows || [];
    if (!rows.length || !cfg.entity) return;
    const mapped = rows.map((row) => {
      const out = {};
      for (const m of cfg.fieldMappings || []) {
        if (!m.target) continue;
        out[m.target] = row[m.source];
      }
      return out;
    });
    state.updateNodeData(nodeId, {
      _importProgress: { status: 'importing', processed: 0, success: 0, failed: 0, total: mapped.length },
    });
    setFailedRows(null);
    try {
      await importToDataverseSSE({ entity: cfg.entity, rows: mapped, orgUrl: cfg.orgUrl || '' }, (evt) => {
        if (evt.type === 'progress' || evt.type === 'start') {
          state.updateNodeData(nodeId, {
            _importProgress: {
              status: 'importing',
              processed: evt.processed ?? 0,
              success: evt.success ?? 0,
              failed: evt.failed ?? 0,
              total: evt.total ?? mapped.length,
            },
          });
        }
        if (evt.type === 'done') {
          state.updateNodeData(nodeId, {
            _importProgress: {
              status: 'done',
              processed: (evt.success ?? 0) + (evt.failed ?? 0),
              success: evt.success ?? 0,
              failed: evt.failed ?? 0,
              total: evt.total ?? mapped.length,
            },
          });
          const fr = evt.failedRows || [];
          setFailedRows(fr);
          if (fr.length) setErrorsOpen(true);
        }
        if (evt.type === 'error') {
          state.updateNodeData(nodeId, {
            _importProgress: { status: 'error', error: evt.error },
          });
        }
      });
    } catch (err) {
      console.error(err);
      state.updateNodeData(nodeId, { _importProgress: { status: 'error', error: err.message } });
    }
  };

  const downloadFailed = () => {
    if (!failedRows?.length) return;
    const csv = Papa.unparse(failedRows);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'failed_rows.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const producedCount = node?.data?._producedRows?.length || 0;

  return (
    <div className="space-y-4">
      <div>
        <Label>Environment URL <span className="text-slate-600 normal-case font-normal text-[10px]">(blank = default from .env)</span></Label>
        <input
          value={cfg.orgUrl || ''}
          onChange={(e) => state.updateNodeConfig(nodeId, { orgUrl: e.target.value, entity: '', fieldMappings: [] })}
          placeholder="e.g. otherorg.crm.dynamics.com"
          className="w-full bg-cardalt border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 font-mono outline-none focus:border-sky-500"
        />
      </div>
      <div>
        <Label>Entity (collection name)</Label>
        <select
          value={cfg.entity || ''}
          onChange={(e) => state.updateNodeConfig(nodeId, { entity: e.target.value, fieldMappings: [] })}
          className="w-full bg-cardalt border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200"
        >
          <option value="">{loadingEntities ? 'Loading…' : '— pick entity —'}</option>
          {entities.map((e) => (
            <option key={e.logicalName} value={e.logicalCollectionName}>
              {e.displayName} ({e.logicalCollectionName})
            </option>
          ))}
        </select>
      </div>

      {cfg.entity && (
        <div>
          <Label>Field mappings (source → Dataverse field)</Label>
          {loadingFields && <div className="text-xs text-slate-500">Loading fields…</div>}
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {(cfg.fieldMappings || []).map((m, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
                <div className="bg-slate-800 px-2 py-1 rounded text-xs text-slate-200 truncate">{m.source}</div>
                <span className="text-slate-500">→</span>
                <select
                  value={m.target || ''}
                  onChange={(e) => setMapping(i, { target: e.target.value })}
                  className="bg-cardalt border border-slate-700 rounded px-1.5 py-1 text-xs text-slate-200 min-w-0"
                >
                  <option value="">—</option>
                  {fields.map((f) => (
                    <option key={f.logicalName} value={f.logicalName}>
                      {f.displayName} ({f.logicalName})
                      {f.requiredLevel === 'ApplicationRequired' ? ' *' : ''}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={startImport}
        disabled={!cfg.entity || !producedCount}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-sm font-medium"
      >
        <Upload size={14} /> Import {producedCount || 0} rows to {cfg.entity || '—'}
      </button>

      {!producedCount && (
        <div className="text-[11px] text-slate-500">Run the pipeline first to stage rows for import.</div>
      )}

      {/* ── Inline error log ───────────────────────────────────────────────── */}
      {failedRows !== null && (
        <div className="border border-slate-700 rounded-lg overflow-hidden">
          {/* Header */}
          <button
            onClick={() => setErrorsOpen((o) => !o)}
            className="w-full flex items-center justify-between px-3 py-2 bg-slate-800 hover:bg-slate-700 transition text-left"
          >
            <div className="flex items-center gap-2">
              {failedRows.length === 0
                ? <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                : <AlertCircle  size={13} className="text-rose-400 shrink-0" />}
              <span className="text-xs font-medium text-slate-200">
                {failedRows.length === 0
                  ? 'All rows imported successfully'
                  : `${failedRows.length} row${failedRows.length > 1 ? 's' : ''} failed`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {failedRows.length > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); downloadFailed(); }}
                  className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200 transition"
                >
                  <Download size={11} /> CSV
                </button>
              )}
              {errorsOpen
                ? <ChevronDown  size={13} className="text-slate-400" />
                : <ChevronRight size={13} className="text-slate-400" />}
            </div>
          </button>

          {/* Error list */}
          {errorsOpen && failedRows.length > 0 && (
            <div
              className="max-h-72 overflow-y-auto divide-y divide-slate-800"
              onWheelCapture={(e) => e.stopPropagation()}
            >
              {failedRows.map((row, i) => {
                const label = rowLabel(row);
                const err   = row._error || 'Unknown error';
                return (
                  <div key={i} className="px-3 py-2 space-y-0.5">
                    {label && (
                      <div className="text-[11px] font-medium text-slate-300 truncate">{label}</div>
                    )}
                    <div className="text-[10px] text-rose-300 leading-relaxed break-words">{err}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function entityLogicalFromCollection(collName, entities) {
  const e = entities.find((x) => x.logicalCollectionName === collName);
  return e?.logicalName || collName;
}

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Pick the most human-readable identifier from a failed row for display
function rowLabel(row) {
  // Prefer fields whose name suggests a human label
  const namePriority = ['lm_name', 'name', 'title', 'subject', 'fullname', 'cr7c7_name'];
  for (const k of namePriority) {
    if (row[k] && typeof row[k] === 'string' && !GUID_RE.test(row[k])) return row[k];
  }
  // Fall back to the first non-GUID string value that looks like a label
  for (const [k, v] of Object.entries(row)) {
    if (k.startsWith('_')) continue;
    if (typeof v === 'string' && v.length > 2 && v.length < 120 && !GUID_RE.test(v)) return v;
  }
  return null;
}

function Label({ children }) {
  return <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1.5 font-semibold">{children}</div>;
}
