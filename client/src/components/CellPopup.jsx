import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Check, X } from 'lucide-react';

/**
 * CellPopup — floating card that shows the full value of a truncated cell.
 *
 * Usage:
 *   const [popup, setPopup] = useState(null); // { col, value, x, y }
 *
 *   <td onClick={(e) => openPopup(e, col, value)}>…</td>
 *   {popup && <CellPopup {...popup} onClose={() => setPopup(null)} />}
 *
 * openPopup helper (copy into the consumer):
 *   const openPopup = (e, col, value) => {
 *     e.stopPropagation();
 *     setPopup({ col, value, x: e.clientX, y: e.clientY });
 *   };
 */

const POPUP_W = 320;
const POPUP_MAX_H = 260;
const MARGIN = 12; // keep away from viewport edges

export default function CellPopup({ col, value, x, y, onClose }) {
  const [copied, setCopied] = useState(false);
  const ref = useRef(null);

  // --- position: try right of click, flip left if too close to edge ----------
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = x + 10;
  if (left + POPUP_W + MARGIN > vw) left = x - POPUP_W - 10;
  left = Math.max(MARGIN, left);

  let top = y - 8;
  // We don't know the exact height yet, but clamp roughly
  top = Math.min(top, vh - POPUP_MAX_H - MARGIN);
  top = Math.max(MARGIN, top);

  // Close on Escape or click outside
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  const copy = () => {
    navigator.clipboard.writeText(value ?? '').then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const display = value == null ? <span className="italic text-slate-500">null</span>
    : value === ''              ? <span className="italic text-slate-500">empty string</span>
    : value;

  return createPortal(
    <div
      ref={ref}
      style={{ left, top, width: POPUP_W, zIndex: 99999 }}
      className="fixed bg-slate-900 border border-slate-600 rounded-lg shadow-2xl flex flex-col"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700 bg-slate-800 rounded-t-lg">
        <span className="text-[11px] font-semibold text-sky-400 truncate max-w-[230px]" title={col}>
          {col}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={copy}
            title="Copy to clipboard"
            className="text-slate-400 hover:text-slate-100 transition flex items-center gap-1 text-[10px]"
          >
            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition ml-1">
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Value body */}
      <div
        className="px-3 py-2.5 text-xs text-slate-200 overflow-y-auto whitespace-pre-wrap break-all leading-relaxed"
        style={{ maxHeight: POPUP_MAX_H - 40 }}
      >
        {display}
      </div>

      {/* Footer: char count */}
      {value != null && value !== '' && (
        <div className="px-3 py-1 border-t border-slate-700/60 text-[10px] text-slate-500 rounded-b-lg">
          {value.length.toLocaleString()} character{value.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>,
    document.body,
  );
}
