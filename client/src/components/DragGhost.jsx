import React from 'react';
import { usePipelineStore } from '../store/usePipelineStore';
import { ALL_PALETTE_ITEMS } from '../data/palette';

export default function DragGhost() {
  const drag = usePipelineStore((s) => s.drag);
  if (!drag) return null;

  const item = ALL_PALETTE_ITEMS.find((i) => i.type === drag.type);
  const Icon = item?.icon;
  const label = item?.label ?? drag.type;

  return (
    <div
      style={{
        position: 'fixed',
        left: drag.ghostX + 12,
        top: drag.ghostY - 16,
        pointerEvents: 'none',
        zIndex: 9999,
      }}
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sky-600 text-white text-xs font-semibold shadow-xl opacity-90"
    >
      {Icon && <Icon size={14} className="shrink-0" />}
      {label}
    </div>
  );
}
