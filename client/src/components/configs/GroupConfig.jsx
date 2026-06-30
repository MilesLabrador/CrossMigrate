import React from 'react';
import { usePipelineStore } from '../../store/usePipelineStore';

export default function GroupConfig({ nodeId }) {
  const { nodes, updateNodeData, updateNodeConfig } = usePipelineStore();
  const node = nodes.find((n) => n.id === nodeId);
  const name = node?.data?.name || 'Group';
  const notes = node?.data?.config?.notes || '';
  const childCount = nodes.filter((n) => n.parentId === nodeId).length;

  return (
    <div className="space-y-4">
      <div>
        <label className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5 block">
          Group name
        </label>
        <input
          value={name}
          onChange={(e) => updateNodeData(nodeId, { name: e.target.value })}
          className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-sky-500"
        />
      </div>

      <div>
        <label className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5 block">
          Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => updateNodeConfig(nodeId, { notes: e.target.value })}
          placeholder="Add notes about this group…"
          rows={6}
          className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-sky-500 resize-y"
        />
      </div>

      <div className="text-[11px] text-slate-500">
        {childCount} node{childCount === 1 ? '' : 's'} in this group.
      </div>
    </div>
  );
}
