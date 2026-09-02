import React from 'react';
import { AlertTriangle, Pin, X } from 'lucide-react';
import { usePipelineStore } from '../../store/usePipelineStore';
import { inferType } from '../../lib/inferType';

const PINNABLE_TYPES = ['text', 'number', 'boolean', 'date'];

// Per-column type pinning for source nodes. Each column shows the type
// inferred from a sample of its data (first 100 rows); that inference is only
// a suggestion. Pinning a column overrides it with an explicit type (and an
// optional date format), stored in config.schema so it persists with the
// pipeline. At run time the server enforces pins softly: values are coerced to
// the pinned type where possible, and values that won't convert are left
// as-is and reported back as per-field warning counts — never dropped.
export default function SchemaEditor({ nodeId }) {
  const { nodes, updateNodeConfig, nodeStatus } = usePipelineStore();
  const node = nodes.find((n) => n.id === nodeId);
  const columns = node?.data?.columns || [];
  const rows = node?.data?.rows || [];
  const pinned = node?.data?.config?.schema || [];

  if (!columns.length) return null;

  const pinnedByName = new Map(pinned.map((s) => [s.name, s]));
  const sample = rows.slice(0, 100);
  const inferredFor = (col) => inferType(sample.map((r) => r[col]));

  const setPin = (name, patch) => {
    const existing = pinnedByName.get(name);
    let next;
    if (patch === null) {
      next = pinned.filter((s) => s.name !== name); // back to auto
    } else if (existing) {
      next = pinned.map((s) => (s.name === name ? { ...s, ...patch } : s));
    } else {
      next = [...pinned, { name, ...patch }];
    }
    updateNodeConfig(nodeId, { schema: next });
  };

  // Pinned columns the current file no longer has — schema drift.
  const missing = pinned.filter((s) => !columns.includes(s.name));
  const runDrift = nodeStatus[nodeId]?.meta?.drift;
  const coercionErrors = nodeStatus[nodeId]?.meta?.coercionErrors;

  return (
    <div className="border-t border-slate-700 pt-3 mt-3">
      <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1.5 font-semibold flex items-center gap-1.5">
        <Pin size={10} /> Column types
        <span className="ml-1 text-slate-600 normal-case font-normal text-[10px]">
          (auto = inferred each run; pin to enforce)
        </span>
      </div>

      <div className="space-y-1 max-h-64 overflow-y-auto" onWheelCapture={(e) => e.stopPropagation()}>
        {columns.map((col) => {
          const pin = pinnedByName.get(col);
          const errCount = coercionErrors?.[col];
          return (
            <div key={col} className="grid grid-cols-[1fr_auto] gap-1.5 items-center">
              <div className="text-[11px] text-slate-300 truncate flex items-center gap-1" title={col}>
                {col}
                {errCount > 0 && (
                  <span
                    className="text-amber-400 text-[10px] shrink-0"
                    title={`${errCount} value${errCount > 1 ? 's' : ''} could not be converted on the last run`}
                  >
                    <AlertTriangle size={10} className="inline" /> {errCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <select
                  value={pin?.type || 'auto'}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPin(col, v === 'auto' ? null : { type: v });
                  }}
                  className={`bg-slate-800 border rounded px-1.5 py-0.5 text-[11px] ${
                    pin ? 'border-sky-600 text-sky-300' : 'border-slate-700 text-slate-400'
                  }`}
                >
                  <option value="auto">auto ({inferredFor(col)})</option>
                  {PINNABLE_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                {pin?.type === 'date' && (
                  <input
                    value={pin.format || ''}
                    onChange={(e) => setPin(col, { format: e.target.value || undefined })}
                    placeholder="fmt e.g. DD/MM/YYYY"
                    title="Strict input format (dayjs tokens). Blank = loose ISO parsing."
                    className="w-28 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] text-slate-300"
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {(missing.length > 0 || runDrift?.missing?.length > 0) && (
        <div className="mt-2 bg-amber-950/40 border border-amber-800/60 rounded px-2 py-1.5 space-y-1">
          <div className="text-[10px] text-amber-300 font-medium flex items-center gap-1">
            <AlertTriangle size={10} /> Schema drift — pinned columns missing from the data
          </div>
          {(missing.length ? missing : (runDrift?.missing || []).map((name) => ({ name }))).map((s) => (
            <div key={s.name} className="flex items-center justify-between text-[10px] text-amber-200/80">
              <span className="font-mono truncate">{s.name}</span>
              <button
                onClick={() => setPin(s.name, null)}
                className="text-amber-400 hover:text-amber-200 flex items-center gap-0.5"
                title="Forget this pin"
              >
                <X size={9} /> unpin
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
