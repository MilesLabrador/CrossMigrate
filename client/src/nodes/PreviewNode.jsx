import React, { useState, useRef, useEffect } from 'react';
import { Eye, Maximize2, Minimize2, Plus, X, ChevronDown, Search } from 'lucide-react';
import NodeShell from '../components/NodeShell';
import { usePipelineStore } from '../store/usePipelineStore';
import CellPopup from '../components/CellPopup';

const PAGE_SIZE = 10;

export default function PreviewNode({ id, selected }) {
  const { nodeStatus, nodes } = usePipelineStore();
  const status = nodeStatus[id];
  const node = nodes.find((n) => n.id === id);

  // Full rows from pipeline run (cached on node) or just the sample
  const allRows = node?.data?._producedRows || status?.sample || [];
  const sample  = status?.sample || [];

  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(0);
  const [popup, setPopup] = useState(null);
  const [pinnedCols, setPinnedCols] = useState([]); // [] = show all

  const openPopup = (e, col, value) => {
    e.stopPropagation();
    const v = String(value ?? '');
    if (popup?.col === col && popup?.value === v) { setPopup(null); return; }
    setPopup({ col, value: v, x: e.clientX, y: e.clientY });
  };

  const rows    = expanded ? allRows : sample;
  const allCols = rows[0] ? Object.keys(rows[0]) : [];
  const cols    = pinnedCols.length > 0 ? pinnedCols.filter((c) => allCols.includes(c)) : allCols;

  const pages    = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));
  const pageRows = expanded
    ? allRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
    : sample.slice(0, 3);
  const pageCols = cols;

  const rowCount = status?.rowCount ?? allRows.length;

  const toggleExpand = (e) => {
    e.stopPropagation();
    setExpanded((v) => !v);
    setPage(0);
  };

  // Extra button injected into the NodeShell header via a portal-free trick:
  // We render it as a sibling inside the children area instead.
  return (
    <NodeShell
      id={id}
      selected={selected}
      category="transform"
      icon={Eye}
      typeLabel="Preview"
      widthClass={expanded ? 'w-[680px]' : 'w-64'}
    >
      {!sample.length ? (
        <div className="text-slate-400 text-[11px]">Run pipeline to see rows here</div>
      ) : (
        <div className="space-y-2">
          {/* Header row: row count + expand toggle */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-400">
              {expanded
                ? `${allRows.length.toLocaleString()} rows · page ${page + 1} / ${pages}`
                : `${rowCount.toLocaleString()} rows · showing 3`}
            </span>
            <button
              onClick={toggleExpand}
              className="flex items-center gap-1 text-[10px] text-sky-400 hover:text-sky-300 transition"
            >
              {expanded
                ? <><Minimize2 size={10} /> Collapse</>
                : <><Maximize2 size={10} /> Expand</>}
            </button>
          </div>

          {/* Column picker — only shown when expanded */}
          {expanded && (
            <NodeColPicker
              allCols={allCols}
              pinned={pinnedCols}
              onChange={setPinnedCols}
            />
          )}

          {/* Table */}
          <div className={`overflow-auto rounded border border-slate-700/60 ${expanded ? 'max-h-64' : ''}`}>
            <table className="text-[10px] w-full">
              <thead className="sticky top-0 bg-slate-800">
                <tr>
                  {pageCols.map((c) => (
                    <th
                      key={c}
                      className="text-left text-slate-400 px-2 py-1 whitespace-nowrap border-b border-slate-700"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r, i) => (
                  <tr key={i} className="odd:bg-slate-900/30">
                    {pageCols.map((c) => {
                      const cell = String(r[c] ?? '');
                      const limit = expanded ? 22 : 10;
                      const long = cell.length > limit;
                      return (
                        <td
                          key={c}
                          className={`px-2 py-0.5 text-slate-300 truncate ${expanded ? 'max-w-[160px]' : 'max-w-[80px]'} ${long ? 'cursor-pointer hover:text-sky-300' : ''}`}
                          title={long ? 'Click to preview full value' : cell}
                          onClick={long ? (e) => openPopup(e, c, cell) : undefined}
                        >
                          {cell}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination — only in expanded mode */}
          {expanded && pages > 1 && (
            <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
              <button
                disabled={page === 0}
                onClick={(e) => { e.stopPropagation(); setPage((p) => p - 1); }}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 transition"
              >
                ← Prev
              </button>
              <span>{page + 1} / {pages}</span>
              <button
                disabled={page >= pages - 1}
                onClick={(e) => { e.stopPropagation(); setPage((p) => p + 1); }}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 transition"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}
      {popup && <CellPopup {...popup} onClose={() => setPopup(null)} />}
    </NodeShell>
  );
}

// ---------------------------------------------------------------------------
// NodeColPicker — compact chip + button-dropdown column filter for the canvas node
// ---------------------------------------------------------------------------
function NodeColPicker({ allCols, pinned, onChange }) {
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

  const available = allCols.filter(
    (c) => !pinned.includes(c) && c.toLowerCase().includes(search.toLowerCase())
  );

  const add    = (col) => { onChange([...pinned, col]); setOpen(false); setSearch(''); };
  const remove = (col) => onChange(pinned.filter((c) => c !== col));

  return (
    <div
      className="flex flex-wrap items-center gap-1"
      ref={ref}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Chips */}
      {pinned.map((c) => (
        <span
          key={c}
          className="flex items-center gap-0.5 bg-slate-700 text-sky-300 text-[10px] px-1.5 py-0.5 rounded"
        >
          {c}
          <button onClick={() => remove(c)} className="text-slate-400 hover:text-rose-400 transition">
            <X size={8} />
          </button>
        </span>
      ))}
      {pinned.length > 0 && (
        <button
          onClick={() => onChange([])}
          className="text-[10px] text-slate-500 hover:text-slate-300 transition px-1"
        >
          clear
        </button>
      )}

      {/* Add-column dropdown */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-0.5 text-[10px] text-sky-400 hover:text-sky-300 transition"
        >
          <Plus size={10} />
          {pinned.length === 0 ? 'Filter cols' : 'Add'}
          <ChevronDown size={9} />
        </button>

        {open && (
          <div className="absolute z-50 left-0 top-full mt-1 w-52 bg-slate-900 border border-slate-700 rounded shadow-xl flex flex-col">
            <div className="p-1.5 border-b border-slate-700">
              <div className="flex items-center gap-1 bg-slate-800 rounded px-2 py-1">
                <Search size={10} className="text-slate-500 shrink-0" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search columns…"
                  className="bg-transparent text-[11px] text-slate-200 outline-none w-full placeholder-slate-600"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="text-slate-500 hover:text-slate-300">
                    <X size={9} />
                  </button>
                )}
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {available.length === 0 ? (
                <div className="px-3 py-2 text-[11px] text-slate-500 italic">
                  {allCols.length === 0 ? 'No columns' : pinned.length === allCols.length ? 'All selected' : `No match`}
                </div>
              ) : (
                available.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => add(c)}
                    className="w-full text-left px-3 py-1.5 text-[11px] text-slate-200 hover:bg-slate-800 transition truncate"
                  >
                    {c}
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
