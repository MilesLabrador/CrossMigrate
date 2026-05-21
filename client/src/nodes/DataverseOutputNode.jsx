import React from 'react';
import { Database, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import NodeShell from '../components/NodeShell';
import { usePipelineStore } from '../store/usePipelineStore';

export default function DataverseOutputNode({ id, selected }) {
  const { nodes } = usePipelineStore();
  const node = nodes.find((n) => n.id === id);
  const cfg = node?.data?.config || {};
  const progress = node?.data?._importProgress;
  return (
    <NodeShell
      id={id}
      selected={selected}
      category="destination"
      icon={Database}
      typeLabel="Dataverse"
    >
      <div className="text-slate-300">
        Entity:{' '}
        {cfg.entity ? (
          <span className="text-emerald-400">{cfg.entity}</span>
        ) : (
          <span className="text-slate-500 italic">— pick →</span>
        )}
      </div>
      <div className="text-slate-300">
        Mappings: <span className="text-emerald-400">{cfg.fieldMappings?.length || 0}</span>
      </div>
      {progress && (
        <div className="mt-2 pt-2 border-t border-slate-800 space-y-1">
          <div className="flex items-center gap-1.5">
            {progress.status === 'importing' && (
              <Loader2 size={11} className="animate-spin text-sky-400" />
            )}
            {progress.status === 'done' && (
              <CheckCircle2 size={11} className="text-emerald-400" />
            )}
            {progress.status === 'error' && (
              <AlertCircle size={11} className="text-rose-400" />
            )}
            <span className="text-slate-300 text-[11px]">
              {progress.processed ?? 0} / {progress.total ?? 0}
            </span>
          </div>
          <div className="h-1 bg-slate-800 rounded overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{
                width: `${
                  progress.total ? ((progress.processed || 0) / progress.total) * 100 : 0
                }%`,
              }}
            />
          </div>
          <div className="text-[10px] text-slate-400">
            <span className="text-emerald-400">{progress.success ?? 0} ok</span>
            {' · '}
            <span className="text-rose-400">{progress.failed ?? 0} failed</span>
          </div>
        </div>
      )}
    </NodeShell>
  );
}
