import React from 'react';
import { usePipelineStore } from '../../store/usePipelineStore';
import { fetchXlsxSheet } from '../../lib/api';

export default function XLSXInputConfig({ nodeId }) {
  const { nodes, updateNodeConfig, updateNodeData } = usePipelineStore();
  const node = nodes.find((n) => n.id === nodeId);
  const cfg  = node?.data?.config || {};
  const sheets = node?.data?.sheets || [];

  const reparse = async (patch) => {
    const fileId = node?.data?.fileId;
    if (!fileId) return;
    const nextCfg = { ...cfg, ...patch };
    updateNodeConfig(nodeId, patch);
    try {
      updateNodeData(nodeId, { _uploading: true });
      const res = await fetchXlsxSheet(fileId, {
        sheet: nextCfg.sheet,
        header: nextCfg.header !== false,
      });
      updateNodeData(nodeId, {
        rows: res.rows,
        columns: res.columns,
        _uploading: false,
      });
    } catch (err) {
      updateNodeData(nodeId, { _uploading: false, _error: err.message });
    }
  };

  return (
    <div className="space-y-3">
      {sheets.length > 1 && (
        <div>
          <Label>Sheet</Label>
          <select
            value={cfg.sheet || sheets[0] || ''}
            onChange={(e) => reparse({ sheet: e.target.value })}
            className="w-full bg-cardalt border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200"
          >
            {sheets.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      )}

      <label className="flex items-center gap-2 text-xs text-slate-200">
        <input
          type="checkbox"
          checked={cfg.header !== false}
          onChange={(e) => reparse({ header: e.target.checked })}
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
