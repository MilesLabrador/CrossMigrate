import React, { useState } from 'react';
import { Search, X } from 'lucide-react';
import { usePipelineStore } from '../../store/usePipelineStore';

const PAGE_SIZE = 10;

export default function PreviewConfig({ nodeId }) {
  const { nodes, nodeStatus } = usePipelineStore();
  const node     = nodes.find((n) => n.id === nodeId);
  const rows     = node?.data?._producedRows || nodeStatus[nodeId]?.sample || [];
  const allRows  = rows.slice(0, 50);

  const [colSearch, setColSearch] = useState('');
  const [rowSearch, setRowSearch] = useState('');
  const [page, setPage]           = useState(0);

  if (!rows.length) {
    return <div className="text-xs text-slate-500 italic">Run the pipeline to see rows here.</div>;
  }

  const allCols = allRows[0] ? Object.keys(allRows[0]) : [];

  // Filter columns
  const cq      = colSearch.toLowerCase();
  const cols    = allCols.filter((c) => c.toLowerCase().includes(cq));

  // Filter rows by value search
  const rq          = rowSearch.toLowerCase();
  const filteredRows = rq
    ? allRows.filter((r) =>
        allCols.some((c) => String(r[c] ?? '').toLowerCase().includes(rq))
      )
    : allRows;

  const pages    = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const pageRows = filteredRows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const clearColSearch = () => setColSearch('');
  const clearRowSearch = () => { setRowSearch(''); setPage(0); };

  return (
    <div className="space-y-2.5">
      {/* Search bar row */}
      <div className="flex gap-2">
        {/* Column search */}
        <div className="relative flex-1">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            value={colSearch}
            onChange={(e) => setColSearch(e.target.value)}
            placeholder="Filter columns…"
            className="w-full pl-7 pr-7 py-1.5 rounded bg-slate-800 border border-slate-700 hover:border-slate-600 focus:border-sky-500 text-slate-300 text-xs outline-none transition placeholder-slate-600"
          />
          {colSearch && (
            <button onClick={clearColSearch} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
              <X size={11} />
            </button>
          )}
        </div>
        {/* Row/value search */}
        <div className="relative flex-1">
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
      </div>

      {/* Status line */}
      <div className="text-[10px] text-slate-500 flex gap-3">
        <span>
          {filteredRows.length === allRows.length
            ? `${allRows.length} rows`
            : <><span className="text-sky-400">{filteredRows.length}</span> of {allRows.length} rows</>}
          {rows.length > 50 && ' (max 50)'}
        </span>
        {colSearch && (
          <span>
            <span className="text-sky-400">{cols.length}</span> of {allCols.length} columns shown
          </span>
        )}
      </div>

      {/* Table */}
      {cols.length === 0 ? (
        <div className="text-xs text-slate-500 italic py-3 text-center">No columns match "{colSearch}".</div>
      ) : (
        <div className="overflow-auto border border-slate-700 rounded">
          <table className="text-[11px] w-full">
            <thead className="bg-slate-800 sticky top-0">
              <tr>
                {cols.map((c) => (
                  <th key={c} className="text-left px-2 py-1.5 text-slate-300 border-b border-slate-700 whitespace-nowrap font-medium">
                    {colSearch
                      ? <Highlight text={c} query={colSearch} />
                      : c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={cols.length} className="px-2 py-4 text-center text-slate-500 italic">
                    No rows match "{rowSearch}".
                  </td>
                </tr>
              ) : (
                pageRows.map((r, i) => (
                  <tr key={i} className="odd:bg-slate-900/40 hover:bg-slate-800/50 transition-colors">
                    {cols.map((c) => {
                      const cell = String(r[c] ?? '');
                      return (
                        <td key={c} className="px-2 py-1 text-slate-200 max-w-[160px] truncate" title={cell}>
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
        <span className="text-slate-500">
          {safePage + 1} / {pages}
        </span>
        <button
          disabled={safePage >= pages - 1}
          onClick={() => setPage((p) => p + 1)}
          className="px-2 py-1 rounded bg-slate-800 disabled:opacity-40 hover:bg-slate-700 transition"
        >
          Next
        </button>
      </div>
    </div>
  );
}

/** Wraps matching substrings in a yellow highlight span */
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
