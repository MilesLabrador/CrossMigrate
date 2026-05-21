import React from 'react';
import { usePipelineStore } from '../../store/usePipelineStore';

export default function CSVInputConfig({ nodeId }) {
  const { nodes, updateNodeConfig } = usePipelineStore();
  const node = nodes.find((n) => n.id === nodeId);
  const cfg = node?.data?.config || {};
  return (
    <div className="space-y-3">
      <div>
        <Label>Delimiter</Label>
        <select
          value={cfg.delimiter || ''}
          onChange={(e) => updateNodeConfig(nodeId, { delimiter: e.target.value })}
          className="w-full bg-cardalt border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200"
        >
          <option value="">Auto-detect</option>
          <option value=",">, (comma)</option>
          <option value=";">; (semicolon)</option>
          <option value={'\t'}>tab</option>
          <option value="|">| (pipe)</option>
        </select>
      </div>
      <div>
        <Label>Encoding</Label>
        <select
          value={cfg.encoding || 'utf8'}
          onChange={(e) => updateNodeConfig(nodeId, { encoding: e.target.value })}
          className="w-full bg-cardalt border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200"
        >
          <option value="utf8">UTF-8</option>
          <option value="latin1">Latin-1</option>
        </select>
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-200">
        <input
          type="checkbox"
          checked={cfg.header !== false}
          onChange={(e) => updateNodeConfig(nodeId, { header: e.target.checked })}
          className="accent-sky-500"
        />
        First row is header
      </label>
      {node?.data?.columns?.length > 0 && (
        <div className="border-t border-slate-700 pt-3 mt-3">
          <Label>Detected columns ({node.data.columns.length})</Label>
          <div className="text-[11px] text-slate-300 max-h-32 overflow-y-auto leading-snug">
            {node.data.columns.join(', ')}
          </div>
          <div className="text-[11px] text-slate-500 mt-2">
            {node.data.rows?.length || 0} rows · {node.data.fileName}
          </div>
        </div>
      )}
    </div>
  );
}
function Label({ children }) {
  return <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1.5 font-semibold">{children}</div>;
}
