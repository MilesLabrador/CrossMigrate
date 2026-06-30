import React from 'react';
import { Filter as FilterIcon } from 'lucide-react';
import NodeShell from '../components/NodeShell';
import { usePipelineStore } from '../store/usePipelineStore';

const STAT_LABELS = {
  fill_pct:     'Fill %',
  unique_count: 'Unique',
  null_count:   'Nulls',
  type:         'Type',
  name:         'Name',
};

export default function FilterNode({ id, selected }) {
  const { nodes, nodeStatus } = usePipelineStore();
  const node = nodes.find((n) => n.id === id);
  const cfg = node?.data?.config || {};
  const conditions = cfg.conditions || [];
  const status = nodeStatus[id];

  return (
    <NodeShell
      id={id}
      selected={selected}
      category="transform"
      icon={FilterIcon}
      typeLabel="Filter"
    >
      {conditions.length === 0 ? (
        <div className="text-slate-400">Click to add conditions →</div>
      ) : (
        <div className="space-y-1">
          {conditions.map((c, i) => {
            const isField = c.scope === 'field';
            const subject = isField ? STAT_LABELS[c.stat] || c.stat : c.field || '—';
            return (
              <div key={i} className="text-slate-300">
                {isField && <span className="text-[9px] mr-1 px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-300 uppercase tracking-wider">field</span>}
                <span className={isField ? 'text-emerald-400' : 'text-sky-400'}>{subject}</span>{' '}
                <span className="text-slate-500">{c.op?.replace(/_/g, ' ')}</span>{' '}
                {!['is_empty', 'is_not_empty'].includes(c.op) && (
                  <span className="text-emerald-400">"{c.value ?? ''}"{isField && c.stat === 'fill_pct' ? '%' : ''}</span>
                )}
                {i < conditions.length - 1 && (
                  <span className="text-slate-500 ml-1 font-bold">{cfg.combinator || 'AND'}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
      {status?.meta && (
        <div className="text-[10px] text-slate-500 mt-2 pt-2 border-t border-slate-800">
          {status.meta.rowCount} of {status.meta.matchedOf} rows match
        </div>
      )}
    </NodeShell>
  );
}
