import React from 'react';
import { Wand2 } from 'lucide-react';
import NodeShell from '../components/NodeShell';
import { usePipelineStore } from '../store/usePipelineStore';

export default function TransformNode({ id, selected }) {
  const { nodes } = usePipelineStore();
  const node = nodes.find((n) => n.id === id);
  const transforms = node?.data?.config?.fieldTransforms || [];

  return (
    <NodeShell id={id} selected={selected} category="transform" icon={Wand2} typeLabel="Transform">
      {transforms.length === 0 ? (
        <div className="text-slate-400">Click to add transforms →</div>
      ) : (
        <div className="space-y-1">
          {transforms.slice(0, 5).map((t, i) => (
            <div key={i} className="text-slate-300">
              <span className="text-sky-400">{t.field}</span>{' '}
              <span className="text-slate-500">·</span>{' '}
              <span className="text-emerald-400">{t.type}</span>
            </div>
          ))}
          {transforms.length > 5 && (
            <div className="text-[10px] text-slate-500">+{transforms.length - 5} more…</div>
          )}
        </div>
      )}
    </NodeShell>
  );
}
