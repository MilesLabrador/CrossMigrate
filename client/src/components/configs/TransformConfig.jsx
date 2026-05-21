import React from 'react';
import { Plus, X } from 'lucide-react';
import { usePipelineStore, getUpstreamColumns } from '../../store/usePipelineStore';

const TYPES = ['trim', 'uppercase', 'lowercase', 'date_format', 'replace', 'regex_extract'];

export default function TransformConfig({ nodeId }) {
  const state = usePipelineStore();
  const node = state.nodes.find((n) => n.id === nodeId);
  const cfg = node?.data?.config || {};
  const transforms = cfg.fieldTransforms || [];
  const cols = getUpstreamColumns(nodeId, state);

  const set = (i, patch) =>
    state.updateNodeConfig(nodeId, {
      fieldTransforms: transforms.map((t, idx) => (idx === i ? { ...t, ...patch } : t)),
    });
  const setOpts = (i, patch) =>
    set(i, { opts: { ...(transforms[i].opts || {}), ...patch } });

  const add = () =>
    state.updateNodeConfig(nodeId, {
      fieldTransforms: [...transforms, { field: cols[0] || '', type: 'trim', opts: {} }],
    });
  const remove = (i) =>
    state.updateNodeConfig(nodeId, { fieldTransforms: transforms.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="mb-0">Field transforms</Label>
        <button onClick={add} className="text-[11px] flex items-center gap-1 text-sky-400 hover:underline">
          <Plus size={11} /> Add
        </button>
      </div>
      {transforms.length === 0 && (
        <div className="text-xs text-slate-500 italic py-3 text-center">
          No transforms yet — add one.
        </div>
      )}
      <div className="space-y-2">
        {transforms.map((t, i) => (
          <div key={i} className="bg-cardalt rounded p-2 border border-slate-700/60 space-y-1.5">
            <div className="flex gap-1.5 items-center">
              <select
                value={t.field || ''}
                onChange={(e) => set(i, { field: e.target.value })}
                className="flex-1 bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-xs text-slate-200 min-w-0"
              >
                <option value="">— field —</option>
                {cols.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <select
                value={t.type}
                onChange={(e) => set(i, { type: e.target.value, opts: {} })}
                className="bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-xs text-slate-200"
              >
                {TYPES.map((tp) => (
                  <option key={tp} value={tp}>{tp}</option>
                ))}
              </select>
              <button onClick={() => remove(i)} className="text-slate-500 hover:text-rose-400">
                <X size={14} />
              </button>
            </div>
            {t.type === 'date_format' && (
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  placeholder="input fmt (e.g. MM/DD/YYYY)"
                  value={t.opts?.input || ''}
                  onChange={(e) => setOpts(i, { input: e.target.value })}
                  className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                />
                <input
                  placeholder="output fmt (e.g. YYYY-MM-DD)"
                  value={t.opts?.output || ''}
                  onChange={(e) => setOpts(i, { output: e.target.value })}
                  className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                />
              </div>
            )}
            {t.type === 'replace' && (
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  placeholder="find"
                  value={t.opts?.find || ''}
                  onChange={(e) => setOpts(i, { find: e.target.value })}
                  className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                />
                <input
                  placeholder="replace"
                  value={t.opts?.replace || ''}
                  onChange={(e) => setOpts(i, { replace: e.target.value })}
                  className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                />
              </div>
            )}
            {t.type === 'regex_extract' && (
              <div className="grid grid-cols-3 gap-1.5">
                <input
                  placeholder="pattern"
                  value={t.opts?.pattern || ''}
                  onChange={(e) => setOpts(i, { pattern: e.target.value })}
                  className="col-span-2 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                />
                <input
                  placeholder="group #"
                  type="number"
                  value={t.opts?.group ?? 1}
                  onChange={(e) => setOpts(i, { group: Number(e.target.value) })}
                  className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Label({ children, className = '' }) {
  return <div className={`text-[11px] uppercase tracking-wider text-slate-400 mb-1.5 font-semibold ${className}`}>{children}</div>;
}
