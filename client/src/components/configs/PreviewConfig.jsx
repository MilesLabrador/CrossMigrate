import React, { useState } from 'react';
import { usePipelineStore } from '../../store/usePipelineStore';

const PAGE_SIZE = 10;

export default function PreviewConfig({ nodeId }) {
  const { nodes, nodeStatus } = usePipelineStore();
  const node = nodes.find((n) => n.id === nodeId);
  const rows = node?.data?._producedRows || nodeStatus[nodeId]?.sample || [];
  const displayed = rows.slice(0, 50);
  const [page, setPage] = useState(0);
  const pageRows = displayed.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const cols = pageRows[0] ? Object.keys(pageRows[0]) : [];
  const pages = Math.max(1, Math.ceil(displayed.length / PAGE_SIZE));

  if (!rows.length) {
    return <div className="text-xs text-slate-500 italic">Run the pipeline to see rows here.</div>;
  }

  return (
    <div className="space-y-2">
      <div className="text-[11px] text-slate-400">
        Showing {pageRows.length} of {displayed.length} (max 50 displayed)
      </div>
      <div className="overflow-auto border border-slate-700 rounded">
        <table className="text-[11px] w-full">
          <thead className="bg-slate-800 sticky top-0">
            <tr>
              {cols.map((c) => (
                <th key={c} className="text-left px-2 py-1 text-slate-300 border-b border-slate-700">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r, i) => (
              <tr key={i} className="odd:bg-slate-900/40">
                {cols.map((c) => (
                  <td key={c} className="px-2 py-1 text-slate-200 max-w-[160px] truncate">
                    {String(r[c] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-[11px] text-slate-300">
        <button
          disabled={page === 0}
          onClick={() => setPage((p) => p - 1)}
          className="px-2 py-1 rounded bg-slate-800 disabled:opacity-40 hover:bg-slate-700"
        >
          Prev
        </button>
        <span>
          {page + 1} / {pages}
        </span>
        <button
          disabled={page >= pages - 1}
          onClick={() => setPage((p) => p + 1)}
          className="px-2 py-1 rounded bg-slate-800 disabled:opacity-40 hover:bg-slate-700"
        >
          Next
        </button>
      </div>
    </div>
  );
}
