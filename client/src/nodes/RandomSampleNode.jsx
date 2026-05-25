import React from 'react';
import { Shuffle } from 'lucide-react';
import NodeShell from '../components/NodeShell';
import { usePipelineStore } from '../store/usePipelineStore';

export default function RandomSampleNode({ id, selected }) {
  const { nodes, nodeStatus } = usePipelineStore();
  const node = nodes.find((n) => n.id === id);
  const cfg = node?.data?.config || {};
  const status = nodeStatus[id];
  const size = cfg.size || 100;

  return (
    <NodeShell id={id} selected={selected} category="transform" icon={Shuffle} typeLabel="Sample">
      <div className="space-y-1">
        <div className="text-slate-300 text-xs">
          {status?.meta?.sampledFrom != null ? (
            <span>
              <span className="text-emerald-400 font-medium">{status.meta.rowCount.toLocaleString()}</span>
              <span className="text-slate-500"> of {status.meta.sampledFrom.toLocaleString()} rows</span>
            </span>
          ) : (
            <span className="text-slate-500">
              Sample {size.toLocaleString()} random rows{cfg.withReplacement ? ' (w/ replacement)' : ''}
            </span>
          )}
        </div>
        {status?.meta?.note && (
          <div className="text-[10px] text-amber-400">{status.meta.note}</div>
        )}
      </div>
    </NodeShell>
  );
}
