import React from 'react';
import { ArrowLeftRight } from 'lucide-react';
import NodeShell from '../components/NodeShell';
import { usePipelineStore } from '../store/usePipelineStore';

export default function SelectMapNode({ id, selected }) {
  const { nodes, nodeStatus } = usePipelineStore();
  const node = nodes.find((n) => n.id === id);
  const mappings = node?.data?.config?.mappings || [];
  const status = nodeStatus[id];

  return (
    <NodeShell
      id={id}
      selected={selected}
      category="transform"
      icon={ArrowLeftRight}
      typeLabel="Select / Map"
    >
      {mappings.length === 0 ? (
        <div className="text-slate-400">Click to map fields →</div>
      ) : (
        <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
          {mappings.slice(0, 6).map((m, i) => (
            <div
              key={i}
              className={`flex items-center gap-1.5 ${m.skip ? 'opacity-40' : ''}`}
            >
              <span className="text-slate-300 truncate max-w-[100px]">{m.source}</span>
              <span className="text-slate-500">→</span>
              <span className="text-emerald-400 truncate max-w-[100px]">
                {m.target || <span className="text-slate-500 italic">—</span>}
              </span>
            </div>
          ))}
          {mappings.length > 6 && (
            <div className="text-[10px] text-slate-500">+{mappings.length - 6} more…</div>
          )}
        </div>
      )}
      {status?.meta?.rowCount != null && (
        <div className="text-[10px] text-slate-500 mt-2 pt-2 border-t border-slate-800">
          {status.meta.rowCount} rows produced
        </div>
      )}
    </NodeShell>
  );
}
