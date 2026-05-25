import React, { useRef } from 'react';
import { Sheet, Upload } from 'lucide-react';
import NodeShell from '../components/NodeShell';
import { usePipelineStore } from '../store/usePipelineStore';
import { uploadXlsx } from '../lib/api';

export default function XLSXInputNode({ id, selected }) {
  const inputRef = useRef(null);
  const { nodes, updateNodeData, updateNodeConfig } = usePipelineStore();
  const node = nodes.find((n) => n.id === id);
  const cfg = node?.data?.config || {};
  const rows = node?.data?.rows || [];
  const columns = node?.data?.columns || [];

  const handleFile = async (file) => {
    if (!file) return;
    try {
      updateNodeData(id, { _uploading: true, _error: null });
      const res = await uploadXlsx(file, {
        header: cfg.header !== false,
      });
      updateNodeData(id, {
        rows: res.rows,
        columns: res.columns,
        fileName: file.name,
        fileId: res.fileId,
        sheets: res.sheets,
        _uploading: false,
      });
      updateNodeConfig(id, { sheet: res.sheetName });
    } catch (err) {
      console.error(err);
      updateNodeData(id, { _uploading: false, _error: err.message });
    }
  };

  return (
    <NodeShell
      id={id}
      selected={selected}
      category="source"
      icon={Sheet}
      typeLabel="XLSX"
    >
      {!rows.length ? (
        <div
          onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
          className="border-2 border-dashed border-slate-700 hover:border-emerald-500 hover:bg-slate-800/40 rounded-md py-6 px-3 text-center cursor-pointer transition"
        >
          <Upload size={18} className="mx-auto text-slate-400 mb-1" />
          <div className="text-slate-300 text-xs">Drop XLSX or click to browse</div>
          {node?.data?._uploading && (
            <div className="text-sky-400 text-[11px] mt-1">Uploading…</div>
          )}
          {node?.data?._error && (
            <div className="text-rose-400 text-[11px] mt-1">{node.data._error}</div>
          )}
        </div>
      ) : (
        <div className="space-y-1">
          <div className="text-slate-300 font-medium truncate">{node?.data?.fileName}</div>
          <div className="text-slate-400">
            {rows.length} rows • {columns.length} cols
            {cfg.sheet && <span className="text-slate-500"> • {cfg.sheet}</span>}
          </div>
          <div className="text-[10px] text-slate-500 truncate">{columns.join(', ')}</div>
          <button
            onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
            className="mt-1 text-[11px] text-sky-400 hover:underline"
          >
            Replace file…
          </button>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xlsm,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </NodeShell>
  );
}
