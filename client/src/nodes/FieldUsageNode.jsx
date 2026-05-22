import React from 'react';
import { BarChart2 } from 'lucide-react';
import NodeShell from '../components/NodeShell';
import { usePipelineStore } from '../store/usePipelineStore';

const TYPE_COLORS = {
  text:    'text-slate-400',
  number:  'text-sky-400',
  boolean: 'text-violet-400',
  date:    'text-amber-400',
  empty:   'text-slate-600',
};

export default function FieldUsageNode({ id, selected }) {
  const { nodeStatus } = usePipelineStore();
  const status = nodeStatus[id];
  const stats = status?.meta?.fieldStats || [];
  const rowCount = status?.meta?.rowCount ?? null;

  return (
    <NodeShell
      id={id}
      selected={selected}
      category="transform"
      icon={BarChart2}
      typeLabel="Field Usage"
      widthClass="w-80"
    >
      {!stats.length ? (
        <div className="text-slate-400 text-[11px]">Run pipeline to see field stats</div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px] text-slate-500 mb-2">
            <span>{stats.length} field{stats.length !== 1 ? 's' : ''}</span>
            {rowCount !== null && <span>{rowCount.toLocaleString()} rows</span>}
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-[1fr_44px_44px_44px] gap-x-2 px-1 pb-1 border-b border-slate-700/60">
            <span className="text-[9px] uppercase tracking-wider text-slate-600 font-semibold">Field</span>
            <span className="text-[9px] uppercase tracking-wider text-slate-600 font-semibold text-right">Fill%</span>
            <span className="text-[9px] uppercase tracking-wider text-slate-600 font-semibold text-right">Uniq</span>
            <span className="text-[9px] uppercase tracking-wider text-slate-600 font-semibold">Type</span>
          </div>

          <div
            className="space-y-0.5 max-h-72 overflow-y-auto pr-0.5"
            onWheelCapture={(e) => e.stopPropagation()}
          >
            {stats.map((f) => {
              const fillPct = rowCount ? Math.round(((rowCount - f.nullCount) / rowCount) * 100) : 0;
              const fillColor = fillPct >= 90 ? 'bg-emerald-500' : fillPct >= 50 ? 'bg-amber-500' : 'bg-rose-500';
              return (
                <div key={f.name} className="group">
                  <div className="grid grid-cols-[1fr_44px_44px_44px] gap-x-2 items-center px-1 py-0.5 rounded hover:bg-slate-800/60">
                    <span className="text-[11px] text-slate-200 truncate font-mono" title={f.name}>{f.name}</span>
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-[10px] text-slate-300">{fillPct}%</span>
                      <div className="w-full h-1 rounded-full bg-slate-700">
                        <div className={`h-1 rounded-full ${fillColor}`} style={{ width: `${fillPct}%` }} />
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-400 text-right">{f.uniqueCount?.toLocaleString() ?? '—'}</span>
                    <span className={`text-[9px] font-semibold uppercase tracking-wider ${TYPE_COLORS[f.type] || TYPE_COLORS.text}`}>
                      {f.type}
                    </span>
                  </div>
                  {/* Sample values — shown on hover */}
                  {f.samples?.length > 0 && (
                    <div className="hidden group-hover:flex flex-wrap gap-1 px-2 pb-1">
                      {f.samples.map((s, i) => (
                        <span key={i} className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded truncate max-w-[80px]" title={String(s)}>
                          {String(s)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </NodeShell>
  );
}
