import React, { useCallback, useEffect, useState } from 'react';
import { Plus, X, ArrowRight, RefreshCw, Loader2 } from 'lucide-react';
import { usePipelineStore, getUpstreamColumns } from '../../store/usePipelineStore';
import { fetchCaches } from '../../lib/api';
import { cacheAge } from '../../nodes/CacheNode';
import ColumnDropdown from '../ColumnDropdown';

const NO_MATCH = [
  { value: 'keep', label: 'keep original value' },
  { value: 'null', label: 'set null' },
  { value: 'default', label: 'use default value' },
  // Stored value stays 'redirect' for saved-pipeline compatibility; only the
  // label changed.
  { value: 'redirect', label: 'send to error output' },
];

const SOURCES = [
  { value: 'inline', label: 'Typed list' },
  { value: 'cache', label: 'From a cache' },
];

// Mirrors pickCacheColumns in server/engine/executeNode.js so the panel shows
// the same columns the run will use. Keep the two in step.
const loose = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function pickCacheColumns(columns, { lookupColumn, cacheKeyColumn, cacheValueColumn } = {}) {
  const has = (c) => c && columns.includes(c);
  const keyColumn = has(cacheKeyColumn)
    ? cacheKeyColumn
    : columns.find((c) => loose(c) === loose(lookupColumn)) || columns[0];
  const valueColumn = has(cacheValueColumn)
    ? cacheValueColumn
    : columns.find((c) => c !== keyColumn) || keyColumn;
  return { keyColumn, valueColumn };
}

export default function LookupConfig({ nodeId }) {
  const state = usePipelineStore();
  const node = state.nodes.find((n) => n.id === nodeId);
  const cfg = node?.data?.config || {};
  const mappings = cfg.mappings || [];
  const source = cfg.mappingSource || 'inline';
  const cols = getUpstreamColumns(nodeId, state);
  const upd = (patch) => state.updateNodeConfig(nodeId, patch);

  const [caches, setCaches] = useState([]);
  const [loadingCaches, setLoadingCaches] = useState(false);
  const [cacheError, setCacheError] = useState('');

  const loadCaches = useCallback(async () => {
    setLoadingCaches(true);
    setCacheError('');
    try {
      setCaches(await fetchCaches());
    } catch (err) {
      setCacheError(err.message);
    } finally {
      setLoadingCaches(false);
    }
  }, []);

  useEffect(() => { loadCaches(); }, [loadCaches]);

  const setMapping = (i, patch) =>
    upd({ mappings: mappings.map((m, idx) => (idx === i ? { ...m, ...patch } : m)) });

  const selected = caches.find((c) => c.key === cfg.cacheKey);
  const cacheCols = selected?.columns || [];
  const { keyColumn, valueColumn } = pickCacheColumns(cacheCols, cfg);

  // Picking a cache also guesses the column to match on, when the cached key
  // column exists upstream and nothing has been chosen yet.
  const chooseCache = (key) => {
    const cache = caches.find((c) => c.key === key);
    const patch = { cacheKey: key, cacheKeyColumn: '', cacheValueColumn: '' };
    if (!cfg.lookupColumn && cache) {
      const guess = pickCacheColumns(cache.columns || [], {}).keyColumn;
      const upstream = cols.find((c) => loose(c) === loose(guess));
      if (upstream) patch.lookupColumn = upstream;
    }
    upd(patch);
  };

  return (
    <div className="space-y-3">
      <div>
        <Label>Match column</Label>
        <ColumnDropdown
          value={cfg.lookupColumn || ''}
          options={cols}
          onChange={(lookupColumn) => upd({ lookupColumn })}
          placeholder="— column to look up —"
        />
      </div>

      <div>
        <Label>Write result to <Hint>(blank = replace in place)</Hint></Label>
        <input
          value={cfg.targetColumn || ''}
          onChange={(e) => upd({ targetColumn: e.target.value })}
          placeholder={cfg.lookupColumn ? `${cfg.lookupColumn} (in place)` : 'new or existing column'}
          className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200"
        />
      </div>

      <div>
        <Label>Mappings from</Label>
        <div className="grid grid-cols-2 gap-1.5">
          {SOURCES.map((s) => (
            <button
              key={s.value}
              onClick={() => upd({ mappingSource: s.value })}
              className={`rounded border px-2 py-1.5 text-xs transition ${
                source === s.value
                  ? 'border-sky-600 bg-sky-950/30 text-slate-100'
                  : 'border-slate-700 bg-slate-800/40 text-slate-400 hover:border-slate-500'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {source === 'cache' ? (
        <CacheMappings
          cfg={cfg}
          caches={caches}
          selected={selected}
          cacheCols={cacheCols}
          keyColumn={keyColumn}
          valueColumn={valueColumn}
          loading={loadingCaches}
          error={cacheError}
          onReload={loadCaches}
          onChooseCache={chooseCache}
          upd={upd}
        />
      ) : (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label className="mb-0">Value mappings</Label>
            <button
              onClick={() => upd({ mappings: [...mappings, { from: '', to: '' }] })}
              className="text-[11px] flex items-center gap-1 text-sky-400 hover:underline"
            >
              <Plus size={11} /> Add
            </button>
          </div>
          {mappings.length === 0 && (
            <div className="text-xs text-slate-500 italic py-2 text-center">
              No mappings yet — e.g. "US" → "United States"
            </div>
          )}
          <div className="space-y-1.5 max-h-64 overflow-y-auto" onWheelCapture={(e) => e.stopPropagation()}>
            {mappings.map((m, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto_1fr_auto] gap-1.5 items-center">
                <input
                  value={m.from ?? ''}
                  onChange={(e) => setMapping(i, { from: e.target.value })}
                  placeholder="match"
                  className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                />
                <ArrowRight size={11} className="text-slate-500 shrink-0" />
                <input
                  value={m.to ?? ''}
                  onChange={(e) => setMapping(i, { to: e.target.value })}
                  placeholder="inject"
                  className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                />
                <button
                  onClick={() => upd({ mappings: mappings.filter((_, idx) => idx !== i) })}
                  className="text-slate-500 hover:text-rose-400 shrink-0"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <label className="flex items-center gap-2 text-xs text-slate-200">
        <input
          type="checkbox"
          checked={!!cfg.caseInsensitive}
          onChange={(e) => upd({ caseInsensitive: e.target.checked })}
          className="accent-sky-500"
        />
        Case-insensitive matching
      </label>

      <div>
        <Label>When no mapping matches</Label>
        <select
          value={cfg.noMatch || 'keep'}
          onChange={(e) => upd({ noMatch: e.target.value })}
          className="w-full bg-cardalt border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200"
        >
          {NO_MATCH.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {cfg.noMatch === 'default' && (
          <input
            value={cfg.defaultValue ?? ''}
            onChange={(e) => upd({ defaultValue: e.target.value })}
            placeholder="default value"
            className="w-full mt-1.5 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200"
          />
        )}
        {cfg.noMatch === 'redirect' && (
          <div className="text-[10px] text-slate-500 mt-1">
            Unmatched rows leave through the red error handle with an <span className="font-mono">_error</span> reason —
            wire it to a Preview or CSV Export as a reject file.
          </div>
        )}
      </div>
    </div>
  );
}

// Cache-backed mappings: pick a warm cache, and the whole table becomes the
// mapping list. Both column pickers default to Auto — the key column is the one
// named like the match column (or the first), the value column the next along —
// so a two-column reference table needs nothing but the cache itself.
function CacheMappings({
  cfg, caches, selected, cacheCols, keyColumn, valueColumn,
  loading, error, onReload, onChooseCache, upd,
}) {
  const sample = (selected?.sample || []).filter((r) => r && r[keyColumn] != null).slice(0, 4);

  return (
    <div className="space-y-2.5">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <Label className="mb-0">Lookup cache</Label>
          <button
            onClick={onReload}
            disabled={loading}
            className="text-[11px] flex items-center gap-1 text-sky-400 hover:underline disabled:opacity-50"
            title="Re-read the list of warm caches"
          >
            {loading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} Refresh
          </button>
        </div>
        <ColumnDropdown
          value={cfg.cacheKey || ''}
          options={caches.map((c) => ({
            value: c.key,
            label: c.label || c.key,
            sub: `${c.rowCount?.toLocaleString()} rows · ${c.columns?.length || 0} cols · ${cacheAge(c.cachedAt)}`,
          }))}
          onChange={onChooseCache}
          placeholder="— pick a warm cache —"
        />
        {error && <div className="text-[10px] text-rose-400 mt-1">Couldn't list caches: {error}</div>}
        {!error && !loading && caches.length === 0 && (
          <div className="text-[10px] text-slate-500 mt-1">
            No warm caches yet — add a Cache node after your reference table (name it, e.g. "genre")
            and run the pipeline once.
          </div>
        )}
        {cfg.cacheKey && !selected && !loading && (
          <div className="text-[10px] text-amber-400 mt-1">
            Cache "{cfg.cacheKey}" isn't warm — run its Cache node, then Refresh.
          </div>
        )}
      </div>

      {selected && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Match against</Label>
              <ColumnDropdown
                value={cfg.cacheKeyColumn || ''}
                options={[{ value: '', label: `Auto (${keyColumn})` }, ...cacheCols]}
                onChange={(cacheKeyColumn) => upd({ cacheKeyColumn })}
                placeholder={`Auto (${keyColumn})`}
              />
            </div>
            <div>
              <Label>Inject value from</Label>
              <ColumnDropdown
                value={cfg.cacheValueColumn || ''}
                options={[{ value: '', label: `Auto (${valueColumn})` }, ...cacheCols]}
                onChange={(cacheValueColumn) => upd({ cacheValueColumn })}
                placeholder={`Auto (${valueColumn})`}
              />
            </div>
          </div>

          <div className="border border-slate-700 rounded bg-slate-800/40 px-2.5 py-2">
            <div className="text-[10px] text-slate-400 mb-1">
              {selected.rowCount?.toLocaleString()} mappings ·{' '}
              <span className="text-sky-400">{keyColumn}</span> → <span className="text-emerald-400">{valueColumn}</span>
            </div>
            {sample.length ? (
              <div className="space-y-0.5">
                {sample.map((r, i) => (
                  <div key={i} className="text-[11px] text-slate-300 truncate">
                    <span className="text-slate-400">{String(r[keyColumn])}</span>
                    <ArrowRight size={9} className="inline mx-1 text-slate-600" />
                    {String(r[valueColumn] ?? '')}
                  </div>
                ))}
                {selected.rowCount > sample.length && (
                  <div className="text-[10px] text-slate-600">
                    +{(selected.rowCount - sample.length).toLocaleString()} more
                  </div>
                )}
              </div>
            ) : (
              <div className="text-[11px] text-slate-500 italic">No sample rows stored for this cache.</div>
            )}
          </div>

          <div className="text-[10px] text-slate-500 leading-snug">
            Every row of the cache is a mapping — refresh the cache and the lookup follows,
            with no per-value setup here.
          </div>
        </>
      )}
    </div>
  );
}

function Label({ children, className = '' }) {
  return <div className={`text-[11px] uppercase tracking-wider text-slate-400 mb-1.5 font-semibold ${className}`}>{children}</div>;
}
function Hint({ children }) {
  return <span className="ml-1 text-slate-600 normal-case font-normal text-[10px]">{children}</span>;
}
