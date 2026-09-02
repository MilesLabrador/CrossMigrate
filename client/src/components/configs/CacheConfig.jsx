import React, { useState } from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import { usePipelineStore } from '../../store/usePipelineStore';
import { clearCacheRemote, fetchCacheStatus } from '../../lib/api';
import { cacheAge } from '../../nodes/CacheNode';

const MODES = [
  { value: 'auto', label: 'Auto', desc: 'Serve from the warm cache if one exists; otherwise cache this run\'s rows. Sources feeding only this cache can skip fetching.' },
  { value: 'refresh', label: 'Always refresh', desc: 'Re-cache the incoming rows on every run (upstream must fetch).' },
  { value: 'bypass', label: 'Bypass', desc: 'Pass rows straight through; the stored cache is kept but unused.' },
];

export default function CacheConfig({ nodeId }) {
  const { nodes, updateNodeConfig, updateNodeData } = usePipelineStore();
  const node = nodes.find((n) => n.id === nodeId);
  const cfg = node?.data?.config || {};
  const cache = node?.data?._cache;
  const [clearing, setClearing] = useState(false);

  const clear = async () => {
    setClearing(true);
    try {
      await clearCacheRemote(cfg.cacheKey || nodeId);
      const info = await fetchCacheStatus(cfg.cacheKey || nodeId);
      updateNodeData(nodeId, { _cache: info });
    } catch (err) {
      console.error(err);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="space-y-4 text-xs">
      <div>
        <Label>Cache name <Hint>(blank = this node's id)</Hint></Label>
        <input
          value={cfg.cacheKey || ''}
          onChange={(e) => updateNodeConfig(nodeId, { cacheKey: e.target.value })}
          placeholder="e.g. genre"
          className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200"
        />
        <div className="text-[10px] text-slate-500 mt-1">
          Naming a cache lets other nodes point at it — a Lookup node can use these rows as its
          mapping table. Renaming starts a fresh (cold) entry; the old one stays until cleared.
        </div>
      </div>

      <div>
        <Label>Cache state</Label>
        {cache?.exists ? (
          <div className="flex items-center justify-between bg-slate-800 border border-slate-700 rounded px-3 py-2">
            <span className="text-slate-200">
              <span className="text-emerald-400 font-medium">Warm</span>
              {' · '}{cache.rowCount?.toLocaleString()} rows · {cacheAge(cache.cachedAt)}
            </span>
            <button
              onClick={clear}
              disabled={clearing}
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-rose-400 transition disabled:opacity-50"
              title="Delete the stored rows — next run fetches fresh"
            >
              {clearing ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />} Clear
            </button>
          </div>
        ) : (
          <div className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-slate-500">
            Cold — the next run's incoming rows will be cached.
          </div>
        )}
      </div>

      <div>
        <Label>Mode</Label>
        <div className="space-y-1.5">
          {MODES.map((m) => (
            <label
              key={m.value}
              className={`block rounded border px-3 py-2 cursor-pointer transition ${
                (cfg.mode || 'auto') === m.value
                  ? 'border-sky-600 bg-sky-950/30'
                  : 'border-slate-700 bg-slate-800/40 hover:border-slate-500'
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`cache-mode-${nodeId}`}
                  checked={(cfg.mode || 'auto') === m.value}
                  onChange={() => updateNodeConfig(nodeId, { mode: m.value })}
                  className="accent-sky-500"
                />
                <span className="text-slate-200 font-medium">{m.label}</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5 ml-5">{m.desc}</div>
            </label>
          ))}
        </div>
      </div>

      <div className="text-[10px] text-slate-500 leading-snug border-t border-slate-700 pt-3">
        Place a Cache right after an expensive source (Dataverse, SQL). Once warm in Auto mode,
        Run and Collect metadata serve rows from the cache and skip refetching that source entirely.
        The cache lives on the server and survives reloads; use Clear (or Always refresh) to pick up new data.
      </div>
    </div>
  );
}

function Label({ children }) {
  return <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1.5 font-semibold">{children}</div>;
}
function Hint({ children }) {
  return <span className="ml-1 text-slate-600 normal-case font-normal text-[10px]">{children}</span>;
}
