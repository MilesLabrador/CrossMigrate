import React from 'react';
import { SearchCheck } from 'lucide-react';
import NodeShell from '../components/NodeShell';
import { usePipelineStore } from '../store/usePipelineStore';

const NO_MATCH_LABEL = {
  keep: 'keep original',
  null: 'null',
  default: 'default value',
  redirect: '⤷ errors',
};

export default function LookupNode({ id, selected }) {
  const { nodes, nodeStatus } = usePipelineStore();
  const node = nodes.find((n) => n.id === id);
  const cfg = node?.data?.config || {};
  const meta = nodeStatus[id]?.meta;
  const fromCache = (cfg.mappingSource || 'inline') === 'cache';
  const inlineCount = (cfg.mappings || []).filter((m) => m.from !== '' && m.from != null).length;
  // A cache-backed lookup doesn't know its table size until a run reports it.
  const mappingCount = fromCache ? meta?.mappingCount : inlineCount;
  const configured = cfg.lookupColumn && (fromCache ? !!cfg.cacheKey : inlineCount > 0);

  const matched = meta?.matched;
  const unmatched = meta?.unmatched;
  const total = (matched ?? 0) + (unmatched ?? 0);
  const pct = total ? Math.round((matched / total) * 100) : 0;

  return (
    <NodeShell
      id={id}
      selected={selected}
      category="transform"
      icon={SearchCheck}
      typeLabel="Lookup"
      sourceHandles={[
        { id: 'out',    top: '38%', title: 'Rows with mapped values' },
        { id: 'errors', top: '72%', title: 'Error output — unmatched rows (no match: send to error output)', className: 'handle-errors' },
      ]}
    >
      {configured ? (
        <div className="text-slate-300">
          Map <span className="text-sky-400">{cfg.lookupColumn}</span>
          {cfg.targetColumn && cfg.targetColumn !== cfg.lookupColumn && (
            <> → <span className="text-emerald-400">{cfg.targetColumn}</span></>
          )}
          {mappingCount != null && (
            <span className="text-slate-500"> · {mappingCount.toLocaleString()} value{mappingCount === 1 ? '' : 's'}</span>
          )}
          {fromCache && (
            <div className="text-slate-500 text-[10px] mt-0.5">
              from cache <span className="text-violet-400">{cfg.cacheKey}</span>
              {meta?.cacheKeyColumn && (
                <span className="text-slate-600"> · {meta.cacheKeyColumn} → {meta.cacheValueColumn}</span>
              )}
            </div>
          )}
          <div className="text-slate-500 text-[10px] mt-0.5">
            no match: {NO_MATCH_LABEL[cfg.noMatch || 'keep']}
          </div>
        </div>
      ) : (
        <div className="text-slate-500 italic">
          {fromCache ? 'Pick a column and a lookup cache' : 'Pick a column and add value mappings'}
        </div>
      )}

      {matched != null && (
        <div className="mt-2 pt-2 border-t border-slate-800">
          <div className="flex justify-between text-[10px] mb-1">
            <span className="text-emerald-400">{matched.toLocaleString()} mapped</span>
            <span className={unmatched ? 'text-amber-400' : 'text-slate-500'}>
              {unmatched.toLocaleString()} unmatched
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-amber-500/40 overflow-hidden">
            <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
    </NodeShell>
  );
}
