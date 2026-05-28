import React, { useRef, useState, useEffect } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

/**
 * Shared searchable single-column dropdown.
 *
 * Props:
 *   value        – currently selected value (string)
 *   options      – array of { value, label, sub? } OR plain strings
 *   onChange     – (value: string) => void
 *   placeholder  – text shown when nothing selected
 *   className    – extra classes on the trigger button
 *   disabled     – disables the button
 */
export default function ColumnDropdown({
  value = '',
  options = [],
  onChange,
  placeholder = '— select —',
  className = '',
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    if (!open) { setSearch(''); return; }
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Normalise plain strings to { value, label }
  const normalised = options.map((o) =>
    typeof o === 'string' ? { value: o, label: o } : o
  );

  const filtered = normalised.filter(
    (o) =>
      o.label.toLowerCase().includes(search.toLowerCase()) ||
      o.value.toLowerCase().includes(search.toLowerCase())
  );

  const selected = normalised.find((o) => o.value === value);

  const choose = (val) => { onChange(val); setOpen(false); };

  return (
    <div className={`relative min-w-0 ${className}`} ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-1.5 bg-slate-800 border rounded px-2 py-1 text-xs transition
          ${disabled
            ? 'border-slate-700 opacity-50 cursor-not-allowed'
            : 'border-slate-700 hover:border-slate-500 text-slate-200 cursor-pointer'}`}
      >
        <span className="truncate flex-1 text-left">
          {selected ? (
            <span>
              {selected.label}
              {selected.sub && (
                <span className="text-slate-500 ml-1 text-[10px]">{selected.sub}</span>
              )}
            </span>
          ) : (
            <span className="text-slate-500">{placeholder}</span>
          )}
        </span>
        <ChevronDown size={11} className="text-slate-500 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 left-0 top-full mt-1 w-full min-w-[180px] bg-slate-900 border border-slate-700 rounded shadow-xl flex flex-col">
          {/* Search bar */}
          <div className="p-1.5 border-b border-slate-700">
            <div className="flex items-center gap-1.5 bg-slate-800 rounded px-2 py-1">
              <Search size={11} className="text-slate-500 shrink-0" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="bg-transparent text-xs text-slate-200 outline-none w-full placeholder-slate-600"
              />
              {search && (
                <button onClick={() => setSearch('')} className="text-slate-500 hover:text-slate-300">
                  <X size={10} />
                </button>
              )}
            </div>
          </div>

          {/* Options list */}
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-slate-500 italic">
                {options.length === 0 ? 'No options available' : `No match for "${search}"`}
              </div>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => choose(o.value)}
                  className={`w-full text-left px-3 py-1.5 text-xs transition
                    ${o.value === value
                      ? 'bg-sky-900/40 text-sky-300'
                      : 'text-slate-200 hover:bg-slate-800'}`}
                >
                  <span className="truncate block">{o.label}</span>
                  {o.sub && <span className="text-slate-500 text-[10px]">{o.sub}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
