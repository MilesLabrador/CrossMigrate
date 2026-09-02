import React from 'react';
import { Binary } from 'lucide-react';
import NodeShell from '../components/NodeShell';
import { usePipelineStore } from '../store/usePipelineStore';

export default function ConvertTypesNode({ id, selected }) {
  const { nodes, nodeStatus } = usePipelineStore();
  const node = nodes.find((n) => n.id === id);
  const conversions = (node?.data?.config?.conversions || []).filter((c) => c.field && c.type);
  const meta = nodeStatus[id]?.meta;

  return (
    <NodeShell
      id={id}
      selected={selected}
      category="transform"
      icon={Binary}
      typeLabel="Convert"
      sourceHandles={[
        { id: 'out',    top: '38%', title: 'Converted rows' },
        { id: 'errors', top: '72%', title: 'Error output — rows whose values could not be converted (error rule: send to error output)', className: 'handle-errors' },
      ]}
    >
      {conversions.length ? (
        <div className="space-y-0.5">
          {conversions.slice(0, 4).map((c, i) => (
            <div key={i} className="text-slate-300 truncate">
              <span className="text-sky-400">{c.field}</span>
              <span className="text-slate-500"> → </span>
              <span className="text-emerald-400">{c.type}</span>
              {c.onError === 'redirect' && <span className="text-rose-400/70 text-[10px]"> ⤷ err</span>}
              {c.onError === 'null' && <span className="text-slate-500 text-[10px]"> ∅ on fail</span>}
            </div>
          ))}
          {conversions.length > 4 && (
            <div className="text-slate-500 text-[10px]">+{conversions.length - 4} more</div>
          )}
        </div>
      ) : (
        <div className="text-slate-500 italic">Pick fields and target types</div>
      )}

      {meta && (meta.nulled > 0 || meta.diverted > 0) && (
        <div className="mt-2 pt-2 border-t border-slate-800 flex gap-3 text-[10px]">
          {meta.nulled > 0 && <span className="text-amber-400">{meta.nulled} nulled</span>}
          {meta.diverted > 0 && <span className="text-rose-400">{meta.diverted} → errors</span>}
        </div>
      )}
    </NodeShell>
  );
}
