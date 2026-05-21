import React, { useEffect, useState } from 'react';
import { distance } from 'fastest-levenshtein';
import { fetchEntities, fetchEntityFields } from '../../lib/api';
import { usePipelineStore, getUpstreamColumns, getUpstreamSample } from '../../store/usePipelineStore';
import { X, Wand2, Search } from 'lucide-react';

function fuzzyMatch(source, candidates) {
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
  // Only confident matches
  return bestScore <= 0.35 ? best : null;
}

export default function SelectMapConfig({ nodeId }) {
  const state = usePipelineStore();
  const node = state.nodes.find((n) => n.id === nodeId);
  const cfg = node?.data?.config || {};
  const mappings = cfg.mappings || [];
  const incoming = getUpstreamColumns(nodeId, state);
  const sample = getUpstreamSample(nodeId, state, 1)[0] || {};

  const [targetMode, setTargetMode] = useState(cfg.targetMode || 'manual');
  const [entity, setEntity] = useState(cfg.targetEntity || '');
  const [entities, setEntities] = useState([]);
  const [fields, setFields] = useState([]);
  const [loadingFields, setLoadingFields] = useState(false);
  const [search, setSearch] = useState('');

  // Initialize mappings from incoming columns when empty
  useEffect(() => {
    if (!mappings.length && incoming.length) {
      const init = incoming.map((c) => ({ source: c, target: c, skip: false }));
      state.updateNodeConfig(nodeId, { mappings: init });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming.length]);

  useEffect(() => {
    if (targetMode === 'dataverse' && !entities.length) {
      fetchEntities().then(setEntities).catch(() => setEntities([]));
    }
  }, [targetMode, entities.length]);

  useEffect(() => {
    if (targetMode === 'dataverse' && entity) {
      setLoadingFields(true);
      fetchEntityFields(entity)
        .then((f) => {
          setFields(f);
          autoMatch(f.map((x) => x.logicalName));
        })
        .catch(() => setFields([]))
        .finally(() => setLoadingFields(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity, targetMode]);

  const autoMatch = (candidates) => {
    if (!candidates?.length || !mappings.length) return;
    const next = mappings.map((m) => {
      if (m.target) return m;
      const guess = fuzzyMatch(m.source, candidates);
      return guess ? { ...m, target: guess } : m;
    });
    state.updateNodeConfig(nodeId, { mappings: next });
  };

  const setMapping = (idx, patch) => {
    const next = mappings.map((m, i) => (i === idx ? { ...m, ...patch } : m));
    state.updateNodeConfig(nodeId, { mappings: next });
  };

  const targetCandidates =
    targetMode === 'dataverse' ? fields.map((f) => f.logicalName) : incoming;

  const q = search.toLowerCase();
  const visibleMappings = mappings
    .map((m, i) => ({ m, i }))
    .filter(({ m }) =>
      !q ||
      m.source.toLowerCase().includes(q) ||
      (m.target || '').toLowerCase().includes(q)
    );

  return (
    <div className="space-y-4">
      <div>
        <Label>Target schema</Label>
        <div className="flex gap-2">
          <Pill
            active={targetMode === 'manual'}
            onClick={() => {
              setTargetMode('manual');
              state.updateNodeConfig(nodeId, { targetMode: 'manual' });
            }}
          >
            Manual
          </Pill>
          <Pill
            active={targetMode === 'dataverse'}
            onClick={() => {
              setTargetMode('dataverse');
              state.updateNodeConfig(nodeId, { targetMode: 'dataverse' });
            }}
          >
            Dataverse entity
          </Pill>
        </div>
      </div>

      {targetMode === 'dataverse' && (
        <div>
          <Label>Entity</Label>
          <select
            value={entity}
            onChange={(e) => {
              setEntity(e.target.value);
              state.updateNodeConfig(nodeId, { targetEntity: e.target.value });
            }}
            className="w-full bg-cardalt border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200"
          >
            <option value="">— pick entity —</option>
            {entities.map((e) => (
              <option key={e.logicalName} value={e.logicalCollectionName}>
                {e.displayName} ({e.logicalCollectionName})
              </option>
            ))}
          </select>
          {loadingFields && <div className="text-xs text-slate-500 mt-1">Loading fields…</div>}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="mb-0">Field mappings</Label>
          <button
            onClick={() => autoMatch(targetCandidates)}
            className="text-[11px] flex items-center gap-1 text-sky-400 hover:underline"
          >
            <Wand2 size={11} /> Auto-match
          </button>
        </div>

        {/* Search */}
        {mappings.length > 0 && (
          <div className="relative mb-2">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search source or target…"
              className="w-full pl-7 pr-7 py-1.5 rounded bg-slate-800 border border-slate-700 hover:border-slate-600 focus:border-sky-500 text-slate-300 text-xs outline-none transition placeholder-slate-600"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                <X size={11} />
              </button>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-2 text-[10px] uppercase text-slate-500 px-1">
            <div>Source</div>
            <div>→</div>
            <div>Target</div>
            <div>Skip</div>
          </div>
          {mappings.length === 0 && (
            <div className="text-xs text-slate-500 italic py-4 text-center">
              No incoming fields yet — connect an upstream node.
            </div>
          )}
          {mappings.length > 0 && visibleMappings.length === 0 && (
            <div className="text-xs text-slate-500 italic py-3 text-center">
              No fields match "{search}".
            </div>
          )}
          {visibleMappings.map(({ m, i }) => (
            <div key={i} className={`grid grid-cols-[1fr_auto_1fr_auto] gap-2 items-center ${m.skip ? 'opacity-50' : ''}`}>
              <div className="bg-slate-800 px-2 py-1 rounded text-xs text-slate-200 truncate">
                <div className="truncate">{m.source}</div>
                <div className="text-[10px] text-slate-500 truncate">
                  {String(sample[m.source] ?? '').slice(0, 30) || <span className="italic">—</span>}
                </div>
              </div>
              <div className="text-slate-500">→</div>
              {targetMode === 'dataverse' ? (
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
              ) : (
                <input
                  value={m.target || ''}
                  onChange={(e) => setMapping(i, { target: e.target.value })}
                  className="bg-cardalt border border-slate-700 rounded px-1.5 py-1 text-xs text-slate-200 min-w-0"
                />
              )}
              <label className="flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={!!m.skip}
                  onChange={(e) => setMapping(i, { skip: e.target.checked })}
                  className="accent-rose-500"
                />
              </label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Label({ children, className = '' }) {
  return <div className={`text-[11px] uppercase tracking-wider text-slate-400 mb-1.5 font-semibold ${className}`}>{children}</div>;
}
function Pill({ active, children, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-xs rounded-md border ${
        active ? 'bg-sky-500/20 text-sky-300 border-sky-500/40' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
      }`}
    >
      {children}
    </button>
  );
}
