import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Search, ChevronDown, Check, Loader2, LogIn } from 'lucide-react';
import { usePipelineStore } from '../../store/usePipelineStore';
import { fetchEntities, fetchEntityFields } from '../../lib/api';
import { getCachedEntities as getCached, setCachedEntities as setCached } from '../../lib/entityCache';
import SignInModal from '../SignInModal';
import clsx from 'clsx';

// ── MaxRowsInput — owns local string state so "|| 5000" doesn't fight typing ──
function MaxRowsInput({ value, onChange }) {
  const [local, setLocal] = React.useState(String(value));
  React.useEffect(() => { setLocal(String(value)); }, [value]);
  const commit = () => {
    const n = parseInt(local, 10);
    if (!isNaN(n) && n > 0) onChange(Math.min(n, 50000));
    else setLocal(String(value));
  };
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">
        Max Rows
      </label>
      <input
        type="number" min={1} max={50000} value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 hover:border-slate-500 focus:border-sky-500 text-slate-200 outline-none transition"
      />
      <p className="text-[10px] text-slate-600 mt-1">Max 50,000. Uses OData pagination automatically.</p>
    </div>
  );
}

// ── Main config component ─────────────────────────────────────────────────────
export default function DataverseInputConfig({ nodeId }) {
  const { nodes, updateNodeConfig, environments, activeEnvId } = usePipelineStore();
  const node = nodes.find((n) => n.id === nodeId);
  const cfg  = node?.data?.config || {};

  const [showAuthModal, setShowAuthModal] = useState(false);

  const [localOrgUrl, setLocalOrgUrl] = useState(cfg.orgUrl || '');
  useEffect(() => { setLocalOrgUrl(cfg.orgUrl || ''); }, [cfg.orgUrl]);
  // Only commit the URL — entity/column validation happens in the effects below
  useEffect(() => {
    const t = setTimeout(() => {
      if (localOrgUrl !== (cfg.orgUrl || '')) {
        updateNodeConfig(nodeId, { orgUrl: localOrgUrl });
      }
    }, 600);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localOrgUrl]);

  const [entities, setEntities]         = useState([]);
  const [entitiesLoading, setEntitiesLoading] = useState(false);
  const [entitiesError, setEntitiesError]     = useState(null);
  const [entitySearch, setEntitySearch]       = useState('');
  const [entityOpen, setEntityOpen]           = useState(false);
  const pickerRef = useRef(null);

  const [fields, setFields]           = useState([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [fieldSearch, setFieldSearch] = useState('');
  const [selectedFields, setSelectedFields] = useState(
    cfg.select ? cfg.select.split(',').map((s) => s.trim()).filter(Boolean) : []
  );

  // ── Entity list loader — defined BEFORE the effect that depends on it ────────
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

  useEffect(() => {
    setEntitiesError(null);
    reloadEntities();
  }, [reloadEntities]);

  // ── When entities reload, check if the selected entity still exists ──────────
  useEffect(() => {
    if (!entities.length || !cfg.entityLogicalName) return;
    const found = entities.find((e) => e.logicalName === cfg.entityLogicalName);
    if (!found) {
      updateNodeConfig(nodeId, { entity: '', entityLogicalName: '', entityDisplayName: '', select: '' });
      setSelectedFields([]);
    }
  // Only re-run when the entity list itself changes (i.e. after a URL switch)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entities]);

  // ── Load fields when entity or orgUrl changes ────────────────────────────────
  const entityKey = cfg.entityLogicalName || cfg.entity;
  useEffect(() => {
    if (!entityKey) { setFields([]); return; }
    setFieldsLoading(true);
    fetchEntityFields(entityKey, cfg.orgUrl || '')
      .then((f) => {
        setFields(f);
        // Trim any previously-selected columns that don't exist in this environment
        if (selectedFields.length) {
          const valid = new Set(f.map((field) => field.logicalName));
          const kept = selectedFields.filter((s) => valid.has(s));
          if (kept.length !== selectedFields.length) {
            setSelectedFields(kept);
            updateNodeConfig(nodeId, { select: kept.join(',') });
          }
        }
      })
      .catch(() => setFields([]))
      .finally(() => setFieldsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityKey, cfg.orgUrl]);

  // ── Close dropdown on outside click ─────────────────────────────────────────
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
      select: '',
      filter: cfg.filter || '',
      top:    cfg.top    || 5000,
    });
    setSelectedFields([]);
    setEntitySearch('');
    setEntityOpen(false);
  };

  const toggleField = (logicalName) => {
    const next = selectedFields.includes(logicalName)
      ? selectedFields.filter((f) => f !== logicalName)
      : [...selectedFields, logicalName];
    setSelectedFields(next);
    updateNodeConfig(nodeId, { select: next.join(',') });
  };

  const selectedEntity = entities.find((e) => e.logicalCollectionName === cfg.entity);

  return (
    <div className="space-y-5 text-xs">
      {showAuthModal && (
        <SignInModal
          orgUrl={cfg.orgUrl || ''}
          onClose={() => setShowAuthModal(false)}
          onAuthenticated={() => {
            setShowAuthModal(false);
            reloadEntities(true); // bust cache after authorising a new environment
          }}
        />
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
            <span className="truncate">
              {selectedEntity ? (
                <span>
                  <span className="font-medium">{selectedEntity.displayName}</span>
                  <span className="text-slate-500 ml-1.5 text-[10px]">{selectedEntity.logicalName}</span>
                </span>
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
              <div className="overflow-y-auto">
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

      {cfg.entity && (
        <>
          {/* Column selector */}
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">
              Columns to Fetch
              <span className="ml-1 text-slate-600 normal-case font-normal">(blank = all)</span>
            </label>
            {fieldsLoading ? (
              <div className="flex items-center gap-2 text-slate-500 py-2">
                <Loader2 size={11} className="animate-spin" /> Loading fields…
              </div>
            ) : fields.length > 0 ? (
              (() => {
                const q = fieldSearch.toLowerCase();
                const visible = q
                  ? fields.filter(
                      (f) =>
                        f.displayName.toLowerCase().includes(q) ||
                        f.logicalName.toLowerCase().includes(q),
                    )
                  : fields;
                return (
                  <>
                    <div className="flex items-center gap-2 px-2 py-1.5 mb-1.5 rounded bg-slate-800 border border-slate-700">
                      <Search size={11} className="text-slate-400 shrink-0" />
                      <input
                        value={fieldSearch}
                        onChange={(e) => setFieldSearch(e.target.value)}
                        placeholder="Search columns…"
                        className="bg-transparent text-slate-200 text-xs w-full outline-none placeholder-slate-600"
                      />
                    </div>
                    <div className="text-[10px] text-slate-600 mb-1">
                      {visible.length} of {fields.length} columns
                      {selectedFields.length > 0 && (
                        <span className="ml-2 text-emerald-500/70">{selectedFields.length} selected</span>
                      )}
                    </div>
                    <div className="max-h-48 overflow-y-auto border border-slate-700 rounded divide-y divide-slate-800">
                      {visible.length === 0 ? (
                        <div className="px-3 py-2 text-slate-500 text-[11px] italic">
                          No columns match &ldquo;{fieldSearch}&rdquo;.
                        </div>
                      ) : (
                        visible.map((f) => {
                          const on = selectedFields.includes(f.logicalName);
                          return (
                            <label
                              key={f.logicalName}
                              className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-slate-800 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() => toggleField(f.logicalName)}
                                className="accent-emerald-500"
                              />
                              <span className="flex-1">
                                <span className="text-slate-200">{f.displayName}</span>
                                <span className="text-slate-600 ml-1.5 text-[10px]">{f.logicalName}</span>
                              </span>
                              <span className="text-[10px] text-slate-600 shrink-0">{f.attributeType}</span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </>
                );
              })()
            ) : (
              <div className="text-slate-500 py-1">No fields found</div>
            )}
          </div>

          {/* OData filter */}
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">
              OData Filter
              <span className="ml-1 text-slate-600 normal-case font-normal">(optional)</span>
            </label>
            <input
              value={cfg.filter || ''}
              onChange={(e) => updateNodeConfig(nodeId, { filter: e.target.value })}
              placeholder="e.g. statecode eq 0 and createdon gt 2024-01-01"
              className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 hover:border-slate-500 focus:border-sky-500 text-slate-200 outline-none transition font-mono text-[11px]"
            />
          </div>

          {/* Max rows */}
          <MaxRowsInput
            value={cfg.top ?? 5000}
            onChange={(v) => updateNodeConfig(nodeId, { top: v })}
          />
        </>
      )}
    </div>
  );
}
