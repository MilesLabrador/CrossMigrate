import React, { useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { ChevronDown, ChevronRight, Loader2, CheckCircle2, AlertCircle, Circle } from 'lucide-react';
import { usePipelineStore } from '../store/usePipelineStore';
import clsx from 'clsx';

const CATEGORY_COLORS = {
  source: { headerBg: 'bg-emerald-700/60', dot: 'bg-emerald-400', border: 'border-emerald-700/40' },
  transform: { headerBg: 'bg-slate-600/60', dot: 'bg-slate-300', border: 'border-slate-600/50' },
  destination: { headerBg: 'bg-rose-700/60', dot: 'bg-rose-400', border: 'border-rose-700/40' },
};

export default function NodeShell({
  id,
  category, // 'source' | 'transform' | 'destination'
  icon: Icon,
  typeLabel,
  children,
  selected,
  widthClass = 'w-64',  // override for wider nodes (e.g. expanded Preview)
}) {
  const { nodes, updateNodeData, nodeStatus, selectNode } = usePipelineStore();
  const node = nodes.find((n) => n.id === id);
  const name = node?.data?.name || typeLabel;
  const status = nodeStatus[id];
  const [collapsed, setCollapsed] = useState(false);
  const colors = CATEGORY_COLORS[category];

  const renderStatusDot = () => {
    if (!status) return <Circle size={10} className="text-slate-500 fill-slate-600" />;
    if (status.status === 'running')
      return <Loader2 size={12} className="animate-spin text-sky-400" />;
    if (status.status === 'success')
      return (
        <span className="flex items-center gap-1 text-emerald-400 text-[10px]">
          <CheckCircle2 size={12} /> {status.rowCount ?? 0}
        </span>
      );
    if (status.status === 'error')
      return (
        <span className="flex items-center gap-1 text-rose-400 text-[10px]" title={status.error}>
          <AlertCircle size={12} /> error
        </span>
      );
    return null;
  };

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        selectNode(id);
      }}
      onWheel={(e) => e.stopPropagation()}
      className={clsx(
        'animate-scale-in rounded-xl bg-card shadow-node text-slate-100 overflow-hidden border',
        widthClass,
        selected ? 'border-sky-400/80 ring-2 ring-sky-400/30' : `${colors.border}`
      )}
    >
      {category !== 'destination' && (
        <Handle
          type="target"
          position={Position.Left}
          className="handle-transform"
          isConnectable={category !== 'source'}
          style={{ opacity: category === 'source' ? 0 : 1 }}
        />
      )}
      <div className={clsx('px-3 py-2 flex items-center gap-2', colors.headerBg)}>
        <Icon size={14} className="text-white/90 shrink-0" />
        <input
          value={name}
          onChange={(e) => updateNodeData(id, { name: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          className="bg-transparent text-sm font-medium text-white flex-1 min-w-0 outline-none focus:bg-black/20 px-1 rounded"
        />
        <div className="text-[10px] uppercase tracking-wider text-white/70 font-semibold">{typeLabel}</div>
        <div className="ml-1">{renderStatusDot()}</div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setCollapsed((c) => !c);
          }}
          className="text-white/70 hover:text-white"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>
      {!collapsed && <div className="p-3 text-xs">{children}</div>}
      {category !== 'source' && category !== 'destination' && (
        <Handle type="source" position={Position.Right} className="handle-transform" />
      )}
      {category === 'source' && (
        <Handle type="source" position={Position.Right} className="handle-source" />
      )}
      {category === 'destination' && (
        <Handle type="target" position={Position.Left} className="handle-destination" />
      )}
    </div>
  );
}
