import React, { useRef, useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { usePipelineStore } from '../../store/usePipelineStore';
import { uploadCsv } from '../../lib/api';
import SchemaEditor from './SchemaEditor';

export default function CSVInputConfig({ nodeId }) {
  const { nodes, updateNodeConfig, updateNodeData } = usePipelineStore();
  const node = nodes.find((n) => n.id === nodeId);
  const cfg = node?.data?.config || {};
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  // Same flow as the node card's uploader — parse with the panel's current
  // delimiter/header/encoding settings and swap the node's data in place.
  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const res = await uploadCsv(file, {
        delimiter: cfg.delimiter || '',
        header: cfg.header !== false,
        encoding: cfg.encoding || 'utf8',
      });
      updateNodeData(nodeId, {
        rows: res.rows,
        columns: res.columns,
        fileName: file.name,
      });
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  };

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

      {/* File — upload or replace without leaving the panel */}
      <div className="border-t border-slate-700 pt-3">
        <Label>File</Label>
        {node?.data?.fileName ? (
          <div className="text-[11px] text-slate-300 mb-1.5 truncate">
            {node.data.fileName}
            <span className="text-slate-500"> · {node.data.rows?.length || 0} rows</span>
          </div>
        ) : (
          <div className="text-[11px] text-slate-500 mb-1.5">No file loaded yet.</div>
        )}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-500 text-slate-200 text-xs disabled:opacity-50 transition"
        >
          {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          {uploading ? 'Uploading…' : node?.data?.fileName ? 'Replace file…' : 'Upload file…'}
        </button>
        {uploadError && <div className="text-rose-400 text-[11px] mt-1">{uploadError}</div>}
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }}
        />
      </div>

      {node?.data?.columns?.length > 0 && (
        <div className="border-t border-slate-700 pt-3">
          <Label>Detected columns ({node.data.columns.length})</Label>
          <div className="text-[11px] text-slate-300 max-h-32 overflow-y-auto leading-snug">
            {node.data.columns.join(', ')}
          </div>
        </div>
      )}
      <SchemaEditor nodeId={nodeId} />
    </div>
  );
}
function Label({ children }) {
  return <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1.5 font-semibold">{children}</div>;
}
