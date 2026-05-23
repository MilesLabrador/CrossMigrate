import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { ChevronDown, ChevronRight, Loader2, CheckCircle2, AlertCircle, Circle } from 'lucide-react';
import { usePipelineStore } from '../store/usePipelineStore';
import { gestureStartedInside } from '../lib/gestureTracker';
import clsx from 'clsx';

const CATEGORY_COLORS = {
  source:      { headerBg: 'bg-emerald-700/60', dot: 'bg-emerald-400', border: 'border-emerald-700/40' },
  transform:   { headerBg: 'bg-slate-600/60',   dot: 'bg-slate-300',   border: 'border-slate-600/50'  },
  destination: { headerBg: 'bg-rose-700/60',    dot: 'bg-rose-400',    border: 'border-rose-700/40'   },
};

// ── Resize handle ─────────────────────────────────────────────────────────────
function ResizeHandle({ id, nodeRef }) {
  const { updateNodeData } = usePipelineStore();

  const onPointerDown = useCallback((e) => {
    e.stopPropagation();
    e.preventDefault();

    const el = nodeRef.current;
    if (!el) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const startW = el.offsetWidth;
    const startH = el.offsetHeight;

    const onMove = (ev) => {
      updateNodeData(id, {
        _width:  Math.max(180, startW + (ev.clientX - startX)),
        _height: Math.max(60,  startH + (ev.clientY - startY)),
      });
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [id, nodeRef, updateNodeData]);

  return (
    <div
      className="nodrag absolute bottom-1 right-1 w-4 h-4 cursor-se-resize flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
      onPointerDown={onPointerDown}
      title="Drag to resize"
    >
      <svg width="9" height="9" viewBox="0 0 9 9" fill="currentColor" className="text-slate-500">
        <circle cx="7.5" cy="7.5" r="1.2" />
        <circle cx="4"   cy="7.5" r="1.2" />
        <circle cx="7.5" cy="4"   r="1.2" />
      </svg>
    </div>
  );
}

// ── Main shell ────────────────────────────────────────────────────────────────
export default function NodeShell({
  id,
  category,
  icon: Icon,
  typeLabel,
  children,
  selected,
  widthClass = 'w-64',
}) {
  const { nodes, updateNodeData, nodeStatus, selectNode } = usePipelineStore();
  const node   = nodes.find((n) => n.id === id);
  const name   = node?.data?.name || typeLabel;
  const status = nodeStatus[id];
  const colors = CATEGORY_COLORS[category];
  const [collapsed, setCollapsed] = useState(false);
  const nodeRef = useRef(null);
  const selectedRef = useRef(selected);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  const customW = node?.data?._width;
  const customH = node?.data?._height;
  const hasHeight = !!customH && !collapsed;

  // Only intercept scroll when this node is selected — unselected nodes let the
  // canvas pan freely. The gesture-origin check (gestureStartedInside) still
  // applies so momentum events that started inside keep being intercepted until
  // the user lifts their fingers, even if the pointer has drifted away.
  useEffect(() => {
    const el = nodeRef.current;
    if (!el) return;
    const handler = (e) => {
      // ctrlKey = pinch-to-zoom on trackpad — always let the canvas handle it
      if (!e.ctrlKey && selectedRef.current && gestureStartedInside(el)) e.stopPropagation();
    };
    el.addEventListener('wheel', handler, { passive: true });
    return () => el.removeEventListener('wheel', handler);
  }, []);

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
    /*
     * Outer div: positions the handles and resize grip, but has NO overflow-hidden
     * so handles can extend beyond the node edge without being clipped.
     */
    <div
      ref={nodeRef}
      onClick={(e) => { e.stopPropagation(); selectNode(id); }}
      className={clsx(
        'group animate-scale-in relative',
        !customW && widthClass,
        hasHeight && 'flex flex-col',
      )}
      style={{
        ...(customW ? { width: customW } : {}),
        ...(hasHeight ? { height: customH } : {}),
      }}
    >
      {/* Connection handles — outside the overflow-hidden card so they're never clipped */}
      {category !== 'destination' && (
        <Handle
          type="target"
          position={Position.Left}
          className="handle-transform"
          isConnectable={category !== 'source'}
          style={{ opacity: category === 'source' ? 0 : 1 }}
        />
      )}
      {category !== 'source' && category !== 'destination' && (
        <Handle type="source" position={Position.Right} className="handle-transform" />
      )}
      {category === 'source' && (
        <Handle type="source" position={Position.Right} className="handle-source" />
      )}
      {category === 'destination' && (
        <Handle type="target" position={Position.Left} className="handle-destination" />
      )}

      {/*
       * Inner card: overflow-hidden here clips the header background colour to
       * the rounded corners without affecting the handles above.
       */}
      <div
        className={clsx(
          'rounded-xl bg-card shadow-node text-slate-100 overflow-hidden border w-full',
          hasHeight && 'flex flex-col flex-1',
          selected ? 'border-sky-400/80 ring-2 ring-sky-400/30' : colors.border,
        )}
      >
        {/* Header */}
        <div className={clsx('px-3 py-2 flex items-center gap-2 shrink-0', colors.headerBg)}>
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
            onClick={(e) => { e.stopPropagation(); setCollapsed((c) => !c); }}
            className="text-white/70 hover:text-white"
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {/* Body */}
        {!collapsed && (
          <div className={clsx('p-3 text-xs', hasHeight && 'flex-1 min-h-0 overflow-auto')}>
            {children}
          </div>
        )}
      </div>

      {/* Resize grip */}
      <ResizeHandle id={id} nodeRef={nodeRef} />
    </div>
  );
}
