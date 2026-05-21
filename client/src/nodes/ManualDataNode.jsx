import React from 'react';
import { Pencil, Plus, X } from 'lucide-react';
import NodeShell from '../components/NodeShell';
import { usePipelineStore } from '../store/usePipelineStore';

const MAX_ROWS = 10;

export default function ManualDataNode({ id, selected }) {
  const { nodes, updateNodeData } = usePipelineStore();
  const node = nodes.find((n) => n.id === id);
  const columns = node?.data?.columns || ['col1', 'col2'];
  const rows = node?.data?.rows || [];

  const setColumns = (cols) => {
    // Update rows so each has all keys
    const newRows = rows.map((r) => {
      const o = {};
      cols.forEach((c) => (o[c] = r[c] ?? ''));
      return o;
    });
    updateNodeData(id, { columns: cols, rows: newRows });
  };

  const setCell = (rowIdx, col, value) => {
    const next = rows.map((r, i) => (i === rowIdx ? { ...r, [col]: value } : r));
    updateNodeData(id, { rows: next });
  };

  const addRow = () => {
    if (rows.length >= MAX_ROWS) return;
    const blank = {};
    columns.forEach((c) => (blank[c] = ''));
    updateNodeData(id, { rows: [...rows, blank] });
  };

  const removeRow = (idx) => updateNodeData(id, { rows: rows.filter((_, i) => i !== idx) });

  const renameColumn = (idx, newName) => {
    const cols = [...columns];
    const old = cols[idx];
    if (!newName.trim() || cols.includes(newName)) return;
    cols[idx] = newName;
    const newRows = rows.map((r) => {
      const { [old]: v, ...rest } = r;
      return { ...rest, [newName]: v };
    });
    updateNodeData(id, { columns: cols, rows: newRows });
  };

  const addCol = () => {
    let i = columns.length + 1;
    let name = `col${i}`;
    while (columns.includes(name)) name = `col${++i}`;
    setColumns([...columns, name]);
  };

  return (
    <NodeShell id={id} selected={selected} category="source" icon={Pencil} typeLabel="Manual">
      <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
        <div className="overflow-x-auto max-w-[420px]">
          <table className="text-[11px] w-full">
            <thead>
              <tr>
                {columns.map((c, i) => (
                  <th key={c} className="px-1 pb-1">
                    <input
                      value={c}
                      onChange={(e) => renameColumn(i, e.target.value)}
                      className="w-20 bg-slate-800 px-1 rounded text-slate-200 outline-none"
                    />
                  </th>
                ))}
                <th>
                  <button
                    onClick={addCol}
                    className="text-slate-400 hover:text-slate-100"
                    title="Add column"
                  >
                    <Plus size={12} />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {columns.map((c) => (
                    <td key={c} className="px-0.5 py-0.5">
                      <input
                        value={r[c] ?? ''}
                        onChange={(e) => setCell(ri, c, e.target.value)}
                        className="w-20 bg-cardalt px-1 py-0.5 rounded text-slate-200 outline-none border border-transparent focus:border-sky-500"
                      />
                    </td>
                  ))}
                  <td>
                    <button
                      onClick={() => removeRow(ri)}
                      className="text-slate-500 hover:text-rose-400"
                    >
                      <X size={11} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          onClick={addRow}
          disabled={rows.length >= MAX_ROWS}
          className="text-[11px] text-sky-400 hover:underline disabled:opacity-50"
        >
          + Add row ({rows.length}/{MAX_ROWS})
        </button>
      </div>
    </NodeShell>
  );
}
