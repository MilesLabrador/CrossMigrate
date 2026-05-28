import React, { useState } from 'react';
import { X } from 'lucide-react';
import CellPopup from './CellPopup';
import { usePipelineStore } from '../store/usePipelineStore';
import XLSXInputConfig from './configs/XLSXInputConfig';
import CSVInputConfig from './configs/CSVInputConfig';
import SQLInputConfig from './configs/SQLInputConfig';
import SQLOutputConfig from './configs/SQLOutputConfig';
import DataverseInputConfig from './configs/DataverseInputConfig';
import SelectColumnsConfig from './configs/SelectColumnsConfig';
import SelectMapConfig from './configs/SelectMapConfig';
import FilterConfig from './configs/FilterConfig';
import TransformConfig from './configs/TransformConfig';
import DeduplicateConfig from './configs/DeduplicateConfig';
import RandomSampleConfig from './configs/RandomSampleConfig';
import CSVExportConfig from './configs/CSVExportConfig';
import DataverseOutputConfig from './configs/DataverseOutputConfig';
import PreviewConfig from './configs/PreviewConfig';
import DataverseViewConfig from './configs/DataverseViewConfig';

const REGISTRY = {
  dataverseInput: { title: 'Dataverse Input', Comp: DataverseInputConfig },
  dataverseView:  { title: 'Dataverse View',  Comp: DataverseViewConfig },
  xlsxInput: { title: 'XLSX Input', Comp: XLSXInputConfig },
  csvInput: { title: 'CSV Input', Comp: CSVInputConfig },
  sqlInput:  { title: 'SQL Input',  Comp: SQLInputConfig },
  sqlOutput: { title: 'SQL Output', Comp: SQLOutputConfig },
  manualData: { title: 'Manual Data', Comp: () => <div className="text-xs text-slate-400">Edit cells directly on the node.</div> },
  selectColumns: { title: 'Select Columns', Comp: SelectColumnsConfig },
  selectMap: { title: 'Select / Map', Comp: SelectMapConfig },
  filter: { title: 'Filter', Comp: FilterConfig },
  transform: { title: 'Transform', Comp: TransformConfig },
  deduplicate:  { title: 'Deduplicate',   Comp: DeduplicateConfig },
  randomSample: { title: 'Random Sample', Comp: RandomSampleConfig },
  csvExport: { title: 'CSV Export', Comp: CSVExportConfig },
  dataverseOutput: { title: 'Dataverse Output', Comp: DataverseOutputConfig },
  preview: { title: 'Preview', Comp: PreviewConfig },
  previewColumns: { title: 'Preview Columns', Comp: () => <div className="text-xs text-slate-400">Schema is inferred automatically when the pipeline runs. No configuration needed.</div> },
};

export default function ConfigPanel() {
  const { configPanelOpen, selectedNodeId, nodes, closeConfigPanel, nodeStatus } = usePipelineStore();
  const [popup, setPopup] = useState(null);

  if (!configPanelOpen || !selectedNodeId) return null;
  const node = nodes.find((n) => n.id === selectedNodeId);
  if (!node) return null;
  const entry = REGISTRY[node.type];
  if (!entry) return null;
  const { Comp, title } = entry;
  const sample = nodeStatus[selectedNodeId]?.sample;

  const openPopup = (e, col, value) => {
    e.stopPropagation();
    const v = String(value ?? '');
    if (popup?.col === col && popup?.value === v) { setPopup(null); return; }
    setPopup({ col, value: v, x: e.clientX, y: e.clientY });
  };

  return (
    <aside className="w-[400px] shrink-0 bg-card border-l border-slate-800 overflow-y-auto animate-slide-in-right">
      <div className="sticky top-0 bg-card border-b border-slate-800 px-4 py-3 flex items-center justify-between z-10">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Configure</div>
          <div className="text-sm font-semibold text-slate-100">{node.data?.name || title}</div>
        </div>
        <button
          onClick={closeConfigPanel}
          className="text-slate-400 hover:text-slate-100 p-1 rounded hover:bg-slate-800"
        >
          <X size={16} />
        </button>
      </div>
      <div className="p-4">
        <Comp nodeId={selectedNodeId} />
      </div>

      {sample?.length > 0 && (
        <div className="border-t border-slate-800 p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1.5 font-semibold">
            Sample (first 3 rows)
          </div>
          <div className="overflow-auto border border-slate-700 rounded text-[11px]">
            <table className="w-full">
              <thead className="bg-slate-800">
                <tr>
                  {Object.keys(sample[0]).map((c) => (
                    <th key={c} className="px-2 py-1 text-left text-slate-300 whitespace-nowrap">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sample.map((r, i) => (
                  <tr key={i} className="odd:bg-slate-900/40">
                    {Object.keys(sample[0]).map((c) => {
                      const cell = String(r[c] ?? '');
                      const long = cell.length > 20;
                      return (
                        <td
                          key={c}
                          className={`px-2 py-1 text-slate-200 max-w-[120px] truncate ${long ? 'cursor-pointer hover:text-sky-300' : ''}`}
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
        </div>
      )}
      {popup && <CellPopup {...popup} onClose={() => setPopup(null)} />}
    </aside>
  );
}
