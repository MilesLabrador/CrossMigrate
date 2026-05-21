import React from 'react';
import Papa from 'papaparse';
import { Download } from 'lucide-react';
import { usePipelineStore } from '../../store/usePipelineStore';

export default function CSVExportConfig({ nodeId }) {
  const { nodes, updateNodeConfig, nodeStatus } = usePipelineStore();
  const node = nodes.find((n) => n.id === nodeId);
  const cfg = node?.data?.config || {};
  const rows = node?.data?._producedRows || nodeStatus[nodeId]?.sample || [];

  const onDownload = () => {
    if (!rows.length) return;
    const csv = Papa.unparse(rows, { delimiter: cfg.delimiter || ',' });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = cfg.filename || 'export.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <div>
        <Label>Filename</Label>
        <input
          value={cfg.filename || 'export.csv'}
          onChange={(e) => updateNodeConfig(nodeId, { filename: e.target.value })}
          className="w-full bg-cardalt border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200"
        />
      </div>
      <div>
        <Label>Delimiter</Label>
        <select
          value={cfg.delimiter || ','}
          onChange={(e) => updateNodeConfig(nodeId, { delimiter: e.target.value })}
          className="w-full bg-cardalt border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200"
        >
          <option value=",">, (comma)</option>
          <option value=";">; (semicolon)</option>
          <option value={'\t'}>tab</option>
          <option value="|">| (pipe)</option>
        </select>
      </div>
      <button
        disabled={!rows.length}
        onClick={onDownload}
        className="flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm"
      >
        <Download size={14} /> Download ({rows.length} rows)
      </button>
      {!rows.length && (
        <div className="text-[11px] text-slate-500">Run the pipeline first to generate rows.</div>
      )}
    </div>
  );
}
function Label({ children }) {
  return <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1.5 font-semibold">{children}</div>;
}
