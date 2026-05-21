import React, { useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  BackgroundVariant,
} from '@xyflow/react';
import { usePipelineStore } from '../store/usePipelineStore';

import CSVInputNode        from '../nodes/CSVInputNode';
import ManualDataNode      from '../nodes/ManualDataNode';
import SelectMapNode       from '../nodes/SelectMapNode';
import FilterNode          from '../nodes/FilterNode';
import TransformNode       from '../nodes/TransformNode';
import DeduplicateNode     from '../nodes/DeduplicateNode';
import PreviewNode         from '../nodes/PreviewNode';
import CSVExportNode       from '../nodes/CSVExportNode';
import DataverseOutputNode from '../nodes/DataverseOutputNode';

const nodeTypes = {
  csvInput:        CSVInputNode,
  manualData:      ManualDataNode,
  selectMap:       SelectMapNode,
  filter:          FilterNode,
  transform:       TransformNode,
  deduplicate:     DeduplicateNode,
  preview:         PreviewNode,
  csvExport:       CSVExportNode,
  dataverseOutput: DataverseOutputNode,
};

function CanvasInner() {
  const {
    nodes, edges,
    onNodesChange, onEdgesChange, onConnect,
    addNode, selectNode, selectedNodeId,
    running, nodeStatus,
    moveDrag, endDrag,
  } = usePipelineStore();

  const canvasRef = useRef(null);
  const { screenToFlowPosition } = useReactFlow();

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
    [edges, nodes, nodeStatus, running]
  );

  const decoratedNodes = useMemo(
    () => nodes.map((n) => ({ ...n, selected: n.id === selectedNodeId })),
    [nodes, selectedNodeId]
  );

  return (
    <div ref={canvasRef} className="flex-1 relative">
      <ReactFlow
        nodes={decoratedNodes}
        edges={decoratedEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => selectNode(node.id)}
        onPaneClick={() => selectNode(null)}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        minZoom={0.1}
        maxZoom={4}
        snapToGrid
        snapGrid={[20, 20]}
        deleteKeyCode={['Backspace', 'Delete']}
        multiSelectionKeyCode={['Shift']}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="#2a304a" />
        <Controls position="bottom-left" showInteractive={false} />
        <MiniMap
          position="bottom-right"
          nodeColor={(n) => {
            if (n.type === 'csvInput' || n.type === 'manualData') return '#22c55e';
            if (['dataverseOutput', 'csvExport', 'preview'].includes(n.type)) return '#f43f5e';
            return '#64748b';
          }}
          maskColor="rgba(15,17,23,0.6)"
        />
      </ReactFlow>
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
