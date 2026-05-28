import React, { useState, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { usePipelineStore } from '../../store/usePipelineStore';
import CellPopup from '../CellPopup';

const PAGE_SIZE = 10;

export default function PreviewConfig({ nodeId }) {
  const { nodes, nodeStatus } = usePipelineStore();
  const node    = nodes.find((n) => n.id === nodeId);
  const rows    = node?.data?._producedRows || nodeStatus[nodeId]?.sample || [];
  const allRows = rows.slice(0, 50);

  // pinnedCols: columns explicitly selected to show. Empty = show all.
  const [pinnedCols, setPinnedCols] = useState([]);
  const [rowSearch, setRowSearch]   = useState('');
  const [page, setPage]             = useState(0);
  const [popup, setPopup]           = useState(null);

  const openPopup = (e, col, value) => {
    e.stopPropagation();
    const v = String(value ?? '');
    if (popup?.col === col && popup?.value === v) { setPopup(null); return; }
    setPopup({ col, value: v, x: e.clientX, y: e.clientY });
  };

  if (!rows.length) {
    return <div className="text-xs text-slate-500 italic">Run the pipeline to see rows here.</div>;
  }

  const allCols = allRows[0] ? Object.keys(allRows[0]) : [];

  // Columns to actually display
  const cols = pinnedCols.length > 0
    ? pinnedCols.filter((c) => allCols.includes(c)) // preserve selection order, guard stale cols
    : allCols;

  const addCol    = (c) => { if (!pinnedCols.includes(c)) setPinnedCols((p) => [...p, c]); };
  const removeCol = (c) => setPinnedCols((p) => p.filter((x) => x !== c));
  const clearCols = () => setPinnedCols([]);

  // Row value search
  const rq = rowSearch.toLowerCase();
  const filteredRows = rq
    ? allRows.filter((r) => allCols.some((c) => String(r[c] ?? '').toLowerCase().includes(rq)))
    : allRows;

  const pages    = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const pageRows = filteredRows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const clearRowSearch = () => { setRowSearch(''); setPage(0); };

  return (
    <div className="space-y-2.5">

      {/* Column chip picker */}
      <ColumnPicker
        allCols={allCols}
        pinned={pinnedCols}
        onAdd={addCol}
        onRemove={removeCol}
        onClear={clearCols}
      />

      {/* Row/value search */}
      <div className="relative">
        <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        <input
          value={rowSearch}
          onChange={(e) => { setRowSearch(e.target.value); setPage(0); }}
          placeholder="Search values…"
          className="w-full pl-7 pr-7 py-1.5 rounded bg-slate-800 border border-slate-700 hover:border-slate-600 focus:border-sky-500 text-slate-300 text-xs outline-none transition placeholder-slate-600"
        />
        {rowSearch && (
          <button onClick={clearRowSearch} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
            <X size={11} />
          </button>
        )}
      </div>

      {/* Status line */}
      <div className="text-[10px] text-slate-500 flex gap-3">
        <span>
          {filteredRows.length === allRows.length
            ? `${allRows.length} rows`
            : <><span className="text-sky-400">{filteredRows.length}</span> of {allRows.length} rows</>}
          {rows.length > 50 && ' (max 50)'}
        </span>
        {pinnedCols.length > 0 && (
          <span>
            <span className="text-sky-400">{cols.length}</span> of {allCols.length} columns shown
          </span>
        )}
      </div>

      {/* Table */}
      {cols.length === 0 ? (
        <div className="text-xs text-slate-500 italic py-3 text-center">No columns to show.</div>
      ) : (
        <div className="overflow-auto border border-slate-700 rounded">
          <table className="text-[11px] w-full">
            <thead className="bg-slate-800 sticky top-0">
              <tr>
                {cols.map((c) => (
                  <th key={c} className="text-left px-2 py-1.5 text-slate-300 border-b border-slate-700 whitespace-nowrap font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={cols.length} className="px-2 py-4 text-center text-slate-500 italic">
                    No rows match &ldquo;{rowSearch}&rdquo;.
                  </td>
                </tr>
              ) : (
                pageRows.map((r, i) => (
                  <tr key={i} className="odd:bg-slate-900/40 hover:bg-slate-800/50 transition-colors">
                    {cols.map((c) => {
                      const cell = String(r[c] ?? '');
                      const long = cell.length > 24;
                      return (
                        <td
                          key={c}
                          className={`px-2 py-1 text-slate-200 max-w-[160px] truncate ${long ? 'cursor-pointer hover:text-sky-300' : ''}`}
                          title={long ? 'Click to preview full value' : cell}
                          onClick={long ? (e) => openPopup(e, c, cell) : undefined}
                        >
                          {rowSearch ? <Highlight text={cell} query={rowSearch} /> : cell}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between text-[11px] text-slate-300">
        <button
          disabled={safePage === 0}
          onClick={() => setPage((p) => p - 1)}
          className="px-2 py-1 rounded bg-slate-800 disabled:opacity-40 hover:bg-slate-700 transition"
        >
          Prev
        </button>
        <span className="text-slate-500">{safePage + 1} / {pages}</span>
        <button
          disabled={safePage >= pages - 1}
          onClick={() => setPage((p) => p + 1)}
          className="px-2 py-1 rounded bg-slate-800 disabled:opacity-40 hover:bg-slate-700 transition"
        >
          Next
        </button>
      </div>

      {popup && <CellPopup {...popup} onClose={() => setPopup(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ColumnPicker — combobox: always-visible search input + dropdown + chips
// ---------------------------------------------------------------------------
function ColumnPicker({ allCols, pinned, onAdd, onRemove, onClear }) {
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const available = allCols.filter(
    (c) => !pinned.includes(c) && c.toLowerCase().includes(search.toLowerCase())
  );

  const pick = (c) => { onAdd(c); setSearch(''); /* keep dropdown open for more picks */ };

  return (
    <div className="space-y-1.5" ref={ref}>
      {/* Label row */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
          Columns
        </span>
        {pinned.length > 0 && (
          <button onClick={onClear} className="text-[10px] text-slate-500 hover:text-slate-300 transition">
            Show all
          </button>
        )}
      </div>

      {/* Selected chips */}
      {pinned.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {pinned.map((c) => (
            <span key={c} className="flex items-center gap-1 bg-slate-700 text-sky-300 text-[11px] px-1.5 py-0.5 rounded">
              {c}
              <button onClick={() => onRemove(c)} className="text-slate-400 hover:text-rose-400 transition">
                <X size={9} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Combobox search input */}
      <div className="relative">
        <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 hover:border-slate-600 focus-within:border-sky-500 rounded px-2 py-1.5 transition">
          <Search size={11} className="text-slate-500 shrink-0" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={pinned.length === 0 ? 'Filter to specific columns…' : 'Add another column…'}
            className="bg-transparent text-xs text-slate-200 outline-none w-full placeholder-slate-600"
          />
          {search && (
            <button onClick={() => { setSearch(''); setOpen(false); }} className="text-slate-500 hover:text-slate-300">
              <X size={10} />
            </button>
          )}
        </div>

        {open && (
          <div className="absolute z-50 left-0 top-full mt-1 w-full bg-slate-900 border border-slate-700 rounded shadow-xl flex flex-col">
            <div className="max-h-52 overflow-y-auto">
              {available.length === 0 ? (
                <div className="px-3 py-3 text-[11px] text-slate-500 italic text-center">
                  {allCols.length === 0 ? 'No columns available'
                    : pinned.length === allCols.length ? 'All columns selected'
                    : `No match for "${search}"`}
                </div>
              ) : (
                available.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); pick(c); }} // preventDefault keeps input focused
                    className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 transition truncate"
                  >
                    {search
                      ? <Highlight text={c} query={search} />
                      : c}
                  </button>
                ))
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Highlight — wraps matching substrings in a yellow mark
// ---------------------------------------------------------------------------
function Highlight({ text, query }) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-400/30 text-yellow-200 rounded-[2px]">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}
