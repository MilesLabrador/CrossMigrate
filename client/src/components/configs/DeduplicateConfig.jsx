import React from 'react';
import { usePipelineStore, getUpstreamColumns } from '../../store/usePipelineStore';

export default function DeduplicateConfig({ nodeId }) {
  const state = usePipelineStore();
  const node = state.nodes.find((n) => n.id === nodeId);
  const cfg = node?.data?.config || {};
  const cols = getUpstreamColumns(nodeId, state);
  const fields = cfg.fields || [];

  const toggle = (c) => {
    const next = fields.includes(c) ? fields.filter((f) => f !== c) : [...fields, c];
    state.updateNodeConfig(nodeId, { fields: next });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Deduplicate by fields</Label>
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {cols.length === 0 && (
            <div className="text-xs text-slate-500 italic">No incoming fields.</div>
          )}
          {cols.map((c) => (
            <label key={c} className="flex items-center gap-2 text-xs text-slate-200">
              <input
                type="checkbox"
                checked={fields.includes(c)}
                onChange={() => toggle(c)}
                className="accent-sky-500"
              />
              {c}
            </label>
          ))}
        </div>
      </div>
      <div>
        <Label>Strategy</Label>
        <select
          value={cfg.strategy || 'first'}
          onChange={(e) => state.updateNodeConfig(nodeId, { strategy: e.target.value })}
          className="w-full bg-cardalt border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200"
        >
          <option value="first">Keep first</option>
          <option value="last">Keep last</option>
        </select>
      </div>
    </div>
  );
}

function Label({ children }) {
  return <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1.5 font-semibold">{children}</div>;
}
