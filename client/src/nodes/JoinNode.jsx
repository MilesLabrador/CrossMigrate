import React from 'react';
import { Merge } from 'lucide-react';
import NodeShell from '../components/NodeShell';
import { usePipelineStore } from '../store/usePipelineStore';

export default function JoinNode({ id, selected }) {
  const { nodes, nodeStatus } = usePipelineStore();
  const node = nodes.find((n) => n.id === id);
  const cfg = node?.data?.config || {};
  const meta = nodeStatus[id]?.meta;

  const configured = cfg.leftColumn && cfg.rightColumn;
  const matched   = meta?.matched;
  const unmatched = meta?.unmatched;
  const total     = (matched ?? 0) + (unmatched ?? 0);
  const pct       = total ? Math.round((matched / total) * 100) : 0;

  return (
    <NodeShell
      id={id}
      selected={selected}
      category="transform"
      icon={Merge}
      typeLabel="Join"
      targetHandles={[
        { id: 'left',  top: '38%', title: 'Left input — rows to keep & enrich' },
        { id: 'right', top: '72%', title: 'Right input — table to join in', className: 'handle-join' },
      ]}
    >
      {configured ? (
        <div className="text-slate-300">
          Join on <span className="text-sky-400">{cfg.leftColumn}</span>
          {' = '}
          <span className="text-amber-400">{cfg.rightColumn}</span>
        </div>
      ) : (
        <div className="text-slate-500 italic">
          Connect left input (top) + right input (bottom), then pick join keys
        </div>
      )}
      {configured && (
        <div className="text-slate-400 mt-1">
          <span className="text-slate-200">{cfg.joinType === 'inner' ? 'Inner' : 'Left'} join</span>
          {' · '}
          {cfg.pullColumns?.length
            ? <span>{cfg.pullColumns.length} column{cfg.pullColumns.length > 1 ? 's' : ''} in</span>
            : <span className="text-slate-500">all columns in</span>}
        </div>
      )}

      {/* Match-rate visualization after a run */}
      {matched != null && (
        <div className="mt-2 pt-2 border-t border-slate-800">
          <div className="flex justify-between text-[10px] mb-1">
            <span className="text-emerald-400">{matched.toLocaleString()} joined</span>
            <span className={unmatched ? 'text-rose-400' : 'text-slate-500'}>
              {unmatched.toLocaleString()} unjoined
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-rose-500/40 overflow-hidden">
            <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            {pct}% joined · right table {meta.rightRows?.toLocaleString()} rows
            {meta.duplicateKeys > 0 && (
              <span className="text-amber-400/80"> · {meta.duplicateKeys} dup keys</span>
            )}
          </div>
        </div>
      )}
    </NodeShell>
  );
}
