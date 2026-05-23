import React from 'react';
import { Columns2 } from 'lucide-react';
import NodeShell from '../components/NodeShell';
import { usePipelineStore } from '../store/usePipelineStore';

export default function SelectColumnsNode({ id, selected }) {
  const { nodes } = usePipelineStore();
  const node = nodes.find((n) => n.id === id);
  const cols = node?.data?.config?.columns || [];

  return (
    <NodeShell
      id={id}
      selected={selected}
      category="transform"
      icon={Columns2}
      typeLabel="Select Cols"
    >
      {cols.length === 0 ? (
        <div className="text-slate-500 italic">No columns selected</div>
      ) : cols.length <= 4 ? (
        <div className="flex flex-wrap gap-1">
          {cols.map((c) => (
            <span key={c} className="bg-slate-700/80 text-sky-300 text-[10px] px-1.5 py-0.5 rounded">
              {c}
            </span>
          ))}
        </div>
      ) : (
        <div className="text-slate-300">
          <span className="text-sky-400">{cols.length}</span> columns kept
        </div>
      )}
    </NodeShell>
  );
}
