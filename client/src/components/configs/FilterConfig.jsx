import React from 'react';
import { Plus, X } from 'lucide-react';
import { usePipelineStore, getUpstreamColumns } from '../../store/usePipelineStore';

const OPS = [
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'greater_than',
  'less_than',
  'is_empty',
  'is_not_empty',
];

export default function FilterConfig({ nodeId }) {
  const state = usePipelineStore();
  const node = state.nodes.find((n) => n.id === nodeId);
  const cfg = node?.data?.config || {};
  const conditions = cfg.conditions || [];
  const cols = getUpstreamColumns(nodeId, state);

  const setCondition = (i, patch) =>
    state.updateNodeConfig(nodeId, {
      conditions: conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c)),
    });

  const add = () =>
    state.updateNodeConfig(nodeId, {
      conditions: [...conditions, { field: cols[0] || '', op: 'equals', value: '' }],
    });

  const remove = (i) =>
    state.updateNodeConfig(nodeId, { conditions: conditions.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-4">
      <div>
        <Label>Combine with</Label>
        <div className="flex gap-2">
          {['AND', 'OR'].map((c) => (
            <button
              key={c}
              onClick={() => state.updateNodeConfig(nodeId, { combinator: c })}
              className={`px-3 py-1 rounded text-xs ${
                (cfg.combinator || 'AND') === c
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                  : 'bg-slate-800 text-slate-300 border border-slate-700'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="mb-0">Conditions</Label>
          <button onClick={add} className="text-[11px] flex items-center gap-1 text-sky-400 hover:underline">
            <Plus size={11} /> Add condition
          </button>
        </div>
        {conditions.length === 0 && (
          <div className="text-xs text-slate-500 italic py-3 text-center">No conditions yet.</div>
        )}
        <div className="space-y-2">
          {conditions.map((c, i) => (
            <div key={i} className="space-y-1.5 bg-cardalt rounded p-2 border border-slate-700/60">
              <div className="flex gap-1.5">
                <select
                  value={c.field || ''}
                  onChange={(e) => setCondition(i, { field: e.target.value })}
                  className="flex-1 bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-xs text-slate-200 min-w-0"
                >
                  <option value="">— field —</option>
                  {cols.map((col) => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
                <select
                  value={c.op}
                  onChange={(e) => setCondition(i, { op: e.target.value })}
                  className="bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-xs text-slate-200"
                >
                  {OPS.map((o) => (
                    <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>
                  ))}
                </select>
                <button onClick={() => remove(i)} className="text-slate-500 hover:text-rose-400">
                  <X size={14} />
                </button>
              </div>
              {!['is_empty', 'is_not_empty'].includes(c.op) && (
                <input
                  placeholder="value"
                  value={c.value ?? ''}
                  onChange={(e) => setCondition(i, { value: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Label({ children, className = '' }) {
  return <div className={`text-[11px] uppercase tracking-wider text-slate-400 mb-1.5 font-semibold ${className}`}>{children}</div>;
}
