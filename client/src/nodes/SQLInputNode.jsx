import React from 'react';
import { Database } from 'lucide-react';
import NodeShell from '../components/NodeShell';
import { usePipelineStore } from '../store/usePipelineStore';

export default function SQLInputNode({ id, selected }) {
  const { nodes } = usePipelineStore();
  const node = nodes.find((n) => n.id === id);
  const cfg = node?.data?.config || {};
  const rows = node?.data?.rows || [];
  const columns = node?.data?.columns || [];
  const connected = rows.length > 0;

  return (
    <NodeShell id={id} selected={selected} category="source" icon={Database} typeLabel="SQL">
      {connected ? (
        <div className="space-y-1">
          <div className="text-slate-300 font-medium truncate">{cfg.table}</div>
          <div className="text-slate-400">
            {rows.length} rows &bull; {columns.length} cols
          </div>
          <div className="text-[10px] text-slate-500 truncate">{columns.join(', ')}</div>
        </div>
      ) : (
        <div className="text-slate-500 text-xs text-center py-2">
          {node?.data?._error ? (
            <span className="text-rose-400">{node.data._error}</span>
          ) : node?.data?._loading ? (
            <span className="text-sky-400">Loading…</span>
          ) : (
            'Open config panel to connect'
          )}
        </div>
      )}
    </NodeShell>
  );
}
