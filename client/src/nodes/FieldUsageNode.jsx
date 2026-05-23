import React, { useState, useMemo } from 'react';
import { BarChart2, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import NodeShell from '../components/NodeShell';
import { usePipelineStore } from '../store/usePipelineStore';

const TYPE_COLORS = {
  text:    'text-slate-400',
  number:  'text-sky-400',
  boolean: 'text-violet-400',
  date:    'text-amber-400',
  empty:   'text-slate-600',
};

const TYPE_ORDER = { number: 0, date: 1, boolean: 2, text: 3, empty: 4 };

function SortHeader({ label, col, sort, onSort, className = '' }) {
  const active = sort.col === col;
  const Icon = active ? (sort.dir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <button
      onClick={() => onSort(col)}
      className={`flex items-center gap-0.5 text-[9px] uppercase tracking-wider font-semibold transition
        ${active ? 'text-sky-400' : 'text-slate-600 hover:text-slate-400'} ${className}`}
    >
      {label}<Icon size={9} />
    </button>
  );
}

export default function FieldUsageNode({ id, selected }) {
  const { nodeStatus } = usePipelineStore();
  const status   = nodeStatus[id];
  const stats    = status?.meta?.fieldStats || [];
  const rowCount = status?.meta?.rowCount ?? null;

  const [sort, setSort] = useState({ col: 'fill', dir: 'desc' });

  const onSort = (col) => {
    setSort((s) => s.col === col
      ? { col, dir: s.dir === 'desc' ? 'asc' : 'desc' }
      : { col, dir: col === 'name' ? 'asc' : 'desc' }   // sensible defaults per column
    );
  };

  const sorted = useMemo(() => {
    if (!stats.length) return stats;
    const rows = stats.map((f) => ({
      ...f,
      fillPct: rowCount ? Math.round(((rowCount - f.nullCount) / rowCount) * 100) : 0,
    }));
    const mul = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (sort.col) {
        case 'name':   return mul * a.name.localeCompare(b.name);
        case 'fill':   return mul * (a.fillPct - b.fillPct);
        case 'unique': return mul * ((a.uniqueCount ?? 0) - (b.uniqueCount ?? 0));
        case 'type':   return mul * ((TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9));
        default: return 0;
      }
    });
  }, [stats, sort, rowCount]);

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
          <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
            <span>{stats.length} field{stats.length !== 1 ? 's' : ''}</span>
            {rowCount !== null && <span>{rowCount.toLocaleString()} rows</span>}
          </div>

          {/* Sortable column headers */}
          <div className="grid grid-cols-[1fr_52px_44px_44px] gap-x-2 px-1 pb-1 border-b border-slate-700/60">
            <SortHeader label="Field"  col="name"   sort={sort} onSort={onSort} />
            <SortHeader label="Fill%"  col="fill"   sort={sort} onSort={onSort} className="justify-end" />
            <SortHeader label="Uniq"   col="unique" sort={sort} onSort={onSort} className="justify-end" />
            <SortHeader label="Type"   col="type"   sort={sort} onSort={onSort} />
          </div>

          <div
            className="space-y-0.5 max-h-72 overflow-y-auto pr-0.5"
          >
            {sorted.map((f) => {
              const fillColor = f.fillPct >= 90 ? 'bg-emerald-500' : f.fillPct >= 50 ? 'bg-amber-500' : 'bg-rose-500';
              return (
                <div key={f.name} className="group">
                  <div className="grid grid-cols-[1fr_52px_44px_44px] gap-x-2 items-center px-1 py-0.5 rounded hover:bg-slate-800/60">
                    <span className="text-[11px] text-slate-200 truncate font-mono" title={f.name}>{f.name}</span>
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-[10px] text-slate-300">{f.fillPct}%</span>
                      <div className="w-full h-1 rounded-full bg-slate-700">
                        <div className={`h-1 rounded-full ${fillColor}`} style={{ width: `${f.fillPct}%` }} />
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-400 text-right">{f.uniqueCount?.toLocaleString() ?? '—'}</span>
                    <span className={`text-[9px] font-semibold uppercase tracking-wider ${TYPE_COLORS[f.type] || TYPE_COLORS.text}`}>
                      {f.type}
                    </span>
                  </div>
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
