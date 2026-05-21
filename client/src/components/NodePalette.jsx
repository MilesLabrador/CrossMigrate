import React from 'react';
import { usePipelineStore } from '../store/usePipelineStore';
import { PALETTE } from '../data/palette';

export default function NodePalette() {
  const { startDrag, addNode } = usePipelineStore();

  const handlePointerDown = (e, type) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    startDrag(type, e.clientX, e.clientY);
  };

  // Double-click: add node at a visible flow position without needing drag
  const handleDoubleClick = (type) => {
    addNode(type, { x: 280 + Math.random() * 60, y: 160 + Math.random() * 60 });
  };

  return (
    <aside className="w-64 shrink-0 bg-card border-r border-slate-800 overflow-y-auto select-none">
      <div className="p-4 border-b border-slate-800">
        <h2 className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Nodes</h2>
        <p className="text-[11px] text-slate-500 mt-1">Drag onto canvas · Double-click to add</p>
      </div>
      {PALETTE.map((group) => (
        <div key={group.group} className="p-3">
          <h3 className={`text-[11px] uppercase tracking-wider font-semibold mb-2 ${group.accent}`}>
            {group.group}
          </h3>
          <div className="space-y-1.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.type}
                  className="palette-item flex items-start gap-2.5 p-2.5 rounded-md bg-cardalt hover:bg-slate-700/60 cursor-grab active:cursor-grabbing transition border border-transparent hover:border-slate-600"
                  onPointerDown={(e) => handlePointerDown(e, item.type)}
                  onDoubleClick={() => handleDoubleClick(item.type)}
                  title="Drag to canvas · Double-click to add"
                >
                  <Icon size={16} className={`mt-0.5 ${group.accent} pointer-events-none shrink-0`} />
                  <div className="pointer-events-none">
                    <div className="text-sm font-medium text-slate-100">{item.label}</div>
                    <div className="text-[11px] text-slate-400 leading-tight">{item.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </aside>
  );
}
