import React, { useEffect } from 'react';
import { Archive } from 'lucide-react';
import NodeShell from '../components/NodeShell';
import { usePipelineStore } from '../store/usePipelineStore';
import { fetchCacheStatus } from '../lib/api';

const MODE_LABEL = { auto: 'auto', refresh: 'always refresh', bypass: 'bypass' };

export function cacheAge(cachedAt) {
  const mins = Math.round((Date.now() - cachedAt) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function CacheNode({ id, selected }) {
  const { nodes, nodeStatus, updateNodeData } = usePipelineStore();
  const node = nodes.find((n) => n.id === id);
  const cfg = node?.data?.config || {};
  const meta = nodeStatus[id]?.meta;
  const cache = node?.data?._cache;

  // Know warm/cold on load, and refresh after any run that touched the cache.
  useEffect(() => {
    let stale = false;
    fetchCacheStatus(cfg.cacheKey || id)
      .then((info) => { if (!stale) updateNodeData(id, { _cache: info }); })
      .catch(() => {});
    return () => { stale = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, cfg.cacheKey, meta?.cachedAt]);

  const warm = cache?.exists;

  return (
    <NodeShell
      id={id}
      selected={selected}
      category="transform"
      icon={Archive}
      typeLabel="Cache"
    >
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${warm ? 'bg-emerald-400' : 'bg-slate-600'}`} />
        {warm ? (
          <span className="text-slate-300">
            Warm · <span className="text-emerald-400">{cache.rowCount?.toLocaleString()} rows</span>
            <span className="text-slate-500"> · {cacheAge(cache.cachedAt)}</span>
          </span>
        ) : (
          <span className="text-slate-500">Cold — fills on next run</span>
        )}
      </div>
      <div className="text-[10px] text-slate-500 mt-1">
        mode: {MODE_LABEL[cfg.mode || 'auto']}
        {warm && (cfg.mode || 'auto') === 'auto' && (
          <span className="text-sky-400/80"> · sources upstream may skip fetching</span>
        )}
      </div>
      {meta?.fromCache && (
        <div className="text-[10px] text-emerald-400/80 mt-1">last run served from cache</div>
      )}
      {meta?.cached && (
        <div className="text-[10px] text-sky-400/80 mt-1">last run wrote {meta.rowCount?.toLocaleString()} rows to cache</div>
      )}
    </NodeShell>
  );
}
