import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { usePipelineStore, getUpstreamColumnsForHandle } from '../../store/usePipelineStore';

export default function JoinConfig({ nodeId }) {
  const state = usePipelineStore();
  const node  = state.nodes.find((n) => n.id === nodeId);
  const cfg   = node?.data?.config || {};
  const meta  = state.nodeStatus[nodeId]?.meta;

  const leftCols  = getUpstreamColumnsForHandle(nodeId, 'left', state);
  const rightCols = getUpstreamColumnsForHandle(nodeId, 'right', state);
  const pullCols  = cfg.pullColumns || [];

  const [search, setSearch] = useState('');
  const q = search.toLowerCase();
  const pullable = rightCols.filter((c) => c !== cfg.rightColumn);
  const visible  = pullable.filter((c) => c.toLowerCase().includes(q));

  const set = (patch) => state.updateNodeConfig(nodeId, patch);

  const togglePull = (c) => {
    const next = pullCols.includes(c) ? pullCols.filter((f) => f !== c) : [...pullCols, c];
    set({ pullColumns: next });
  };

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-slate-500 leading-snug">
        Joins a second table onto your data where the key columns match, so you
        can link related tables and verify the relationships before importing.
      </p>

      <div>
        <Label>Left key column <span className="normal-case text-slate-500">(top handle)</span></Label>
        <ColumnSelect
          value={cfg.leftColumn || ''}
          columns={leftCols}
          emptyHint="Connect the left (main data) input first"
          onChange={(v) => set({ leftColumn: v })}
        />
      </div>

      <div>
        <Label>Right key column <span className="normal-case text-amber-500/80">(bottom handle)</span></Label>
        <ColumnSelect
          value={cfg.rightColumn || ''}
          columns={rightCols}
          emptyHint="Connect the right (joined table) input first"
          onChange={(v) => set({ rightColumn: v })}
        />
      </div>

      <div>
        <Label>Join type</Label>
        <select
          value={cfg.joinType || 'left'}
          onChange={(e) => set({ joinType: e.target.value })}
          className="w-full bg-cardalt border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200"
        >
          <option value="left">Left join — keep all rows, blanks where unjoined</option>
          <option value="inner">Inner join — only keep rows that joined</option>
        </select>
      </div>

      <div>
        <Label>Columns to join in</Label>
        <div className="text-[10px] text-slate-600 mb-1.5">
          None selected = join in all right-table columns
          {pullCols.length > 0 && <span className="ml-2 text-sky-500/70">{pullCols.length} selected</span>}
        </div>
        {pullable.length > 4 && (
          <div className="relative mb-2">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search fields…"
              className="w-full pl-7 pr-3 py-1.5 rounded bg-slate-800 border border-slate-700 hover:border-slate-600 focus:border-sky-500 text-slate-300 text-xs outline-none transition placeholder-slate-600"
            />
          </div>
        )}
        <div className="space-y-0.5 max-h-48 overflow-y-auto pr-1">
          {pullable.length === 0 && (
            <div className="text-xs text-slate-500 italic py-2">No right-table fields yet.</div>
          )}
          {visible.map((c) => (
            <label key={c} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-800 cursor-pointer group">
              <input
                type="checkbox"
                checked={pullCols.includes(c)}
                onChange={() => togglePull(c)}
                className="accent-sky-500 shrink-0"
              />
              <span className="text-xs text-slate-200 truncate group-hover:text-white transition">{c}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <Label>Prefix for joined columns</Label>
        <input
          value={cfg.prefix || ''}
          onChange={(e) => set({ prefix: e.target.value })}
          placeholder="e.g. account_"
          className="w-full px-3 py-1.5 rounded bg-slate-800 border border-slate-700 hover:border-slate-600 focus:border-sky-500 text-slate-200 text-sm outline-none transition placeholder-slate-600"
        />
        <p className="text-[10px] text-slate-600 mt-1">Avoids clobbering same-named columns on the left input.</p>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={!!cfg.caseInsensitive}
          onChange={(e) => set({ caseInsensitive: e.target.checked })}
          className="accent-sky-500"
        />
        <span className="text-xs text-slate-300">Case-insensitive key matching</span>
      </label>

      {/* Post-run join report */}
      {meta?.matched != null && (
        <div className="border border-slate-700 rounded-lg p-3 space-y-1.5 bg-slate-900/40">
          <Label>Last run</Label>
          <div className="text-xs text-emerald-400">{meta.matched.toLocaleString()} rows joined</div>
          <div className={`text-xs ${meta.unmatched ? 'text-rose-400' : 'text-slate-500'}`}>
            {meta.unmatched.toLocaleString()} rows unjoined
          </div>
          {meta.duplicateKeys > 0 && (
            <div className="text-xs text-amber-400/90">
              {meta.duplicateKeys.toLocaleString()} duplicate keys in right table (first occurrence used)
            </div>
          )}
          {meta.unmatchedSamples?.length > 0 && (
            <div className="text-[11px] text-slate-400 pt-1">
              Unjoined keys:{' '}
              <span className="font-mono text-slate-300">
                {meta.unmatchedSamples.map((v) => String(v)).join(', ')}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ColumnSelect({ value, columns, onChange, emptyHint }) {
  if (!columns.length) {
    return <div className="text-xs text-slate-500 italic py-1">{emptyHint}</div>;
  }
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-cardalt border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200"
    >
      <option value="">— choose column —</option>
      {columns.map((c) => (
        <option key={c} value={c}>{c}</option>
      ))}
    </select>
  );
}

function Label({ children }) {
  return <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1.5 font-semibold">{children}</div>;
}
