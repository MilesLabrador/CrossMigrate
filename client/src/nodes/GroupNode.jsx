import React from 'react';
import { NodeResizer } from '@xyflow/react';
import { Layers, StickyNote } from 'lucide-react';
import { usePipelineStore } from '../store/usePipelineStore';

export default function GroupNode({ id, selected }) {
  const { nodes, selectNode } = usePipelineStore();
  const node = nodes.find((n) => n.id === id);
  const name = node?.data?.name || 'Group';
  const notes = node?.data?.config?.notes || '';

  return (
    <div className="w-full h-full rounded-lg border-2 border-dashed border-sky-700/50 bg-sky-500/[0.04]">
      <NodeResizer
        isVisible={selected}
        minWidth={200}
        minHeight={120}
        lineClassName="!border-sky-500/60"
        handleClassName="!w-2.5 !h-2.5 !bg-sky-500 !border-none !rounded-sm"
      />
      <div
        className="group-drag-handle flex items-center gap-1.5 px-2.5 py-1.5 cursor-pointer rounded-t-md hover:bg-sky-500/10 select-none"
        onClick={(e) => { e.stopPropagation(); selectNode(id); }}
      >
        <Layers size={13} className="text-sky-400 shrink-0" />
        <span className="text-xs font-semibold text-sky-200 truncate">{name}</span>
        {notes && <StickyNote size={11} className="text-sky-400/70 shrink-0 ml-auto" />}
      </div>
    </div>
  );
}
