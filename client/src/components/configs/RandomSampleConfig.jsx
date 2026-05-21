import React from 'react';
import { usePipelineStore } from '../../store/usePipelineStore';

export default function RandomSampleConfig({ nodeId }) {
  const { nodes, updateNodeConfig, nodeStatus } = usePipelineStore();
  const node = nodes.find((n) => n.id === nodeId);
  const cfg = node?.data?.config || {};
  const status = nodeStatus[nodeId];

  return (
    <div className="space-y-4 text-xs">
      <div>
        <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">
          Sample size
        </label>
        <input
          type="number"
          min={1}
          value={cfg.size ?? 100}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v) && v > 0) updateNodeConfig(nodeId, { size: v });
          }}
          className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 hover:border-slate-500 focus:border-sky-500 text-slate-200 outline-none transition"
        />
        <p className="text-[10px] text-slate-600 mt-1">
          Picks N rows at random using Fisher-Yates. Returns all rows if input is smaller.
        </p>
      </div>

      {status?.meta && (
        <div className="rounded bg-slate-800/60 border border-slate-700 px-3 py-2 space-y-0.5">
          <div className="text-slate-400">Last run</div>
          <div className="text-slate-200">
            {status.meta.rowCount?.toLocaleString()} rows sampled
            {status.meta.sampledFrom != null && (
              <span className="text-slate-500"> from {status.meta.sampledFrom.toLocaleString()}</span>
            )}
          </div>
          {status.meta.note && <div className="text-amber-400 text-[10px]">{status.meta.note}</div>}
        </div>
      )}
    </div>
  );
}
