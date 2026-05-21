import React, { useState } from 'react';
import { Eye, Maximize2, Minimize2 } from 'lucide-react';
import NodeShell from '../components/NodeShell';
import { usePipelineStore } from '../store/usePipelineStore';

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

  const rows = expanded ? allRows : sample;
  const cols = rows[0] ? Object.keys(rows[0]) : [];

  const pages     = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));
  const pageRows  = expanded
    ? allRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
    : sample.slice(0, 3);
  const pageCols  = pageRows[0] ? Object.keys(pageRows[0]) : cols;

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
                    {pageCols.map((c) => (
                      <td
                        key={c}
                        className={`px-2 py-0.5 text-slate-300 truncate ${expanded ? 'max-w-[160px]' : 'max-w-[80px]'}`}
                        title={String(r[c] ?? '')}
                      >
                        {String(r[c] ?? '')}
                      </td>
                    ))}
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
    </NodeShell>
  );
}
