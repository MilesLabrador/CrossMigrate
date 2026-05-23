import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Search, ChevronDown, Loader2, LogIn, RefreshCw, AlertCircle } from 'lucide-react';
import { usePipelineStore } from '../../store/usePipelineStore';
import { fetchEntities, fetchViews } from '../../lib/api';
import { getCachedEntities as getCached, setCachedEntities as setCached } from '../../lib/entityCache';
import SignInModal from '../SignInModal';
import clsx from 'clsx';

/** Extract logical attribute names from FetchXML <attribute name="..."/> elements. */
function parseColumnsFromFetchXml(xml) {
  if (!xml) return [];
  return [...xml.matchAll(/<attribute\s+name="([^"]+)"/g)].map((m) => m[1]);
}

export default function DataverseViewConfig({ nodeId }) {
  const { nodes, updateNodeConfig, environments } = usePipelineStore();
  const node = nodes.find((n) => n.id === nodeId);
  const cfg  = node?.data?.config || {};

  const [showAuthModal, setShowAuthModal] = useState(false);

  // ── Debounced org URL ──────────────────────────────────────────────────────
  const [localOrgUrl, setLocalOrgUrl] = useState(cfg.orgUrl || '');
  useEffect(() => { setLocalOrgUrl(cfg.orgUrl || ''); }, [cfg.orgUrl]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (localOrgUrl !== (cfg.orgUrl || '')) {
        // Reset view selection (view GUIDs are environment-specific) but keep the
        // entity — the validation effect below will clear it if not found in new env
        updateNodeConfig(nodeId, {
          orgUrl: localOrgUrl,
          viewId: '', viewName: '', fetchXml: '', viewColumns: [],
        });
      }
    }, 600);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localOrgUrl]);

  // ── Entity picker ─────────────────────────────────────────────────────────
  const [entities, setEntities]             = useState([]);
  const [entitiesLoading, setEntitiesLoading] = useState(false);
  const [entitiesError, setEntitiesError]   = useState(null);
  const [entitySearch, setEntitySearch]     = useState('');
  const [entityOpen, setEntityOpen]         = useState(false);
  const pickerRef = useRef(null);

  const reloadEntities = useCallback((bust = false) => {
    const key = cfg.orgUrl || '';
    if (!bust) {
      const cached = getCached(key);
      if (cached) { setEntities(cached); return; }
    }
    setEntitiesLoading(true);
    setEntitiesError(null);
    fetchEntities(key)
      .then((list) => { setCached(key, list); setEntities(list); })
      .catch((e) => setEntitiesError(e.message))
      .finally(() => setEntitiesLoading(false));
  }, [cfg.orgUrl]);

  useEffect(() => { setEntitiesError(null); reloadEntities(); }, [reloadEntities]);

  // ── When entities reload, check if the selected entity still exists ──────────
  useEffect(() => {
    if (!entities.length || !cfg.entityLogicalName) return;
    const found = entities.find((e) => e.logicalName === cfg.entityLogicalName);
    if (!found) {
      updateNodeConfig(nodeId, {
        entity: '', entityLogicalName: '', entityDisplayName: '',
        viewId: '', viewName: '', fetchXml: '', viewColumns: [],
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entities]);

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
    updateNodeConfig(nodeId, {
      entity:            e.logicalCollectionName,
      entityLogicalName: e.logicalName,
      entityDisplayName: e.displayName,
      viewId: '', viewName: '', fetchXml: '',
    });
    setEntitySearch('');
    setEntityOpen(false);
  };

  const selectedEntity = entities.find((e) => e.logicalCollectionName === cfg.entity);

  // ── View picker ───────────────────────────────────────────────────────────
  const [views, setViews]             = useState([]);
  const [viewsLoading, setViewsLoading] = useState(false);
  const [viewsError, setViewsError]   = useState(null);
  const [viewSearch, setViewSearch]   = useState('');
  const [viewOpen, setViewOpen]       = useState(false);
  const viewPickerRef = useRef(null);

  useEffect(() => {
    if (!cfg.entityLogicalName) { setViews([]); return; }
    setViewsLoading(true);
    setViewsError(null);
    fetchViews(cfg.entityLogicalName, cfg.orgUrl || '')
      .then(setViews)
      .catch((e) => setViewsError(e.message))
      .finally(() => setViewsLoading(false));
  }, [cfg.entityLogicalName, cfg.orgUrl]);

  useEffect(() => {
    const handler = (e) => {
      if (viewPickerRef.current && !viewPickerRef.current.contains(e.target)) setViewOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredViews = views.filter((v) =>
    v.name.toLowerCase().includes(viewSearch.toLowerCase())
  );

  const chooseView = (v) => {
    updateNodeConfig(nodeId, {
      viewId:      v.id,
      viewName:    v.name,
      fetchXml:    v.fetchXml,
      viewColumns: parseColumnsFromFetchXml(v.fetchXml),
    });
    setViewSearch('');
    setViewOpen(false);
  };

  // ── Auth error detection ──────────────────────────────────────────────────
  const needsSignIn =
    (entitiesError && entitiesError.startsWith('sign-in-required:')) ||
    (viewsError    && viewsError.startsWith('sign-in-required:'));

  return (
    <div className="space-y-5 text-xs">
      {showAuthModal && (
        <SignInModal
          orgUrl={cfg.orgUrl || ''}
          onClose={() => setShowAuthModal(false)}
          onAuthenticated={() => {
            setShowAuthModal(false);
            reloadEntities(true);
          }}
        />
      )}

      {/* Sign-in banner */}
      {needsSignIn && (
        <div className="flex items-center gap-2 bg-amber-900/30 border border-amber-700/40 rounded-lg px-3 py-2 text-amber-300 text-[11px]">
          <AlertCircle size={12} className="shrink-0" />
          <span className="flex-1">Sign in to access this environment.</span>
          <button
            onClick={() => setShowAuthModal(true)}
            className="flex items-center gap-1 text-amber-200 hover:text-white font-medium"
          >
            <LogIn size={11} /> Sign in
          </button>
        </div>
      )}

      {/* Environment URL */}
      <div>
        <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">
          Environment URL
          <span className="ml-1 text-slate-600 normal-case font-normal">(blank = default from .env)</span>
        </label>
        {environments.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {environments.map((env) => (
              <button
                key={env.id}
                type="button"
                onClick={() => setLocalOrgUrl(env.orgUrl)}
                className={`px-2 py-0.5 rounded text-[10px] border transition ${
                  localOrgUrl === env.orgUrl
                    ? 'bg-emerald-900/50 border-emerald-700 text-emerald-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                }`}
              >
                {env.name}
              </button>
            ))}
          </div>
        )}
        <input
          value={localOrgUrl}
          onChange={(e) => setLocalOrgUrl(e.target.value)}
          placeholder="e.g. otherorg.crm.dynamics.com"
          className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 hover:border-slate-500 focus:border-sky-500 text-slate-200 outline-none transition font-mono text-[11px]"
        />
      </div>

      {/* Entity picker */}
      <div>
        <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">
          Dataverse Table
        </label>
        <div className="relative" ref={pickerRef}>
          <button
            type="button"
            onClick={() => setEntityOpen((o) => !o)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded bg-slate-800 border border-slate-700 hover:border-slate-500 text-slate-200 transition"
          >
            <span className="truncate text-[11px]">
              {selectedEntity ? (
                <>
                  <span className="font-medium">{selectedEntity.displayName}</span>
                  <span className="text-slate-500 ml-1.5">{selectedEntity.logicalName}</span>
                </>
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
                    className="flex-1 bg-transparent outline-none text-slate-200 placeholder-slate-500"
                  />
                </div>
              </div>
              <div className="overflow-y-auto">
                {filteredEntities.length === 0 && (
                  <div className="px-3 py-4 text-slate-500 italic text-center">
                    {entities.length === 0 ? 'No tables loaded.' : `No match for "${entitySearch}".`}
                  </div>
                )}
                {filteredEntities.map((e) => (
                  <button
                    key={e.logicalName}
                    type="button"
                    onClick={() => chooseEntity(e)}
                    className={clsx(
                      'w-full text-left px-3 py-2 hover:bg-slate-800 transition flex items-center justify-between gap-2',
                      cfg.entity === e.logicalCollectionName && 'bg-sky-900/30 text-sky-200'
                    )}
                  >
                    <span className="font-medium truncate">{e.displayName}</span>
                    <span className="text-slate-500 shrink-0 text-[10px]">{e.logicalName}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        {entitiesError && !needsSignIn && (
          <p className="text-rose-400 text-[10px] mt-1">{entitiesError}</p>
        )}
      </div>

      {/* View picker — only shown once entity is chosen */}
      {cfg.entityLogicalName && (
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">
            View
          </label>
          <div className="relative" ref={viewPickerRef}>
            <button
              type="button"
              onClick={() => setViewOpen((o) => !o)}
              disabled={viewsLoading}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded bg-slate-800 border border-slate-700 hover:border-slate-500 text-slate-200 transition disabled:opacity-60"
            >
              <span className="truncate text-[11px]">
                {cfg.viewName
                  ? <span className="font-medium">{cfg.viewName}</span>
                  : <span className="text-slate-500">
                      {viewsLoading ? 'Loading views…' : 'Choose a view…'}
                    </span>}
              </span>
              {viewsLoading
                ? <Loader2 size={12} className="animate-spin text-slate-400 shrink-0" />
                : <ChevronDown size={12} className="text-slate-400 shrink-0" />}
            </button>

            {viewOpen && (
              <div className="absolute z-50 w-full mt-1 bg-slate-900 border border-slate-700 rounded shadow-xl max-h-64 flex flex-col">
                <div className="p-2 border-b border-slate-700">
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-slate-800 border border-slate-700">
                    <Search size={11} className="text-slate-400 shrink-0" />
                    <input
                      autoFocus
                      value={viewSearch}
                      onChange={(e) => setViewSearch(e.target.value)}
                      placeholder="Search views…"
                      className="flex-1 bg-transparent outline-none text-slate-200 placeholder-slate-500 text-[11px]"
                    />
                  </div>
                </div>
                <div className="overflow-y-auto">
                  {filteredViews.length === 0 && (
                    <div className="px-3 py-4 text-slate-500 italic text-center">
                      {views.length === 0 ? 'No public views found.' : `No match for "${viewSearch}".`}
                    </div>
                  )}
                  {filteredViews.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => chooseView(v)}
                      className={clsx(
                        'w-full text-left px-3 py-2 hover:bg-slate-800 transition',
                        cfg.viewId === v.id && 'bg-sky-900/30 text-sky-200'
                      )}
                    >
                      <div className="font-medium text-[11px] truncate">{v.name}</div>
                      {v.description && (
                        <div className="text-[10px] text-slate-500 truncate mt-0.5">{v.description}</div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {viewsError && !needsSignIn && (
            <p className="text-rose-400 text-[10px] mt-1">{viewsError}</p>
          )}
        </div>
      )}

      {/* FetchXML preview */}
      {cfg.fetchXml && (
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">
            FetchXML (read-only)
          </label>
          <pre className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-[10px] text-slate-400 overflow-auto max-h-32 whitespace-pre-wrap break-all font-mono">
            {cfg.fetchXml}
          </pre>
        </div>
      )}

      {/* Row count hint */}
      {cfg.viewName && !cfg.fetchXml && (
        <p className="text-[10px] text-slate-600 italic">No FetchXML available for this view.</p>
      )}
    </div>
  );
}
