import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  BackgroundVariant,
} from '@xyflow/react';
import { Copy, Trash2, Boxes } from 'lucide-react';
import { usePipelineStore } from '../store/usePipelineStore';

import GroupNode            from '../nodes/GroupNode';
import DataverseInputNode   from '../nodes/DataverseInputNode';
import PreviewColumnsNode  from '../nodes/PreviewColumnsNode';
import RandomSampleNode   from '../nodes/RandomSampleNode';
import XLSXInputNode       from '../nodes/XLSXInputNode';
import CSVInputNode        from '../nodes/CSVInputNode';
import ManualDataNode      from '../nodes/ManualDataNode';
import SelectColumnsNode  from '../nodes/SelectColumnsNode';
import SelectMapNode       from '../nodes/SelectMapNode';
import FilterNode          from '../nodes/FilterNode';
import TransformNode       from '../nodes/TransformNode';
import DeduplicateNode     from '../nodes/DeduplicateNode';
import PreviewNode         from '../nodes/PreviewNode';
import FieldUsageNode      from '../nodes/FieldUsageNode';
import CSVExportNode       from '../nodes/CSVExportNode';
import DataverseOutputNode from '../nodes/DataverseOutputNode';
import SQLInputNode        from '../nodes/SQLInputNode';
import SQLOutputNode       from '../nodes/SQLOutputNode';

const nodeTypes = {
  group:           GroupNode,
  dataverseInput:  DataverseInputNode,
  previewColumns:  PreviewColumnsNode,
  randomSample:    RandomSampleNode,
  xlsxInput:       XLSXInputNode,
  csvInput:        CSVInputNode,
  manualData:      ManualDataNode,
  selectColumns:   SelectColumnsNode,
  selectMap:       SelectMapNode,
  filter:          FilterNode,
  transform:       TransformNode,
  deduplicate:     DeduplicateNode,
  preview:         PreviewNode,
  fieldUsage:      FieldUsageNode,
  csvExport:       CSVExportNode,
  dataverseOutput: DataverseOutputNode,
  sqlInput:        SQLInputNode,
  sqlOutput:       SQLOutputNode,
};

function CanvasInner() {
  const {
    nodes, edges,
    onNodesChange, onEdgesChange, onConnect,
    addNode, selectNode, selectedNodeId,
    running, nodeStatus,
    moveDrag, endDrag,
    deleteNodes, duplicateNodes, groupNodes,
  } = usePipelineStore();

  const canvasRef = useRef(null);
  const { screenToFlowPosition } = useReactFlow();

  // ─── Node context menu (right-click) ───────────────────────────────────────
  const [contextMenu, setContextMenu] = useState(null); // { ids: [...], x, y }

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKeyDown = (e) => { if (e.key === 'Escape') close(); };
    // Skip the event that just opened the menu — it's still bubbling when this
    // effect attaches, so listening for 'click'/'contextmenu' here would catch
    // it and close the menu immediately after it opens.
    const raf = requestAnimationFrame(() => {
      window.addEventListener('click', close);
      window.addEventListener('contextmenu', close);
    });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', close, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', close, true);
    };
  }, [contextMenu]);

  // Combine both selection mechanisms into one "currently selected" id list:
  // box-select (drives node.selected) takes priority when 2+ nodes are
  // highlighted; otherwise fall back to the single NodeShell-driven click
  // selection (selectedNodeId) — see the selection-sync comment block below.
  const effectiveSelectedIds = useMemo(() => {
    const boxSelected = nodes.filter((n) => n.selected).map((n) => n.id);
    if (boxSelected.length > 1) return boxSelected;
    return selectedNodeId ? [selectedNodeId] : [];
  }, [nodes, selectedNodeId]);

  const onNodeContextMenu = (e, node) => {
    e.preventDefault();
    e.stopPropagation();
    const ids = effectiveSelectedIds.includes(node.id) && effectiveSelectedIds.length > 1
      ? effectiveSelectedIds
      : [node.id];
    setContextMenu({ ids, x: e.clientX, y: e.clientY });
  };

  // When 2+ nodes are box-selected, React Flow renders a separate draggable
  // "NodesSelection" overlay on top of them (so the group can be dragged as
  // one). Right-clicking lands on that overlay, not the individual node
  // elements — onNodeContextMenu never fires there, so without this the
  // browser's native context menu shows instead.
  const onSelectionContextMenu = (e, selectedNodes) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ ids: selectedNodes.map((n) => n.id), x: e.clientX, y: e.clientY });
  };

  // ─── Always-fresh ref so the window listener never has a stale closure ───────
  // React Flow initialises its internal domNode asynchronously; capturing
  // screenToFlowPosition directly in a useEffect closure risks getting the
  // pre-init version that returns raw screen coordinates instead of flow coords.
  const s2fRef = useRef(screenToFlowPosition);
  useEffect(() => { s2fRef.current = screenToFlowPosition; }, [screenToFlowPosition]);

  // ─── Global pointer handlers (custom drag system) ─────────────────────────
  useEffect(() => {
    const onMove = (e) => {
      if (!usePipelineStore.getState().drag) return;
      moveDrag(e.clientX, e.clientY);
    };

    const onUp = (e) => {
      const drag = usePipelineStore.getState().drag;
      if (!drag) return;
      endDrag();

      // Verify drop landed inside the canvas wrapper
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const inside =
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top  && e.clientY <= rect.bottom;
      if (!inside) return;

      // Use the ref — guaranteed to be the latest initialised screenToFlowPosition
      const pos = s2fRef.current({ x: e.clientX, y: e.clientY });
      addNode(drag.type, pos);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup',   onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup',   onUp);
    };
    // s2fRef is a ref — intentionally not in deps. moveDrag/endDrag/addNode are stable.
  }, [moveDrag, endDrag, addNode]);

  // ─── Edge decoration ────────────────────────────────────────────────────────
  // Field-count labels only depend on each source node's row/column shape, not
  // the full `nodes` array — but `nodes` changes identity on every selection
  // click now (selectNode writes the `selected` flag). Depending on raw
  // `nodes` here recreated every edge (including its label) on each click,
  // which fed back through React Flow's edge-label measuring and produced an
  // update-depth crash. This signature only changes when the data a label
  // actually reflects changes, so plain selection clicks no longer touch edges.
  const nodeDataSignature = nodes
    .map((n) => `${n.id}:${n.data?.rows?.length ?? ''}:${n.data?.columns?.length ?? ''}`)
    .join('|');

  const decoratedEdges = useMemo(
    () => edges.map((e) => {
      const upstream   = nodes.find((n) => n.id === e.source);
      const status     = nodeStatus[e.source];
      const sample     = status?.sample?.[0] || upstream?.data?.rows?.[0];
      const fieldCount = sample ? Object.keys(sample).length : 0;
      return {
        ...e,
        className:    running ? 'running' : '',
        animated:     running,
        label:        fieldCount ? `${fieldCount} fields` : undefined,
        labelBgPadding: [4, 2],
        labelStyle:   { fill: '#94a3b8', fontSize: 10 },
        labelBgStyle: { fill: '#1e2130', stroke: '#3a4060', strokeWidth: 0.5 },
      };
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [edges, nodeDataSignature, nodeStatus, running]
  );

  // Selection highlighting comes straight from each node's own `selected` flag,
  // which React Flow already manages internally via onNodesChange on every
  // click/drag/box-select. Re-deriving `selected` here (e.g. from a separate
  // selectedNodeId) would create new node objects every render and fight with
  // React Flow's own controlled-state diffing, causing an update-depth loop —
  // so `nodes` is passed straight through. selectedNodeId (for the config
  // panel) is synced separately via onSelectionChange below.

  // While a box-select drag is in progress, onSelectionChange fires repeatedly
  // as nodes enter the marquee one at a time — including transient states where
  // exactly one node is selected. We only want to act on the *final* selection,
  // so changes are buffered in a ref during the drag and applied once on
  // onSelectionEnd. Outside of a drag (e.g. a plain node click), changes apply
  // immediately as before.
  // NodeShell handles plain node clicks itself (selectNode + stopPropagation),
  // bypassing React Flow's internal click-to-select entirely — so React Flow's
  // own selection set never reflects single clicks and can't be used to detect
  // "nothing selected, deselect". Deselecting on empty canvas is already owned
  // by onPaneClick below. This handler therefore only *adds* a sync from a
  // finished box-select down to selectedNodeId — it never clears it.
  const boxSelecting = useRef(false);
  const latestSelection = useRef([]);

  const applySelection = (selected) => {
    if (selected.length === 1 && selected[0].id !== selectedNodeId) {
      selectNode(selected[0].id);
    }
    // 0 selected: leave selectedNodeId alone (onPaneClick/Escape own deselection).
    // >1 selected: leave selectedNodeId/config panel as-is so it doesn't flicker
    // closed while box-selecting.
  };

  const onSelectionChange = useCallback(({ nodes: selected }) => {
    latestSelection.current = selected;
    if (!boxSelecting.current) applySelection(selected);
  }, [selectedNodeId]);

  const onSelectionStart = useCallback(() => { boxSelecting.current = true; }, []);
  const onSelectionEnd = useCallback(() => {
    boxSelecting.current = false;
    applySelection(latestSelection.current);
  }, [selectedNodeId]);

  return (
    <div ref={canvasRef} className="flex-1 relative">
      <ReactFlow
        nodes={nodes}
        edges={decoratedEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => selectNode(node.id)}
        onNodeContextMenu={onNodeContextMenu}
        onSelectionContextMenu={onSelectionContextMenu}
        onPaneClick={() => selectNode(null)}
        onSelectionChange={onSelectionChange}
        onSelectionStart={onSelectionStart}
        onSelectionEnd={onSelectionEnd}
        selectionKeyCode="Shift"
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        minZoom={0.1}
        maxZoom={4}
        snapToGrid
        snapGrid={[20, 20]}
        // Two-finger trackpad → pan freely; pinch → zoom; scroll wheel alone → pan
        panOnScroll
        panOnScrollMode="free"
        panOnScrollSpeed={0.6}
        zoomOnScroll={false}
        zoomOnPinch
        deleteKeyCode={['Backspace', 'Delete']}
        multiSelectionKeyCode={['Shift']}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="#2a304a" />
        <Controls position="bottom-left" showInteractive={false} />
        <MiniMap
          position="bottom-right"
          nodeColor={(n) => {
            if (['csvInput', 'xlsxInput', 'manualData', 'dataverseInput'].includes(n.type)) return '#22c55e';
            if (['dataverseOutput', 'csvExport'].includes(n.type)) return '#f43f5e';
            return '#64748b';
          }}
          maskColor="rgba(15,17,23,0.6)"
        />
      </ReactFlow>

      {contextMenu && (() => {
        const count = contextMenu.ids.length;
        const isMulti = count > 1;
        return (
          <div
            className="fixed z-50 min-w-[180px] bg-slate-800 border border-slate-700 rounded-md shadow-xl py-1 text-sm"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 text-slate-200 hover:bg-slate-700 text-left"
              onClick={() => {
                duplicateNodes(contextMenu.ids);
                setContextMenu(null);
              }}
            >
              <Copy size={14} /> Duplicate{isMulti ? ` ${count} nodes` : ''}
            </button>
            {isMulti && (
              <button
                className="w-full flex items-center gap-2 px-3 py-1.5 text-slate-200 hover:bg-slate-700 text-left"
                onClick={() => {
                  groupNodes(contextMenu.ids);
                  setContextMenu(null);
                }}
              >
                <Boxes size={14} /> Group {count} nodes
              </button>
            )}
            <div className="my-1 border-t border-slate-700" />
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 text-rose-400 hover:bg-rose-500/10 text-left"
              onClick={() => {
                deleteNodes(contextMenu.ids);
                setContextMenu(null);
              }}
            >
              <Trash2 size={14} /> Delete{isMulti ? ` ${count} nodes` : ''}
            </button>
          </div>
        );
      })()}
    </div>
  );
}

export default function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
