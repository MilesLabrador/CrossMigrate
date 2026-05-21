import React, { useState } from 'react';
import { DatabaseZap, RefreshCw, AlertCircle, ShieldAlert } from 'lucide-react';
import NodeShell from '../components/NodeShell';
import { usePipelineStore } from '../store/usePipelineStore';
import { fetchDataverseRows } from '../lib/api';

export default function DataverseInputNode({ id, selected }) {
  const { nodes, updateNodeData } = usePipelineStore();
  const node = nodes.find((n) => n.id === id);
  const cfg = node?.data?.config || {};
  const rows = node?.data?.rows || [];
  const columns = node?.data?.columns || [];
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState(null);

  const canFetch = !!cfg.entity;

  const handleFetch = async (e) => {
    e.stopPropagation();
    if (!canFetch) return;
    setFetching(true);
    setError(null);
    try {
      const result = await fetchDataverseRows({
        entity:  cfg.entity,
        select:  cfg.select  || '',
        filter:  cfg.filter  || '',
        top:     cfg.top     || 5000,
        orgUrl:  cfg.orgUrl  || '',
      });
      updateNodeData(id, {
        rows: result.rows,
        columns: result.columns,
        _lastFetched: new Date().toLocaleTimeString(),
        _debugUrl: result._debugUrl || null,
        _zeroRows: result.rowCount === 0,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  };

  return (
    <NodeShell
      id={id}
      selected={selected}
      category="source"
      icon={DatabaseZap}
      typeLabel="Dataverse"
    >
      {!cfg.entity ? (
        <div className="text-slate-400 text-[11px] text-center py-3">
          Click node to configure entity
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-300 font-medium text-xs truncate">
              {cfg.entityDisplayName || cfg.entity}
            </span>
            {rows.length > 0 && (
              <span className="text-[10px] text-emerald-400 shrink-0">
                {rows.length.toLocaleString()} rows
              </span>
            )}
          </div>

          {columns.length > 0 && (
            <div className="text-[10px] text-slate-500 truncate">
              {columns.slice(0, 6).join(', ')}{columns.length > 6 ? ` +${columns.length - 6}` : ''}
            </div>
          )}

          {node?.data?._lastFetched && (
            <div className="text-[10px] text-slate-600">
              Fetched at {node.data._lastFetched}
            </div>
          )}

          {node?.data?._zeroRows && !error && (
            <div className="flex items-start gap-1 text-amber-400 text-[10px]">
              <ShieldAlert size={10} className="shrink-0 mt-0.5" />
              <span>
                0 rows returned — app may lack read permission for this table in Dataverse.
                {node.data._debugUrl && (
                  <span className="block text-slate-600 mt-0.5 break-all font-mono">{node.data._debugUrl}</span>
                )}
              </span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-1 text-rose-400 text-[10px]">
              <AlertCircle size={10} className="shrink-0 mt-0.5" />
              <span className="break-all">{error}</span>
            </div>
          )}

          <button
            onClick={handleFetch}
            disabled={fetching}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded bg-emerald-700/40 hover:bg-emerald-700/60 text-emerald-300 text-[11px] font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw size={11} className={fetching ? 'animate-spin' : ''} />
            {fetching ? 'Fetching…' : rows.length ? 'Re-fetch' : 'Fetch rows'}
          </button>
        </div>
      )}
    </NodeShell>
  );
}
