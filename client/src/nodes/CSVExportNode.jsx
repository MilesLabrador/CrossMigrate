import React from 'react';
import { Download } from 'lucide-react';
import NodeShell from '../components/NodeShell';
import { usePipelineStore } from '../store/usePipelineStore';

export default function CSVExportNode({ id, selected }) {
  const { nodes } = usePipelineStore();
  const node = nodes.find((n) => n.id === id);
  const cfg = node?.data?.config || {};
  return (
    <NodeShell
      id={id}
      selected={selected}
      category="destination"
      icon={Download}
      typeLabel="CSV Export"
    >
      <div className="text-slate-300">
        File: <span className="text-emerald-400">{cfg.filename || 'export.csv'}</span>
      </div>
      <div className="text-slate-300">
        Delimiter: <span className="text-emerald-400">"{cfg.delimiter || ','}"</span>
      </div>
      <div className="text-[10px] text-slate-500 mt-2">Click for download →</div>
    </NodeShell>
  );
}
