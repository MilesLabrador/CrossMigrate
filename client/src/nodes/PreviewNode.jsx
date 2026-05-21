import React from 'react';
import { Eye } from 'lucide-react';
import NodeShell from '../components/NodeShell';
import { usePipelineStore } from '../store/usePipelineStore';

export default function PreviewNode({ id, selected }) {
  const { nodeStatus } = usePipelineStore();
  const status = nodeStatus[id];
  const sample = status?.sample || [];
  const cols = sample[0] ? Object.keys(sample[0]) : [];
  return (
    <NodeShell id={id} selected={selected} category="destination" icon={Eye} typeLabel="Preview">
      {!sample.length ? (
        <div className="text-slate-400">Run pipeline to see rows here</div>
      ) : (
        <div className="overflow-x-auto max-w-[340px]">
          <table className="text-[10px]">
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c} className="text-left text-slate-400 pr-2">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sample.slice(0, 3).map((r, i) => (
                <tr key={i}>
                  {cols.map((c) => (
                    <td key={c} className="pr-2 text-slate-300 truncate max-w-[80px]">
                      {String(r[c] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="text-[10px] text-slate-500 mt-2">Click for full table view →</div>
    </NodeShell>
  );
}
