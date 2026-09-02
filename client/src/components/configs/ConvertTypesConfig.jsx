import React from 'react';
import { Plus, X } from 'lucide-react';
import { usePipelineStore, getUpstreamColumns } from '../../store/usePipelineStore';
import ColumnDropdown from '../ColumnDropdown';

const TYPES = ['text', 'number', 'boolean', 'date'];
const ON_ERROR = [
  { value: 'fail', label: 'fail the run' },
  { value: 'null', label: 'set null' },
  // Stored value stays 'redirect' for saved-pipeline compatibility; only the
  // label changed.
  { value: 'redirect', label: 'send to error output' },
];

export default function ConvertTypesConfig({ nodeId }) {
  const state = usePipelineStore();
  const node = state.nodes.find((n) => n.id === nodeId);
  const conversions = node?.data?.config?.conversions || [];
  const cols = getUpstreamColumns(nodeId, state);

  const set = (i, patch) =>
    state.updateNodeConfig(nodeId, {
      conversions: conversions.map((c, idx) => (idx === i ? { ...c, ...patch } : c)),
    });
  const add = () =>
    state.updateNodeConfig(nodeId, {
      conversions: [...conversions, { field: cols[0] || '', type: 'number', onError: 'fail' }],
    });
  const remove = (i) =>
    state.updateNodeConfig(nodeId, { conversions: conversions.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="mb-0">Type conversions</Label>
        <button onClick={add} className="text-[11px] flex items-center gap-1 text-sky-400 hover:underline">
          <Plus size={11} /> Add
        </button>
      </div>

      <div className="text-[10px] text-slate-500 leading-snug">
        Values that can't convert follow the per-field error rule: <span className="text-slate-400">fail</span> aborts
        the node, <span className="text-slate-400">set null</span> keeps the row with a null,
        <span className="text-slate-400"> send to error output</span> diverts the whole original row out the red error handle.
      </div>

      {cols.length === 0 && (
        <div className="text-[10px] text-amber-400/90 bg-amber-950/30 border border-amber-800/50 rounded px-2 py-1.5">
          No upstream fields known yet. Load data into the source (or run Collect metadata) so
          field names appear here — check the banner for sources that couldn't be sampled.
        </div>
      )}

      {conversions.length === 0 && (
        <div className="text-xs text-slate-500 italic py-3 text-center">
          No conversions yet — add one.
        </div>
      )}

      <div className="space-y-2">
        {conversions.map((c, i) => (
          <div key={i} className="bg-cardalt rounded p-2 border border-slate-700/60 space-y-1.5">
            <div className="flex gap-1.5 items-center">
              <ColumnDropdown
                value={c.field || ''}
                options={cols}
                onChange={(field) => set(i, { field })}
                placeholder="— field —"
                className="flex-1"
              />
              <select
                value={c.type}
                onChange={(e) => set(i, { type: e.target.value })}
                className="bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-xs text-slate-200 shrink-0"
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <button onClick={() => remove(i)} className="text-slate-500 hover:text-rose-400 shrink-0">
                <X size={14} />
              </button>
            </div>
            <div className="flex gap-1.5 items-center">
              <span className="text-[10px] text-slate-500 shrink-0">on error</span>
              <select
                value={c.onError || 'fail'}
                onChange={(e) => set(i, { onError: e.target.value })}
                className="bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-xs text-slate-200"
              >
                {ON_ERROR.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {c.type === 'date' && (
                <input
                  value={c.format || ''}
                  onChange={(e) => set(i, { format: e.target.value || undefined })}
                  placeholder="input fmt e.g. DD/MM/YYYY"
                  title="Strict input format (dayjs tokens). Blank = loose ISO parsing."
                  className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Label({ children, className = '' }) {
  return <div className={`text-[11px] uppercase tracking-wider text-slate-400 mb-1.5 font-semibold ${className}`}>{children}</div>;
}
