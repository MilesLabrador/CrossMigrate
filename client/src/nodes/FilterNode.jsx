import React from 'react';
import { Filter as FilterIcon } from 'lucide-react';
import NodeShell from '../components/NodeShell';
import { usePipelineStore } from '../store/usePipelineStore';

export default function FilterNode({ id, selected }) {
  const { nodes, nodeStatus } = usePipelineStore();
  const node = nodes.find((n) => n.id === id);
  const cfg = node?.data?.config || {};
  const conditions = cfg.conditions || [];
  const status = nodeStatus[id];

  return (
    <NodeShell
      id={id}
      selected={selected}
      category="transform"
      icon={FilterIcon}
      typeLabel="Filter"
    >
      {conditions.length === 0 ? (
        <div className="text-slate-400">Click to add conditions →</div>
      ) : (
        <div className="space-y-1">
          {conditions.map((c, i) => (
            <div key={i} className="text-slate-300">
              <span className="text-sky-400">{c.field || '—'}</span>{' '}
              <span className="text-slate-500">{c.op}</span>{' '}
              <span className="text-emerald-400">"{c.value ?? ''}"</span>
              {i < conditions.length - 1 && (
                <span className="text-slate-500 ml-1 font-bold">{cfg.combinator || 'AND'}</span>
              )}
            </div>
          ))}
        </div>
      )}
      {status?.meta && (
        <div className="text-[10px] text-slate-500 mt-2 pt-2 border-t border-slate-800">
          {status.meta.rowCount} of {status.meta.matchedOf} rows match
        </div>
      )}
    </NodeShell>
  );
}
