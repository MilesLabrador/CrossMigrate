import React from 'react';
import { HardDriveUpload, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import NodeShell from '../components/NodeShell';
import { usePipelineStore } from '../store/usePipelineStore';

export default function SQLOutputNode({ id, selected }) {
  const { nodes } = usePipelineStore();
  const node = nodes.find((n) => n.id === id);
  const cfg = node?.data?.config || {};
  const progress = node?.data?._writeProgress;

  return (
    <NodeShell id={id} selected={selected} category="destination" icon={HardDriveUpload} typeLabel="SQL Out">
      <div className="text-slate-300">
        Table:{' '}
        {cfg.table ? (
          <span className="text-rose-400">{cfg.table}</span>
        ) : (
          <span className="text-slate-500 italic">— pick →</span>
        )}
      </div>
      <div className="text-slate-400 text-[11px]">
        {cfg.type || 'postgres'}{cfg.database ? ` · ${cfg.database}` : ''}
      </div>

      {progress && (
        <div className="mt-2 pt-2 border-t border-slate-800 space-y-1">
          <div className="flex items-center gap-1.5">
            {progress.status === 'writing' && (
              <Loader2 size={11} className="animate-spin text-sky-400" />
            )}
            {progress.status === 'done' && (
              <CheckCircle2 size={11} className="text-emerald-400" />
            )}
            {progress.status === 'error' && (
              <AlertCircle size={11} className="text-rose-400" />
            )}
            <span className="text-slate-300 text-[11px]">
              {progress.status === 'done'
                ? `${progress.written} rows written`
                : progress.status === 'error'
                ? progress.error
                : 'Writing…'}
            </span>
          </div>
          {progress.status === 'writing' && (
            <div className="h-1 bg-slate-800 rounded overflow-hidden">
              <div className="h-full bg-rose-500 animate-pulse w-full" />
            </div>
          )}
        </div>
      )}
    </NodeShell>
  );
}
