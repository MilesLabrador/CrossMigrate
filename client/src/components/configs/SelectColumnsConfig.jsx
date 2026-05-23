import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { usePipelineStore, getUpstreamColumns } from '../../store/usePipelineStore';

export default function SelectColumnsConfig({ nodeId }) {
  const state    = usePipelineStore();
  const node     = state.nodes.find((n) => n.id === nodeId);
  const cfg      = node?.data?.config || {};
  const cols     = getUpstreamColumns(nodeId, state);
  const selected = cfg.columns || [];

  const [search, setSearch] = useState('');

  const q       = search.toLowerCase();
  const visible = cols.filter((c) => c.toLowerCase().includes(q));

  const toggle = (c) => {
    const next = selected.includes(c)
      ? selected.filter((f) => f !== c)
      : [...selected, c];
    state.updateNodeConfig(nodeId, { columns: next });
  };

  const allVisibleChecked = visible.length > 0 && visible.every((c) => selected.includes(c));
  const toggleAll = () => {
    if (allVisibleChecked) {
      state.updateNodeConfig(nodeId, { columns: selected.filter((f) => !visible.includes(f)) });
    } else {
      const added = visible.filter((c) => !selected.includes(c));
      state.updateNodeConfig(nodeId, { columns: [...selected, ...added] });
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Keep columns</Label>

        <div className="flex items-center gap-2 mb-2">
          <div className="relative flex-1">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search columns…"
              className="w-full pl-7 pr-3 py-1.5 rounded bg-slate-800 border border-slate-700 hover:border-slate-600 focus:border-sky-500 text-slate-300 text-xs outline-none transition placeholder-slate-600"
            />
          </div>
          {visible.length > 0 && (
            <button
              onClick={toggleAll}
              className="shrink-0 text-[11px] text-sky-400 hover:text-sky-300 transition whitespace-nowrap"
            >
              {allVisibleChecked ? 'Deselect all' : 'Select all'}
            </button>
          )}
        </div>

        {cols.length > 0 && (
          <div className="text-[10px] text-slate-600 mb-1.5">
            {visible.length} of {cols.length} columns
            {selected.length > 0 && (
              <span className="ml-2 text-sky-500/70">{selected.length} selected</span>
            )}
          </div>
        )}

        <div className="space-y-0.5 max-h-60 overflow-y-auto pr-1">
          {cols.length === 0 && (
            <div className="text-xs text-slate-500 italic py-2">No incoming columns.</div>
          )}
          {visible.length === 0 && cols.length > 0 && (
            <div className="text-xs text-slate-500 italic py-2">No columns match &ldquo;{search}&rdquo;.</div>
          )}
          {visible.map((c) => (
            <label
              key={c}
              className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-800 cursor-pointer group"
            >
              <input
                type="checkbox"
                checked={selected.includes(c)}
                onChange={() => toggle(c)}
                className="accent-sky-500 shrink-0"
              />
              <span className="text-xs text-slate-200 truncate group-hover:text-white transition">{c}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function Label({ children }) {
  return <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1.5 font-semibold">{children}</div>;
}
