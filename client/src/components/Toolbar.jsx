import React, { useState } from 'react';
import { Save, FolderOpen, Play, Trash2, Loader2 } from 'lucide-react';
import { usePipelineStore } from '../store/usePipelineStore';
import { runPipelineStream } from '../lib/api';

export default function Toolbar() {
  const {
    projectName,
    setProjectName,
    save,
    load,
    clearCanvas,
    nodes,
    edges,
    setRunning,
    running,
    setNodeStatus,
    resetNodeStatuses,
    updateNodeData,
  } = usePipelineStore();
  const [savedFlash, setSavedFlash] = useState(false);

  const onSave = () => {
    save();
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
  };

  const onRun = async () => {
    if (!nodes.length || running) return;
    setRunning(true);
    resetNodeStatuses();
    // Strip non-serializable / heavy stuff but keep rows/columns
    const slim = {
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: {
          name: n.data?.name,
          config: n.data?.config,
          rows: n.data?.rows,
          columns: n.data?.columns,
        },
      })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
    };
    try {
      await runPipelineStream(slim, (evt) => {
        if (evt.type === 'node') {
          setNodeStatus(evt.nodeId, evt);
          // Cache produced rows on the node so DataverseOutput can import them later
          if (evt.status === 'success' && Array.isArray(evt.rows)) {
            updateNodeData(evt.nodeId, { _producedRows: evt.rows });
          }
        }
      });
    } catch (err) {
      console.error('pipeline run failed', err);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="h-14 flex items-center justify-between px-4 bg-card border-b border-slate-800 z-20">
      <div className="flex items-center gap-3">
        <div className="font-bold text-lg tracking-tight text-white">
          Cross<span className="text-emerald-400">Migrate</span>
        </div>
        <input
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          className="bg-transparent text-slate-300 text-sm px-2 py-1 rounded hover:bg-slate-800 focus:bg-slate-800 outline-none w-64"
        />
      </div>
      <div className="flex items-center gap-2">
        <Btn onClick={onSave} icon={<Save size={14} />}>
          {savedFlash ? 'Saved!' : 'Save'}
        </Btn>
        <Btn onClick={() => load()} icon={<FolderOpen size={14} />}>Load</Btn>
        <Btn
          onClick={() => {
            if (confirm('Clear the entire canvas?')) clearCanvas();
          }}
          icon={<Trash2 size={14} />}
        >
          Clear
        </Btn>
        <button
          onClick={onRun}
          disabled={running || !nodes.length}
          className="flex items-center gap-2 px-4 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          {running ? 'Running…' : 'Run'}
        </button>
      </div>
    </div>
  );
}

function Btn({ children, onClick, icon }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm transition"
    >
      {icon}
      {children}
    </button>
  );
}
