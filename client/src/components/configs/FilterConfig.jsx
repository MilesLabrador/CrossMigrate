import React from 'react';
import { Plus, X } from 'lucide-react';
import { usePipelineStore, getUpstreamColumns } from '../../store/usePipelineStore';
import ColumnDropdown from '../ColumnDropdown';

const ROW_OPS = [
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

const FIELD_STATS = [
  { key: 'fill_pct',     label: 'Fill %',       kind: 'number' },
  { key: 'unique_count', label: 'Unique count', kind: 'number' },
  { key: 'null_count',   label: 'Null count',   kind: 'number' },
  { key: 'type',         label: 'Type',         kind: 'enum',   options: ['text', 'number', 'boolean', 'date', 'empty'] },
  { key: 'name',         label: 'Field name',   kind: 'text' },
];

const FIELD_OPS_NUMBER = ['greater_than', 'less_than', 'greater_equal', 'less_equal', 'equals', 'not_equals'];
const FIELD_OPS_TEXT   = ['equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'ends_with'];
const FIELD_OPS_ENUM   = ['equals', 'not_equals'];

function fieldOpsFor(stat) {
  const meta = FIELD_STATS.find((s) => s.key === stat);
  if (!meta) return FIELD_OPS_NUMBER;
  if (meta.kind === 'number') return FIELD_OPS_NUMBER;
  if (meta.kind === 'enum') return FIELD_OPS_ENUM;
  return FIELD_OPS_TEXT;
}

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

  const add = (scope = 'row') =>
    state.updateNodeConfig(nodeId, {
      conditions: [
        ...conditions,
        scope === 'field'
          ? { scope: 'field', stat: 'fill_pct', op: 'greater_than', value: '90' }
          : { scope: 'row', field: cols[0] || '', op: 'equals', value: '' },
      ],
    });

  const remove = (i) =>
    state.updateNodeConfig(nodeId, { conditions: conditions.filter((_, idx) => idx !== i) });

  const setScope = (i, scope) =>
    state.updateNodeConfig(nodeId, {
      conditions: conditions.map((c, idx) => {
        if (idx !== i) return c;
        return scope === 'field'
          ? { scope: 'field', stat: 'fill_pct', op: 'greater_than', value: '90' }
          : { scope: 'row', field: cols[0] || '', op: 'equals', value: '' };
      }),
    });

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
          <div className="flex items-center gap-2">
            <button onClick={() => add('row')} className="text-[11px] flex items-center gap-1 text-sky-400 hover:underline">
              <Plus size={11} /> Row
            </button>
            <button onClick={() => add('field')} className="text-[11px] flex items-center gap-1 text-emerald-400 hover:underline">
              <Plus size={11} /> Field stat
            </button>
          </div>
        </div>

        {conditions.length === 0 && (
          <div className="text-xs text-slate-500 italic py-3 text-center">No conditions yet.</div>
        )}

        <div className="space-y-2">
          {conditions.map((c, i) => {
            const isField = c.scope === 'field';
            const statMeta = isField ? FIELD_STATS.find((s) => s.key === c.stat) : null;
            const ops = isField ? fieldOpsFor(c.stat) : ROW_OPS;
            return (
              <div
                key={i}
                className={`space-y-1.5 rounded p-2 border ${
                  isField ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-cardalt border-slate-700/60'
                }`}
              >
                {/* Scope toggle + remove */}
                <div className="flex gap-1.5 items-center">
                  <div className="flex rounded overflow-hidden border border-slate-700 text-[10px]">
                    <button
                      onClick={() => setScope(i, 'row')}
                      className={`px-2 py-0.5 ${!isField ? 'bg-sky-500/20 text-sky-300' : 'bg-slate-800 text-slate-400'}`}
                    >
                      Row
                    </button>
                    <button
                      onClick={() => setScope(i, 'field')}
                      className={`px-2 py-0.5 ${isField ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}
                    >
                      Field
                    </button>
                  </div>
                  <div className="flex-1" />
                  <button onClick={() => remove(i)} className="text-slate-500 hover:text-rose-400 shrink-0">
                    <X size={14} />
                  </button>
                </div>

                {/* Subject: column for row, stat for field */}
                {isField ? (
                  <select
                    value={c.stat || 'fill_pct'}
                    onChange={(e) => {
                      const stat = e.target.value;
                      const validOps = fieldOpsFor(stat);
                      setCondition(i, { stat, op: validOps.includes(c.op) ? c.op : validOps[0], value: '' });
                    }}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-xs text-slate-200"
                  >
                    {FIELD_STATS.map((s) => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                ) : (
                  <ColumnDropdown
                    value={c.field || ''}
                    options={cols}
                    onChange={(field) => setCondition(i, { field })}
                    placeholder="— field —"
                    className="w-full"
                  />
                )}

                {/* Operator */}
                <select
                  value={c.op}
                  onChange={(e) => setCondition(i, { op: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-xs text-slate-200"
                >
                  {ops.map((o) => (
                    <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>
                  ))}
                </select>

                {/* Value */}
                {!['is_empty', 'is_not_empty'].includes(c.op) && (
                  isField && statMeta?.kind === 'enum' ? (
                    <select
                      value={c.value ?? ''}
                      onChange={(e) => setCondition(i, { value: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-xs text-slate-200"
                    >
                      <option value="">— select —</option>
                      {statMeta.options.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      placeholder={isField && statMeta?.kind === 'number' ? (c.stat === 'fill_pct' ? 'e.g. 90' : 'number') : 'value'}
                      value={c.value ?? ''}
                      onChange={(e) => setCondition(i, { value: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                    />
                  )
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Label({ children, className = '' }) {
  return <div className={`text-[11px] uppercase tracking-wider text-slate-400 mb-1.5 font-semibold ${className}`}>{children}</div>;
}
