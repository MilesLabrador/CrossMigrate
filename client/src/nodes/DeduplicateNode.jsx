import React from 'react';
import { CopyMinus } from 'lucide-react';
import NodeShell from '../components/NodeShell';
import { usePipelineStore } from '../store/usePipelineStore';

export default function DeduplicateNode({ id, selected }) {
  const { nodes, nodeStatus } = usePipelineStore();
  const node = nodes.find((n) => n.id === id);
  const cfg = node?.data?.config || {};
  const status = nodeStatus[id];
  return (
    <NodeShell
      id={id}
      selected={selected}
      category="transform"
      icon={CopyMinus}
      typeLabel="Dedup"
    >
      <div className="text-slate-300">
        Fields:{' '}
        {cfg.fields?.length ? (
          <span className="text-sky-400">{cfg.fields.join(', ')}</span>
        ) : (
          <span className="text-slate-500 italic">none</span>
        )}
      </div>
      <div className="text-slate-300">
        Keep: <span className="text-emerald-400">{cfg.strategy || 'first'}</span>
      </div>
      {status?.meta?.duplicatesRemoved != null && (
        <div className="text-[10px] text-slate-500 mt-2 pt-2 border-t border-slate-800">
          {status.meta.duplicatesRemoved} duplicates removed
        </div>
      )}
    </NodeShell>
  );
}
