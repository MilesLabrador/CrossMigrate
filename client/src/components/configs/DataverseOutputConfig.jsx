import React, { useEffect, useState, useRef, useCallback } from 'react';
import Papa from 'papaparse';
import {
  Search, ChevronDown, ChevronRight, Check, Loader2, LogIn,
  Download, Upload, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { distance } from 'fastest-levenshtein';
import { fetchEntities, fetchEntityFields, importToDataverseSSE } from '../../lib/api';
import { usePipelineStore, getUpstreamColumns } from '../../store/usePipelineStore';
import { getCachedEntities, setCachedEntities } from '../../lib/entityCache';
import SignInModal from '../SignInModal';
import clsx from 'clsx';

// ── Fuzzy match for auto-mapping source columns → Dataverse fields ────────────
function fuzzy(source, candidates) {
  const s = source.toLowerCase().replace(/[_\s-]/g, '');
  let best = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    const cc = c.toLowerCase().replace(/[_\s-]/g, '');
    const d  = distance(s, cc);
    const score = d / Math.max(s.length, cc.length);
    if (score < bestScore) { bestScore = score; best = c; }
  }
  return bestScore <= 0.35 ? best : null;
}

// ── Resolve logical name from collection name using a loaded entities list ────
function entityLogicalFromCollection(collName, entities) {
  const e = entities.find((x) => x.logicalCollectionName === collName);
  return e?.logicalName || collName;
}

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Pick the most human-readable identifier from a failed row for display
function rowLabel(row) {
  const namePriority = ['lm_name', 'name', 'title', 'subject', 'fullname'];
  for (const k of namePriority) {
    if (row[k] && typeof row[k] === 'string' && !GUID_RE.test(row[k])) return row[k];
  }
  for (const [k, v] of Object.entries(row)) {
    if (k.startsWith('_')) continue;
    if (typeof v === 'string' && v.length > 2 && v.length < 120 && !GUID_RE.test(v)) return v;
  }
  return null;
}

export default function DataverseOutputConfig({ nodeId }) {
  const state    = usePipelineStore();
  const node     = state.nodes.find((n) => n.id === nodeId);
  const cfg      = node?.data?.config || {};
  const incoming = getUpstreamColumns(nodeId, state);

  const [showAuthModal, setShowAuthModal] = useState(false);

  const [localOrgUrl, setLocalOrgUrl] = useState(cfg.orgUrl || '');
  useEffect(() => { setLocalOrgUrl(cfg.orgUrl || ''); }, [cfg.orgUrl]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (localOrgUrl !== (cfg.orgUrl || '')) {
        state.updateNodeConfig(nodeId, {
          orgUrl: localOrgUrl,
          entity: '', entityLogicalName: '', entityDisplayName: '',
          fieldMappings: [],
        });
      }
    }, 600);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localOrgUrl]);

  // Entity picker state
  const [entities, setEntities]               = useState([]);
  const [entitiesLoading, setEntitiesLoading] = useState(false);
  const [entitiesError, setEntitiesError]     = useState(null);
  const [entitySearch, setEntitySearch]       = useState('');
  const [entityOpen, setEntityOpen]           = useState(false);
  const pickerRef = useRef(null);

  // Fields
  const [fields, setFields]                 = useState([]);
  const [loadingFields, setLoadingFields]   = useState(false);

  // Import results
  const [failedRows, setFailedRows] = useState(null);
  const [errorsOpen, setErrorsOpen] = useState(true);

  // ── Entity loader (cache-aware, defined BEFORE the effect that uses it) ────
  const reloadEntities = useCallback((bust = false) => {
    const key = cfg.orgUrl || '';
    if (!bust) {
      const cached = getCachedEntities(key);
      if (cached) { setEntities(cached); return; }
    }
    setEntitiesLoading(true);
    setEntitiesError(null);
    fetchEntities(key)
      .then((list) => { setCachedEntities(key, list); setEntities(list); })
      .catch((e) => setEntitiesError(e.message))
      .finally(() => setEntitiesLoading(false));
  }, [cfg.orgUrl]);

  useEffect(() => {
    setEntitiesError(null);
    reloadEntities();
  }, [reloadEntities]);

  // ── Load fields when entity or orgUrl changes ──────────────────────────────
  const entityKey = cfg.entityLogicalName || entityLogicalFromCollection(cfg.entity, entities);
  useEffect(() => {
    if (!entityKey) { setFields([]); return; }
    setLoadingFields(true);
    fetchEntityFields(entityKey, cfg.orgUrl || '')
      .then((f) => {
        setFields(f);
        // Auto-populate field mappings if not yet set
        if (!cfg.fieldMappings?.length || cfg.fieldMappings.length !== incoming.length) {
          const candidates = f.map((x) => x.logicalName);
          const auto = incoming.map((src) => ({ source: src, target: fuzzy(src, candidates) || '' }));
          state.updateNodeConfig(nodeId, { fieldMappings: auto });
        }
      })
      .catch(() => setFields([]))
      .finally(() => setLoadingFields(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityKey, cfg.orgUrl]);

  // ── Pull mappings from upstream SelectMap node, if present ─────────────────
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

  // ── Close entity picker dropdown on outside click ──────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setEntityOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredEntities = entities.filter(
    (e) =>
      e.displayName.toLowerCase().includes(entitySearch.toLowerCase()) ||
      e.logicalName.toLowerCase().includes(entitySearch.toLowerCase())
  );

  const chooseEntity = (e) => {
    state.updateNodeConfig(nodeId, {
      entity:            e.logicalCollectionName,
      entityLogicalName: e.logicalName,
      entityDisplayName: e.displayName,
      fieldMappings:     [],
    });
    setEntitySearch('');
    setEntityOpen(false);
  };

  const selectedEntity = entities.find((e) => e.logicalCollectionName === cfg.entity);

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
              status:    'importing',
              processed: evt.processed ?? 0,
              success:   evt.success   ?? 0,
              failed:    evt.failed    ?? 0,
              total:     evt.total     ?? mapped.length,
            },
          });
        }
        if (evt.type === 'done') {
          state.updateNodeData(nodeId, {
            _importProgress: {
              status:    'done',
              processed: (evt.success ?? 0) + (evt.failed ?? 0),
              success:   evt.success ?? 0,
              failed:    evt.failed  ?? 0,
              total:     evt.total   ?? mapped.length,
            },
          });
          const fr = evt.failedRows || [];
          setFailedRows(fr);
          if (fr.length) setErrorsOpen(true);
        }
        if (evt.type === 'error') {
          state.updateNodeData(nodeId, { _importProgress: { status: 'error', error: evt.error } });
        }
      });
    } catch (err) {
      console.error(err);
      state.updateNodeData(nodeId, { _importProgress: { status: 'error', error: err.message } });
    }
  };

  const downloadFailed = () => {
    if (!failedRows?.length) return;
    const csv  = Papa.unparse(failedRows);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'failed_rows.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const producedCount = node?.data?._producedRows?.length || 0;

  return (
    <div className="space-y-4 text-xs">
      {showAuthModal && (
        <SignInModal
          orgUrl={cfg.orgUrl || ''}
          onClose={() => setShowAuthModal(false)}
          onAuthenticated={() => {
            setShowAuthModal(false);
            reloadEntities(true); // bust cache after authorising new env
          }}
        />
      )}

      {/* Environment URL */}
      <div>
        <Label>Environment URL <Hint>(blank = default from .env)</Hint></Label>
        <input
          value={localOrgUrl}
          onChange={(e) => setLocalOrgUrl(e.target.value)}
          placeholder="e.g. otherorg.crm.dynamics.com"
          className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-[11px] text-slate-200 font-mono outline-none focus:border-sky-500 hover:border-slate-500 transition"
        />
      </div>

      {/* Entity picker (searchable) */}
      <div>
        <Label>Dataverse Table</Label>
        <div className="relative" ref={pickerRef}>
          <button
            type="button"
            onClick={() => setEntityOpen((o) => !o)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded bg-slate-800 border border-slate-700 hover:border-slate-500 text-slate-200 transition"
          >
            <span className="truncate">
              {selectedEntity ? (
                <span>
                  <span className="font-medium">{selectedEntity.displayName}</span>
                  <span className="text-slate-500 ml-1.5 text-[10px]">{selectedEntity.logicalName}</span>
                </span>
              ) : cfg.entity ? (
                <span className="font-mono text-slate-300">{cfg.entityDisplayName || cfg.entity}</span>
              ) : (
                <span className="text-slate-500">Choose a table…</span>
              )}
            </span>
            {entitiesLoading
              ? <Loader2 size={12} className="animate-spin text-slate-400 shrink-0" />
              : <ChevronDown size={12} className="text-slate-400 shrink-0" />}
          </button>

          {entityOpen && (
            <div className="absolute z-50 w-full mt-1 bg-slate-900 border border-slate-700 rounded shadow-xl max-h-64 flex flex-col">
              <div className="p-2 border-b border-slate-700">
                <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-slate-800 border border-slate-700">
                  <Search size={11} className="text-slate-400 shrink-0" />
                  <input
                    autoFocus
                    value={entitySearch}
                    onChange={(e) => setEntitySearch(e.target.value)}
                    placeholder="Search tables…"
                    className="bg-transparent text-slate-200 text-xs w-full outline-none"
                  />
                </div>
              </div>
              <div className="overflow-y-auto" onWheelCapture={(e) => e.stopPropagation()}>
                {entitiesError ? (
                  <div className="px-3 py-3 space-y-2">
                    <div className="text-rose-400 font-medium">Failed to load tables</div>
                    {entitiesError.startsWith('sign-in-required:') ? (
                      <>
                        <div className="text-slate-400 text-[10px]">
                          You're signed in, but your account hasn't authorized this Dataverse environment yet.
                        </div>
                        <button
                          onClick={() => setShowAuthModal(true)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-[11px] transition"
                        >
                          <LogIn size={11} /> Authorize this environment
                        </button>
                      </>
                    ) : (
                      <div className="text-rose-300/70 text-[10px] break-all">{entitiesError}</div>
                    )}
                  </div>
                ) : filteredEntities.length === 0 && !entitiesLoading ? (
                  <div className="px-3 py-2 text-slate-500">No tables found</div>
                ) : null}
                {filteredEntities.map((e) => (
                  <button
                    key={e.logicalName}
                    type="button"
                    onClick={() => chooseEntity(e)}
                    className={clsx(
                      'w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-800 transition',
                      cfg.entity === e.logicalCollectionName && 'bg-slate-800'
                    )}
                  >
                    {cfg.entity === e.logicalCollectionName && <Check size={10} className="text-emerald-400 shrink-0" />}
                    <span className={clsx('flex-1', cfg.entity !== e.logicalCollectionName && 'ml-[14px]')}>
                      <span className="text-slate-200">{e.displayName}</span>
                      <span className="text-slate-500 ml-1.5 text-[10px]">{e.logicalName}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Field mappings */}
      {cfg.entity && (
        <div>
          <Label>Field mappings (source → Dataverse field)</Label>
          {loadingFields && <div className="text-xs text-slate-500">Loading fields…</div>}
          <div className="space-y-1.5 max-h-72 overflow-y-auto" onWheelCapture={(e) => e.stopPropagation()}>
            {(cfg.fieldMappings || []).map((m, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
                <div className="bg-slate-800 px-2 py-1 rounded text-xs text-slate-200 truncate">{m.source}</div>
                <span className="text-slate-500">→</span>
                <select
                  value={m.target || ''}
                  onChange={(e) => setMapping(i, { target: e.target.value })}
                  className="bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-xs text-slate-200 min-w-0 hover:border-slate-500 focus:border-sky-500 outline-none"
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

      {/* Import button */}
      <button
        onClick={startImport}
        disabled={!cfg.entity || !producedCount}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition"
      >
        <Upload size={14} /> Import {producedCount || 0} rows to {cfg.entity || '—'}
      </button>

      {!producedCount && (
        <div className="text-[11px] text-slate-500">Run the pipeline first to stage rows for import.</div>
      )}

      {/* Inline error log */}
      {failedRows !== null && (
        <div className="border border-slate-700 rounded-lg overflow-hidden">
          <button
            onClick={() => setErrorsOpen((o) => !o)}
            className="w-full flex items-center justify-between px-3 py-2 bg-slate-800 hover:bg-slate-700 transition text-left"
          >
            <div className="flex items-center gap-2">
              {failedRows.length === 0
                ? <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                : <AlertCircle  size={13} className="text-rose-400  shrink-0" />}
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
                    {label && <div className="text-[11px] font-medium text-slate-300 truncate">{label}</div>}
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

function Label({ children }) {
  return <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1.5 font-semibold">{children}</div>;
}
function Hint({ children }) {
  return <span className="ml-1 text-slate-600 normal-case font-normal text-[10px]">{children}</span>;
}
