import React from 'react';
import { TableProperties } from 'lucide-react';
import NodeShell from '../components/NodeShell';
import { usePipelineStore } from '../store/usePipelineStore';

const TYPE_STYLES = {
  text:    'bg-slate-700 text-slate-300',
  number:  'bg-sky-900/60 text-sky-300',
  boolean: 'bg-violet-900/60 text-violet-300',
  date:    'bg-amber-900/60 text-amber-300',
  empty:   'bg-slate-800 text-slate-500',
};

export default function PreviewColumnsNode({ id, selected }) {
  const { nodeStatus } = usePipelineStore();
  const status = nodeStatus[id];
  const schema = status?.meta?.schema || [];
  const rowCount = status?.meta?.rowCount ?? null;

  return (
    <NodeShell
      id={id}
      selected={selected}
      category="transform"
      icon={TableProperties}
      typeLabel="Schema"
      widthClass="w-72"
    >
      {!schema.length ? (
        <div className="text-slate-400 text-[11px]">Run pipeline to inspect schema</div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px] text-slate-500 mb-2">
            <span>{schema.length} column{schema.length !== 1 ? 's' : ''}</span>
            {rowCount !== null && <span>{rowCount.toLocaleString()} rows</span>}
          </div>
          <div
            className="space-y-1 max-h-64 overflow-y-auto pr-0.5"
          >
            {schema.map((col) => (
              <div key={col.name} className="flex items-center gap-2">
                <span className="flex-1 text-[11px] text-slate-200 truncate font-mono" title={col.name}>
                  {col.name}
                </span>
                <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${TYPE_STYLES[col.type] || TYPE_STYLES.text}`}>
                  {col.type}
                </span>
                {col.nullCount > 0 && (
                  <span className="text-[9px] text-slate-600 shrink-0" title={`${col.nullCount} null/empty values`}>
                    {col.nullCount}∅
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </NodeShell>
  );
}
